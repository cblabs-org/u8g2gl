/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/project-path-rule.ts
 * Purpose: The lexical half of the project write boundary ([D-11], §13.10),
 *          in one pure function every `ProjectFileSystem` and the design server
 *          share. A path that names a project file is a project-relative POSIX
 *          path in canonical form; anything else — `..`, an absolute path, a
 *          Windows drive or backslash, an empty segment — is refused before any
 *          implementation touches storage. The other half, resolving symlinks
 *          against the real filesystem, needs `node:fs` and therefore lives in
 *          `src/node/project-path.ts` (`isInsideProject`).
 * Description: Refusal is by rule, not by normalisation. A path such as
 *              `a/./b` or `a//b` is not quietly cleaned up into `a/b`: two
 *              spellings of one file would give a watcher, a conflict check and
 *              a cache two keys for the same thing, so only the canonical
 *              spelling is accepted and the caller learns why the other was not.
 *
 * Exports:
 * - ProjectPathCheck:     Result of checking one path — the path, or why it was refused
 * - checkProjectPath():   Apply the lexical rule to a path
 * - refusedPathMessage(): The message every implementation gives for a refused path
 */

/**
 * The result of {@link checkProjectPath}: the accepted path, unchanged, or a
 * human-readable reason it was refused.
 */
export type ProjectPathCheck =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

/** A segment made only of dots: `.` and `..`, and `...`, which Windows path handling can collapse. */
const DOTS_ONLY = /^\.+$/;

/** Any ASCII control character, NUL included. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * @brief Checks that a path is a canonical project-relative POSIX path.
 *
 * Accepted: one or more `/`-separated segments, none empty, none made only of
 * dots, with no backslash, colon or control character anywhere. Every refusal
 * names its rule.
 *
 * This is the lexical rule only. It cannot see a symlink, so a path it accepts
 * may still resolve outside the project on disk; a Node implementation must
 * also apply `isInsideProject` before writing.
 *
 * @param path The path as the caller supplied it.
 * @return `{ ok: true, path }` with the path unchanged, or `{ ok: false, reason }`.
 */
export function checkProjectPath(path: string): ProjectPathCheck {
  // --- Step 1: Characters no project path may contain, wherever they appear ---
  if (path === '') {
    return { ok: false, reason: 'the path is empty' };
  }
  if (CONTROL_CHARACTER.test(path)) {
    return { ok: false, reason: 'the path contains a control character' };
  }
  // A backslash is a separator on Windows, so `a\..\..\x` escapes there even
  // though it is one harmless segment on POSIX. Refusing it outright means the
  // rule is the same on every host.
  if (path.includes('\\')) {
    return { ok: false, reason: "the path contains a backslash; use '/' as the separator" };
  }
  // A colon starts a drive (`C:x` is relative to C:'s current directory, not
  // to the project) or an NTFS alternate data stream (`file.xml:hidden`).
  if (path.includes(':')) {
    return { ok: false, reason: 'the path contains a colon (a drive or stream name)' };
  }
  if (path.startsWith('/')) {
    return { ok: false, reason: 'the path is absolute; give it relative to the project directory' };
  }

  // --- Step 2: Segment rules — no empty segment, no dot segment ---
  for (const segment of path.split('/')) {
    if (segment === '') {
      return { ok: false, reason: "the path has an empty segment ('//' or a trailing '/')" };
    }
    if (DOTS_ONLY.test(segment)) {
      return { ok: false, reason: `the path has a '${segment}' segment` };
    }
  }
  return { ok: true, path };
}

/**
 * @brief The message for a path {@link checkProjectPath} refused.
 *
 * One wording for every implementation and the server, so a refusal reads the
 * same wherever it is reported.
 *
 * @param path   The path as supplied.
 * @param reason `checkProjectPath`'s reason.
 */
export function refusedPathMessage(path: string, reason: string): string {
  return `'${path}' is not a project path: ${reason}.`;
}
