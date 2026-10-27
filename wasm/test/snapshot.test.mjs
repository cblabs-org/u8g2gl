/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/snapshot.test.mjs
 * Purpose: Wasm snapshot test — loads a scene through the Wasm bridge, renders
 *          a frame, and computes the SHA-256 of the pixel buffer. This is the
 *          D-9 parity proof: the Wasm renderer must produce the same pixels as
 *          the host (CMake) build for the same scene.
 *
 * Usage: node wasm/test/snapshot.test.mjs
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

async function main() {
  console.log('=== U8G2GL Wasm Snapshot Test ===\n');

  // --- Step 1: Load Wasm module ---
  console.log('Loading Wasm module...');
  const editor = await createEditor();
  console.log('  Wasm module loaded.\n');

  // --- Step 2: Load scene JSON ---
  const scenePath = join(projectRoot, 'test', 'generated_fixture', 'generated_editor', 'ui_scene.json');
  const sceneJson = readFileSync(scenePath, 'utf-8');
  console.log(`Scene: ${scenePath}`);
  console.log(`  Size: ${sceneJson.length} bytes\n`);

  // --- Step 3: Apply scene ---
  console.log('Applying scene...');
  const ok = editor.applyScene(sceneJson);
  if (!ok) {
    console.error(`  FAILED: ${editor.getLastError()}`);
    process.exit(1);
  }
  const { width, height } = editor.getDisplaySize();
  console.log(`  Display: ${width}x${height}`);
  console.log('  Scene applied successfully.\n');

  // No sample data: the D-9 parity proof requires identical inputs to the
  // native test (test_wasm_parity.cpp), which renders the bare scene.

  // --- Step 5: Render frame ---
  console.log('Rendering frame...');
  const buffer = editor.renderFrame(0);
  if (!buffer) {
    console.error(`  FAILED: ${editor.getLastError()}`);
    process.exit(1);
  }
  console.log(`  Buffer size: ${buffer.length} bytes`);

  // Count lit pixels (for 1-bit vertical_top_lsb encoding)
  let litPixels = 0;
  for (let i = 0; i < buffer.length; i++) {
    let byte = buffer[i];
    while (byte) {
      litPixels += byte & 1;
      byte >>>= 1;
    }
  }
  console.log(`  Lit pixels: ${litPixels}`);

  // --- Step 6: Compute SHA-256 ---
  const hash = createHash('sha256').update(buffer).digest('hex');
  console.log(`  SHA-256: ${hash}\n`);

  // --- Step 7: Summary ---
  console.log('=== Snapshot Summary ===');
  console.log(`Display:    ${width}x${height}`);
  console.log(`Buffer:     ${buffer.length} bytes`);
  console.log(`Lit pixels: ${litPixels}`);
  console.log(`SHA-256:    ${hash}`);
  console.log('');

  // --- Step 7: D-9 parity assertion ---
  // This hash must match the native build's output (test_wasm_parity.cpp,
  // golden in test/CMakeLists.txt). If they differ, the Wasm renderer has
  // diverged from the host — the failure [D-9] names as the one that
  // discredits a design tool.
  const GOLDEN_SHA256 = '1c0c7bb2019c564510e4f124ab8355cf44bde019b34c12d6044dc8d07d22c2e0';

  console.log('=== D-9 Parity Check ===');
  if (hash === GOLDEN_SHA256) {
    console.log('PASS: Wasm SHA-256 matches native build.');
    console.log(`  Golden: ${GOLDEN_SHA256}`);
  } else {
    console.error('FAIL: D-9 parity broken — Wasm SHA-256 differs from native build.');
    console.error(`  Expected: ${GOLDEN_SHA256}`);
    console.error(`  Got:      ${hash}`);
    process.exit(1);
  }

  // --- Step 8: Teardown ---
  editor.teardown();
  console.log('\nTeardown complete. Test passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
