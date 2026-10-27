/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/temp-project.ts
 * Purpose: Throwaway project directories for the design server's tests, under
 *          the git-ignored cli/tmp/ as the other filesystem tests use, so a
 *          failed run leaves nothing in the repository.
 * Description: `makeTempDir` creates and remembers a directory; `writeFiles`
 *              seeds project-relative paths; `removeTempDirs` deletes every
 *              remembered directory.
 *
 * Exports:
 * - makeTempDir():     A fresh directory under cli/tmp/
 * - writeFiles():      Write project-relative files into a directory
 * - removeTempDirs():  Delete everything makeTempDir created
 * - MINIMAL_PROJECT:   A u8g2gl.xml and a screen
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const created: string[] = [];

/** A u8g2gl.xml and one screen — enough for `design` to accept the directory. */
export const MINIMAL_PROJECT: Readonly<Record<string, string>> = {
  'u8g2gl.xml': '<u8g2gl schema="0.4" name="design" version="1.0.0" />\n',
  'screens/screen_home.xml': '<screen name="home" />\n',
};

/** @brief A fresh, empty directory under cli/tmp/, deleted by removeTempDirs. */
export function makeTempDir(prefix: string): string {
  const base = resolve(__dirname, '../../../tmp');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, `${prefix}-`));
  created.push(dir);
  return dir;
}

/** @brief Writes project-relative files (text or bytes), creating directories. */
export function writeFiles(root: string, files: Readonly<Record<string, string | Uint8Array>>): void {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, ...path.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

/** @brief Deletes every directory makeTempDir created. */
export function removeTempDirs(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
