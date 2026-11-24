/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-large-fonts.test.ts
 * Purpose: The fonts unit's guard for U8G2's large fonts (§14.1): a large
 *          `<builtin>` gets an `#error` naming it, after U8G2's header; a small
 *          one, or a `<bdf>`, gets none; several large fonts get one guard
 *          each, in declaration order; a project with no large font emits no
 *          trace of the feature. Also holds the committed large-font fixture
 *          (`test/large_font_guard/` at the repository root) to the generator,
 *          because the C++ suite compiles its `ui_fonts.cpp` to prove the
 *          guard fires on a real compiler, and that proves nothing about
 *          today's generator if the file is stale.
 * Description: Drives `emitFontsUnit()` with a hand-built emit input, so these
 *              are core-level tests with no filesystem; the fixture check
 *              regenerates through the core API exactly as
 *              `refresh-goldens.mjs` does.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FontDecl } from '../../src/core/schema/globals.js';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { isLargeFont, LARGE_FONTS } from '../../src/core/catalogue/index.js';
import type { CompiledFont } from '../../src/core/fonts/index.js';
import { generate } from '../../src/core/generator/index.js';
import { emitFontsUnit, LARGE_FONT_ERROR, U8G2_HEADER } from '../../src/core/generator/emit/fonts.js';
import type { ProjectEmitInput } from '../../src/core/generator/emit/unit.js';
import { loadProject } from '../../src/node/load-project.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

/** Must match refresh-goldens.mjs and compile-fixture.test.ts. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const SMALL = 'u8g2_font_6x10_mr';
const LARGE_A = 'u8g2_font_unifont_t_gb2312';
const LARGE_B = 'u8g2_font_b10_t_japanese2';

/** A compiled `<bdf>`'s minimal result: a bdf is never a U8G2 large font. */
const TINY_BDF: CompiledFont = {
  bytes: Uint8Array.from([0]),
  declaredLength: 1,
  selectedGlyphs: 1,
  totalGlyphs: 1,
  fontName: undefined,
  copyright: undefined,
};

// emitFonts
// The fonts unit's text for the given declarations.
//   fonts — the globals' <fonts>, in declaration order
function emitFonts(fonts: readonly FontDecl[]): string {
  const input: ProjectEmitInput = {
    project: { schema: '0.7', name: 'p', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [...fonts], images: [] },
    screens: [],
    capacities: { maxObjectsPerScreen: 0, maxBindingsPerObject: 0, totalBindings: 0, styles: 0, styleNames: [], subjects: [], collections: [] },
    manifests: frameworkRegistry(),
    images: new Map(),
    compiledFonts: new Map([['my_bdf', TINY_BDF]]),
    stamp: '// stamp\n',
  };
  return emitFontsUnit(input).content;
}

const builtin = (name: string): FontDecl => ({ kind: 'builtin', name });
const guard = (name: string): string =>
  ['#ifndef U8G2_USE_LARGE_FONTS', `#error "${name} ${LARGE_FONT_ERROR}"`, '#endif'].join('\n');

describe('the large-font guard in ui_fonts.cpp (§14.1)', () => {
  it('the fonts used here are what the data says they are', () => {
    expect(isLargeFont(LARGE_A)).toBe(true);
    expect(isLargeFont(LARGE_B)).toBe(true);
    expect(isLargeFont(SMALL)).toBe(false);
    expect(LARGE_FONTS).toContain(LARGE_A);
  });

  it('guards a large built-in, after U8G2’s header and before the fonts section', () => {
    const text = emitFonts([builtin(LARGE_A)]);
    const at = text.indexOf(guard(LARGE_A));
    expect(at).toBeGreaterThan(text.indexOf(U8G2_HEADER));
    expect(at).toBeLessThan(text.indexOf('// --- Fonts'));
  });

  it('names the font and both fixes, cites u8g2.h, and lists no platform', () => {
    const errorLine = emitFonts([builtin(LARGE_A)]).split('\n').find((line) => line.startsWith('#error')) ?? '';
    expect(errorLine).toBe(
      `#error "${LARGE_A} is one of U8G2's large fonts (over 32 KB), which U8G2 compiles only where ` +
        'U8G2_USE_LARGE_FONTS is defined (see u8g2.h). Choose a smaller font, or define ' +
        'U8G2_USE_LARGE_FONTS if this platform supports arrays over 32 KB."',
    );
    expect(errorLine).not.toMatch(/ESP|ARM|unix|AVR/i);
  });

  it('does not guard a small built-in or a <bdf>', () => {
    const text = emitFonts([builtin(SMALL), { kind: 'bdf', name: 'my_bdf', src: 'fonts/x.bdf' }]);
    expect(text).not.toContain('U8G2_USE_LARGE_FONTS');
    expect(text).not.toContain('#error');
  });

  it('gives two large fonts two guards, in declaration order, and none to a small one between them', () => {
    const text = emitFonts([builtin(LARGE_A), builtin(SMALL), builtin(LARGE_B)]);
    expect(text.match(/^#error /gm)).toHaveLength(2);
    expect(text).toContain(`${guard(LARGE_A)}\n${guard(LARGE_B)}\n`);
    expect(text).not.toContain(`#error "${SMALL}`);
    const reversed = emitFonts([builtin(LARGE_B), builtin(LARGE_A)]);
    expect(reversed).toContain(`${guard(LARGE_B)}\n${guard(LARGE_A)}\n`);
  });

  it('emits exactly the pre-guard layout for a project with no large font', () => {
    const text = emitFonts([builtin(SMALL)]);
    expect(text.startsWith(`// stamp\n\n#include "ui.hpp"\n\n${U8G2_HEADER}\n\n// --- Fonts`)).toBe(true);
  });
});

describe('the large-font guard fixture is exactly what the generator writes (§13.9)', () => {
  const fixtureDir = resolve(__dirname, '../../../test/large_font_guard');
  const committedDir = join(fixtureDir, 'generated');

  it('regenerating it is an empty diff, byte for byte, and its fonts unit carries the guard', async () => {
    const loaded = loadProject(fixtureDir);
    const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
    const result = generate({
      ...loaded.model,
      generatorVersion: GOLDEN_GENERATOR_VERSION,
      compiledAssets,
      bdfLicenceFiles: loaded.bdfLicenceFiles,
    });
    expect(result.diagnostics).toEqual([]);
    expect(readdirSync(committedDir).sort()).toEqual(result.files.map((file) => file.path).sort());
    for (const file of result.files) {
      expect(readFileSync(join(committedDir, file.path), 'utf8'), file.path).toBe(file.content);
    }
    expect(readFileSync(join(committedDir, 'ui_fonts.cpp'), 'utf8')).toContain(guard(LARGE_A));
  });
});
