/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/last-error.test.mjs
 * Purpose: Proves getLastError() always describes the call that just failed.
 *          The bridge keeps only the first error a call raises, so an entry
 *          point that did not clear it first would report a previous call's
 *          failure for every later one in the same scene.
 * Description: Two failing selectScreen() calls in a row must each name their
 *              own screen; a succeeding call leaves the error empty; and a
 *              failing renderFrame() after a failing selectScreen() reports its
 *              own cause.
 *
 * Usage: node wasm/test/last-error.test.mjs [wasm-dir]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenePath = join(__dirname, '..', '..', 'test', 'generated_fixture', 'generated_editor', 'ui_scene.json');

async function main() {
  const editor = await createEditor(process.argv[2]);
  const select = (name) => editor._module.ccall('selectScreen', 'number', ['string'], [name]) === 1;
  const checks = [];
  const check = (what, ok, detail) => checks.push({ what, ok, detail });

  // --- Step 1: A scene that applies, so later failures are the only errors ---
  check('applyScene succeeds', editor.applyScene(readFileSync(scenePath, 'utf-8')), editor.getLastError());

  // --- Step 2: Two different failures, each reported as its own ---
  check('first missing screen fails', !select('no_such_screen_a'), '');
  check('and names that screen', editor.getLastError().includes('no_such_screen_a'), editor.getLastError());
  check('second missing screen fails', !select('no_such_screen_b'), '');
  check('and names the second, not the first', editor.getLastError().includes('no_such_screen_b'), editor.getLastError());

  // --- Step 3: A failing render reports its own cause ---
  check('render with no screen active fails', editor.renderFrame(0) === null, '');
  check('and says why', /no screen active/.test(editor.getLastError()), editor.getLastError());

  // --- Step 4: Success leaves no error behind ---
  check('selecting a real screen succeeds', select('home'), editor.getLastError());
  check('and clears the error', editor.getLastError() === '', editor.getLastError());
  check('rendering it succeeds with no error', editor.renderFrame(0) !== null && editor.getLastError() === '', editor.getLastError());

  editor.teardown();
  for (const { what, ok, detail } of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  }
  if (checks.some(({ ok }) => !ok)) {
    process.exit(1);
  }
  console.log('Last-error test passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
