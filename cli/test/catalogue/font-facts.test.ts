/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/font-facts.test.ts
 * Purpose: The font-name decoder says only what U8G2's naming scheme says.
 *          Every bundled font is run through it, and the fonts it cannot
 *          decode are compared with a list written down here, so a U8G2
 *          upgrade that brings a new suffix shows up as a diff to this file
 *          rather than as a font the picker silently mislabels.
 * Description: Pins the standard and custom suffix shapes on known names,
 *              the unknown list over `u8g2-fonts.json`, the large flag against
 *              the extracted large-font list for every bundled font, and — with
 *              `extern/u8g2` checked out — that every custom postfix in the
 *              table is one U8G2's font build tool actually writes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_SETS, fontFacts } from '../../src/core/catalogue/font-facts.js';
import { LARGE_FONTS } from '../../src/core/catalogue/large-fonts.js';

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD_C = resolve(CLI_ROOT, '..', 'extern', 'u8g2', 'tools', 'font', 'build', 'build.c');
const FONTS = JSON.parse(readFileSync(join(CLI_ROOT, 'src', 'data', 'u8g2-fonts.json'), 'utf8')) as string[];

// The bundled fonts the table cannot decode. Each has a bare-number postfix
// (or, for siji, a size) whose meaning is a different map file or Unicode
// block per font, so naming any of them would be a guess.
const EXPECTED_UNKNOWN = [
  'u8g2_font_gb16st_t_1',
  'u8g2_font_gb16st_t_2',
  'u8g2_font_gb16st_t_3',
  'u8g2_font_gb24st_t_1',
  'u8g2_font_gb24st_t_2',
  'u8g2_font_gb24st_t_3',
  'u8g2_font_siji_t_6x10',
  'u8g2_font_unifont_t_0_72_73',
  'u8g2_font_unifont_t_0_75',
  'u8g2_font_unifont_t_0_76',
  'u8g2_font_unifont_t_0_77',
  'u8g2_font_unifont_t_0_78_79',
  'u8g2_font_unifont_t_0_86',
  'u8g2_font_unifont_t_72_73',
  'u8g2_font_unifont_t_75',
  'u8g2_font_unifont_t_76',
  'u8g2_font_unifont_t_77',
  'u8g2_font_unifont_t_78_79',
  'u8g2_font_unifont_t_86',
];

describe('fontFacts', () => {
  it('decodes a standard suffix into its box and its set', () => {
    const facts = fontFacts('u8g2_font_helvR08_tr');
    expect(facts.box).toMatchObject({ code: 't', label: 'transparent', monospace: false });
    expect(facts.set).toMatchObject({ code: 'r', standard: true });
    expect(fontFacts('u8g2_font_6x10_mf').box).toMatchObject({ code: 'm', monospace: true });
    expect(fontFacts('u8g2_font_6x10_mf').set?.code).toBe('f');
    expect(fontFacts('u8g2_font_profont29_8n').box?.code).toBe('8');
    expect(fontFacts('u8g2_font_10x20_me').set?.code).toBe('e');
    expect(fontFacts('u8g2_font_mozart_nbp_hn').box?.label).toBe('common height');
  });

  it('decodes a known custom postfix, and an empty one, from the end of the name', () => {
    expect(fontFacts('u8g2_font_b10_b_t_japanese1')).toMatchObject({ box: { code: 't' }, set: { code: 'japanese1', standard: false } });
    expect(fontFacts('u8g2_font_6x12_m_symbols')).toMatchObject({ box: { code: 'm' }, set: { code: 'symbols' } });
    expect(fontFacts('u8g2_font_open_iconic_all_1x_t')).toMatchObject({ box: { code: 't' }, set: { code: '' } });
    expect(fontFacts('u8g2_font_pxplustandynewtv_8_all')).toMatchObject({ box: { code: '8' }, set: { code: 'all' } });
  });

  it('reports an unknown suffix, or a name outside the scheme, as unknown rather than guessing', () => {
    expect(fontFacts('u8g2_font_unifont_t_72_73')).toEqual({ box: undefined, set: undefined, large: false });
    expect(fontFacts('u8g2_font_siji_t_6x10')).toEqual({ box: undefined, set: undefined, large: false });
    expect(fontFacts('u8x8_font_8x13_1x2_r')).toEqual({ box: undefined, set: undefined, large: false });
    expect(fontFacts('my_font')).toEqual({ box: undefined, set: undefined, large: false });
  });

  it('decodes every bundled font except the listed unknowns', () => {
    const unknown = FONTS.filter((name) => {
      const facts = fontFacts(name);
      return facts.box === undefined || facts.set === undefined;
    });
    expect(unknown).toEqual(EXPECTED_UNKNOWN);
  });

  it('says a font is large exactly for the 63 in the extracted list, for every bundled font', () => {
    const large = new Set(LARGE_FONTS);
    expect(large.size).toBe(63);
    for (const name of FONTS) expect(fontFacts(name).large, name).toBe(large.has(name));
    expect(FONTS.filter((name) => fontFacts(name).large)).toHaveLength(63);
    // Read from the list, not the name: a large font's facts still decode as usual.
    expect(fontFacts('u8g2_font_unifont_t_gb2312')).toMatchObject({ box: { code: 't' }, set: { code: 'gb2312' }, large: true });
    expect(fontFacts('u8g2_font_6x10_mr').large).toBe(false);
  });
});

describe.runIf(existsSync(BUILD_C))('the custom postfixes', () => {
  it('are each one U8G2’s font build tool writes as a map_custom_postfix', () => {
    const source = readFileSync(BUILD_C, 'latin1');
    // A font table row ends `..., "<map_custom>", "<postfix>" }`.
    const postfixes = new Set([...source.matchAll(/"[^"]*",\s*"(_?[A-Za-z0-9_]*)"\s*\}/g)].map((m) => (m[1] ?? '').replace(/^_/, '')));
    for (const set of FONT_SETS.filter((s) => !s.standard)) {
      expect(postfixes.has(set.code), set.code).toBe(true);
    }
  });
});
