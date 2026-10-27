/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/disk-project.ts
 * Purpose: The design server's access to the project directory: the disk side
 *          of the `ProjectFileSystem` contract that `ServedProjectFileSystem`
 *          speaks over HTTP. It is where the write boundary ([D-11], §13.10)
 *          is enforced for the editor: every path passes the shared lexical
 *          rule (`checkProjectPath`) and then the shared real-path rule
 *          (`isInsideProject`), the same two functions `loadProject()` relies
 *          on, so the editor cannot write anywhere the CLI would not read.
 * Description: Read, write-with-expected-version, and list, each returning the
 *              `ProjectFsResult` shapes the browser half passes straight
 *              through. Versions are `contentVersion` of the bytes, so the
 *              server and browser agree without shared state.
 *
 *              The file operations are synchronous on purpose: Node runs one
 *              request handler at a time, so a synchronous check-then-write
 *              cannot interleave with another request's write. (An external
 *              editor writing in the same instant can still race it; no
 *              portable filesystem offers compare-and-swap.)
 *
 * Exports:
 * - DiskProject:              One project directory
 *
 *     ProjectFileSystem's disk side:
 *     - read():               Bytes and version
 *     - write():              Conditional write, creating directories
 *     - list():               Every project source file
 *
 *     Shared with the watcher:
 *     - absolutePath():       A project-relative path on disk
 *     - listFiles():          The same walk `list()` does, as a plain array
 */

import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compareCodeUnits } from '../../core/order.js';
import { contentVersion } from '../../core/project-fs/content-version.js';
import { checkProjectPath } from '../../core/project-fs/project-path-rule.js';
import type {
  BytesFile,
  FileListing,
  ProjectFsError,
  ProjectFsResult,
  WriteOptions,
  WriteOutcome,
} from '../../core/project-fs/project-file-system.js';
import { isInsideProject } from '../project-path.js';
import { isIgnoredPath } from './ignored-paths.js';

/**
 * One project directory, as the design server reads and writes it.
 */
export class DiskProject {
  /** Absolute project directory. */
  readonly root: string;

  /** @param root The project directory; resolved to an absolute path. */
  constructor(root: string) {
    this.root = resolve(root);
  }

  /** @brief A project-relative POSIX path as an absolute path on this host. */
  absolutePath(path: string): string {
    return join(this.root, ...path.split('/'));
  }

  /**
   * @brief Reads a file's bytes and version.
   *
   * @param path As the client sent it; checked here.
   * @return The file, or `invalid-path`, `outside-project` (a symlink out of
   *         the project) or `not-found`.
   */
  read(path: string): ProjectFsResult<BytesFile> {
    const check = checkProjectPath(path);
    if (!check.ok) {
      return error('invalid-path', `'${path}' is not a project path: ${check.reason}.`);
    }
    const absolute = this.absolutePath(path);
    if (!isInsideProject(this.root, absolute)) {
      return error('outside-project', `'${path}' resolves outside the project directory.`);
    }
    const bytes = readFileOrUndefined(absolute);
    if (bytes === undefined) {
      return error('not-found', `'${path}' does not exist.`);
    }
    return { ok: true, path, bytes, version: contentVersion(bytes) };
  }

  /**
   * @brief Writes a file if it is still at the expected version.
   *
   * @param path    As the client sent it; checked here.
   * @param bytes   The new content.
   * @param options The expected version, as in `ProjectFileSystem.write`.
   * @return The new version, or `invalid-path`, `outside-project` (a symlink
   *         out of the project, or an ignored path such as `.git/`),
   *         `conflict`, or `unavailable` for an I/O failure.
   */
  write(path: string, bytes: Uint8Array, options: WriteOptions): ProjectFsResult<WriteOutcome> {
    // --- Step 1: The lexical rule, then this server's own no-go areas ---
    const check = checkProjectPath(path);
    if (!check.ok) {
      return error('invalid-path', `'${path}' is not a project path: ${check.reason}.`);
    }
    if (isIgnoredPath(path)) {
      return error('outside-project', `'${path}' is not project source; generated/, .git/, node_modules/ and the lock file are not written by the editor.`);
    }

    // --- Step 2: The real-path rule, on the nearest thing that exists ---
    const absolute = this.absolutePath(path);
    if (!this.writeStaysInside(absolute)) {
      return error('outside-project', `'${path}' resolves outside the project directory.`);
    }

    // --- Step 3: The version check (EDITOR-DESIGN §2.3: never silently overwrite) ---
    const current = readFileOrUndefined(absolute);
    const currentVersion = current === undefined ? null : contentVersion(current);
    if (options.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
      return {
        ok: false,
        code: 'conflict',
        message: `'${path}' changed since it was read; it was not written.`,
        currentVersion,
      };
    }

    // --- Step 4: Write, creating directories ---
    try {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, bytes);
    } catch (cause) {
      return error('unavailable', `'${path}' could not be written: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return { ok: true, path, version: contentVersion(bytes), created: current === undefined };
  }

  /** @brief Every project source file, sorted (§13.9). */
  list(): ProjectFsResult<FileListing> {
    return { ok: true, files: this.listFiles() };
  }

  /**
   * @brief Every project source file: regular files, and symlinks to files
   *        inside the project, skipping ignored paths. Sorted by code unit.
   *
   * Symlinked directories are not descended — a link back to an ancestor
   * would otherwise loop forever.
   */
  listFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (isIgnoredPath(path) || !checkProjectPath(path).ok) {
          continue;
        }
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute, path);
        } else if (entry.isFile()) {
          files.push(path);
        } else if (entry.isSymbolicLink() && isInsideProject(this.root, absolute) && isFile(absolute)) {
          files.push(path);
        }
      }
    };
    walk(this.root, '');
    return files.sort(compareCodeUnits);
  }

  // writeStaysInside
  // Whether writing `absolute` lands inside the project. isInsideProject alone
  // cannot answer for a file that does not exist yet — it falls back to a
  // lexical comparison, and `linkdir/new.xml` under a symlink pointing out
  // would pass — so this applies it to the nearest existing entry instead. An
  // entry that exists but cannot be resolved is a dangling symlink, and
  // writing through it would create its target wherever it points: refused.
  //   absolute — the absolute path about to be written
  private writeStaysInside(absolute: string): boolean {
    let probe = absolute;
    while (!entryExists(probe)) {
      const parent = dirname(probe);
      if (parent === probe) {
        return false;
      }
      probe = parent;
    }
    try {
      realpathSync(probe);
    } catch {
      return false;
    }
    return isInsideProject(this.root, probe);
  }
}

// error
// A ProjectFsError with a code and message.
function error(code: ProjectFsError['code'], message: string): ProjectFsError {
  return { ok: false, code, message };
}

// readFileOrUndefined
// A regular file's bytes, or undefined if it is absent or not a file.
function readFileOrUndefined(absolute: string): Uint8Array | undefined {
  try {
    return new Uint8Array(readFileSync(absolute));
  } catch {
    return undefined;
  }
}

// entryExists
// Whether a directory entry exists at all, a dangling symlink included —
// lstat, not stat, so the link itself is seen.
function entryExists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

// isFile
// Whether a path (following symlinks) is a regular file.
function isFile(absolute: string): boolean {
  try {
    return statSync(absolute).isFile();
  } catch {
    return false;
  }
}
