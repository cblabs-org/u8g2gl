/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-images.test.ts
 * Purpose: `<convert>` through `generate()`: a converted
 *          image is emitted exactly as an `<xbm>` is, with a provenance
 *          comment; the §18 budget measures it; the editor scene lists it; and
 *          `generate()` refuses loudly when the host skipped the asset step,
 *          for either kind of image.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile, parseScreenFile } from '../../src/core/parser/index.js';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate, type GenerateInput } from '../../src/core/generator/index.js';
import { buildGenerateReport } from '../../src/core/generator/report/index.js';
import { findTargetDisplay } from '../../src/core/resolver/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import { buildPng } from '../helpers/png-builder.js';

const PROJECT_XML = `<u8g2gl schema="0.4" name="img" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`;

/** A 10x2 greyscale PNG: the top row black, the bottom row white. */
const PNG_10X2 = new Uint8Array(
  buildPng({
    width: 10,
    height: 2,
    colourType: 0,
    depth: 8,
    samples: [...Array.from({ length: 10 }, () => 0), ...Array.from({ length: 10 }, () => 255)],
  }),
);

const XBM_TEXT = ['#define t_width 8', '#define t_height 1', 'static unsigned char t_bits[] = {', '  0x81 };', ''].join('\n');

const GLOBALS_XML = `<globals><images>
<xbm name="icon" src="assets/icon.xbm" />
<convert name="logo" src="assets/logo.png" width="10" height="2" mode="threshold" threshold="100" />
</images></globals>
`;

const SCREEN_XML =
  '<screen name="home"><view>' +
  '<u8g2gl_xbm name="a" x="0" y="0" width="8" height="1" src="icon" />' +
  '<u8g2gl_xbm name="b" x="0" y="8" width="10" height="2" src="logo" />' +
  '</view></screen>';

const ASSETS = new Map<string, Uint8Array>([
  ['assets/icon.xbm', new TextEncoder().encode(XBM_TEXT)],
  ['assets/logo.png', PNG_10X2],
]);

function inputOf(): GenerateInput {
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [parseScreenFile(SCREEN_XML, 'screens/screen_home.xml').value!],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
    loadDiagnostics: [],
    hasProjectManifest: true,
    generatorVersion: '9.9.9',
  };
}

describe('<convert> through generate()', () => {
  it('emits a converted image like an <xbm>, with a provenance comment', async () => {
    const base = inputOf();
    const compiledAssets = await compileProjectAssets({ globals: base.globals, assets: ASSETS });
    const result = generate({ ...base, compiledAssets });

    expect(result.diagnostics).toEqual([]);
    const images = result.files.find((f) => f.path === 'ui_images.cpp')!.content;
    // Declaration order: the <xbm> first, then the <convert>. Both are arrays.
    expect(images).toContain('// icon: assets/icon.xbm, 8x1, 1 bytes.');
    expect(images).toContain('const uint8_t ui_image_icon[] U8G2GL_PROGMEM = {\n    0x81,\n};');
    // Width 10 -> 2 bytes per row, 2 rows. Row 0 all black: ff, 03. Row 1 white: 00, 00.
    expect(images).toContain(
      '// logo: converted from assets/logo.png, 10x2, mode threshold, threshold 100, 4 bytes.',
    );
    expect(images).toContain('const uint8_t ui_image_logo[] U8G2GL_PROGMEM = {\n    0xff, 0x03, 0x00, 0x00,\n};');
    expect(images.indexOf('ui_image_icon')).toBeLessThan(images.indexOf('ui_image_logo'));
    // ui.hpp declares both.
    const header = result.files.find((f) => f.path === 'ui.hpp')!.content;
    expect(header).toContain('ui_image_icon');
    expect(header).toContain('ui_image_logo');
  });

  it('a <convert> with no mode or threshold records the defaults it used', async () => {
    const base = inputOf();
    const globals = parseGlobalsFile(
      '<globals><images><convert name="logo" src="assets/logo.png" width="10" height="2" /></images></globals>',
      'globals.xml',
    ).value!;
    const compiledAssets = await compileProjectAssets({ globals, assets: ASSETS });
    const result = generate({
      ...base,
      globals,
      screens: [parseScreenFile(SCREEN_XML.replace(/<u8g2gl_xbm name="a"[^>]*\/>/, ''), 'screens/screen_home.xml').value!],
      compiledAssets,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.files.find((f) => f.path === 'ui_images.cpp')!.content).toContain(
      'mode threshold, threshold 128, 4 bytes.',
    );
  });

  it('the budget measures a converted image, from the same map emission used', async () => {
    const base = inputOf();
    const compiledAssets = await compileProjectAssets({ globals: base.globals, assets: ASSETS });
    const result = generate({ ...base, compiledAssets });
    const target = base.project.targets[0]!;
    const report = buildGenerateReport({
      globals: base.globals,
      manifests: base.manifests,
      realised: result.realised!,
      capacities: result.capacities!,
      target,
      display: findTargetDisplay(target, CATALOGUE),
      generatorVersion: '9.9.9',
      images: compiledAssets.images,
      compiledFonts: compiledAssets.fonts,
    });
    const line = report.budget.flash.find((l) => l.item === 'image data (bitmap arrays)');
    expect(line?.names).toEqual(['icon', 'logo']);
    // 1 byte (icon) + 4 bytes (logo): a converted image counts like any other.
    expect(line?.figure).toMatchObject({ kind: 'measured', bytes: 5 });
  });

  it('refuses with U8G2GL_MISSING_COMPILED_IMAGE, for either kind, when the host skipped the asset step', () => {
    const result = generate(inputOf());

    expect(result.files).toEqual([]);
    const missing = result.diagnostics.filter((d) => d.code === 'U8G2GL_MISSING_COMPILED_IMAGE');
    expect(missing.map((d) => d.offendingText)).toEqual(['icon', 'logo']);
    expect(missing[0]?.message).toContain('compileProjectAssets()');
  });

  it('does not pile the guard on an image the asset step already reported', async () => {
    const base = inputOf();
    const compiledAssets = await compileProjectAssets({ globals: base.globals, assets: new Map() });
    const result = generate({ ...base, compiledAssets });

    expect(result.files).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['U8G2GL_MISSING_FILE', 'U8G2GL_MISSING_FILE']);
  });

  it('a size mismatch refuses the build with the declared and actual sizes', async () => {
    const base = inputOf();
    const globals = parseGlobalsFile(
      '<globals><images><convert name="logo" src="assets/logo.png" width="32" height="32" /></images></globals>',
      'globals.xml',
    ).value!;
    const compiledAssets = await compileProjectAssets({ globals, assets: ASSETS });
    const result = generate({ ...base, globals, compiledAssets });

    expect(result.files).toEqual([]);
    expect(result.diagnostics.map((d) => d.message)).toContain(
      "Image 'logo' declares 32x32 but 'assets/logo.png' is 10x2; resize the PNG.",
    );
  });
});
