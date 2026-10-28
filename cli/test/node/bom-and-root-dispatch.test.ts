/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/bom-and-root-dispatch.test.ts
 * Purpose: Two guarantees. `--fix-names` inserts a name where the diagnostic
 *          points, which on line 1 of a file with a leading BOM is one code
 *          unit past where a BOM-blind line table would put it. And a file is
 *          dispatched to its parser by the root element the parser finds, so a
 *          comment ahead of the root that happens to contain a tag does not
 *          decide which parser reads the file.
 * Description: The edit path through the core functions and through
 *              `fixMissingNames` on real files, BOM with LF and with CRLF; the
 *              dispatch through `rootElementName`, `loadProject` and
 *              `fixMissingNames`. Files are written under the git-ignored
 *              cli/tmp/.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyTextEdits, parseScreenFile, rootElementName } from '../../src/core/parser/index.js';
import { fixMissingNames } from '../../src/node/fix-names.js';
import { loadProject } from '../../src/node/load-project.js';

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

describe('a file is dispatched by its root element', () => {
  const COMMENTED_GLOBALS = '<!-- copied from <screen name="x"> -->\n<globals>\n</globals>\n';

  it('rootElementName skips a comment holding a tag, a declaration and a BOM', () => {
    expect(rootElementName(COMMENTED_GLOBALS, 'globals.xml')).toBe('globals');
    expect(rootElementName(`${BOM}<?xml version="1.0"?>\n<screen name="s" />`, 's.xml')).toBe('screen');
    expect(rootElementName('<!-- only a comment -->', 'e.xml')).toBeUndefined();
  });

  it('loadProject reads a commented globals file as globals, not as a screen', () => {
    const loaded = loadProject(tempFile('globals.xml', COMMENTED_GLOBALS), { label: 'globals.xml' });
    expect(loaded.model.screens).toEqual([]);
    expect(loaded.model.loadDiagnostics).toEqual([]);
  });

  it('loadProject reads a single BOM screen file as a screen', () => {
    const path = tempFile('screen_home.xml', BOM + '<screen name="home">\n    <view />\n</screen>\n');
    const loaded = loadProject(path, { label: 'screen_home.xml' });
    expect(loaded.model.screens.map((screen) => screen.name)).toEqual(['home']);
    expect(loaded.model.loadDiagnostics).toEqual([]);
  });

  it('fixMissingNames fixes a screen whose leading comment holds a <widget> tag', () => {
    const before = '<!-- <widget name="old"> -->\n<screen name="home"><view><u8g2gl_box x="0" y="0" width="4" height="4" /></view></screen>\n';
    const path = tempFile('screen_home.xml', before);
    expect(fixMissingNames(path, 'screen_home.xml')).toEqual([{ file: 'screen_home.xml', names: ['box_0'] }]);
    expect(readFileSync(path, 'utf-8')).toBe(before.replace('<u8g2gl_box ', '<u8g2gl_box name="box_0" '));
  });
});
