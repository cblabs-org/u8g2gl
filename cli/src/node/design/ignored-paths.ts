/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/ignored-paths.ts
 * Purpose: Which paths under a project directory are not project source, in one
 *          place, so the watcher, the file list and the write route agree.
 *          `generated/` is the generator's output ([D-11]), written by
 *          `u8g2gl generate`, not by hand; `.git/` and `node_modules/` belong to
 *          other tools; the lock file is this server's own state. Watching them
 *          would flood the editor with events it has no use for, and letting
 *          the editor write them would let a token holder plant a git hook.
 * Description: A path is ignored when its first segment is one of the ignored
 *              directories, or it is the lock file at the project root.
 *
 * Exports:
 * - LOCK_FILE_NAME:   The design server's lock file, at the project root
 * - isIgnoredPath():  Whether a project-relative path is outside the project's source
 */

/** The design server's lock file, at the project root. */
export const LOCK_FILE_NAME = '.u8g2gl-design.lock';

/** Top-level directories that are never project source. */
const IGNORED_DIRECTORIES: readonly string[] = ['generated', '.git', 'node_modules'];

/**
 * @brief Whether a project-relative POSIX path is outside the project's source.
 *
 * @param path Project-relative, `/`-separated.
 * @return True for anything under an ignored directory, and for the lock file.
 */
export function isIgnoredPath(path: string): boolean {
  const first = path.split('/', 1)[0] ?? '';
  return path === LOCK_FILE_NAME || IGNORED_DIRECTORIES.includes(first);
}
