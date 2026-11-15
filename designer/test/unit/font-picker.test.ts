/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/font-picker.test.ts
 * Purpose: The rules behind the font picker (ui_spec §6.4): every built-in
 *          font is a row with its height and decoded facts; the search
 *          matches as the display search does; the height, character-set and
 *          box filters keep what they say; the fonts a form declares are
 *          marked; U8G2's large fonts are marked, and "Hide large fonts"
 *          leaves out exactly them; and an undecoded font says so rather
 *          than guessing.
 * Description: The picker model's pure functions over the shipped font list
 *              and heights, and `declaredBuiltins()` over small `globals.xml`
 *              texts read as the form reads them.
 */

import { expect, test } from '@playwright/test';
import FONT_NAMES from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import FONT_HEIGHTS from '@u8g2gl/data/u8g2-font-heights.json' with { type: 'json' };
import LARGE_FONTS from '@u8g2gl/data/u8g2-large-fonts.json' with { type: 'json' };
import { buildFormModel } from '../../src/forms/form-model';
import { declaredBuiltins, factsLine, filterFonts, fontRows, heightRange, LARGE_FONT_BADGE, LARGE_FONT_TOOLTIP, NO_FILTER, setOptions } from '../../src/forms/font-picker-model';
import { decodeSampleBits, samplePixel } from '../../src/forms/font-samples';

const HEIGHTS: Readonly<Record<string, number>> = FONT_HEIGHTS;
const ROWS = fontRows(FONT_NAMES, HEIGHTS, new Set(['u8g2_font_helvR08_tr']));

/** The `<builtin>` names a globals.xml text declares, as the form reads it. */
function declaredIn(fonts: string): ReadonlySet<string> {
  const reading = buildFormModel('globals.xml', `<globals>\n  <fonts>\n    ${fonts}\n  </fonts>\n</globals>\n`);
  if (reading.kind !== 'form') throw new Error(reading.problem);
  return declaredBuiltins(reading.model);
}

test('every built-in font is a row, with its height and decoded facts, and declared fonts are marked', () => {
  expect(ROWS.map((row) => row.name)).toEqual(FONT_NAMES);
  const helv = ROWS.find((row) => row.name === 'u8g2_font_helvR08_tr');
  expect(helv).toMatchObject({ height: HEIGHTS['u8g2_font_helvR08_tr'], box: { code: 't' }, set: { code: 'r' }, declared: true });
  expect(ROWS.filter((row) => row.declared).map((row) => row.name)).toEqual(['u8g2_font_helvR08_tr']);
  expect(factsLine(helv ?? ROWS[0]!)).toBe(`${HEIGHTS['u8g2_font_helvR08_tr']} px · reduced (ASCII 32–127) · transparent`);
});

test('an undecoded font says its set and box are unknown', () => {
  const unifont = ROWS.find((row) => row.name === 'u8g2_font_unifont_t_72_73');
  expect(unifont?.set).toBeUndefined();
  expect(factsLine(unifont ?? ROWS[0]!)).toMatch(/character set unknown · glyph box unknown$/);
});

test('the search matches every word in the name, any case, shortest names first', () => {
  const found = filterFonts(ROWS, 'HELV r08', NO_FILTER);
  expect(found.rows.length).toBeGreaterThan(0);
  for (const row of found.rows) expect(row.name.toLowerCase()).toMatch(/helv.*r08|r08.*helv/);
  const lengths = found.rows.map((row) => row.name.length);
  expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
  expect(filterFonts(ROWS, 'helvR08_tr', NO_FILTER).rows[0]?.name).toBe('u8g2_font_helvR08_tr');
  expect(filterFonts(ROWS, 'no such font zz', NO_FILTER).total).toBe(0);
});

test('with no query every font is kept in the list’s order, up to the limit, with the total', () => {
  const found = filterFonts(ROWS, '', NO_FILTER, 10);
  expect(found.rows.map((row) => row.name)).toEqual(FONT_NAMES.slice(0, 10));
  expect(found.total).toBe(FONT_NAMES.length);
});

test('the height filter keeps fonts within the range, inclusive', () => {
  const found = filterFonts(ROWS, '', { minHeight: 10, maxHeight: 12 }, 5000);
  expect(found.total).toBeGreaterThan(0);
  for (const row of found.rows) expect(row.height).toBeGreaterThanOrEqual(10);
  for (const row of found.rows) expect(row.height).toBeLessThanOrEqual(12);
  expect(found.total).toBe(ROWS.filter((row) => row.height !== undefined && row.height >= 10 && row.height <= 12).length);
  const { min, max } = heightRange(ROWS);
  expect(filterFonts(ROWS, '', { minHeight: min, maxHeight: max }, 5000).total).toBe(FONT_NAMES.length);
});

test('the character-set filter keeps one set, and offers every set some font has, unknown last', () => {
  const digits = filterFonts(ROWS, '', { set: 'n' }, 5000);
  expect(digits.total).toBeGreaterThan(0);
  for (const row of digits.rows) expect(row.set?.code).toBe('n');
  const unknown = filterFonts(ROWS, '', { set: 'unknown' }, 5000);
  expect(unknown.total).toBe(19);
  const options = setOptions(ROWS);
  expect(options.map((option) => option.code).slice(0, 5)).toEqual(['f', 'r', 'u', 'n', 'e']);
  expect(options.at(-1)).toMatchObject({ code: 'unknown', count: 19 });
  expect(options.reduce((sum, option) => sum + option.count, 0)).toBe(FONT_NAMES.length);
  // 'symbol' and 'symbols' share a label and are told apart by their postfix.
  expect(options.filter((option) => option.code.startsWith('symbol')).map((option) => option.label)).toEqual(['symbols (_symbol)', 'symbols (_symbols)']);
});

test('the box filter keeps monospace, proportional or one box', () => {
  const mono = filterFonts(ROWS, '', { box: 'monospace' }, 5000);
  for (const row of mono.rows) expect(['m', '8']).toContain(row.box?.code);
  const proportional = filterFonts(ROWS, '', { box: 'proportional' }, 5000);
  for (const row of proportional.rows) expect(['t', 'h']).toContain(row.box?.code);
  expect(mono.total + proportional.total).toBe(FONT_NAMES.length - 19);
  const eight = filterFonts(ROWS, '', { box: '8' }, 5000);
  expect(eight.total).toBeGreaterThan(0);
  for (const row of eight.rows) expect(row.box?.code).toBe('8');
});

test('filters combine with the search', () => {
  const found = filterFonts(ROWS, 'logisoso', { set: 'n', minHeight: 50 }, 5000);
  expect(found.total).toBeGreaterThan(0);
  for (const row of found.rows) {
    expect(row.name).toContain('logisoso');
    expect(row.set?.code).toBe('n');
    expect(row.height).toBeGreaterThanOrEqual(50);
  }
});

test('U8G2’s large fonts are marked, and only they are', () => {
  expect(ROWS.filter((row) => row.large).map((row) => row.name)).toEqual(FONT_NAMES.filter((name) => LARGE_FONTS.includes(name)));
  expect(ROWS.filter((row) => row.large)).toHaveLength(63);
  expect(ROWS.find((row) => row.name === 'u8g2_font_unifont_t_gb2312')?.large).toBe(true);
  expect(ROWS.find((row) => row.name === 'u8g2_font_helvR08_tr')?.large).toBe(false);
  expect(LARGE_FONT_BADGE).toBe('large (over 32 KB): needs U8G2_USE_LARGE_FONTS');
  expect(LARGE_FONT_TOOLTIP).toMatch(/unix, ARM and ESP targets \(see u8g2\.h\)/);
  expect(LARGE_FONT_TOOLTIP).toMatch(/error naming this font/);
});

test('"Hide large fonts" is off by default, and on leaves out exactly the large fonts', () => {
  expect(NO_FILTER.hideLarge).toBeUndefined();
  expect(filterFonts(ROWS, 'gb2312', NO_FILTER, 5000).rows.some((row) => row.large)).toBe(true);
  const hidden = filterFonts(ROWS, '', { hideLarge: true }, 5000);
  expect(hidden.total).toBe(FONT_NAMES.length - 63);
  expect(hidden.rows.some((row) => row.large)).toBe(false);
  expect(filterFonts(ROWS, '', { hideLarge: false }, 5000).total).toBe(FONT_NAMES.length);
  // Combined with a search: the small gb2312 fonts stay, the large ones go.
  const search = filterFonts(ROWS, 'unifont gb2312', { hideLarge: true }, 5000);
  expect(search.rows.map((row) => row.name)).not.toContain('u8g2_font_unifont_t_gb2312');
  expect(search.total).toBe(filterFonts(ROWS, 'unifont gb2312', NO_FILTER, 5000).rows.filter((row) => !row.large).length);
});

test('the declared fonts are read from the form, wherever the <builtin> is', () => {
  expect([...declaredIn('<builtin name="u8g2_font_6x10_mr" />\n    <builtin name="u8g2_font_helvR08_tr" />')]).toEqual(['u8g2_font_6x10_mr', 'u8g2_font_helvR08_tr']);
  expect([...declaredIn('<bdf name="mine" src="fonts/mine.bdf" />')]).toEqual([]);
});

test('a sample’s bits read row-major, most significant bit first', () => {
  // 3×2: row 0 is 1 0 1, row 1 is 0 1 1 → bits 101011.. → 0b10101100.
  const bytes = decodeSampleBits({ w: 3, h: 2, bits: btoa(String.fromCharCode(0b10101100)) });
  expect([0, 1, 2].map((x) => samplePixel(bytes, 3, x, 0))).toEqual([true, false, true]);
  expect([0, 1, 2].map((x) => samplePixel(bytes, 3, x, 1))).toEqual([false, true, true]);
});
