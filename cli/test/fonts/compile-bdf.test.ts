/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fonts/compile-bdf.test.ts
 * Purpose: Unit-level coverage of compileBdf() itself (PR-04b WO2 item 2) beyond the
 *          oracle, parity and determinism tests: BDF header fields, the "(null)" guard
 *          (WO1 Finding 2), every FontCompileFailure path, and concurrency safety.
 * Description: The oracle test (u8g2-oracle.test.ts) already proves byte-exact output
 *              against U8G2's own shipped arrays; this file proves the surrounding
 *              contract — failures are returned, never thrown, and concurrent calls do not
 *              interfere with each other because each gets its own module instance.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileBdf } from '../../src/core/fonts/compile-bdf.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');

const FOUR_BY_SIX = () => readFileSync(resolve(bdfDir, '4x6.bdf'));

describe('compileBdf() — header fields', () => {
  it('reads FONT and COPYRIGHT from the BDF itself', async () => {
    const result = await compileBdf({ bdf: FOUR_BY_SIX(), identifier: 'header_test', range: '0x20-0x7F' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 4x6.bdf's own BDF header carries both; exact text is bdfconv's to define — the
    // guarantee under test is "present and not the literal string (null)", not the text.
    expect(result.fontName).toBeDefined();
    expect(result.fontName).not.toBe('(null)');
    expect(result.copyright).toBeDefined();
    expect(result.copyright).not.toBe('(null)');
  });

  it('reports selectedGlyphs and totalGlyphs consistent with a restricting range', async () => {
    const full = await compileBdf({ bdf: FOUR_BY_SIX(), identifier: 'glyphs_full', range: '0x20-0xFF' });
    const narrow = await compileBdf({ bdf: FOUR_BY_SIX(), identifier: 'glyphs_narrow', range: '0x20-0x7F' });
    expect(full.ok).toBe(true);
    expect(narrow.ok).toBe(true);
    if (!full.ok || !narrow.ok) return;
    expect(narrow.selectedGlyphs).toBeLessThan(full.selectedGlyphs);
    expect(narrow.totalGlyphs).toBe(full.totalGlyphs);
  });
});

describe('compileBdf() — failures are returned, never thrown', () => {
  it('fails on a malformed range without ever invoking bdfconv', async () => {
    const result = await compileBdf({ bdf: FOUR_BY_SIX(), identifier: 'bad_range', range: '32-*' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("'*'");
    expect(result.stderr).toEqual([]);
  });

  it('fails with "no glyphs" on a malformed BDF (WO1 Finding 2: bdfconv exits 0)', async () => {
    const malformed = new TextEncoder().encode('this is not a BDF file\n');
    const result = await compileBdf({ bdf: malformed, identifier: 'malformed_bdf' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('No glyphs compiled');
    expect(result.reason).toContain('Glyphs: 0/0');
  });

  it('fails with a range-specific reason when the range selects nothing from a real font', async () => {
    // 4x6.bdf has no glyphs in the Private Use Area; a well-formed range that matches none
    // of them selects zero glyphs from a font whose total is > 0 — a different failure
    // reason than a wholly malformed BDF, and compileBdf() must be able to tell them apart.
    const result = await compileBdf({ bdf: FOUR_BY_SIX(), identifier: 'empty_selection', range: '0xE000-0xE010' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('No glyphs compiled');
    expect(result.reason).toContain('selected no glyphs from a font with');
  });
});

describe('compileBdf() — concurrency', () => {
  it('compiles several fonts concurrently without interference', async () => {
    const bdfBytes = FOUR_BY_SIX();
    const inputs = [
      { bdf: bdfBytes, identifier: 'concurrent_a', range: '0x20-0x7F' },
      { bdf: bdfBytes, identifier: 'concurrent_b', range: '0x20-0xFF' },
      { bdf: bdfBytes, identifier: 'concurrent_c', range: '0x20,0x2A-0x3A' },
      { bdf: bdfBytes, identifier: 'concurrent_d', range: '0x20-0x7F' },
    ];

    const results = await Promise.all(inputs.map((input) => compileBdf(input)));
    const sequential = [];
    for (const input of inputs) {
      sequential.push(await compileBdf(input));
    }

    for (let i = 0; i < inputs.length; i++) {
      const concurrent = results[i]!;
      const solo = sequential[i]!;
      expect(concurrent.ok).toBe(true);
      expect(solo.ok).toBe(true);
      if (!concurrent.ok || !solo.ok) continue;
      expect(concurrent.bytes).toEqual(solo.bytes);
      expect(concurrent.declaredLength).toBe(solo.declaredLength);
    }
    // The two identical inputs (a and d) must produce identical bytes to each other too.
    const a = results[0]!;
    const d = results[3]!;
    if (a.ok && d.ok) {
      expect(a.bytes).toEqual(d.bytes);
    }
  });
});
