/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/diagnostics.test.ts
 * Purpose: The mapping from [D-16] diagnostics to Monaco markers and Problems
 *          rows: same place, same code, suggestions kept as data, errors first,
 *          and a failed build's compiler-style text read back into rows.
 * Description: Pure functions over literal diagnostics.
 */

import { expect, test } from '@playwright/test';
import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import { MARKER_SEVERITY, markersByFile, parseBuildFailure, sameProblems, toProblemRows } from '../../src/pipeline/diagnostics';

const font: Diagnostic = {
  code: 'U8G2GL_UNKNOWN_FONT',
  severity: 'error',
  file: 'screens/screen_home.xml',
  line: 14,
  column: 32,
  message: "unknown font 'small_9'",
  suggestions: ['small_09'],
};
const warning: Diagnostic = { code: 'U8G2GL_X', severity: 'warning', file: 'globals.xml', line: 2, column: 1, message: 'w' };
const later: Diagnostic = { ...font, line: 3, column: 5, message: 'earlier line' };

test('rows put errors first, then sort by file, line and column, keeping code and suggestions', () => {
  const rows = toProblemRows([warning, font, later]);
  expect(rows.map((r) => [r.severity, r.line])).toEqual([
    ['error', 3],
    ['error', 14],
    ['warning', 2],
  ]);
  expect(rows[1]).toMatchObject({ code: 'U8G2GL_UNKNOWN_FONT', file: 'screens/screen_home.xml', column: 32, suggestions: ['small_09'] });
});

test('rows have stable keys, so an unchanged set compares equal', () => {
  expect(sameProblems(toProblemRows([font, warning]), toProblemRows([warning, font]))).toBe(true);
  expect(sameProblems(toProblemRows([font]), toProblemRows([later]))).toBe(false);
});

test('markers are grouped by file, at the diagnostic position, spanning the word there', () => {
  const byFile = markersByFile([font, warning], (file, line, column) => (file === 'screens/screen_home.xml' && line === 14 && column === 32 ? 41 : undefined));
  expect([...byFile.keys()].sort()).toEqual(['globals.xml', 'screens/screen_home.xml']);
  expect(byFile.get('screens/screen_home.xml')?.[0]).toEqual({
    severity: MARKER_SEVERITY.error,
    message: "unknown font 'small_9'\nDid you mean: small_09?",
    code: 'U8G2GL_UNKNOWN_FONT',
    source: 'u8g2gl',
    startLineNumber: 14,
    startColumn: 32,
    endLineNumber: 14,
    endColumn: 41,
  });
  // A file that is not open has no word to measure: one character.
  expect(byFile.get('globals.xml')?.[0]).toMatchObject({ severity: MARKER_SEVERITY.warning, startColumn: 1, endColumn: 2 });
});

test("a diagnostic's own end wins over the word", () => {
  const ranged: Diagnostic = { ...warning, endLine: 4, endColumn: 9 };
  expect(markersByFile([ranged], () => 99).get('globals.xml')?.[0]).toMatchObject({ endLineNumber: 4, endColumn: 9 });
});

test('a failed build reads back into located diagnostics; other text yields none', () => {
  const text = [
    'error: widgets/wd_x/wd_x.cpp:12:10',
    "   'Arduino.h' is a platform header; the editor Wasm cannot include it",
    '',
    'warning: globals.xml:3:5',
    '   something minor',
  ].join('\n');
  expect(parseBuildFailure(text)).toEqual([
    {
      code: 'U8G2GL_EDITOR_BUILD',
      severity: 'error',
      file: 'widgets/wd_x/wd_x.cpp',
      line: 12,
      column: 10,
      message: "'Arduino.h' is a platform header; the editor Wasm cannot include it",
    },
    { code: 'U8G2GL_EDITOR_BUILD', severity: 'warning', file: 'globals.xml', line: 3, column: 5, message: 'something minor' },
  ]);
  expect(parseBuildFailure("no Emscripten 5.0.3: run 'u8g2gl toolchain install'")).toEqual([]);
});
