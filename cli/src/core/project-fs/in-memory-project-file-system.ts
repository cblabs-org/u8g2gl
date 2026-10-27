/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/in-memory-project-file-system.ts
 * Purpose: A `ProjectFileSystem` held entirely in memory — for tests of
 *          anything that takes the interface, and for a future static mode
 *          with no server ([UD-2]). It is the reference implementation of the
 *          contract: the served implementation must behave as this one does,
 *          and the shared contract suite holds both to it.
 * Description: A map from path to bytes. Its own writes emit events exactly as
 *              a real watcher reports them, and two test hooks —
 *              `simulateExternalWrite` and `simulateExternalRemove` — stand in
 *              for an IDE or git changing a file behind the editor's back.
 *              Events are delivered synchronously, after the change is applied.
 *
 * Exports:
 * - InitialFiles:                 Seed content, by path
 * - InMemoryProjectFileSystem:    The implementation
 *
 *     ProjectFileSystem:
 *     - read / readBytes / write / list / watch
 *
 *     Test hooks:
 *     - simulateExternalWrite():  A change made by another author
 *     - simulateExternalRemove(): A deletion made by another author
 */

import { contentVersion } from './content-version.js';
import { checkProjectPath } from './project-path-rule.js';
import {
  GuardedProjectFileSystem,
  type BytesFile,
  type FileListing,
  type ProjectFsResult,
  type WriteOptions,
  type WriteOutcome,
} from './project-file-system.js';

/** Seed content for an {@link InMemoryProjectFileSystem}: text or bytes, by path. */
export type InitialFiles = Readonly<Record<string, string | Uint8Array>>;

/**
 * A `ProjectFileSystem` over an in-memory map.
 */
export class InMemoryProjectFileSystem extends GuardedProjectFileSystem {
  private readonly files = new Map<string, Uint8Array>();

  /**
   * @param initial Files the project starts with. No events are emitted for them.
   * @throws Error if a path is refused by `checkProjectPath` — a defect in the
   *         test or caller that seeded it, not a user error.
   */
  constructor(initial: InitialFiles = {}) {
    super();
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(requireProjectPath(path), toBytes(content));
    }
  }

  /**
   * @brief Changes a file as another author would, emitting `added` or `changed`.
   *
   * @throws Error if the path is refused by `checkProjectPath`.
   */
  simulateExternalWrite(path: string, content: string | Uint8Array): void {
    const checked = requireProjectPath(path);
    const existed = this.files.has(checked);
    this.files.set(checked, toBytes(content));
    this.emit({ kind: existed ? 'changed' : 'added', path: checked });
  }

  /**
   * @brief Deletes a file as another author would, emitting `removed` if it existed.
   *
   * @throws Error if the path is refused by `checkProjectPath`.
   */
  simulateExternalRemove(path: string): void {
    const checked = requireProjectPath(path);
    if (this.files.delete(checked)) {
      this.emit({ kind: 'removed', path: checked });
    }
  }

  protected async readBytesChecked(path: string): Promise<ProjectFsResult<BytesFile>> {
    const bytes = this.files.get(path);
    if (bytes === undefined) {
      return { ok: false, code: 'not-found', message: `'${path}' does not exist.` };
    }
    // A copy, so a caller mutating the array cannot change the stored file.
    return { ok: true, path, bytes: bytes.slice(), version: contentVersion(bytes) };
  }

  protected async writeChecked(path: string, bytes: Uint8Array, options: WriteOptions): Promise<ProjectFsResult<WriteOutcome>> {
    // --- Step 1: Refuse the write if the file moved since the caller read it ---
    const current = this.files.get(path);
    const currentVersion = current === undefined ? null : contentVersion(current);
    if (options.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
      return {
        ok: false,
        code: 'conflict',
        message: `'${path}' changed since it was read; it was not written.`,
        currentVersion,
      };
    }

    // --- Step 2: Store, then tell the watchers ---
    this.files.set(path, bytes.slice());
    this.emit({ kind: current === undefined ? 'added' : 'changed', path });
    return { ok: true, path, version: contentVersion(bytes), created: current === undefined };
  }

  protected async listUnsorted(): Promise<ProjectFsResult<FileListing>> {
    return { ok: true, files: [...this.files.keys()] };
  }
}

// requireProjectPath
// The path, if checkProjectPath accepts it; throws otherwise. For the seed and
// the test hooks, where a bad path is the caller's defect.
//   path — the path to check
function requireProjectPath(path: string): string {
  const check = checkProjectPath(path);
  if (!check.ok) {
    throw new Error(`'${path}' is not a project path: ${check.reason}.`);
  }
  return check.path;
}

// toBytes
// Text as UTF-8, or a private copy of bytes.
//   content — text or bytes
function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content.slice();
}
