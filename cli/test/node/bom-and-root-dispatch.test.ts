/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/bom-and-root-dispatch.test.ts
 * Purpose: A file with a leading BOM now parses, and a file is dispatched to
 *          its parser by the root element the parser actually finds. Two
 *          consequences are pinned here. `--fix-names` must insert a name
 *          where the diagnostic points, which on line 1 of a BOM file is one
 *          code unit past where a BOM-blind line table would put it. And a
 *          comment ahead of the root that happens to contain a tag must not
 *          decide which parser reads the file, as the old first-`<name`
 *          search let it.
 * Description: The edit path through the core functions and through
 *              `fixMissingNames` on real files, BOM with LF and with CRLF; the
 *              dispatch through `rootElementName`, `loadProject` and
 *              `fixMissingNames`. Files are written under the git-ignored
 *              cli/tmp/.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyTextEdits, parseScreenFile } from '../../src/core/parser/index.js';
import { fixMissingNames } from '../../src/node/fix-names.js';

const BOM = '﻿';
const GENERATE = { missingNamePolicy: 'generate' } as const;
const tempDirs: string[] = [];

// tempFile
// Write `content` to a fresh temporary file and return its absolute path.
function tempFile(name: string, content: string): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/bom-dispatch-'));
  tempDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A screen whose first unnamed element is on line 1, and a second on line 2. */
const SCREEN = (eol: string): string =>
  `<screen name="home"><view><u8g2gl_box x="0" y="0" width="4" height="4" />${eol}` +
  `<u8g2gl_box x="8" y="0" width="4" height="4" /></view></screen>${eol}`;
const NAMED = (eol: string): string =>
  `<screen name="home"><view><u8g2gl_box name="box_0" x="0" y="0" width="4" height="4" />${eol}` +
  `<u8g2gl_box name="box_1" x="8" y="0" width="4" height="4" /></view></screen>${eol}`;

describe('name insertion after a BOM', () => {
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('lands after the tag name on line 1 and line 2 (%s)', (_name, eol) => {
    const text = BOM + SCREEN(eol);
    const edits = parseScreenFile(text, 'screens/screen_home.xml', GENERATE).nameEdits ?? [];
    expect(edits.map((edit) => [edit.loc.line, edit.loc.column])).toEqual([
      [1, 38],
      [2, 12],
    ]);
    expect(applyTextEdits(text, edits)).toBe(BOM + NAMED(eol));
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('is right through fixMissingNames on a file (%s)', (_name, eol) => {
    const path = tempFile('screen_home.xml', BOM + SCREEN(eol));
    expect(fixMissingNames(path, 'screen_home.xml')).toEqual([
      { file: 'screen_home.xml', names: ['box_0', 'box_1'] },
    ]);
    expect(readFileSync(path, 'utf-8')).toBe(BOM + NAMED(eol));
  });
});
