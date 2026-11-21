/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/font-view.test.ts
 * Purpose: The Fonts view's measurements and layouts, without a browser: the
 *          string ruler's reading (the lit pixels' box in a U8G2 buffer), the
 *          glyph codes a font table carries, and the small projects the view
 *          draws its grid and ruler through.
 * Description: Buffers are built bit by bit in U8G2's tile layout, so each
 *              case states the pixels it lights. The glyph walk is checked on
 *              two real tables from the packaged u8g2_fonts.c, through the
 *              design server's own parser.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseU8g2Fonts } from '../../../cli/src/node/design/builtin-fonts';
import { escapeXml, fontEncodings, fontMetrics, glyphGridTexts, GRID_LIMIT, inkBox, rulerTexts, VIEW_SCREEN, VIEW_SETUP } from '../../src/fonts/font-view-model';

// buffer
// A width × height U8G2 tile buffer with the given pixels lit.
function buffer(width: number, height: number, lit: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const bytes = new Uint8Array(width * Math.ceil(height / 8));
  for (const [x, y] of lit) bytes[(y >> 3) * width + x]! |= 1 << (y & 7);
  return bytes;
}

const FONTS = parseU8g2Fonts(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'extern', 'u8g2', 'csrc', 'u8g2_fonts.c'))).fonts;

test('the ruler reads the lit pixels\' box: width and height in device pixels, inclusive', () => {
  expect(inkBox(buffer(32, 16, []), 32, 16)).toBeUndefined();
  expect(inkBox(buffer(32, 16, [[3, 2]]), 32, 16)).toEqual({ x: 3, y: 2, width: 1, height: 1 });
  // Across a tile row boundary (y 7 and 8) and to the last column.
  expect(inkBox(buffer(32, 16, [[1, 7], [31, 8], [5, 3]]), 32, 16)).toEqual({ x: 1, y: 3, width: 31, height: 6 });
});

test('the ruler can read inside one rectangle only, clipped to the display', () => {
  const frame = buffer(32, 16, [[0, 0], [10, 10], [12, 11]]);
  expect(inkBox(frame, 32, 16, { x: 8, y: 8, width: 8, height: 8 })).toEqual({ x: 10, y: 10, width: 3, height: 2 });
  expect(inkBox(frame, 32, 16, { x: 20, y: 0, width: 40, height: 40 })).toBeUndefined();
});

test('a font table\'s glyph codes, as U8G2 looks them up', () => {
  // u8g2_font_6x10_mr: "reduced", the 95 printable ASCII codes, 32..126.
  expect(fontEncodings(FONTS.get('u8g2_font_6x10_mr')!)).toEqual(Array.from({ length: 95 }, (_, i) => 32 + i));
  // u8g2_font_6x10_tn: digits and a few symbols, nothing else.
  const digits = fontEncodings(FONTS.get('u8g2_font_6x10_tn')!);
  expect(digits).toEqual(expect.arrayContaining([48, 49, 57]));
  expect(digits).not.toContain(65);
  // A Unicode font reaches past 255.
  expect(Math.max(...fontEncodings(FONTS.get('u8g2_font_unifont_t_symbols')!))).toBeGreaterThan(255);
  expect(fontEncodings(new Uint8Array(4))).toEqual([]);
});

test('a font\'s glyph box comes from its header: 6x10 is 6 wide, 10 high, its baseline 8 down', () => {
  expect(fontMetrics(FONTS.get('u8g2_font_6x10_mr')!)).toEqual({ width: 6, height: 10, ascent: 8 });
  expect(fontMetrics(new Uint8Array(3))).toEqual({ width: 0, height: 0, ascent: 0 });
});

test('the glyph grid is one glyph per cell, in rows across the view\'s display, at most GRID_LIMIT', () => {
  const { texts, cells } = glyphGridTexts('<globals/>', 'u8g2_font_6x10_mr', [65, 66, 67], { width: 298, height: 18, ascent: 15 });
  expect(cells).toEqual([
    { code: 65, x: 0, y: 0, width: 300, height: 20 },
    { code: 66, x: 300, y: 0, width: 300, height: 20 },
    { code: 67, x: 0, y: 20, width: 300, height: 20 },
  ]);
  expect(texts.get('u8g2gl.xml')).toContain(`setup="${VIEW_SETUP}"`);
  expect(texts.get(VIEW_SCREEN)).toContain('<u8g2gl_glyph name="g2" x="0" y="35" width="300" height="20" font="u8g2_font_6x10_mr" glyph="67" />');
  expect(texts.get('globals.xml')).toBe('<globals/>');
  const many = glyphGridTexts('', 'f', Array.from({ length: 1000 }, (_, i) => i), { width: 6, height: 6, ascent: 5 });
  expect(many.cells).toHaveLength(GRID_LIMIT);
});

test('the glyph grid wraps at the width it is given, so a narrow view is not shrunk', () => {
  // A sidebar 190 px wide at zoom 2 gives 95 device pixels: eleven 8 px cells a row.
  const { cells } = glyphGridTexts('', 'f', Array.from({ length: 30 }, (_, i) => 32 + i), { width: 6, height: 10, ascent: 8 }, 95);
  expect(Math.max(...cells.map((c) => c.x + c.width))).toBeLessThanOrEqual(95);
  expect(cells[11]).toMatchObject({ x: 0, y: 12 });
  expect(cells).toHaveLength(30);
});

test('the ruler draws its text escaped, at the display\'s top left', () => {
  expect(escapeXml('a<b & "c">')).toBe('a&lt;b &amp; &quot;c&quot;&gt;');
  expect(rulerTexts('<globals/>', 'u8g2_font_6x10_mr', 'A&B').get(VIEW_SCREEN)).toContain('x="0" y="0" width="640" height="320" font="u8g2_font_6x10_mr" text="A&amp;B"');
});
