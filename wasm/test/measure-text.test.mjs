/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/measure-text.test.mjs
 * Purpose: Proves the bridge's measureText() gives U8G2's own widths: the
 *          designer's *full, longest* sample set is made of the widest glyph
 *          of each font, found with it, so a wrong width would make the worst
 *          case less than the worst.
 * Description: The framework editor Wasm, with the generated fixture's fonts
 *              injected as the designer injects them (inject-assets.mjs). The
 *              known widths are the fonts' own: a monospaced built-in advances
 *              by its cell width for every glyph (`u8g2_font_6x10_mr` 6,
 *              `u8g2_font_5x7_mr` 5), U8G2's 4x6.bdf declares DWIDTH 4, and
 *              getUTF8Width() counts a string's last glyph by its ink rather
 *              than its advance, so a width of n glyphs is (n − 1) advances
 *              plus that glyph's own width. A proportional font's W is wider
 *              than its i. A font that is not loaded, and a missing argument,
 *              are refused with a reason.
 *
 * Usage: node wasm/test/measure-text.test.mjs (after building the CLI and
 *        the u8g2gl_editor target)
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';
import { injectAssets, projectAssets } from './inject-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'test', 'generated_fixture');

async function main() {
  const checks = [];
  const check = (what, ok, detail = '') => checks.push({ what, ok, detail });

  // --- Step 1: The framework Wasm, with the fixture's fonts injected ---
  const editor = await createEditor();
  injectAssets(editor._module, await projectAssets(fixture));
  const measure = (font, text) => editor._module.ccall('measureText', 'number', ['string', 'string'], [font, text]);
  const advance = (font, glyph) => measure(font, glyph + glyph) - measure(font, glyph);

  // --- Step 2: Monospaced built-ins: every glyph advances by the cell width ---
  for (const [font, cell] of [
    ['u8g2_font_6x10_mr', 6],
    ['u8g2_font_5x7_mr', 5],
  ]) {
    check(`${font}: "Hello" is 5 cells`, measure(font, 'Hello') === 5 * cell, `got ${measure(font, 'Hello')}`);
    check(`${font}: "iiii" is as wide as "WWWW"`, measure(font, 'iiii') === measure(font, 'WWWW'));
    const advances = new Set([...'AWi.@ ~0'].map((glyph) => advance(font, glyph)));
    check(`${font}: every glyph advances ${cell}`, advances.size === 1 && advances.has(cell), `got ${[...advances].join(', ')}`);
  }

  // --- Step 3: A BDF font, at its declared DWIDTH; the last glyph counted by its ink ---
  check('font_4x6: W advances 4 (DWIDTH 4)', advance('font_4x6', 'W') === 4, `got ${advance('font_4x6', 'W')}`);
  check('font_4x6: n glyphs are (n - 1) advances plus the last one\'s width', measure('font_4x6', 'WWW') === 2 * 4 + measure('font_4x6', 'W'));

  // --- Step 4: A proportional font: W is wider than i, and nothing is zero but nothing ---
  check('u8g2_font_helvR08_tr: W advances further than i', advance('u8g2_font_helvR08_tr', 'W') > advance('u8g2_font_helvR08_tr', 'i'));
  check('the empty string measures 0', measure('u8g2_font_helvR08_tr', '') === 0);

  // --- Step 5: Refusals, with a reason ---
  check('a font that is not loaded is -1', measure('u8g2_font_not_loaded', 'x') === -1);
  check('and the reason names it', /font 'u8g2_font_not_loaded' is not loaded/.test(editor.getLastError()), editor.getLastError());
  check('a later good call clears the error', measure('u8g2_font_6x10_mr', 'x') === 6 && editor.getLastError() === '');
  check('a missing text is -1', editor._module.ccall('measureText', 'number', ['string', 'number'], ['u8g2_font_6x10_mr', 0]) === -1);

  for (const { what, ok, detail } of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail && !ok ? ` (${detail})` : ''}`);
  }
  if (checks.some(({ ok }) => !ok)) {
    process.exit(1);
  }
  console.log(`measureText test passed: ${checks.length} checks.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
