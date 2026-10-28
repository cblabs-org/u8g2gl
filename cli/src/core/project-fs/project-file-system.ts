/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/project-file-system.ts
 * Purpose: The one way isomorphic code reaches a project's files ([UD-2]).
 *          The designer runs in a browser and the CLI in Node; `src/core/`
 *          serves both and may not import `node:` or touch either filesystem,
 *          so every read, write, listing and change notification crosses this
 *          interface. It is shaped by the editor being a co-author beside the
 *          user's IDE: every read carries a version, a save
 *          names the version it was based on and is refused if the file moved,
 *          and external edits arrive as events so a clean buffer can reload.
 * Description: The interface, its result and event types, and
 *              `GuardedProjectFileSystem`, the base every implementation
 *              extends. The base applies `checkProjectPath` before an
 *              implementation sees a path and owns the listener set, so neither
 *              the path rule nor event fan-out can differ between
 *              implementations. Failures a caller can cause — a bad path, a
 *              missing file, a conflict, an unreachable server — are returned
 *              as `ProjectFsError`, never thrown: throwing is reserved for
 *              programmer error.
 *
 * Exports:
 * - ProjectFileSystem:         read / readBytes / write / list / watch
 *
 *     Results:
 *     - ProjectFsErrorCode:    Why an operation failed
 *     - ProjectFsError:        A failed operation
 *     - ProjectFsResult<T>:    Success payload or ProjectFsError
 *     - TextFile, BytesFile:   A read: content plus version (text: and whether it had a BOM)
 *     - WriteOutcome:          A write: the new version, and whether it created the file
 *     - FileListing:           A list: sorted project-relative paths
 *     - WriteOptions:          The version a write expects to replace; whether to write a BOM
 *
 *     Events:
 *     - ProjectFsEventKind:    'changed' | 'added' | 'removed'
 *     - ProjectFsEvent:        One change to one file
 *     - ProjectFsListener:     A watch callback
 *
 *     Base class:
 *     - GuardedProjectFileSystem: path validation and listener fan-out
 */

import { compareCodeUnits } from '../order.js';
import { checkProjectPath, refusedPathMessage } from './project-path-rule.js';

/**
 * Why an operation failed.
 *
 * - `invalid-path` — refused by `checkProjectPath` before storage was touched.
 * - `outside-project` — lexically valid, but resolves outside the project on
 *   disk (a symlink); only an implementation backed by a real filesystem
 *   returns it.
 * - `not-found` — the file does not exist.
 * - `conflict` — a write's expected version did not match the file's current one.
 * - `unavailable` — the storage could not be reached or failed (network, I/O).
 */
export type ProjectFsErrorCode = 'invalid-path' | 'outside-project' | 'not-found' | 'conflict' | 'unavailable';

/** A failed operation. */
export interface ProjectFsError {
  readonly ok: false;
  readonly code: ProjectFsErrorCode;
  /** Human prose; may be reworded freely. Branch on `code`. */
  readonly message: string;
  /**
   * For `conflict` only: the file's version now, or `null` if it does not
   * exist — what the editor needs to offer "keep mine / take theirs".
   */
  readonly currentVersion?: string | null;
}

/** A success payload `T`, flagged `ok: true`, or a {@link ProjectFsError}. */
export type ProjectFsResult<T> = ({ readonly ok: true } & T) | ProjectFsError;

/** A text read. */
export interface TextFile {
  readonly path: string;
  /** The content decoded as UTF-8, without a leading byte-order mark. */
  readonly text: string;
  /**
   * True when the file starts with a UTF-8 byte-order mark. `text` never
   * contains it; pass this back as `WriteOptions.bom` so a save keeps it.
   */
  readonly bom: boolean;
  /** Opaque; pass it back as `WriteOptions.expectedVersion` when saving. */
  readonly version: string;
}

/** A binary read — fonts (`<bdf>`) and images (`<xbm>`, `<convert>`) are bytes. */
export interface BytesFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  /** Opaque, and the same version a text read of the same content returns. */
  readonly version: string;
}

/** A successful write. */
export interface WriteOutcome {
  readonly path: string;
  /** The version of the content just written. */
  readonly version: string;
  /** True when the file did not exist before this write. */
  readonly created: boolean;
}

/** A successful listing. */
export interface FileListing {
  /** Every project file, project-relative, sorted by code unit (§13.9). */
  readonly files: readonly string[];
}

/** Options for {@link ProjectFileSystem.write}. */
export interface WriteOptions {
  /**
   * The version the caller last read. Omitted: write unconditionally. A
   * string: write only if the file is still at that version. `null`: write
   * only if the file does not exist (create, never replace).
   */
  readonly expectedVersion?: string | null;
  /**
   * True: write a UTF-8 byte-order mark before the text. A file read with
   * one is written back with one only if the caller passes its `bom` here.
   */
  readonly bom?: boolean;
}

/** What happened to a file. */
export type ProjectFsEventKind = 'changed' | 'added' | 'removed';

/** One change to one project file, from any author — the editor, an IDE, git. */
export interface ProjectFsEvent {
  readonly kind: ProjectFsEventKind;
  /** Project-relative POSIX path. */
  readonly path: string;
}

/** A watch callback. */
export type ProjectFsListener = (event: ProjectFsEvent) => void;

/**
 * Access to one project's files, from Node or a browser.
 *
 * Every path is project-relative POSIX in canonical form (`checkProjectPath`).
 * Every operation is asynchronous, because the served implementation is a
 * network round trip.
 */
export interface ProjectFileSystem {
  /** @brief Reads a file as UTF-8 text, with its version. */
  read(path: string): Promise<ProjectFsResult<TextFile>>;
  /** @brief Reads a file's bytes, with its version. */
  readBytes(path: string): Promise<ProjectFsResult<BytesFile>>;
  /**
   * @brief Writes UTF-8 text to a file, creating it and its directories if needed.
   *
   * With `expectedVersion`, the write is refused with `conflict` — and the file
   * left untouched — unless the file is still at that version.
   */
  write(path: string, text: string, options?: WriteOptions): Promise<ProjectFsResult<WriteOutcome>>;
  /** @brief Lists every project file. */
  list(): Promise<ProjectFsResult<FileListing>>;
  /**
   * @brief Subscribes to file changes, including those this instance made.
   *
   * @return A function that unsubscribes; calling it twice is harmless.
   */
  watch(listener: ProjectFsListener): () => void;
}

/**
 * The base every `ProjectFileSystem` implementation extends.
 *
 * It validates each path with `checkProjectPath` and only then calls the
 * implementation's `*Checked` method, so a refused path never reaches storage,
 * and it owns the listener set, so implementations only call `emit`.
 */
export abstract class GuardedProjectFileSystem implements ProjectFileSystem {
  private readonly listeners = new Set<ProjectFsListener>();

  /** Reads a path already accepted by `checkProjectPath`. */
  protected abstract readBytesChecked(path: string): Promise<ProjectFsResult<BytesFile>>;
  /** Writes to a path already accepted by `checkProjectPath`. */
  protected abstract writeChecked(path: string, bytes: Uint8Array, options: WriteOptions): Promise<ProjectFsResult<WriteOutcome>>;
  /** Lists every project file, in any order; the base sorts. */
  protected abstract listUnsorted(): Promise<ProjectFsResult<FileListing>>;

  /** {@inheritDoc ProjectFileSystem.read} */
  async read(path: string): Promise<ProjectFsResult<TextFile>> {
    const result = await this.readBytes(path);
    if (!result.ok) {
      return result;
    }
    const bom = startsWithBom(result.bytes);
    // The default decoder strips a leading BOM, so `text` never carries it.
    const text = new TextDecoder().decode(result.bytes);
    return { ok: true, path: result.path, text, bom, version: result.version };
  }

  /** {@inheritDoc ProjectFileSystem.readBytes} */
  async readBytes(path: string): Promise<ProjectFsResult<BytesFile>> {
    const check = checkProjectPath(path);
    if (!check.ok) {
      return invalidPath(path, check.reason);
    }
    return this.readBytesChecked(check.path);
  }

  /** {@inheritDoc ProjectFileSystem.write} */
  async write(path: string, text: string, options: WriteOptions = {}): Promise<ProjectFsResult<WriteOutcome>> {
    const check = checkProjectPath(path);
    if (!check.ok) {
      return invalidPath(path, check.reason);
    }
    return this.writeChecked(check.path, encodeText(text, options.bom === true), options);
  }

  /** {@inheritDoc ProjectFileSystem.list} */
  async list(): Promise<ProjectFsResult<FileListing>> {
    const result = await this.listUnsorted();
    if (!result.ok) {
      return result;
    }
    return { ok: true, files: [...result.files].sort(compareCodeUnits) };
  }

  /** {@inheritDoc ProjectFileSystem.watch} */
  watch(listener: ProjectFsListener): () => void {
    // A wrapper, so the same function subscribed twice is two subscriptions
    // and each unsubscribe removes exactly its own.
    const entry: ProjectFsListener = (event) => listener(event);
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  /**
   * @brief Delivers an event to every current listener.
   *
   * A listener that throws does not stop the others: the throw is a defect in
   * that listener, and the file change it reports has already happened.
   */
  protected emit(event: ProjectFsEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Deliberately swallowed; see above.
      }
    }
  }
}

// invalidPath
// The `invalid-path` error for a path checkProjectPath refused.
//   path   — the path as supplied
//   reason — checkProjectPath's reason
function invalidPath(path: string, reason: string): ProjectFsError {
  return { ok: false, code: 'invalid-path', message: refusedPathMessage(path, reason) };
}

/** The UTF-8 encoding of U+FEFF, the byte-order mark. */
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

// startsWithBom
// Whether `bytes` open with the UTF-8 byte-order mark.
function startsWithBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

// encodeText
// `text` as UTF-8, after a byte-order mark when `bom` is set. A text that
// already starts with U+FEFF is not given a second one.
//   text — what to write
//   bom  — whether the file should start with a byte-order mark
function encodeText(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom || startsWithBom(body)) {
    return body;
  }
  const bytes = new Uint8Array(body.length + UTF8_BOM.length);
  bytes.set(UTF8_BOM, 0);
  bytes.set(body, UTF8_BOM.length);
  return bytes;
}
