/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/placeholder.test.mjs
 * Purpose: Proves that one widget the loaded Wasm cannot build costs one
 *          rectangle, not the whole canvas. For each
 *          chosen element of the fixture's home screen, a copy of the scene
 *          names an unknown class for it and another removes it; the two must
 *          render identically everywhere outside the element's rectangle, the
 *          placeholder must draw inside it (unless a flag directive hides it,
 *          as it would the widget), and getPlaceholders() must name it.
 *
 * Description: Removing an element renumbers the objects after it (their
 *              `object`, `parent`, `clip` and visibility `ancestor` indices),
 *              as the generator would have numbered a scene without it.
 *
 * Usage: node wasm/test/placeholder.test.mjs [wasm-dir]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const UNKNOWN_CLASS = 'wd_not_in_this_wasm';

// pixel
// Whether (x, y) is lit in U8G2's vertical_top_lsb buffer: one byte per column
// of each 8-pixel tile row, low bit at the top.
function pixel(buffer, width, x, y) {
  return (buffer[Math.floor(y / 8) * width + x] >> (y % 8)) & 1;
}

// withUnknownClass
// The scene with one element's class replaced by a name no registry has.
function withUnknownClass(scene, screen, name) {
  const copy = structuredClone(scene);
  const element = copy.screens.find((s) => s.name === screen).elements.find((e) => e.name === name);
  element.class = UNKNOWN_CLASS;
  return copy;
}

// withoutElement
// The scene with one object element removed and every later object index
// shifted down, so it reads as if the element had never been written.
function withoutElement(scene, screen, name) {
  const copy = structuredClone(scene);
  const elements = copy.screens.find((s) => s.name === screen).elements;
  const index = elements.findIndex((e) => e.name === name);
  const removed = elements[index].object;
  elements.splice(index, 1);
  const shift = (value) => (typeof value === 'number' && value > removed ? value - 1 : value);
  for (const element of elements) {
    if (element.parent === removed || element.clip === removed) {
      throw new Error(`${name} has dependants; choose a leaf element`);
    }
    element.object = shift(element.object);
    element.parent = shift(element.parent);
    if (element.clip !== undefined) element.clip = shift(element.clip);
    for (const term of element.visibility ?? []) {
      if (term.ancestor !== undefined) term.ancestor = shift(term.ancestor);
    }
  }
  return copy;
}

// render
// Applies a scene and renders its first frame; fails the test on refusal.
function render(editor, scene) {
  if (!editor.applyScene(JSON.stringify(scene))) {
    throw new Error(`applyScene refused: ${editor.getLastError()}`);
  }
  const buffer = editor.renderFrame(0);
  if (buffer === null) {
    throw new Error(`renderFrame failed: ${editor.getLastError()}`);
  }
  return { buffer, placeholders: editor.getPlaceholders(), ...editor.getDisplaySize() };
}

async function main() {
  const editor = await createEditor(process.argv[2]);
  const scenePath = join(projectRoot, 'test', 'generated_fixture', 'generated_editor', 'ui_scene.json');
  const scene = JSON.parse(readFileSync(scenePath, 'utf-8'));
  let failures = 0;

  // A mid-array child (later objects renumber), the last object, and a child
  // hidden by its flag directive — a placeholder keeps the base object's flags,
  // so it hides exactly when the widget would, and then draws nothing.
  const cases = [
    { name: 'bar_clock', drawn: true },
    { name: 'msg', drawn: true },
    { name: 'bar_wifi_icon', drawn: false },
  ];
  for (const { name, drawn } of cases) {
    // --- Step 1: Render the scene with the element unknown, and without it ---
    const unknown = render(editor, withUnknownClass(scene, 'home', name));
    const absent = render(editor, withoutElement(scene, 'home', name));
    const element = scene.screens.find((s) => s.name === 'home').elements.find((e) => e.name === name);
    const [rx, ry, rw, rh] = element.rect;
    const inside = (x, y) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;

    // --- Step 2: Identical outside the rectangle; something drawn inside ---
    let differing = 0;
    let litInside = 0;
    for (let y = 0; y < unknown.height; y++) {
      for (let x = 0; x < unknown.width; x++) {
        const a = pixel(unknown.buffer, unknown.width, x, y);
        if (inside(x, y)) {
          litInside += a;
        } else if (a !== pixel(absent.buffer, absent.width, x, y)) {
          differing++;
        }
      }
    }

    // --- Step 3: getPlaceholders() names it, and only it ---
    const listed = unknown.placeholders;
    const listedOk =
      listed.length === 1 && listed[0].name === name && listed[0].class === UNKNOWN_CLASS &&
      JSON.stringify(listed[0].rect) === JSON.stringify(element.rect);
    const ok = differing === 0 && (litInside > 0) === drawn && listedOk && absent.placeholders.length === 0;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${name}: ${differing} pixels differ outside [${element.rect}], ` +
        `${litInside} lit inside, placeholders ${JSON.stringify(listed)}`,
    );
    failures += ok ? 0 : 1;
  }

  editor.teardown();
  if (failures > 0) {
    process.exit(1);
  }
  console.log('Placeholder test passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
