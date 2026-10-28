/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/rewrite-home-paths.mjs
 * Purpose: Removes absolute home-folder paths from every tracked text file, so
 *          the repository can be published without naming the machine it was
 *          written on. It is a committed script, not a one-off edit, so a
 *          reviewer can re-run it and check the result instead of trusting it.
 * Description: Two rules, applied in order to every `/Users/<name>` or
 *              `/home/<name>` path (scripts/home-paths.mjs defines both):
 *              1. Under a checkout of this repository
 *                 (`<home>/Documents/Projects/U8G2GL` or `U8G2GL-<anything>`)
 *                 the path becomes repo-relative: the checkout prefix and its
 *                 slash are removed, and a bare checkout root becomes `.`.
 *              2. Any other path under the home folder becomes `~/...`.
 *              Where the absolute path is embedded in a longer one, as CMake
 *              does in `CMakeFiles/x.dir/<absolute path>`, the joining slash is
 *              kept. Files are rewritten in place; nothing else changes. The
 *              script is idempotent: a second run changes nothing.
 *              Usage: node scripts/rewrite-home-paths.mjs [--dry-run]
 *              (run from anywhere inside the work tree)
 *
 * Exports:
 * - rewriteText():  One file's text with its home paths rewritten, and how many
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isExemptHomeName, listTrackedTextFiles } from './home-paths.mjs';

/** A path character. */
const PATH_CHAR = /[A-Za-z0-9._-]/;

/**
 * Whether the match at `offset` is embedded in a longer path, as CMake writes
 * `CMakeFiles/x.dir/<absolute path>`: the character before it is a path
 * character and the word it ends contains a slash. A compiler flag such as
 * `-I<absolute path>` is not embedded: its word has no slash.
 */
function isEmbedded(whole, offset) {
  if (offset === 0 || !PATH_CHAR.test(whole[offset - 1])) return false;
  const lineStart = Math.max(whole.lastIndexOf('\n', offset), 0);
  const word = whole.slice(lineStart, offset).split(/\s/).pop();
  return word.includes('/');
}

/**
 * `<home>/Documents/Projects/U8G2GL` or `U8G2GL-<suffix>`, then `/` or the end
 * of the path. The suffix may contain dots but not end in one, so a sentence
 * ending "...U8G2GL-e1d." keeps its full stop.
 */
const CHECKOUT_PATTERN =
  /\/(?:Users|home)\/([A-Za-z0-9_][A-Za-z0-9._-]*)\/Documents\/Projects\/U8G2GL(?:-[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)?(\/|(?![A-Za-z0-9_-]|\.[A-Za-z0-9_-]))/g;

/** `<home>` alone, followed by `/` or the end of the path. */
const HOME_PATTERN = /\/(?:Users|home)\/([A-Za-z0-9_][A-Za-z0-9._-]*?)(?=\/|[^A-Za-z0-9._-]|\.(?![A-Za-z0-9_-])|$)/g;

/**
 * Rewrite one file's text.
 * @returns {{ text: string, count: number }} the new text and how many paths changed
 */
export function rewriteText(text) {
  let count = 0;

  // --- Step 1: Checkouts of this repository become repo-relative ---
  let out = text.replace(CHECKOUT_PATTERN, (match, name, slash, offset, whole) => {
    if (isExemptHomeName(name)) return match;
    count++;
    const embedded = isEmbedded(whole, offset);
    if (slash === '/') return embedded ? '/' : '';
    return embedded ? '/.' : '.';
  });

  // --- Step 2: Every other home path becomes `~` ---
  out = out.replace(HOME_PATTERN, (match, name, offset, whole) => {
    if (isExemptHomeName(name)) return match;
    count++;
    const embedded = isEmbedded(whole, offset);
    return embedded ? '/~' : '~';
  });

  return { text: out, count };
}

// main
// Rewrites every tracked text file in place (or, with --dry-run, only lists
// them) and prints a count. Exits 0; a git failure throws, exiting non-zero.
function main() {
  const dryRun = process.argv.includes('--dry-run');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();

  let files = 0;
  let paths = 0;
  for (const file of listTrackedTextFiles(root)) {
    const { text, count } = rewriteText(file.text);
    if (count === 0) continue;
    files++;
    paths += count;
    console.log(`${String(count).padStart(6)}  ${file.path}`);
    // Latin-1 out, as it was read: byte-exact outside the rewritten paths.
    if (!dryRun) writeFileSync(join(root, file.path), text, 'latin1');
  }
  console.log(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${paths} path(s) in ${files} file(s).`);
}

// Run only as a script, not when imported (process.argv[1] is unset under `node -e`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
