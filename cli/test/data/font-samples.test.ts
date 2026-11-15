/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/data/font-samples.test.ts
 * Purpose: The committed font samples cover every bundled font and each is a
 *          well-formed 1-bit image, so the designer's picker never meets a
 *          font it cannot show; and the build's pure steps — the generated
 *          font table, reading the renderer's output, the JSON layout —
 *          refuse anything malformed rather than writing it.
 * Description: The renderer itself needs a C compiler and runs only under
 *              `npm run build:font-samples`; its reproducibility is checked by
 *              running that twice and comparing. These tests read the
 *              committed file and exercise font-sample-builder.ts directly.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIGITS_TEXT,
  fontSampleTable,
  parseSampleOutput,
  SAMPLE_TEXT,
  sampleText,
  serialiseSamples,
  type FontSample,
} from '../../src/node/font-sample-builder.js';

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(CLI_ROOT, 'src', 'data');
const FONTS = JSON.parse(readFileSync(join(DATA, 'u8g2-fonts.json'), 'utf8')) as string[];
const SAMPLES_TEXT = readFileSync(join(DATA, 'u8g2-font-samples.json'), 'utf8');
const SAMPLES = JSON.parse(SAMPLES_TEXT) as Record<string, FontSample>;

describe('the committed font samples', () => {
  it('have one entry per bundled font, in the font list’s order', () => {
    expect(Object.keys(SAMPLES)).toEqual(FONTS);
  });

  it('each have a non-zero size and exactly ceil(w*h/8) bytes of bits', () => {
    for (const name of FONTS) {
      const sample = SAMPLES[name];
      expect(sample, name).toBeDefined();
      if (sample === undefined) continue;
      expect(sample.w, name).toBeGreaterThan(0);
      expect(sample.h, name).toBeGreaterThan(0);
      expect(Buffer.from(sample.bits, 'base64').length, name).toBe(Math.ceil((sample.w * sample.h) / 8));
    }
  });

  it('each light at least one pixel', () => {
    for (const name of FONTS) {
      const bits = Buffer.from(SAMPLES[name]?.bits ?? '', 'base64');
      expect(bits.some((byte) => byte !== 0), name).toBe(true);
    }
  });

  it('are laid out as the builder writes them, so a rebuild is a minimal diff', () => {
    expect(serialiseSamples(new Map(Object.entries(SAMPLES)))).toBe(SAMPLES_TEXT);
  });
});

describe('the font-sample build', () => {
  it('draws digits for a numbers-only font and the sample text otherwise', () => {
    expect(sampleText('u8g2_font_logisoso92_tn')).toBe(DIGITS_TEXT);
    expect(sampleText('u8g2_font_helvR08_tr')).toBe(SAMPLE_TEXT);
  });

  it('writes one table entry per font, naming U8G2’s own array, and refuses a name that is not an identifier', () => {
    const table = fontSampleTable(['u8g2_font_a_tr', 'u8g2_font_b_tn']);
    expect(table).toContain(`{ "u8g2_font_a_tr", u8g2_font_a_tr, "${SAMPLE_TEXT}" },`);
    expect(table).toContain(`{ "u8g2_font_b_tn", u8g2_font_b_tn, "${DIGITS_TEXT}" },`);
    expect(table).toContain('const size_t font_sample_count = 2;');
    expect(() => fontSampleTable(['u8g2_font_x"); evil();'])).toThrow(/not a C identifier/);
  });

  it('reads the renderer’s lines into base64 samples', () => {
    const samples = parseSampleOutput('f_a 3 3 ff80\nf_b 8 1 a5\n', ['f_a', 'f_b']);
    expect(samples.get('f_a')).toEqual({ w: 3, h: 3, bits: Buffer.from([0xff, 0x80]).toString('base64') });
    expect(samples.get('f_b')).toEqual({ w: 8, h: 1, bits: Buffer.from([0xa5]).toString('base64') });
  });

  it('refuses output that is out of order, missing, extra, zero-sized or the wrong length', () => {
    expect(() => parseSampleOutput('f_b 1 1 80\nf_a 1 1 80\n', ['f_a', 'f_b'])).toThrow(/not f_a's sample/);
    expect(() => parseSampleOutput('f_a 1 1 80\n', ['f_a', 'f_b'])).toThrow(/no sample for f_b/);
    expect(() => parseSampleOutput('f_a 1 1 80\nf_b 1 1 80\n', ['f_a'])).toThrow(/2 samples for 1 fonts/);
    expect(() => parseSampleOutput('f_a 0 1 \n', ['f_a'])).toThrow(/not positive/);
    expect(() => parseSampleOutput('f_a 3 3 ff\n', ['f_a'])).toThrow(/1 bytes for a 3x3 sample/);
  });
});
