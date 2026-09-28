/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-fonts.test.ts
 * Purpose: `<bdf>` through `generate()` (PR-04b WO3): the oracle byte match end
 *          to end (not just compileBdf() in isolation — u8g2-oracle.test.ts
 *          already has that), `ui.hpp`'s declaration, the budget's measured
 *          line, document-order interleaving with `<builtin>`, two `<bdf>`s
 *          from one BDF with different ranges, the licence-file provenance
 *          line's absence/presence, and comment sanitisation against a BDF
 *          whose header fields try to break out of a `//` comment.
 * Description: Drives `generate()` directly with an in-memory `compiledAssets`
 *              (from `compileProjectAssets()`) and asset map — no filesystem,
 *              so these are core-level tests, not integration tests through the
 *              built CLI (test/integration/generate.test.ts covers that path,
 *              including determinism, via valid-project's own two `<bdf>`s).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile, parseScreenFile } from '../../src/core/parser/index.js';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import type { CompiledFont } from '../../src/core/fonts/index.js';
import { generate, type GenerateInput } from '../../src/core/generator/index.js';
import { emitFontsUnit, fontDeclarations } from '../../src/core/generator/emit/fonts.js';
import { emitUiHeader } from '../../src/core/generator/emit/ui-hpp.js';
import type { ProjectEmitInput } from '../../src/core/generator/emit/unit.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { readU8g2FontArray } from '../helpers/u8g2-font-reader.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');
const u8g2FontsC = resolve(repoRoot, 'extern', 'u8g2', 'csrc', 'u8g2_fonts.c');
const FOUR_BY_SIX = () => readFileSync(resolve(bdfDir, '4x6.bdf'));

const PROJECT_XML = `<u8g2gl schema="0.4" name="fonts_test" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`;

/** Builds and runs a project with the given globals.xml and screen bodies, compiling every <bdf> first. */
async function generateWith(globalsXml: string, screenBody: string, assets: ReadonlyMap<string, Uint8Array>) {
  const project = parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!;
  const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
  const screen = parseScreenFile(
    `<screen name="home"><view>${screenBody}</view></screen>`,
    'screens/screen_home.xml',
  ).value!;
  const compiledAssets = await compileProjectAssets({ globals, assets });
  const input: GenerateInput = {
    project,
    globals,
    screens: [screen],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
    loadDiagnostics: [],
    hasProjectManifest: true,
    generatorVersion: '9.9.9',
    compiledAssets,
  };
  return generate(input);
}

describe('<bdf> through generate() (PR-04b WO3)', () => {
  it('emits bytes matching u8g2_font_4x6_tr, end to end through generate()', async () => {
    const globalsXml = `<globals><fonts><bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" /></fonts></globals>\n`;
    const screenBody = `<u8g2gl_label name="lbl" x="0" y="0" width="128" height="12" font="small_9" text="Hi" />`;
    const assets = new Map([['fonts/4x6.bdf', FOUR_BY_SIX()]]);

    const result = await generateWith(globalsXml, screenBody, assets);

    expect(result.errors).toBe(0);
    const fontsUnit = result.files.find((f) => f.path === 'ui_fonts.cpp');
    expect(fontsUnit).toBeDefined();
    const expected = readU8g2FontArray(u8g2FontsC, 'u8g2_font_4x6_tr');
    const arrayMatch = /ui_fontdata_small_9\[(\d+)\][^{]*\{\n([\s\S]*?)\n\};/.exec(fontsUnit!.content);
    expect(arrayMatch).not.toBeNull();
    const declaredLength = Number(arrayMatch![1]);
    const hexBytes = [...arrayMatch![2]!.matchAll(/0x([0-9a-f]{2})/g)].map((m) => parseInt(m[1]!, 16));
    expect(declaredLength).toBe(expected.declaredLength);
    expect(Uint8Array.from(hexBytes)).toEqual(expected.bytes);

    // ui.hpp declares it, in the shared form both font kinds use.
    const uiHpp = result.files.find((f) => f.path === 'ui.hpp');
    expect(uiHpp?.content).toContain('extern const uint8_t* const ui_font_small_9;');
  });

  it('interleaves <builtin> and <bdf> in document order, and emits two <bdf>s from one BDF with different ranges', async () => {
    const globalsXml = `<globals><fonts>
      <bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" />
      <builtin name="u8g2_font_6x10_mr" />
      <bdf name="tall_12" src="fonts/4x6.bdf" range="0x30-0x39" />
    </fonts></globals>\n`;
    const screenBody = [
      `<u8g2gl_label name="a" x="0" y="0" width="60" height="12" font="small_9" text="a" />`,
      `<u8g2gl_label name="b" x="0" y="20" width="60" height="12" font="u8g2_font_6x10_mr" text="b" />`,
      `<u8g2gl_label name="c" x="0" y="40" width="60" height="12" font="tall_12" text="c" />`,
    ].join('');
    const assets = new Map([['fonts/4x6.bdf', FOUR_BY_SIX()]]);

    const result = await generateWith(globalsXml, screenBody, assets);

    expect(result.errors).toBe(0);
    const fontsUnit = result.files.find((f) => f.path === 'ui_fonts.cpp')!.content;
    // Document order, not declaration-kind order: small_9 (bdf), then the
    // builtin, then tall_12 (bdf).
    const order = ['small_9', 'u8g2_font_6x10_mr', 'tall_12'].map((name) => fontsUnit.indexOf(name));
    expect(order[0]!).toBeLessThan(order[1]!);
    expect(order[1]!).toBeLessThan(order[2]!);
    // Two distinct compiled arrays, from the same BDF, with different byte counts.
    expect(fontsUnit).toContain('ui_fontdata_small_9[723]');
    expect(fontsUnit).toMatch(/ui_fontdata_tall_12\[\d+\]/);
    expect(fontsUnit).not.toContain('ui_fontdata_small_9[100]');
  });

  it('reports the compiled font as a measured flash line, with byte count and count 2', async () => {
    const globalsXml = `<globals><fonts>
      <bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" />
      <bdf name="tall_12" src="fonts/4x6.bdf" range="0x30-0x39" />
    </fonts></globals>\n`;
    const screenBody = [
      `<u8g2gl_label name="a" x="0" y="0" width="60" height="12" font="small_9" text="a" />`,
      `<u8g2gl_label name="c" x="0" y="40" width="60" height="12" font="tall_12" text="c" />`,
    ].join('');
    const assets = new Map([['fonts/4x6.bdf', FOUR_BY_SIX()]]);

    const project = parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!;
    const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
    const screen = parseScreenFile(
      `<screen name="home"><view>${screenBody}</view></screen>`,
      'screens/screen_home.xml',
    ).value!;
    const compiledAssets = await compileProjectAssets({ globals, assets });
    const result = generate({
      project,
      globals,
      screens: [screen],
      manifests: frameworkRegistry(),
      catalogue: CATALOGUE,
      loadDiagnostics: [],
      hasProjectManifest: true,
      generatorVersion: '9.9.9',
      compiledAssets,
    });
    expect(result.errors).toBe(0);

    const { buildGenerateReport } = await import('../../src/core/generator/report/index.js');
    const { findTargetDisplay } = await import('../../src/core/resolver/index.js');
    const target = project.targets[0]!;
    const report = buildGenerateReport({
      globals,
      manifests: frameworkRegistry(),
      realised: result.realised!,
      capacities: result.capacities!,
      target,
      display: findTargetDisplay(target, CATALOGUE),
      generatorVersion: '9.9.9',
      images: compiledAssets.images,
      compiledFonts: compiledAssets.fonts,
    });

    const line = report.budget.flash.find((l) => l.item === 'fonts (compiled bdf)');
    expect(line?.count).toBe(2);
    expect(line?.names).toEqual(['small_9', 'tall_12']);
    expect(line?.figure).toMatchObject({ kind: 'measured', bytes: 723 + 100 });
  });

  it('refuses with U8G2GL_MISSING_COMPILED_FONT when the host never calls compileProjectAssets()', async () => {
    const project = parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!;
    const globalsXml = `<globals><fonts><bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" /></fonts></globals>\n`;
    const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
    const screen = parseScreenFile(
      `<screen name="home"><view><u8g2gl_label name="lbl" x="0" y="0" width="60" height="12" font="small_9" text="a" /></view></screen>`,
      'screens/screen_home.xml',
    ).value!;

    const result = generate({
      project,
      globals,
      screens: [screen],
      manifests: frameworkRegistry(),
      catalogue: CATALOGUE,
      loadDiagnostics: [],
      hasProjectManifest: true,
      generatorVersion: '9.9.9',
      // No `assets`, no `compiledAssets`: the host "forgot" the step.
    });

    expect(result.errors).toBeGreaterThan(0);
    expect(result.files).toEqual([]);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain('U8G2GL_MISSING_COMPILED_FONT');
  });

  // The guard's three cases (PR-04b WO3b item 1), now driven by
  // compiledAssets.failedFonts rather than by reading offendingText: a font
  // that compiled, one whose compile failed (compileProjectAssets() already
  // reported it — the guard must not pile on a second, misleading diagnostic),
  // and one never submitted to compileProjectAssets() at all.

  it('a font that compiled: no U8G2GL_MISSING_COMPILED_FONT diagnostic', async () => {
    const globalsXml = `<globals><fonts><bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" /></fonts></globals>\n`;
    const screenBody = `<u8g2gl_label name="lbl" x="0" y="0" width="128" height="12" font="small_9" text="Hi" />`;
    const assets = new Map([['fonts/4x6.bdf', FOUR_BY_SIX()]]);

    const result = await generateWith(globalsXml, screenBody, assets);

    expect(result.errors).toBe(0);
    expect(result.diagnostics.map((d) => d.code)).not.toContain('U8G2GL_MISSING_COMPILED_FONT');
  });

  it('a font whose compile failed: exactly the one diagnostic compileProjectAssets() raised, never a second', async () => {
    const globalsXml = `<globals><fonts><bdf name="small_9" src="fonts/bad.bdf" /></fonts></globals>\n`;
    const screenBody = `<u8g2gl_label name="lbl" x="0" y="0" width="128" height="12" font="small_9" text="Hi" />`;
    const assets = new Map([['fonts/bad.bdf', new TextEncoder().encode('this is not a BDF file\n')]]);

    const result = await generateWith(globalsXml, screenBody, assets);

    expect(result.errors).toBeGreaterThan(0);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toEqual(['U8G2GL_BDF_COMPILE_FAILED']);
    expect(codes).not.toContain('U8G2GL_MISSING_COMPILED_FONT');
  });

  it('a font never submitted to compileProjectAssets(): U8G2GL_MISSING_COMPILED_FONT', async () => {
    // compileProjectAssets() runs over an empty Globals, so 'dropped' is
    // compiled by nothing and diagnosed by nothing — exactly what a host that
    // silently dropped a font before calling compileProjectAssets() would
    // produce, distinct from the "never called it at all" test above.
    const globalsXml = `<globals><fonts><bdf name="dropped" src="fonts/4x6.bdf" /></fonts></globals>\n`;
    const screenBody = `<u8g2gl_label name="lbl" x="0" y="0" width="128" height="12" font="dropped" text="Hi" />`;
    const assets = new Map([['fonts/4x6.bdf', FOUR_BY_SIX()]]);
    const compiledAssets = await compileProjectAssets({ globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] }, assets });

    const project = parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!;
    const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
    const screen = parseScreenFile(
      `<screen name="home"><view>${screenBody}</view></screen>`,
      'screens/screen_home.xml',
    ).value!;
    const result = generate({
      project,
      globals,
      screens: [screen],
      manifests: frameworkRegistry(),
      catalogue: CATALOGUE,
      loadDiagnostics: [],
      hasProjectManifest: true,
      generatorVersion: '9.9.9',
      compiledAssets,
    });

    expect(result.errors).toBeGreaterThan(0);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toEqual(['U8G2GL_MISSING_COMPILED_FONT']);
  });
});

describe('emitFontsUnit() — comment sanitisation (PR-04b WO3 item 5)', () => {
  // A hand-built CompiledFont with header fields designed to attack a `//`
  // comment: an embedded newline (would end the comment early and let the
  // next line become code), a literal `*/`, and a very long string.
  const HOSTILE: CompiledFont = {
    bytes: Uint8Array.from([0]),
    declaredLength: 1,
    selectedGlyphs: 1,
    totalGlyphs: 1,
    fontName: 'evil\nname/*with*/junk',
    copyright: `x`.repeat(500),
  };

  function projectEmitInputFor(font: { readonly name: string; readonly src: string; readonly range?: string }): ProjectEmitInput {
    return {
      project: { schema: '0.4', name: 'p', version: '1.0.0', targets: [] },
      globals: { consts: [], subjects: [], styles: [], fonts: [{ kind: 'bdf', ...font }], images: [] },
      screens: [],
      capacities: {
        maxObjectsPerScreen: 0,
        maxBindingsPerObject: 0,
        totalBindings: 0,
        styles: 0,
        styleNames: [],
        subjects: [],
      },
      manifests: frameworkRegistry(),
      images: new Map(),
      compiledFonts: new Map([[font.name, HOSTILE]]),
      stamp: '// stamp\n',
    };
  }

  it('never lets a BDF field break out of the // comment or inject a raw newline', () => {
    const unit = emitFontsUnit(projectEmitInputFor({ name: 'evil_font', src: 'fonts/evil.bdf' }));

    // Every line is still a comment, a declaration, or blank — nothing from
    // the hostile fields produced a bare code line of its own.
    for (const line of unit.content.split('\n')) {
      expect(
        line === '' ||
          line.startsWith('//') ||
          line.startsWith('static const uint8_t') ||
          line.startsWith('const uint8_t* const') ||
          /^\s{4}0x[0-9a-f]{2},$/.test(line) ||
          line === '};' ||
          line.startsWith('#include') ||
          line.startsWith('// GENERATED') ||
          line.startsWith('// stamp'),
      ).toBe(true);
    }
    expect(unit.content).not.toContain('*/');
    expect(unit.diagnostics).toEqual([]);
  });

  it('caps an oversized field rather than emitting it in full', () => {
    const unit = emitFontsUnit(projectEmitInputFor({ name: 'evil_font', src: 'fonts/evil.bdf' }));
    const copyrightLine = unit.content.split('\n').find((l) => l.includes('BDF copyright'));
    expect(copyrightLine).toBeDefined();
    expect(copyrightLine!.length).toBeLessThan(300);
  });
});

describe('fontDeclarations() — both kinds share one declared form', () => {
  it('gives a <bdf> the same identifier shape as a <builtin>, pointing at its own array', () => {
    const input: ProjectEmitInput = {
      project: { schema: '0.4', name: 'p', version: '1.0.0', targets: [] },
      globals: {
        consts: [],
        subjects: [],
        styles: [],
        fonts: [
          { kind: 'bdf', name: 'small_9', src: 'fonts/small_9.bdf' },
          { kind: 'builtin', name: 'u8g2_font_6x10_mr' },
        ],
        images: [],
      },
      screens: [],
      capacities: { maxObjectsPerScreen: 0, maxBindingsPerObject: 0, totalBindings: 0, styles: 0, styleNames: [], subjects: [] },
      manifests: frameworkRegistry(),
      images: new Map(),
      stamp: '',
    };
    const declarations = fontDeclarations(input);
    expect(declarations.map((d) => d.identifier)).toEqual(['ui_font_small_9', 'ui_font_u8g2_font_6x10_mr']);
    expect(declarations[0]?.array).toBe('ui_fontdata_small_9');
    expect(declarations[1]?.array).toBe('u8g2_font_6x10_mr');

    const header = emitUiHeader(input);
    expect(header.content).toContain('extern const uint8_t* const ui_font_small_9;');
    expect(header.content).toContain('extern const uint8_t* const ui_font_u8g2_font_6x10_mr;');
  });
});
