/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/home-paths.mjs
 * Purpose: The one definition of "a home-folder path", shared by the script that
 *          rewrites them out of the tree and the guard that keeps them out. Two
 *          copies of these patterns would drift, and a guard that disagrees with
 *          the rewrite either fails on a clean tree or passes a dirty one.
 * Description: A home path is `/Users/<name>` or `/home/<name>`, where `<name>`
 *              starts with a letter, digit or underscore (so `/Users/.../x`, an
 *              already elided path, is not one). A few names are not people and
 *              are exempt: see EXEMPT_HOME_NAMES. The owner's username is held
 *              only as a SHA-256 digest, so this file never contains it and the
 *              guard cannot match itself.
 *
 * Exports:
 * - EXEMPT_HOME_NAMES:      Home-folder names that are not a person's
 * - OWNER_USERNAME_SHA256:  Digest of the owner's username
 * - HOME_PATH_PATTERN:      Global regex matching `/Users/<name>` or `/home/<name>`
 * - isExemptHomeName():     Whether a matched name is on the exempt list
 * - findOwnerUsername():    Every line holding the owner's username as a word
 * - listTrackedTextFiles(): Tracked regular files of a work tree, binaries skipped,
 *                           as byte-exact (Latin-1) text
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Names after `/Users/` or `/home/` that are not a person's home folder.
 * - `web_user`: Emscripten's virtual home directory, compiled into generated glue.
 * - `a`:        The placeholder home the toolchain tests pass to the cache-root function.
 * Add a name here only when it is not a real account; say why beside it.
 */
export const EXEMPT_HOME_NAMES = new Set(['web_user', 'a']);

/** `/Users/<name>` or `/home/<name>`; group 1 is the root, group 2 the name. */
export const HOME_PATH_PATTERN = /\/(Users|home)\/([A-Za-z0-9_][A-Za-z0-9._-]*)/g;

/** SHA-256 of the owner's home-folder username, lower-case. */
export const OWNER_USERNAME_SHA256 = 'f8645ccafa388f919b3e2f63bf64b9372762a701f565cd97e357ad312862aad2';

/** @returns {boolean} true when `name` (a matched `<name>`) is exempt. */
export function isExemptHomeName(name) {
  return EXEMPT_HOME_NAMES.has(name);
}

/** Room for `git ls-files` over a large tree; Node's 1 MiB default is too small for this one. */
const LISTING_MAX_BYTES = 256 * 1024 * 1024;

/** Digests already computed, so each distinct word is hashed once per run. */
const digestCache = new Map();

// digestOf
// SHA-256 of `word`, lower-cased, hex; memoised in digestCache.
//   word — one run of letters and digits
function digestOf(word) {
  const lower = word.toLowerCase();
  let digest = digestCache.get(lower);
  if (digest === undefined) {
    digest = createHash('sha256').update(lower).digest('hex');
    digestCache.set(lower, digest);
  }
  return digest;
}

/**
 * Lines of `text` that contain, as a whole word, the word whose SHA-256 is
 * `digest` (the owner's username unless a test passes another). Words are runs
 * of letters and digits, compared case-insensitively, so a longer login that
 * merely contains the name's letters is a different word and does not match.
 * @returns {number[]} one-based line numbers
 */
export function findOwnerUsername(text, digest = OWNER_USERNAME_SHA256) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const word of lines[i].match(/[A-Za-z0-9]+/g) ?? []) {
      if (digestOf(word) === digest) {
        hits.push(i + 1);
        break;
      }
    }
  }
  return hits;
}

/**
 * Tracked regular files of the work tree at `root`. Submodules (gitlinks) and
 * symlinks are skipped, and so is any file containing a NUL byte, which is
 * binary. Text is decoded as Latin-1, not UTF-8: every byte maps to one
 * character and back, so a rewrite never alters a byte it did not mean to, even
 * in a file that is not valid UTF-8. The patterns here are ASCII, and a UTF-8
 * multi-byte sequence decodes to characters none of them match.
 * @returns {{ path: string, text: string }[]}
 */
export function listTrackedTextFiles(root) {
  // --- Step 1: The listing ---
  // `ls-files -s` gives each entry's mode, which separates regular files
  // (100644/100755) from gitlinks (160000) and symlinks (120000).
  const listing = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: root, maxBuffer: LISTING_MAX_BYTES })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);

  // --- Step 2: Read each regular file and drop the binary ones ---
  const files = [];
  for (const entry of listing) {
    const tab = entry.indexOf('\t');
    const mode = entry.slice(0, 6);
    const path = entry.slice(tab + 1);
    if (mode !== '100644' && mode !== '100755') continue;
    let buffer;
    try {
      buffer = readFileSync(join(root, path));
    } catch {
      continue; // tracked but deleted in the work tree
    }
    if (buffer.includes(0)) continue;
    files.push({ path, text: buffer.toString('latin1') });
  }
  return files;
}
