/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/design-hidden.test.mjs
 * Purpose: Proves the designer's own hiding (setDesignHidden()) leaves the
 *          frame exactly as if the element were not written — an object or a
 *          shape, with whatever it overlapped still drawn — and never leaks
 *          into what the device would draw: a fresh applyScene() forgets it,
 *          and getRuntimeHidden() reports only what the runtime's own rules
 *          left out, never what the designer hid.
 * Description: The parity fixture's scene, with the `bounds` screen's `dot`
 *              moved as a filled box over the `temp` label so the two overlap.
 *              Each hidden frame is compared, pixel for pixel, with a frame of
 *              a scene that does not have the element at all, or, for a
 *              container, with the frame its bound `hidden` flag produces.
 *
 * Usage: node wasm/test/design-hidden.test.mjs [wasm-dir]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenePath = join(__dirname, '..', '..', 'test', 'generated_fixture', 'generated_editor', 'ui_scene.json');
/** The box `dot` is moved to, over the `temp` label's text (0, 50, 60 × 10). */
const BOX = { x: 0, y: 50, width: 30, height: 10 };

// pixel
// Whether (x, y) is lit in U8G2's vertical_top_lsb buffer.
function pixel(buffer, width, x, y) {
  return (buffer[Math.floor(y / 8) * width + x] >> (y % 8)) & 1;
}

// overlapping
// The scene with `dot` a fixed, filled box over `temp`, so hiding either
// must leave the other's pixels where they overlap.
function overlapping(scene) {
  const copy = structuredClone(scene);
  const dot = copy.screens.find((s) => s.name === 'bounds').elements.find((e) => e.name === 'dot');
  dot.arguments = Object.entries(BOX).map(([name, value]) => ({ name, value }));
  return copy;
}

// without
// The scene with one leaf element removed, object indices shifted down after
// an object's, so it reads as if the element had never been written.
function without(scene, screen, name) {
  const copy = structuredClone(scene);
  const elements = copy.screens.find((s) => s.name === screen).elements;
  const index = elements.findIndex((e) => e.name === name);
  const removed = elements[index].object;
  elements.splice(index, 1);
  if (removed === undefined) return copy;
  const shift = (value) => (typeof value === 'number' && value > removed ? value - 1 : value);
  for (const element of elements) {
    element.object = shift(element.object);
    element.parent = shift(element.parent);
    if (element.clip !== undefined) element.clip = shift(element.clip);
    for (const term of element.visibility ?? []) {
      if (term.ancestor !== undefined) term.ancestor = shift(term.ancestor);
    }
  }
  return copy;
}

async function main() {
  const editor = await createEditor(process.argv[2]);
  const call = (name, text) => editor._module.ccall(name, 'number', ['string'], [text]);
  const hide = (names) => call('setDesignHidden', typeof names === 'string' ? names : JSON.stringify(names)) === 1;
  const runtimeHidden = () => JSON.parse(editor._module.UTF8ToString(editor._module._getRuntimeHidden()));
  const base = JSON.parse(readFileSync(scenePath, 'utf-8'));
  const scene = overlapping(base);
  const checks = [];
  const check = (what, ok, detail = '') => checks.push({ what, ok, detail });

  // frame
  // Applies a scene, selects a screen, sets sample data and the designer's
  // hidden names (none when undefined), and renders one frame.
  const frame = (json, screen, data = {}, hidden = undefined) => {
    if (!editor.applyScene(JSON.stringify(json))) throw new Error(`applyScene: ${editor.getLastError()}`);
    if (call('selectScreen', screen) !== 1) throw new Error(`selectScreen: ${editor.getLastError()}`);
    editor.applySampleData(JSON.stringify(data));
    if (hidden !== undefined && !hide(hidden)) throw new Error(`setDesignHidden: ${editor.getLastError()}`);
    const buffer = editor.renderFrame(0);
    if (buffer === null) throw new Error(`renderFrame: ${editor.getLastError()}`);
    return { buffer, ...editor.getDisplaySize() };
  };
  // differing
  // Pixels that differ between two frames of one display.
  const differing = (a, b) => {
    let count = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) count += pixel(a.buffer, a.width, x, y) !== pixel(b.buffer, b.width, x, y) ? 1 : 0;
    return count;
  };
  // litIn
  // Lit pixels of a frame inside the box.
  const litIn = (f) => {
    let count = 0;
    for (let y = BOX.y; y < BOX.y + BOX.height; y++) for (let x = BOX.x; x < BOX.x + BOX.width; x++) count += pixel(f.buffer, f.width, x, y);
    return count;
  };

  // --- Step 1: A hidden shape leaves the frame as if absent; the label under it stays ---
  const full = frame(scene, 'bounds');
  const shapeHidden = frame(scene, 'bounds', {}, ['dot']);
  const shapeAbsent = frame(without(scene, 'bounds', 'dot'), 'bounds');
  check('shown, the box lights pixels the label alone does not', litIn(full) > litIn(shapeHidden), `${litIn(full)} lit`);
  check('a hidden shape: identical to the scene without it', differing(shapeHidden, shapeAbsent) === 0, `${differing(shapeHidden, shapeAbsent)} differ`);
  check('and the label it covered is drawn underneath', litIn(shapeHidden) > 0 && litIn(shapeHidden) < BOX.width * BOX.height, `${litIn(shapeHidden)} lit`);

  // --- Step 2: A hidden object leaves the frame as if absent; the box under it stays ---
  const objectHidden = frame(scene, 'bounds', {}, ['temp']);
  const objectAbsent = frame(without(scene, 'bounds', 'temp'), 'bounds');
  check('a hidden object: identical to the scene without it', differing(objectHidden, objectAbsent) === 0, `${differing(objectHidden, objectAbsent)} differ`);
  check('and the box it overlapped is whole', litIn(objectHidden) === BOX.width * BOX.height, `${litIn(objectHidden)} lit`);

  // --- Step 3: A hidden container takes its children, objects and shapes, with it ---
  // The device hides the panel, its note and its edge when show_panel is
  // false, so that frame is the panel's subtree absent.
  const containerHidden = frame(base, 'gauges', { show_panel: true }, ['panel']);
  const boundHidden = frame(base, 'gauges', { show_panel: false });
  check('a hidden container hides everything inside it', differing(containerHidden, boundHidden) === 0, `${differing(containerHidden, boundHidden)} differ`);

  // --- Step 4: Unknown names are ignored; malformed text is refused and changes nothing ---
  const unknown = frame(scene, 'bounds', {}, ['no_such_element']);
  check('an unknown name changes nothing', differing(unknown, full) === 0);
  check('malformed JSON is refused', !hide('["dot"'), '');
  check('and says why', /JSON array of strings/.test(editor.getLastError()), editor.getLastError());
  check('a non-string name is refused', !hide('["dot", 3]'), '');
  check('a refusal keeps the previous set', differing({ buffer: editor.renderFrame(0), ...editor.getDisplaySize() }, unknown) === 0);

  // --- Step 5: selectScreen() keeps the set; applyScene() forgets it ---
  frame(scene, 'bounds', {}, ['dot']);
  call('selectScreen', 'home');
  call('selectScreen', 'bounds');
  const reselected = { buffer: editor.renderFrame(0), ...editor.getDisplaySize() };
  check('selectScreen keeps the hidden set', differing(reselected, shapeHidden) === 0);
  const reapplied = frame(scene, 'bounds');
  check('applyScene forgets it: the exported view', differing(reapplied, full) === 0, `${differing(reapplied, full)} differ`);

  // --- Step 6: getRuntimeHidden() names what the runtime's rules left out, never the designer's ---
  // `ghost` is written with hidden="true", so its own flag always hides it.
  const data = { show_panel: false, wifi_connected: false };
  frame(base, 'gauges', data);
  check('bound-hidden objects and guarded shapes are reported', JSON.stringify(runtimeHidden()) === '["panel","panel_edge","panel_note","ghost","blip"]', JSON.stringify(runtimeHidden()));
  frame(base, 'gauges', data, ['blip']);
  check('a designer-hidden shape is not reported', JSON.stringify(runtimeHidden()) === '["panel","panel_edge","panel_note","ghost"]', JSON.stringify(runtimeHidden()));
  frame(base, 'gauges', data, ['panel']);
  check('nor is a designer-hidden container, or anything inside it', JSON.stringify(runtimeHidden()) === '["ghost","blip"]', JSON.stringify(runtimeHidden()));
  frame(base, 'gauges', { show_panel: true, wifi_connected: true });
  check('with the data showing everything, only the flag written hidden', JSON.stringify(runtimeHidden()) === '["ghost"]', JSON.stringify(runtimeHidden()));
  call('selectScreen', 'home');
  check('a new screen reports nothing before its first frame', JSON.stringify(runtimeHidden()) === '[]', JSON.stringify(runtimeHidden()));

  editor.teardown();
  for (const { what, ok, detail } of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  }
  if (checks.some(({ ok }) => !ok)) {
    process.exit(1);
  }
  console.log('Design-hidden test passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
