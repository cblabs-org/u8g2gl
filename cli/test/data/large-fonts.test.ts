/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/data/large-fonts.test.ts
 * Purpose: The committed list of U8G2's large fonts says what U8G2's own
 *          source says: every font defined inside an
 *          `#ifdef U8G2_USE_LARGE_FONTS` block of `u8g2_fonts.c`, each one a
 *          font U8G2 bundles, and nothing else. The generator's `#error` guard
 *          (§14.1) is only as right as this list, so it is recounted from the
 *          source by a second reading that shares no code with the builder,
 *          and the builder is pinned on the block shapes it must refuse.
 * Description: The independent reading is deliberately naive: the line after
 *              each `#ifdef U8G2_USE_LARGE_FONTS` names the font, because that
 *              is how U8G2 writes every block. The source checks run only with
 *              `extern/u8g2` checked out.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findLargeFonts, parseLargeFonts } from '../../src/node/font-symbol-builder.js';

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const U8G2_CSRC = resolve(CLI_ROOT, '..', 'extern', 'u8g2', 'csrc');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(CLI_ROOT, 'src', 'data', name), 'utf8')) as T;

const FONTS = readJson<string[]>('u8g2-fonts.json');
const LARGE = readJson<string[]>('u8g2-large-fonts.json');

/** One font definition as U8G2 writes it, with a one-byte body. */
const definition = (name: string): string =>
  `const uint8_t ${name}[2] U8G2_FONT_SECTION("${name}") = \n  "\\0";`;

describe('the committed large-font list', () => {
  it('has 63 names, unique and sorted, every one a font U8G2 bundles', () => {
    expect(LARGE).toHaveLength(63);
    expect(new Set(LARGE).size).toBe(LARGE.length);
    expect([...LARGE].sort()).toEqual(LARGE); // The default sort compares UTF-16 code units.
    const bundled = new Set(FONTS);
    expect(LARGE.filter((name) => !bundled.has(name))).toEqual([]);
  });

  it.runIf(existsSync(U8G2_CSRC))('is what an independent reading of u8g2_fonts.c counts, and what the builder writes', () => {
    const lines = readFileSync(join(U8G2_CSRC, 'u8g2_fonts.c'), 'latin1').split('\n');
    const recounted: string[] = [];
    lines.forEach((line, index) => {
      if (line.trim() !== '#ifdef U8G2_USE_LARGE_FONTS') return;
      const next = lines[index + 1] ?? '';
      const start = next.indexOf('u8g2_font_');
      recounted.push(next.slice(start, next.indexOf('[', start)));
    });
    expect(recounted).toHaveLength(63);
    expect(lines.filter((line) => line.startsWith('#endif') && line.includes('U8G2_USE_LARGE_FONTS'))).toHaveLength(63);
    expect([...recounted].sort()).toEqual([...LARGE].sort());
    expect(parseLargeFonts(U8G2_CSRC, FONTS)).toEqual(LARGE);
  });
});

describe('findLargeFonts', () => {
  const fonts = ['u8g2_font_a', 'u8g2_font_b', 'u8g2_font_c'];

  it('reads the fonts inside each block, and none outside', () => {
    const source = [
      '#include "u8g2.h"',
      definition('u8g2_font_c'),
      '#ifdef U8G2_USE_LARGE_FONTS',
      definition('u8g2_font_b'),
      '#endif /* U8G2_USE_LARGE_FONTS */',
      definition('u8g2_font_a'),
    ].join('\n');
    expect(findLargeFonts(source, fonts)).toEqual(['u8g2_font_b']);
  });

  it('refuses a nested conditional', () => {
    const nestedLarge = ['#ifdef U8G2_USE_LARGE_FONTS', '#ifdef U8G2_USE_LARGE_FONTS', definition('u8g2_font_a'), '#endif', '#endif'];
    expect(() => findLargeFonts(nestedLarge.join('\n'), fonts)).toThrow(/nested/);
    const nestedOther = ['#ifdef U8G2_USE_LARGE_FONTS', '#if defined(X)', definition('u8g2_font_a'), '#endif', '#endif'];
    expect(() => findLargeFonts(nestedOther.join('\n'), fonts)).toThrow(/unexpected #if/);
  });

  it('refuses an unterminated block', () => {
    const source = ['#ifdef U8G2_USE_LARGE_FONTS', definition('u8g2_font_a')].join('\n');
    expect(() => findLargeFonts(source, fonts)).toThrow(/no #endif/);
  });

  it('refuses any other conditional, a stray #endif, and an empty block', () => {
    expect(() => findLargeFonts(['#ifndef U8G2_USE_LARGE_FONTS', '#endif'].join('\n'), fonts)).toThrow(/unexpected #ifndef/);
    expect(() => findLargeFonts(['#ifdef U8G2_USE_LARGE_FONTS', '#else', '#endif'].join('\n'), fonts)).toThrow(/unexpected #else/);
    expect(() => findLargeFonts('#endif', fonts)).toThrow(/unexpected #endif/);
    expect(() => findLargeFonts(['#ifdef U8G2_USE_LARGE_FONTS', '#endif'].join('\n'), fonts)).toThrow(/defines no font/);
  });

  it('refuses a large font missing from the font list', () => {
    const source = ['#ifdef U8G2_USE_LARGE_FONTS', definition('u8g2_font_z'), '#endif'].join('\n');
    expect(() => findLargeFonts(source, fonts)).toThrow(/u8g2_font_z/);
  });
});
