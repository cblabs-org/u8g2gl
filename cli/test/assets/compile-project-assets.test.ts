/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/assets/compile-project-assets.test.ts
 * Purpose: Unit-level coverage of compileProjectAssets(): the
 *          async step both hosts must call before generate(). Covers every
 *          diagnostic it raises, that results and diagnostics come out in
 *          declaration order regardless of which font's compile settles first,
 *          that a successfully compiled font's bytes are exactly compileBdf()'s
 *          own, that `offendingText` is the declaration's `src`,
 *          and that `failedFonts` names every font that did not compile.
 * Description: Builds a `Globals` value directly (no XML parsing needed — this
 *              module reads only `globals.fonts`) and an in-memory asset map, so
 *              these tests exercise the isomorphic core with no filesystem.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/compile-project-assets.js';
import { compileBdf } from '../../src/core/fonts/compile-bdf.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { BdfFontDecl, Globals } from '../../src/core/schema/globals.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const bdfDir = resolve(testDir, '..', '..', '..', 'extern', 'u8g2', 'tools', 'font', 'bdf');
const FOUR_BY_SIX = () => readFileSync(resolve(bdfDir, '4x6.bdf'));

/** A minimal Globals with only the given fonts declared. */
function globalsWithFonts(fonts: readonly BdfFontDecl[]): Globals {
  return { consts: [], subjects: [], styles: [], fonts, images: [] };
}

/** One <bdf> declaration, with an optional source location for diagnostics. */
function bdf(name: string, src: string, options: { range?: string; line?: number } = {}): BdfFontDecl {
  return {
    kind: 'bdf',
    name,
    src,
    ...(options.range !== undefined ? { range: options.range } : {}),
    ...(options.line !== undefined ? { loc: { file: 'globals.xml', line: options.line, column: 9 } } : {}),
  };
}

describe('compileProjectAssets()', () => {
  it('compiles a <bdf> and returns exactly compileBdf()\'s own bytes', async () => {
    const bytes = FOUR_BY_SIX();
    const globals = globalsWithFonts([bdf('small_9', 'fonts/4x6.bdf', { range: '0x20-0x7F' })]);
    const assets = new Map([['fonts/4x6.bdf', bytes]]);

    const result = await compileProjectAssets({ globals, assets });
    const direct = await compileBdf({ bdf: bytes, identifier: 'small_9', range: '0x20-0x7F' });

    expect(result.diagnostics).toEqual([]);
    expect(result.fonts.size).toBe(1);
    const compiled = result.fonts.get('small_9');
    expect(compiled).toBeDefined();
    expect(direct.ok).toBe(true);
    if (!direct.ok || compiled === undefined) return;
    expect(compiled.bytes).toEqual(direct.bytes);
    expect(compiled.declaredLength).toBe(direct.declaredLength);
    expect(result.failedFonts).toEqual(new Set());
  });

  it('reports a missing source file as U8G2GL_MISSING_FILE, located at the declaration', async () => {
    const globals = globalsWithFonts([bdf('small_9', 'fonts/missing.bdf', { line: 20 })]);

    const result = await compileProjectAssets({ globals, assets: new Map() });

    expect(result.fonts.size).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.MISSING_FILE,
      severity: 'error',
      file: 'globals.xml',
      line: 20,
      // The declaration's `src`, not its `name` — generate()'s guard reads
      // `failedFonts`, so nothing needs the name recoverable from here.
      offendingText: 'fonts/missing.bdf',
    });
    expect(result.diagnostics[0]?.message).toContain('fonts/missing.bdf');
    expect(result.failedFonts).toEqual(new Set(['small_9']));
  });

  it('reports a bdfconv failure as U8G2GL_BDF_COMPILE_FAILED, with the reason', async () => {
    const globals = globalsWithFonts([bdf('small_9', 'fonts/bad.bdf', { line: 21 })]);
    const assets = new Map([['fonts/bad.bdf', new TextEncoder().encode('this is not a BDF file\n')]]);

    const result = await compileProjectAssets({ globals, assets });

    expect(result.fonts.size).toBe(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.BDF_COMPILE_FAILED,
      severity: 'error',
      file: 'globals.xml',
      line: 21,
      offendingText: 'fonts/bad.bdf',
    });
    expect(result.diagnostics[0]?.message).toContain('No glyphs compiled');
    expect(result.failedFonts).toEqual(new Set(['small_9']));
  });

  it('produces results and diagnostics in declaration order regardless of completion order', async () => {
    const bytes = FOUR_BY_SIX();
    // 'z_slow' is declared first but has more work (a wider range, so it is not
    // guaranteed to finish first); 'a_fast' is declared second. If ordering
    // depended on which settled first this would be flaky; Promise.all's
    // ordering guarantee is what this test actually pins.
    const globals = globalsWithFonts([
      bdf('z_slow', 'fonts/4x6.bdf', { range: '0x20-0xFFFF' }),
      bdf('a_missing', 'fonts/missing.bdf'),
      bdf('a_fast', 'fonts/4x6.bdf', { range: '0x20-0x21' }),
    ]);
    const assets = new Map([['fonts/4x6.bdf', bytes]]);

    const result = await compileProjectAssets({ globals, assets });

    expect([...result.fonts.keys()]).toEqual(['z_slow', 'a_fast']);
    expect(result.diagnostics.map((d) => d.offendingText)).toEqual(['fonts/missing.bdf']);
    expect(result.failedFonts).toEqual(new Set(['a_missing']));
  });

  it('ignores <builtin> fonts entirely — nothing to compile, nothing to diagnose', async () => {
    const globals: Globals = {
      consts: [],
      subjects: [],
      styles: [],
      fonts: [{ kind: 'builtin', name: 'u8g2_font_6x10_mr' }],
      images: [],
    };

    const result = await compileProjectAssets({ globals, assets: new Map() });

    expect(result.fonts.size).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.failedFonts).toEqual(new Set());
  });
});
