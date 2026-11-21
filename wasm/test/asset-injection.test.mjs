/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/asset-injection.test.mjs
 * Purpose: Proves the designer's injected fonts and images draw exactly what
 *          the same assets compiled in draw (design_spec §9). The editor Wasm
 *          compiles in no project font or image; the designer hands the
 *          bridge each one's bytes instead, so the canvas is only honest if
 *          those bytes are the firmware's, pixel for pixel.
 * Description: Two Wasms over the framework fixture: the reference
 *              (`build-wasm/wasm/compiled_assets/`), with the fixture's fonts
 *              and images compiled in, and the framework editor Wasm, with
 *              none, into which the fixture's assets are injected as the
 *              designer gathers them (inject-assets.mjs: a built-in from the
 *              packaged u8g2_fonts.c by the design server's parser, a `<bdf>`
 *              and an image through compileProjectAssets()). Every screen
 *              must render identically in both. Then each asset is left out
 *              in turn, and the bridge must name it, and replaced by other
 *              bytes, and some screen must change, so a built-in font, a BDF
 *              font and an image are each shown to be drawn from the injected
 *              bytes. Then clearing: after clearInjected() the
 *              framework Wasm renders exactly as one never injected into.
 *              Last, the bridge's refusals of a truncated font and of image
 *              bytes that do not fit their size.
 *
 * Usage: node wasm/test/asset-injection.test.mjs (after building the CLI and
 *        the u8g2gl_editor and u8g2gl_editor_compiled_assets targets)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';
import { injectAssets, projectAssets } from './inject-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'test', 'generated_fixture');
const scene = readFileSync(join(fixture, 'generated_editor', 'ui_scene.json'), 'utf-8');
const screens = JSON.parse(scene).screens.map((screen) => screen.name);

// render
// Every screen of the fixture scene through one module, with the wifi icon
// shown: per screen, whether it applied, the last error (or warning) after the frame, and the frame's bytes.
//   editor — a createEditor() module
function render(editor) {
  const select = (name) => editor._module.ccall('selectScreen', 'number', ['string'], [name]) === 1;
  return screens.map((name) => {
    // wifi_connected shows the status bar's icon_wifi, hidden while it is false.
    const applied = editor.applyScene(scene) && select(name) && editor.applySampleData(JSON.stringify({ wifi_connected: true }));
    const frame = applied ? editor.renderFrame(0) : null;
    return { name, applied, error: editor.getLastError(), frame: frame === null ? '' : Buffer.from(frame).toString('hex') };
  });
}

// same
// Whether two renders match screen for screen, frame and error alike.
function same(a, b) {
  return a.every((screen, i) => screen.applied === b[i].applied && screen.frame === b[i].frame && screen.error === b[i].error);
}

// lit
// Lit pixels in a hex frame.
function lit(hex) {
  let count = 0;
  for (const byte of Buffer.from(hex, 'hex')) for (let b = byte; b !== 0; b >>= 1) count += b & 1;
  return count;
}

async function main() {
  const checks = [];
  const check = (what, ok, detail = '') => checks.push({ what, ok, detail });

  // --- Step 1: The reference, compiled in, and the framework Wasm, injected ---
  const reference = await createEditor(join(root, 'build-wasm', 'wasm', 'compiled_assets'));
  const framework = await createEditor();
  const assets = await projectAssets(fixture);
  injectAssets(framework._module, assets);
  const expected = render(reference);
  const injected = render(framework);
  check('the reference renders every screen', expected.every((s) => s.applied && s.error === '' && lit(s.frame) > 0), JSON.stringify(expected.map((s) => s.error)));
  for (const [i, screen] of injected.entries()) {
    check(`screen '${screen.name}' renders pixel-identically injected and compiled in`, screen.applied && screen.frame === expected[i].frame, screen.error);
  }

  // --- Step 2: Each asset is drawn from its injected bytes ---
  // One of each kind is named, so a fixture change that dropped a kind fails here.
  const kinds = { 'built-in font': 'u8g2_font_6x10_mr', 'BDF font': 'font_4x6', image: 'icon_wifi' };
  for (const [kind, name] of Object.entries(kinds)) {
    check(`the fixture declares the ${kind} '${name}'`, assets.fonts.has(name) || assets.images.has(name));
  }
  for (const name of [...assets.fonts.keys(), ...assets.images.keys()]) {
    framework._module._clearInjected();
    injectAssets(framework._module, {
      fonts: new Map([...assets.fonts].filter(([font]) => font !== name)),
      images: new Map([...assets.images].filter(([image]) => image !== name)),
    });
    const without = render(framework);
    check(`without '${name}' the bridge names it`, without.some((screen) => screen.error.includes(`'${name}'`)));
    // Other bytes under the same name: another font (font_4x6 is a 4x6 font,
    // so the fallback alone may look the same), or the image inverted.
    framework._module._clearInjected();
    const substitute = name === 'u8g2_font_6x10_mr' ? 'u8g2_font_5x7_mr' : 'u8g2_font_6x10_mr';
    const fonts = new Map(assets.fonts);
    const images = new Map(assets.images);
    if (fonts.has(name)) fonts.set(name, assets.fonts.get(substitute));
    else images.set(name, { ...images.get(name), bytes: images.get(name).bytes.map((byte) => byte ^ 0xff) });
    injectAssets(framework._module, { fonts, images });
    const other = render(framework);
    check(`'${name}' is drawn from its injected bytes: other bytes change some screen`, other.some((screen, i) => screen.frame !== expected[i].frame));
  }

  // --- Step 3: Clearing leaves nothing behind ---
  framework._module._clearInjected();
  injectAssets(framework._module, assets);
  check('re-injected, it matches again', same(render(framework), expected));
  framework.applyScene(scene);
  const before = framework.renderFrame(0);
  framework._module._clearInjected();
  const kept = framework.renderFrame(0);
  check('the screen built before a clear keeps drawing its own bytes', before !== null && kept !== null && Buffer.compare(before, kept) === 0);
  const cleared = render(framework);
  const fresh = await createEditor();
  check('after clearInjected() it renders as a Wasm never injected into', same(cleared, render(fresh)), JSON.stringify(cleared.map((s) => s.error)));
  // With its images but no fonts, every screen applies, each font drawn in the fallback.
  injectAssets(framework._module, { images: assets.images });
  const fallback = render(framework);
  check('a font that is not loaded is drawn in the fallback, and the warning names it',
    fallback.every((s) => s.applied && lit(s.frame) > 0 && /font '.*' is not loaded, so it is drawn in u8g2_font_4x6_tr/.test(s.error)), JSON.stringify(fallback.map((s) => s.error)));

  // --- Step 4: What the bridge refuses ---
  const font = assets.fonts.get('u8g2_font_6x10_mr');
  const refusesFont = (() => {
    try {
      injectAssets(framework._module, { fonts: new Map([['short', font.subarray(0, font.length - 8)]]) });
      return false;
    } catch (error) {
      return /not a whole U8G2 font table/.test(String(error));
    }
  })();
  check('a truncated font is refused', refusesFont);
  const refusesImage = (() => {
    try {
      injectAssets(framework._module, { images: new Map([['odd', { width: 16, height: 16, bytes: new Uint8Array(31) }]]) });
      return false;
    } catch (error) {
      return /not the 16x16 bitmap's 32/.test(String(error));
    }
  })();
  check('image bytes that are not their size are refused', refusesImage);

  for (const { what, ok, detail } of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail && !ok ? ` (${detail})` : ''}`);
  }
  if (checks.some(({ ok }) => !ok)) {
    process.exit(1);
  }
  console.log(`Asset-injection test passed: ${screens.length} screens, ${assets.fonts.size} fonts, ${assets.images.size} images.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
