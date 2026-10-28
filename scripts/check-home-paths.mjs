/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/check-home-paths.mjs
 * Purpose: Keeps home-folder paths out of the repository once
 *          scripts/rewrite-home-paths.mjs has taken them out. Agents and
 *          tools paste absolute paths into logs and records without noticing;
 *          this fails CI on the first one, while it is one line to fix.
 * Description: Fails (exit 1) when any tracked text file contains an absolute
 *              home path (`/Users/<name>`, `/home/<name>`; the exempt names in
 *              scripts/home-paths.mjs aside) or the owner's username as a word,
 *              printing each as `file:line`. The username is matched by digest,
 *              so neither this file nor its shared module contains it.
 *              `--self-test` checks the matcher against planted text instead,
 *              including that it fails on a planted path; CI runs both.
 *              Usage: node scripts/check-home-paths.mjs [--self-test]
 *
 * Exports:
 * - scanText():  Every offending line of one file's text, with the reason
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  HOME_PATH_PATTERN,
  OWNER_USERNAME_SHA256,
  findOwnerUsername,
  isExemptHomeName,
  listTrackedTextFiles,
} from './home-paths.mjs';

/**
 * Every offending line of one file's text.
 * @param usernameDigest SHA-256 of the username to find; the self-test passes its own
 * @returns {{ line: number, reason: string }[]}
 */
export function scanText(text, usernameDigest = OWNER_USERNAME_SHA256) {
  const findings = [];

  // --- Step 1: Absolute home paths, line by line so each finding has a location ---
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(HOME_PATH_PATTERN)) {
      if (isExemptHomeName(match[2])) continue;
      findings.push({ line: i + 1, reason: `absolute home path under /${match[1]}/` });
      break;
    }
  }

  // --- Step 2: The owner's username anywhere else, such as in a relative path ---
  for (const line of findOwnerUsername(text, usernameDigest)) {
    if (!findings.some((f) => f.line === line)) {
      findings.push({ line, reason: "the owner's username" });
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Planted text the guard must reject, and text it must accept. The username
 * cases plant a stand-in word and pass its digest, which exercises the same
 * matcher the owner's digest goes through without writing the username here.
 */
function selfTest() {
  const STAND_IN = 'plantedusername';
  const standInDigest = createHash('sha256').update(STAND_IN).digest('hex');
  // Planted paths are assembled here, not written out, so this file passes
  // the guard it implements.
  const home = (root, name) => `/${root}/${name}`;
  const mustFail = [
    `cd ${home('Users', 'someone')}/Documents/Projects/U8G2GL`,
    `log: -I${home('home', 'builder')}/src/include`,
    `file://${home('Users', 'x')}/notes.md`,
    `relative/${STAND_IN}/path`,
    `owner: ${STAND_IN.toUpperCase()}@example.com`,
  ];
  const mustPass = [
    'cd ~/Documents/Projects/U8G2GL',
    'cmake -B build && ctest',
    'Emscripten keeps files under /home/web_user',
    "toolchainCacheRoot('darwin', {}, '/Users/a')",
    'an already elided path: /Users/.../U8G2GL-05r',
    `a longer login: matthew${STAND_IN}`,
  ];

  let failures = 0;
  for (const text of mustFail) {
    if (scanText(text, standInDigest).length === 0) {
      console.error(`self-test: not detected: ${JSON.stringify(text)}`);
      failures++;
    }
  }
  for (const text of mustPass) {
    if (scanText(text, standInDigest).length !== 0) {
      console.error(`self-test: false positive: ${JSON.stringify(text)}`);
      failures++;
    }
  }
  const total = mustFail.length + mustPass.length;
  console.log(`self-test: ${total - failures}/${total} cases behave`);
  return failures === 0;
}

// main
// The guard (exit 0 clean, 1 with each finding printed as file:line) or, with
// --self-test, the matcher's own check (exit 0 when every case behaves).
function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const root = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
  let count = 0;
  for (const file of listTrackedTextFiles(root)) {
    for (const finding of scanText(file.text)) {
      console.error(`${file.path}:${finding.line}: ${finding.reason}`);
      count++;
    }
  }
  if (count > 0) {
    console.error(
      `${count} home-folder path(s) or username(s) in tracked files. ` +
        'Use a repo-relative path or ~/, or run node scripts/rewrite-home-paths.mjs.',
    );
    process.exit(1);
  }
  console.log('No home-folder paths in tracked files.');
}

// Run only as a script, not when imported (process.argv[1] is unset under `node -e`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
