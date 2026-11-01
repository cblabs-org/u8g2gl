/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/design-server.ts
 * Purpose: The server behind `u8g2gl design` (ui_spec [UD-2], amendment of
 *          2026-10-26): it serves the editor and the project's files, pushes
 *          file changes, and runs builds, and it is **never in the per-edit
 *          loop** — an edit is applied in the browser, and the server only sees
 *          a save. It is separate from the command so tests can start it on
 *          port 0, talk to it, and close it, with no process, lock or browser.
 * Description: `node:http` on 127.0.0.1 only. Every request is checked for the
 *              session token first, on every route, before anything is parsed
 *              — an unauthorised request learns nothing, not even which routes
 *              exist. The Host header must also name the loopback address,
 *              which defeats DNS rebinding: a hostile page that rebinds its own
 *              name to 127.0.0.1 sends its own name as Host.
 *
 *              Routes, all token-checked:
 *              - `GET /`                   the designer (a redirect to
 *                                          `/app/<token>/`), or the
 *                                          placeholder page if it is not built
 *              - `GET /app/<token>/<file>` the designer's own files
 *              - `GET /api/files`          `{ files }`
 *              - `GET /api/file?path=`     bytes, version in `U8G2GL-Version`
 *              - `PUT /api/file?path=`     conditional write; 409 on conflict
 *              - `GET /api/events`         server-sent events of file changes
 *              - `POST /api/build/<job>`   queue a build; 202 with its record
 *              - `GET /api/build/<id>`     a build's record
 *              - `GET /api/editor-wasm/<id>/<file>` the editor Wasm a
 *                                          succeeded `editor-wasm` build made
 *              - `POST <path>`             a JSON route a later piece of the
 *                                          designer registered with
 *                                          `registerJsonRoute()` (the test
 *                                          run's bug report, say)
 *
 * Exports:
 * - LOOPBACK:              The one address the server binds
 * - DesignServerOptions:   Project, port, token
 * - JsonRoute:             A registered JSON route's handler
 * - DesignServer:          A running server
 * - startDesignServer():   Start one
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename } from 'node:path';
import type { ProjectFsError, ProjectFsEvent } from '../../core/project-fs/project-file-system.js';
import {
  EXPECTED_ABSENT,
  EXPECTED_VERSION_HEADER,
  VERSION_HEADER,
} from '../../core/project-fs/served-project-file-system.js';
import { EDITOR_WASM_JOB } from './build/editor-wasm-build.js';
import { BuildQueue, type BuildJobRecord } from './build-queue.js';
import { DiskProject } from './disk-project.js';
import { placeholderPage } from './placeholder-page.js';
import { ProjectWatcher } from './project-watcher.js';
import { APP_PATH_PREFIX, generateSessionToken, presentedToken, tokenMatches } from './session-token.js';
import { readStaticFile } from './static-files.js';

/** The only address the server binds: loopback, so no other machine can reach it. */
export const LOOPBACK = '127.0.0.1';

/** Largest request body accepted — far above any project source file. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** The editor Wasm route's prefix; the build id and file follow. */
const EDITOR_WASM_ROUTE = '/api/editor-wasm/';

/** The files an editor Wasm build serves: the Emscripten loader and its module. */
const EDITOR_WASM_FILES: readonly string[] = ['u8g2gl_editor.js', 'u8g2gl_editor.wasm'];

/** How often an idle event stream is sent a comment, so proxies and browsers keep it open. */
const KEEPALIVE_MS = 15_000;

/** Options for {@link startDesignServer}. */
export interface DesignServerOptions {
  /** The project directory. */
  readonly projectRoot: string;
  /** Port to bind; 0 or omitted picks a free one. */
  readonly port?: number;
  /** Session token; generated when omitted. Tests pass one to know it. */
  readonly token?: string;
  /**
   * The built designer (`designer/dist/`), served at `/`. Omitted, `/` serves
   * the placeholder page.
   */
  readonly designerRoot?: string;
}

/**
 * A registered JSON route: the request's parsed body in, a status and a JSON
 * body out. It runs after the token and Host checks, like every route. A
 * handler that throws answers 500 with no detail.
 */
export type JsonRoute = (body: unknown) => Promise<{ readonly status: number; readonly body: unknown }>;

/** A running design server. */
export interface DesignServer {
  /** The URL to open: `http://127.0.0.1:<port>/?token=<token>`. */
  readonly url: string;
  /** The port actually bound — the one chosen when 0 was asked for. */
  readonly port: number;
  /** The session secret. Print it only inside the URL the user is given; never log it. */
  readonly token: string;
  /** The bound address, as `server.address()` reports it. */
  readonly address: AddressInfo;
  /** The build queue; a job kind is added with `builds.register()`. */
  readonly builds: BuildQueue;
  /**
   * @brief Adds a `POST` route taking and answering JSON.
   *
   * @param path Under `/api/`, and not one of the server's own routes.
   * @throws Error for a path outside `/api/`, a built-in one, or one already
   *         registered: two pieces of code claiming a route is a defect.
   */
  registerJsonRoute(path: string, route: JsonRoute): void;
  /** @brief Stops watching, ends every event stream and connection, and closes. */
  close(): Promise<void>;
}

/** HTTP status for each `ProjectFsErrorCode`. */
const STATUS_FOR: Readonly<Record<ProjectFsError['code'], number>> = {
  'invalid-path': 400,
  'outside-project': 403,
  'not-found': 404,
  conflict: 409,
  unavailable: 500,
};

/**
 * @brief Starts a design server for one project.
 *
 * @param options Project directory, port and token.
 * @return The running server, once it is listening and watching.
 * @throws Error if the port is taken, or the platform cannot watch
 *         recursively; nothing is left running in either case.
 */
export async function startDesignServer(options: DesignServerOptions): Promise<DesignServer> {
  const project = new DiskProject(options.projectRoot);
  const token = options.token ?? generateSessionToken();
  const builds = new BuildQueue(project.root);
  const streams = new Set<ServerResponse>();
  const jsonRoutes = new Map<string, JsonRoute>();

  // --- Step 1: The watcher, broadcasting to every open event stream ---
  const broadcast = (event: ProjectFsEvent): void => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const stream of streams) {
      stream.write(frame);
    }
  };
  const watcher = new ProjectWatcher(project, broadcast);
  watcher.start();

  // --- Step 2: The HTTP server ---
  let port = 0;
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { code: 'unavailable', message: 'internal error' });
      } else {
        response.destroy();
      }
    });
  });

  // handle
  // One request: authorise, then route.
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${LOOPBACK}:${port}`);

    // --- Step 1: Authorise — Host, then token, before anything is parsed or routed ---
    // Host is checked as well as the token because of DNS rebinding: a hostile
    // page can rebind its own name to 127.0.0.1, and the browser then sends
    // that name as Host. The token already refuses such a request; this is a
    // second, independent barrier, so a token that leaks (a log, a screenshot,
    // browser history) is still useless to a page on another origin.
    // The port is part of the match because Host always carries it for a
    // non-default port, and a Host naming another port is not addressed to
    // this server. `localhost` is accepted beside 127.0.0.1 because a user may
    // retype the printed URL with it, and it resolves only to this machine.
    const host = request.headers.host;
    if (host !== `${LOOPBACK}:${port}` && host !== `localhost:${port}`) {
      sendJson(response, 403, { code: 'forbidden', message: 'wrong Host' });
      return;
    }
    // The token gate runs before routing, and on every route including `/`, so
    // an unauthorised caller cannot learn which routes exist: a real route and
    // a made-up one answer alike. The body is identical for a missing and a
    // wrong token, so the response says nothing about what was presented.
    if (!tokenMatches(presentedToken(request, url), token)) {
      sendJson(response, 403, { code: 'forbidden', message: 'missing or wrong session token' });
      return;
    }

    // --- Step 2: Route ---
    const method = request.method ?? 'GET';
    const route = url.pathname;
    if (route === '/' && method === 'GET') {
      if (options.designerRoot === undefined) {
        send(response, 200, 'text/html; charset=utf-8', placeholderPage(basename(project.root)));
      } else {
        // The designer lives under its token-carrying path; see APP_PATH_PREFIX.
        response.writeHead(302, { Location: `${APP_PATH_PREFIX}${token}/`, 'Cache-Control': 'no-store' });
        response.end();
      }
    } else if (route.startsWith(APP_PATH_PREFIX) && method === 'GET') {
      serveDesigner(response, route);
    } else if (route.startsWith(EDITOR_WASM_ROUTE) && method === 'GET') {
      serveEditorWasm(response, route);
    } else if (route === '/api/files' && method === 'GET') {
      sendResult(response, project.list(), (r) => ({ files: r.files }));
    } else if (route === '/api/file' && method === 'GET') {
      const path = pathParam(url);
      if (path === undefined) {
        sendMalformed(response);
        return;
      }
      const result = project.read(path);
      if (!result.ok) {
        sendError(response, result);
      } else {
        response.setHeader(VERSION_HEADER, result.version);
        send(response, 200, 'application/octet-stream', result.bytes);
      }
    } else if (route === '/api/file' && method === 'PUT') {
      const body = await readBody(request);
      if (body === undefined) {
        sendJson(response, 413, { code: 'unavailable', message: 'request body too large' });
        return;
      }
      const header = request.headers[EXPECTED_VERSION_HEADER.toLowerCase()];
      const expected = typeof header === 'string' ? (header === EXPECTED_ABSENT ? null : header) : undefined;
      const path = pathParam(url);
      if (path === undefined) {
        sendMalformed(response);
        return;
      }
      const result = project.write(path, body, { expectedVersion: expected });
      sendResult(response, result, (r) => ({ path: r.path, version: r.version, created: r.created }));
    } else if (route === '/api/events' && method === 'GET') {
      openStream(response);
    } else if (jsonRoutes.has(route) && method === 'POST') {
      await serveJsonRoute(request, response, jsonRoutes.get(route)!);
    } else if (route.startsWith('/api/build/') && method === 'POST') {
      const job = decodeStrict(route.slice('/api/build/'.length));
      if (job === undefined) {
        sendMalformed(response);
        return;
      }
      const body = await readBody(request);
      let params: unknown;
      try {
        params = body === undefined || body.length === 0 ? undefined : JSON.parse(new TextDecoder().decode(body));
      } catch {
        sendJson(response, 400, { code: 'bad-request', message: 'build parameters must be JSON' });
        return;
      }
      const record = builds.submit(job, params);
      if (record === undefined) {
        sendJson(response, 404, { code: 'unknown-job', message: `no build job '${job}' is registered` });
      } else {
        sendJson(response, 202, record);
      }
    } else if (route.startsWith('/api/build/') && method === 'GET') {
      const id = decodeStrict(route.slice('/api/build/'.length));
      if (id === undefined) {
        sendMalformed(response);
        return;
      }
      const record = builds.get(id);
      if (record === undefined) {
        sendJson(response, 404, { code: 'unknown-build', message: 'no such build' });
      } else {
        sendJson(response, 200, record);
      }
    } else {
      sendJson(response, 404, { code: 'not-found', message: `no route ${method} ${route}` });
    }
  }

  // serveDesigner
  // One of the designer's own files. The gate has already matched the token
  // in the path, so what follows it is the file; '' is the index page.
  //   route — the request path, `/app/<token>/<file>`
  function serveDesigner(response: ServerResponse, route: string): void {
    const raw = route.slice(`${APP_PATH_PREFIX}${token}/`.length);
    const file = decodeStrict(raw === '' ? 'index.html' : raw);
    const found = options.designerRoot === undefined || file === undefined ? undefined : readStaticFile(options.designerRoot, file);
    if (found === undefined) {
      sendJson(response, 404, { code: 'not-found', message: `no designer file '${raw}'` });
      return;
    }
    // The page's URL holds the token, and a Referer would carry it to any
    // origin the page links to. Only the designer's own files need this: the
    // 302 and the 404s are not pages that link anywhere, and the Wasm route is
    // fetched by the page, never navigated to. The index page also carries
    // <meta name="referrer">, which covers it however it is served (the Vite
    // dev server, say), where this header would be absent.
    response.setHeader('Referrer-Policy', 'no-referrer');
    send(response, 200, found.contentType, found.bytes);
  }

  // serveEditorWasm
  // The loader or module a succeeded editor-wasm build wrote. Addressed by
  // build id, not by hash or path, so the client can only ask for what a
  // build it started produced, and the server never takes a directory from
  // the URL.
  //   route — the request path, `/api/editor-wasm/<id>/<file>`
  function serveEditorWasm(response: ServerResponse, route: string): void {
    const [rawId = '', rawFile = '', ...extra] = route.slice(EDITOR_WASM_ROUTE.length).split('/');
    const id = decodeStrict(rawId);
    const file = decodeStrict(rawFile);
    const wasmDir = id === undefined ? undefined : editorWasmDir(builds.get(id));
    // Refused, each as a 404: a sub-path (`extra`), a malformed encoding, any
    // file but the two a build emits (an allowlist, so nothing else in a build
    // directory is ever reachable), and an unknown, queued, failed or
    // non-editor-wasm build (`wasmDir` undefined).
    if (extra.length > 0 || file === undefined || !EDITOR_WASM_FILES.includes(file) || wasmDir === undefined) {
      sendJson(response, 404, { code: 'not-found', message: 'no such editor Wasm file' });
      return;
    }
    const found = readStaticFile(wasmDir, file);
    if (found === undefined) {
      sendJson(response, 404, { code: 'not-found', message: `the build's ${file} is gone` });
      return;
    }
    send(response, 200, found.contentType, found.bytes);
  }

  // serveJsonRoute
  // A registered route: the body parsed as JSON (absent is undefined), the
  // handler's status and JSON body sent back.
  //   route — the handler
  async function serveJsonRoute(request: IncomingMessage, response: ServerResponse, route: JsonRoute): Promise<void> {
    const body = await readBody(request);
    if (body === undefined) {
      sendJson(response, 413, { code: 'unavailable', message: 'request body too large' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = body.length === 0 ? undefined : JSON.parse(new TextDecoder().decode(body));
    } catch {
      sendJson(response, 400, { code: 'bad-request', message: 'the request body must be JSON' });
      return;
    }
    const answer = await route(parsed);
    sendJson(response, answer.status, answer.body);
  }

  // openStream
  // Holds a response open as a server-sent event stream until the client goes.
  // `ready` is sent first, so a client knows it is attached and that no event
  // after this point will be missed.
  function openStream(response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.write('retry: 1000\nevent: ready\ndata: {}\n\n');
    streams.add(response);
    const keepalive = setInterval(() => response.write(': keepalive\n\n'), KEEPALIVE_MS);
    response.on('close', () => {
      clearInterval(keepalive);
      streams.delete(response);
    });
  }

  // --- Step 3: Listen, on loopback only ---
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, LOOPBACK, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (cause) {
    watcher.close();
    throw cause;
  }
  const address = server.address() as AddressInfo;
  port = address.port;

  return {
    url: `http://${LOOPBACK}:${port}/?token=${token}`,
    port,
    token,
    address,
    builds,
    registerJsonRoute(path, route) {
      // The server's own routes are matched before registered ones only for
      // the paths below; refusing them here makes a shadowed route an error
      // at registration instead of a handler that silently never runs.
      const builtIn = path === '/api/files' || path === '/api/file' || path === '/api/events' || path.startsWith('/api/build/') || path.startsWith(EDITOR_WASM_ROUTE);
      if (!path.startsWith('/api/') || builtIn || jsonRoutes.has(path)) {
        throw new Error(`cannot register the route '${path}'`);
      }
      jsonRoutes.set(path, route);
    },
    close: () => closeServer(server, watcher, streams),
  };
}

// editorWasmDir
// The output directory of a succeeded editor-wasm build, or undefined for any
// other record. The result is the job's own JSON, typed `unknown`, so the cast
// below is the narrowing, not a trust: the value is checked to be a string.
// `wasmDir` is written by the server's own build job; nothing in the request
// reaches it.
//   record — a build record, or undefined
function editorWasmDir(record: BuildJobRecord | undefined): string | undefined {
  if (record === undefined || record.job !== EDITOR_WASM_JOB || record.status !== 'succeeded') {
    return undefined;
  }
  const result = record.result;
  const dir = typeof result === 'object' && result !== null ? (result as { wasmDir?: unknown }).wasmDir : undefined;
  return typeof dir === 'string' ? dir : undefined;
}

// closeServer
// Stops the watcher, ends every event stream (which would otherwise hold
// server.close() open forever), drops idle keep-alive connections, and waits
// for the server to finish closing.
async function closeServer(server: Server, watcher: ProjectWatcher, streams: Set<ServerResponse>): Promise<void> {
  watcher.close();
  for (const stream of streams) {
    stream.end();
  }
  streams.clear();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

// decodeStrict
// A percent-encoded URL component, decoded, or undefined if its encoding is
// malformed (`%zz`, a truncated or invalid UTF-8 sequence). `decodeURIComponent`
// throws on those, and `URLSearchParams` silently keeps or replaces them — so a
// malformed path could otherwise either surface as a 500 or be read as a
// different file name than the client meant. A `+` is a space, as in a form-
// encoded query; the browser half encodes `+` itself as `%2B`.
//   raw — the component as it appears in the URL
function decodeStrict(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

// pathParam
// The `path` query parameter, strictly decoded: '' when absent (which the path
// rule then refuses as empty), undefined when its encoding is malformed.
//   url — the request URL
function pathParam(url: URL): string | undefined {
  for (const pair of url.search.slice(1).split('&')) {
    const equals = pair.indexOf('=');
    const name = equals < 0 ? pair : pair.slice(0, equals);
    if (name === 'path') {
      return decodeStrict(equals < 0 ? '' : pair.slice(equals + 1));
    }
  }
  return '';
}

// sendMalformed
// The 400 `invalid-path` answer to a malformed percent-encoding.
function sendMalformed(response: ServerResponse): void {
  sendJson(response, 400, { code: 'invalid-path', message: 'the request URL has a malformed percent-encoding' });
}

// readBody
// A request's body, or undefined if it exceeds MAX_BODY_BYTES (the request is
// then drained and discarded, so the response can still be sent).
async function readBody(request: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      tooLarge = true;
    } else {
      chunks.push(buffer);
    }
  }
  return tooLarge ? undefined : new Uint8Array(Buffer.concat(chunks));
}

// send
// A complete response with a body.
function send(response: ServerResponse, status: number, contentType: string, body: string | Uint8Array): void {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

// sendJson
// A complete JSON response.
function sendJson(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

// sendError
// A ProjectFsError as its status and `{ code, message, currentVersion? }` body,
// which ServedProjectFileSystem turns back into the same ProjectFsError.
function sendError(response: ServerResponse, error: ProjectFsError): void {
  sendJson(response, STATUS_FOR[error.code], {
    code: error.code,
    message: error.message,
    ...(error.currentVersion !== undefined ? { currentVersion: error.currentVersion } : {}),
  });
}

// sendResult
// A ProjectFsResult as JSON: the shaped success body, or the error.
function sendResult<T extends { readonly ok: true }>(
  response: ServerResponse,
  result: T | ProjectFsError,
  shape: (success: T) => unknown,
): void {
  if (result.ok) {
    sendJson(response, 200, shape(result as T));
  } else {
    sendError(response, result as ProjectFsError);
  }
}
