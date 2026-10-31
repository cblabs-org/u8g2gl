/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/data/font-heights.test.ts
 * Purpose: The committed table of built-in font heights says what U8G2's own
 *          font data says: one entry for every bundled font, in the font
 *          list's order, each equal to byte 10 (`max_char_height`) of that
 *          font's header — checked for a sample of fonts by a second,
 *          independent decoder of the C string literal — and the whole table
 *          equal to what the builder writes from the pinned source, so it is
 *          never stale. The C-literal decoder itself is pinned on the escapes
 *          U8G2's data uses.
 * Description: The independent decoder is JavaScript's own: a C string of
 *              octal escapes is a valid sloppy-mode JavaScript string with
 *              the same meaning, so `Function` evaluates it without this
 *              module's code. Runs only with `extern/u8g2` checked out.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeCStringPrefix, FONT_HEIGHT_BYTE, parseFontHeights } from '../../src/node/font-height-builder.js';

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const U8G2_CSRC = resolve(CLI_ROOT, '..', 'extern', 'u8g2', 'csrc');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(CLI_ROOT, 'src', 'data', name), 'utf8')) as T;

describe('decodeCStringPrefix', () => {
  it('decodes octal escapes greedily up to three digits, hex, single-character escapes and adjacent literals', () => {
    expect(decodeCStringPrefix('"\\277\\0\\2\\12A"', 5)).toEqual([0o277, 0, 2, 10, 65]);
    expect(decodeCStringPrefix('"\\1234"', 2)).toEqual([0o123, 52]);
    expect(decodeCStringPrefix('"\\x41\\n\\\\\\""', 4)).toEqual([0x41, 10, 92, 34]);
    expect(decodeCStringPrefix('"ab"\n  "cd";\n"ef"', 10)).toEqual([97, 98, 99, 100]);
  });
});

describe.runIf(existsSync(U8G2_CSRC))('the built-in font height table', () => {
  const fonts = readJson<string[]>('u8g2-fonts.json');
  const heights = readJson<Record<string, number>>('u8g2-font-heights.json');

  it('has one entry per bundled font, in the font list’s order, and is what the builder writes from the pinned source', () => {
    expect(Object.keys(heights)).toEqual(fonts);
    expect(heights).toEqual(parseFontHeights(U8G2_CSRC, fonts));
  });

  it('matches byte 10 of each sampled font’s header, decoded independently', () => {
    const source = readFileSync(join(U8G2_CSRC, 'u8g2_fonts.c'), 'latin1');
    // Every 50th font, and the ones the departures project uses.
    const sample = [...fonts.filter((_, i) => i % 50 === 0), 'u8g2_font_6x10_mr', 'u8g2_font_helvR08_tr'];
    for (const font of sample) {
      const at = source.indexOf(`const uint8_t ${font}[`);
      const literal = /=\s*((?:"(?:[^"\\]|\\.)*"\s*)+);/.exec(source.slice(at))?.[1];
      expect(literal, font).toBeDefined();
      // The independent decoder: JavaScript reads the literal itself.
      const decoded = new Function(`return ${(literal ?? '""').replace(/"\s+"/g, '')};`)() as string;
      expect(heights[font], font).toBe(decoded.charCodeAt(FONT_HEIGHT_BYTE));
    }
    expect(sample.length).toBeGreaterThan(40);
  });

  it('gives the heights of fonts whose size is in their name', () => {
    expect(heights.u8g2_font_6x10_tf).toBe(10);
    expect(heights.u8g2_font_10x20_tf).toBe(20);
  });
});
