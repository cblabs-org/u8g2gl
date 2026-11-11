/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/served-project-file-system.ts
 * Purpose: The browser half of served mode (ui_spec [UD-2], amendment of
 *          2026-10-26): the editor reaches the project on disk through
 *          `u8g2gl design`'s loopback server, using only `fetch` and
 *          `EventSource`, so the same code runs in any browser and in Node 22
 *          tests. It is the second `ProjectFileSystem` implementation, and the
 *          shared contract suite holds it to the same behaviour as the
 *          in-memory one.
 * Description: Reads and writes are HTTP round trips to `/api/file` and
 *              `/api/files`, authorised with the session token as a Bearer
 *              header. Change events arrive over server-sent events from
 *              `/api/events`, which carries the token as a query parameter
 *              because `EventSource` cannot set headers. `connect()` opens that
 *              stream and resolves once the server says it is attached, so no
 *              event between connecting and watching is lost; `close()` ends it.
 *
 *              The stream doubles as the session's heartbeat: once attached,
 *              its failing means the server has gone, and `EventSource`'s own
 *              retry succeeding means it is back. That is reported as the
 *              connection state, so the designer can say so instead of letting
 *              the next save fail without explanation.
 *
 *              The wire protocol, which `src/node/design/` serves:
 *              - `GET /api/files` → `{ files: string[] }`
 *              - `GET /api/file?path=` → the bytes; version in `U8G2GL-Version`
 *              - `PUT /api/file?path=` → body is the text; an expected version in
 *                `U8G2GL-Expected-Version` (`absent` for "must not exist");
 *                `{ path, version, created }`, or 409 with `currentVersion`
 *              - errors → `{ code, message }` with a `ProjectFsErrorCode`
 *              - `GET /api/events?token=` → `event: ready`, then one `data:`
 *                `{ kind, path }` per change
 *
 * Exports:
 * - VERSION_HEADER, EXPECTED_VERSION_HEADER, EXPECTED_ABSENT: Wire names shared with the server
 * - EventSourceLike:            The part of `EventSource` this uses
 * - ConnectionState:            'connected' | 'lost'
 * - ConnectionListener:         A connection-state callback
 * - ServedProjectFsOptions:     Server origin, token, and injectable fetch/EventSource
 * - ServedProjectFileSystem:    The implementation
 *
 *     ProjectFileSystem:
 *     - read / readBytes / write / list / watch
 *
 *     Connection:
 *     - connect():              Open the event stream
 *     - close():                Close it
 *     - connection:             Whether the server is reachable, as the stream last said
 *     - onConnectionChange():   Subscribe to that; returns the unsubscribe
 */

import {
  GuardedProjectFileSystem,
  type BytesFile,
  type FileListing,
  type ProjectFsError,
  type ProjectFsErrorCode,
  type ProjectFsEvent,
  type ProjectFsResult,
  type WriteOptions,
  type WriteOutcome,
} from './project-file-system.js';

/** Response header carrying a read file's version. */
export const VERSION_HEADER = 'U8G2GL-Version';
/** Request header carrying the version a write expects to replace. */
export const EXPECTED_VERSION_HEADER = 'U8G2GL-Expected-Version';
/** The `EXPECTED_VERSION_HEADER` value meaning "the file must not exist". */
export const EXPECTED_ABSENT = 'absent';

/** The part of the DOM `EventSource` this implementation uses. */
export interface EventSourceLike {
  onmessage: ((event: { readonly data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  addEventListener(type: 'ready', listener: () => void): void;
  close(): void;
}

/**
 * Whether the design server is reachable, as the event stream last reported.
 *
 * - `connected` — the stream is attached, or has not been opened yet.
 * - `lost` — the stream failed after it was attached: the server has stopped,
 *   or restarted with a new token. Reads and writes will fail until it is back.
 */
export type ConnectionState = 'connected' | 'lost';

/** A {@link ServedProjectFileSystem.onConnectionChange} callback, given the new state. */
export type ConnectionListener = (state: ConnectionState) => void;

/** Options for {@link ServedProjectFileSystem}. */
export interface ServedProjectFsOptions {
  /** The server's origin, e.g. `http://127.0.0.1:5199`. No trailing slash needed. */
  readonly origin: string;
  /** The session token from the page URL. */
  readonly token: string;
  /** Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Defaults to constructing the global `EventSource`. */
  readonly createEventSource?: (url: string) => EventSourceLike;
}

/**
 * Every `ProjectFsErrorCode`, as a runtime list. The type alone cannot narrow
 * a server's reply, which is untrusted JSON; this must list every member of
 * the union, or a code the server sends would be reported as `unavailable`.
 */
const ERROR_CODES: readonly ProjectFsErrorCode[] = ['invalid-path', 'outside-project', 'not-found', 'conflict', 'unavailable'];

/**
 * A `ProjectFileSystem` served by `u8g2gl design`.
 *
 * Call {@link connect} before relying on `watch`; reads and writes work without it.
 */
export class ServedProjectFileSystem extends GuardedProjectFileSystem {
  private readonly origin: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createEventSource: (url: string) => EventSourceLike;
  private source: EventSourceLike | undefined;
  private state: ConnectionState = 'connected';
  private readonly connectionListeners = new Set<ConnectionListener>();

  /**
   * @param options The server origin and session token, and optionally the
   *                `fetch` and `EventSource` to use (tests inject both).
   */
  constructor(options: ServedProjectFsOptions) {
    super();
    this.origin = options.origin.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.createEventSource =
      options.createEventSource ?? ((url) => new EventSource(url) as unknown as EventSourceLike);
  }

  /**
   * @brief Opens the event stream; resolves once the server confirms it is attached.
   *
   * Rejects if the stream fails before it is ready (a wrong token gives 403).
   * Calling it while connected is a no-op. After it resolves, a dropped stream
   * is retried by `EventSource` itself; events while disconnected are lost, so
   * a long-lived caller should re-`list()` on reconnect. The drop and the
   * reconnection are reported through {@link onConnectionChange}.
   */
  connect(): Promise<void> {
    if (this.source !== undefined) {
      return Promise.resolve();
    }
    const source = this.createEventSource(`${this.origin}/api/events?token=${encodeURIComponent(this.token)}`);
    this.source = source;
    return new Promise((resolve, reject) => {
      let ready = false;
      // The handlers below ignore a stream that `close()` has already
      // replaced: a closed stream says nothing about the server.
      source.addEventListener('ready', () => {
        if (this.source !== source) return;
        // The first `ready` settles connect(); a later one is EventSource's
        // retry reaching the server again.
        ready = true;
        this.setConnection('connected');
        resolve();
      });
      source.onerror = () => {
        if (this.source !== source) return;
        if (!ready) {
          this.close();
          reject(new Error(`could not open the event stream at ${this.origin}`));
        } else {
          this.setConnection('lost');
        }
      };
      source.onmessage = (message) => {
        const event = parseEvent(message.data);
        if (event !== undefined) {
          this.emit(event);
        }
      };
    });
  }

  /**
   * @brief Closes the event stream. Harmless if not connected.
   *
   * Closing is the caller's choice, not a lost server, so it changes no
   * connection state and notifies no listener.
   */
  close(): void {
    this.source?.close();
    this.source = undefined;
  }

  /** @brief Whether the server is reachable, as the event stream last reported. */
  get connection(): ConnectionState {
    return this.state;
  }

  /**
   * @brief Calls `listener` with the new state each time {@link connection} changes.
   *
   * A repeated error while already `lost`, which is `EventSource` retrying, is
   * not a change and is not reported.
   *
   * @return A function that unsubscribes; calling it twice is harmless.
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    // A wrapper, as in `watch`, so each subscription is its own.
    const entry: ConnectionListener = (state) => listener(state);
    this.connectionListeners.add(entry);
    return () => {
      this.connectionListeners.delete(entry);
    };
  }

  // setConnection
  // Records the connection state and, if it changed, tells every listener. A
  // listener that throws does not stop the others, as in `emit`.
  //   next — the state the stream has just reported
  private setConnection(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.connectionListeners]) {
      try {
        listener(next);
      } catch {
        // Deliberately swallowed; see above.
      }
    }
  }

  protected async readBytesChecked(path: string): Promise<ProjectFsResult<BytesFile>> {
    const sent = await this.request(`/api/file?path=${encodeURIComponent(path)}`, { method: 'GET' });
    if (!('response' in sent)) {
      return sent;
    }
    const { response } = sent;
    if (!response.ok) {
      return errorFrom(response);
    }
    const version = response.headers.get(VERSION_HEADER);
    if (version === null) {
      return unavailable(`the server sent no version for '${path}'`);
    }
    return { ok: true, path, bytes: new Uint8Array(await response.arrayBuffer()), version };
  }

  protected async writeChecked(path: string, bytes: Uint8Array, options: WriteOptions): Promise<ProjectFsResult<WriteOutcome>> {
    const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (options.expectedVersion !== undefined) {
      headers[EXPECTED_VERSION_HEADER] = options.expectedVersion ?? EXPECTED_ABSENT;
    }
    const sent = await this.request(`/api/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers,
      // A fresh copy is typed over a plain ArrayBuffer, which BodyInit requires.
      body: new Uint8Array(bytes),
    });
    if (!('response' in sent)) {
      return sent;
    }
    const { response } = sent;
    if (!response.ok) {
      return errorFrom(response);
    }
    const body = (await response.json()) as { version?: unknown; created?: unknown };
    if (typeof body.version !== 'string' || typeof body.created !== 'boolean') {
      return unavailable(`the server's reply to writing '${path}' was malformed`);
    }
    return { ok: true, path, version: body.version, created: body.created };
  }

  protected async listUnsorted(): Promise<ProjectFsResult<FileListing>> {
    const sent = await this.request('/api/files', { method: 'GET' });
    if (!('response' in sent)) {
      return sent;
    }
    const { response } = sent;
    if (!response.ok) {
      return errorFrom(response);
    }
    const body = (await response.json()) as { files?: unknown };
    if (!Array.isArray(body.files) || !body.files.every((f): f is string => typeof f === 'string')) {
      return unavailable("the server's file list was malformed");
    }
    return { ok: true, files: body.files };
  }

  // request
  // One authorised round trip; a network failure becomes `unavailable` rather
  // than a rejection, so no caller has to wrap every call in try/catch.
  //   route — path and query under the origin
  //   init  — method, headers, body
  private async request(route: string, init: RequestInit): Promise<{ readonly response: Response } | ProjectFsError> {
    try {
      const response = await this.fetchImpl(`${this.origin}${route}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${this.token}` },
      });
      return { response };
    } catch (error) {
      return unavailable(`the design server could not be reached (${error instanceof Error ? error.message : String(error)})`);
    }
  }
}

// errorFrom
// The ProjectFsError a non-2xx response carries in its `{ code, message }`
// body; anything unrecognised (a 403 for a bad token, a proxy's HTML page) is
// `unavailable`, with the status in the message.
//   response — the failed response
async function errorFrom(response: Response): Promise<ProjectFsError> {
  let body: { code?: unknown; message?: unknown; currentVersion?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Not JSON: fall through to `unavailable`.
  }
  const code = ERROR_CODES.find((c) => c === body.code);
  const message = typeof body.message === 'string' ? body.message : `the design server answered ${response.status}`;
  if (code === undefined) {
    return unavailable(message);
  }
  if (code === 'conflict') {
    const current = body.currentVersion;
    return { ok: false, code, message, currentVersion: typeof current === 'string' ? current : null };
  }
  return { ok: false, code, message };
}

// unavailable
// The `unavailable` error with a message.
function unavailable(message: string): ProjectFsError {
  return { ok: false, code: 'unavailable', message };
}

// parseEvent
// One SSE `data:` payload as a ProjectFsEvent, or undefined if it is not one —
// a malformed message is dropped rather than delivered half-understood.
//   data — the message's data field
function parseEvent(data: string): ProjectFsEvent | undefined {
  try {
    const value = JSON.parse(data) as { kind?: unknown; path?: unknown };
    if ((value.kind === 'changed' || value.kind === 'added' || value.kind === 'removed') && typeof value.path === 'string') {
      return { kind: value.kind, path: value.path };
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}
