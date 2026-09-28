/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fonts/bdf-range.test.ts
 * Purpose: Unit tests for the `<bdf range>` grammar (PR-04b WO2 item 3) — the translator
 *          both `validate` and compileBdf() share.
 * Description: Covers the accepted grammar (decimal, 0x/0X hex, single codepoints,
 *              inclusive lo-hi pairs, whitespace tolerance, radix-preserving translation
 *              to bdfconv's `$`-prefixed hex) and every documented rejection: bdfconv's own
 *              reserved syntax, an empty item, lo > hi, and a codepoint beyond bdfconv's
 *              uint16_t ceiling.
 */

import { describe, expect, it } from 'vitest';
import { MAX_BDF_CODEPOINT, parseBdfRange } from '../../src/core/fonts/bdf-range.js';

describe('parseBdfRange — accepted grammar', () => {
  it('parses a single decimal codepoint', () => {
    const result = parseBdfRange('65');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 65, hi: 65 }]);
    expect(result.bdfconvMap).toBe('65');
  });

  it('parses a single 0x-prefixed hex codepoint, translated to bdfconv\'s $ prefix', () => {
    const result = parseBdfRange('0x41');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 0x41, hi: 0x41 }]);
    expect(result.bdfconvMap).toBe('$41');
  });

  it('parses an uppercase 0X-prefixed hex codepoint', () => {
    const result = parseBdfRange('0X1f');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 0x1f, hi: 0x1f }]);
    expect(result.bdfconvMap).toBe('$1f');
  });

  it('parses a decimal lo-hi pair', () => {
    const result = parseBdfRange('32-127');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 32, hi: 127 }]);
    expect(result.bdfconvMap).toBe('32-127');
  });

  it('parses a hex lo-hi pair, each side translated independently', () => {
    const result = parseBdfRange('0x20-0x7F');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 0x20, hi: 0x7f }]);
    expect(result.bdfconvMap).toBe('$20-$7f');
  });

  it('parses a mixed-radix lo-hi pair, preserving each side\'s own radix', () => {
    const result = parseBdfRange('32-0x7F');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bdfconvMap).toBe('32-$7f');
  });

  it('parses a comma-separated list of items, in order', () => {
    const result = parseBdfRange('0x20-0x7F,0xA0,200-210');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      { lo: 0x20, hi: 0x7f },
      { lo: 0xa0, hi: 0xa0 },
      { lo: 200, hi: 210 },
    ]);
    expect(result.bdfconvMap).toBe('$20-$7f,$a0,200-210');
  });

  it('tolerates whitespace around items and within a pair', () => {
    const result = parseBdfRange(' 32 - 127 , 200 ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      { lo: 32, hi: 127 },
      { lo: 200, hi: 200 },
    ]);
  });

  it('accepts a single-codepoint pair where lo equals hi', () => {
    const result = parseBdfRange('65-65');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([{ lo: 65, hi: 65 }]);
  });

  it('accepts the maximum codepoint', () => {
    const result = parseBdfRange(`${MAX_BDF_CODEPOINT}`);
    expect(result.ok).toBe(true);
  });
});

describe('parseBdfRange — rejections', () => {
  it('rejects an empty item', () => {
    const result = parseBdfRange('32,,127');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Empty range item');
  });

  it('rejects an empty range (empty item, same as "32,,127")', () => {
    const result = parseBdfRange('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Empty range item');
  });

  it("rejects bdfconv's own '*' default syntax", () => {
    const result = parseBdfRange('*');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("'*'");
  });

  it("rejects bdfconv's own '~' exclude syntax", () => {
    const result = parseBdfRange('~32-127');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('~32-127');
  });

  it("rejects bdfconv's own '>' map-to syntax", () => {
    const result = parseBdfRange('32-127>32');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('>');
  });

  it("rejects bdfconv's own '$' hex syntax directly (only 0x is accepted)", () => {
    const result = parseBdfRange('$41');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('$41');
  });

  it('rejects a non-numeric item', () => {
    const result = parseBdfRange('abc');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not a valid number');
  });

  it('rejects a malformed lo-hi pair', () => {
    const result = parseBdfRange('32-abc');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a valid 'lo-hi' pair");
  });

  it('rejects lo > hi', () => {
    const result = parseBdfRange('127-32');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('greater than hi');
  });

  it('rejects a single codepoint beyond the maximum', () => {
    const result = parseBdfRange(`${MAX_BDF_CODEPOINT + 1}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('exceeds');
  });

  it('rejects a lo-hi pair whose hi is beyond the maximum', () => {
    const result = parseBdfRange(`0-0x${(MAX_BDF_CODEPOINT + 1).toString(16)}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('exceeds');
  });
});
