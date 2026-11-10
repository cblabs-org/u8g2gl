/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/openable-files.ts
 * Purpose: Which project files "Open in editor" may hand to another program.
 *          The platform's opener (`open`, `explorer.exe`, `xdg-open`) *runs* a
 *          file that is executable by type — a `.command`, `.app`, `.bat`,
 *          `.desktop`, `.sh` — and the session token can write a file of any
 *          name, so without this list the token could start native code. An
 *          allowlist, not a blocklist, because nobody can name every
 *          executable type on every platform. Shared by the design server,
 *          which enforces it, and the designer, which offers the action only
 *          where it would be allowed, so the two can never disagree; it lives
 *          here because neither may import the other.
 * Description: A file is openable when its last segment's extension, compared
 *              case-insensitively, is one of the project's source and asset
 *              types. An extensionless name, or a dotfile, is not.
 *
 * Exports:
 * - OPENABLE_EXTENSIONS:  The allowlist
 * - isOpenablePath():     Whether a path's file type may be opened
 */

/** The file types "Open in editor" may open: project source, notes, and assets. */
export const OPENABLE_EXTENSIONS: readonly string[] = [
  '.xml',
  '.cpp',
  '.cc',
  '.c',
  '.hpp',
  '.h',
  '.json',
  '.md',
  '.txt',
  '.bdf',
  '.xbm',
  '.png',
];

/**
 * @brief Whether a path names a file type "Open in editor" may open.
 *
 * Judged by name alone. A caller that opens through the filesystem must also
 * check the path a symlink resolves to, since a link's own name proves
 * nothing about its target.
 *
 * @param path A `/`-separated path, project-relative or absolute; on Windows
 *             a `\` also separates.
 */
export function isOpenablePath(path: string): boolean {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1).toLowerCase();
  const dot = name.lastIndexOf('.');
  // dot <= 0: no extension at all, or a dotfile such as `.profile`.
  return dot > 0 && OPENABLE_EXTENSIONS.includes(name.slice(dot));
}
