/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/design-server.ts
 * Purpose: The server behind `u8g2gl design` (ui_spec [UD-2], second
 *          amendment): it serves the editor and the project's files, pushes
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
 *              - `GET /`                   the placeholder page
 *              - `GET /api/files`          `{ files }`
 *              - `GET /api/file?path=`     bytes, version in `U8G2GL-Version`
 *              - `PUT /api/file?path=`     conditional write; 409 on conflict
 *              - `GET /api/events`         server-sent events of file changes
 *              - `POST /api/build/<job>`   queue a build; 202 with its record
 *              - `GET /api/build/<id>`     a build's record
 *
 * Exports:
 * - DesignServerOptions:   Project, port, token
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
import { BuildQueue } from './build-queue.js';
import { DiskProject } from './disk-project.js';
import { placeholderPage } from './placeholder-page.js';
import { ProjectWatcher } from './project-watcher.js';
import { generateSessionToken, presentedToken, tokenMatches } from './session-token.js';

/** The only address the server binds (c3). */
const LOOPBACK = '127.0.0.1';

/** Largest request body accepted — far above any project source file. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

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
}

/** A running design server. */
export interface DesignServer {
  /** The URL to open: `http://127.0.0.1:<port>/?token=<token>`. */
  readonly url: string;
  readonly port: number;
  readonly token: string;
  /** The bound address, as `server.address()` reports it. */
  readonly address: AddressInfo;
  /** The build queue; a job kind is added with `builds.register()`. */
  readonly builds: BuildQueue;
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

    // --- Authorisation, before anything else (c1) ---
    const host = request.headers.host;
    if (host !== `${LOOPBACK}:${port}` && host !== `localhost:${port}`) {
      sendJson(response, 403, { code: 'forbidden', message: 'wrong Host' });
      return;
    }
    if (!tokenMatches(presentedToken(request, url), token)) {
      sendJson(response, 403, { code: 'forbidden', message: 'missing or wrong session token' });
      return;
    }

    // --- Routing ---
    const method = request.method ?? 'GET';
    const route = url.pathname;
    if (route === '/' && method === 'GET') {
      send(response, 200, 'text/html; charset=utf-8', placeholderPage(basename(project.root)));
    } else if (route === '/api/files' && method === 'GET') {
      sendResult(response, project.list(), (r) => ({ files: r.files }));
    } else if (route === '/api/file' && method === 'GET') {
      const result = project.read(url.searchParams.get('path') ?? '');
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
      const result = project.write(url.searchParams.get('path') ?? '', body, { expectedVersion: expected });
      sendResult(response, result, (r) => ({ path: r.path, version: r.version, created: r.created }));
    } else if (route === '/api/events' && method === 'GET') {
      openStream(response);
    } else if (route.startsWith('/api/build/') && method === 'POST') {
      const job = decodeURIComponent(route.slice('/api/build/'.length));
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
      const record = builds.get(decodeURIComponent(route.slice('/api/build/'.length)));
      if (record === undefined) {
        sendJson(response, 404, { code: 'unknown-build', message: 'no such build' });
      } else {
        sendJson(response, 200, record);
      }
    } else {
      sendJson(response, 404, { code: 'not-found', message: `no route ${method} ${route}` });
    }
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
    close: () => closeServer(server, watcher, streams),
  };
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
