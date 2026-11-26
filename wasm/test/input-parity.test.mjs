/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/input-parity.test.mjs
 * Purpose: Input parity in the real Wasm (§12): the input fixture's
 *          scene through the editor bridge, as the designer's canvas previews
 *          it, and its generated firmware through the test-run harness, as a
 *          design server's test run runs it, both driven by one scripted event
 *          sequence. After every step the two must draw the same frame, show
 *          the same screen and reach the same callbacks, each as the script
 *          says, and no frame may be blank.
 * Description: Loads build-wasm/wasm/input/ (the editor and the harness,
 *              built by wasm/CMakeLists.txt) and test/input_menu/'s committed
 *              scene and script. PASS/FAIL lines, exit 1 on any failure.
 *
 * Usage: node wasm/test/input-parity.test.mjs
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';
import { injectAssets, projectAssets } from './inject-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const fixture = join(root, 'test', 'input_menu');
const built = join(root, 'build-wasm', 'wasm', 'input');
const scene = readFileSync(join(fixture, 'generated_editor', 'ui_scene.json'), 'utf-8');
const script = JSON.parse(readFileSync(join(fixture, 'script.json'), 'utf-8'));

// The runtime's u8g2gl_event_t values, as cli/src/core/schema/input-model.ts's
// INPUT_EVENTS names them.
const EVENTS = {
  encoder_cw: 1,
  encoder_ccw: 2,
  encoder_click: 3,
  button_press: 4,
  button_long_press: 5,
  encoder_long_click: 6,
  button_next: 7,
  button_prev: 8,
};

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` (${detail})`}`);
  if (!ok) failures += 1;
}

function lit(buffer) {
  let count = 0;
  for (const byte of buffer) {
    for (let b = byte; b; b >>>= 1) count += b & 1;
  }
  return count;
}

function sameBytes(a, b) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// --- The editor: the scene, previewed and driven as the canvas does ---
const editor = await createEditor(built);
injectAssets(editor._module, await projectAssets(fixture));
const module = editor._module;
const callString = (name, text) => {
  const length = module.lengthBytesUTF8(text) + 1;
  const pointer = module._malloc(length);
  module.stringToUTF8(text, pointer, length);
  try {
    return module[name](pointer);
  } finally {
    module._free(pointer);
  }
};
if (!editor.applyScene(scene)) throw new Error(`applyScene: ${editor.getLastError()}`);
if (callString('_selectScreen', script.screen) !== 1) throw new Error(`selectScreen: ${editor.getLastError()}`);
check('the editor starts preview on the script screen', module._setPreview(1) === 1, editor.getLastError());
const editorSteps = [];
const keepEditor = () => {
  const frame = editor.renderFrame(0);
  const state = JSON.parse(module.UTF8ToString(module._getInputState()));
  editorSteps.push({
    frame,
    screen: state.screen,
    focused: state.focused,
    callbacks: state.callbacks.map((call) => `${call.callback} ${call.element} ${call.trigger}`),
  });
};
keepEditor();
for (const step of script.steps) {
  module._dispatchEvent(EVENTS[step.event]);
  keepEditor();
}
module._setPreview(0);

// --- The firmware: the harness, as a test run boots and drives it ---
const require = createRequire(import.meta.url);
const createHarness = require(join(built, 'u8g2gl_harness.js'));
const harness = await createHarness({ wasmBinary: readFileSync(join(built, 'u8g2gl_harness.wasm')) });
const screens = Array.from({ length: harness._getScreenCount() }, (_, i) => harness.UTF8ToString(harness._getScreenName(i)));
const objectNames = Object.fromEntries(
  JSON.parse(scene).screens.map((screen) => [
    screen.name,
    Object.fromEntries(screen.elements.filter((e) => e.realisation === 'object').map((e) => [e.object, e.name])),
  ]),
);
harness._selectSampleSet(-1);
const events = Uint32Array.from(script.steps.map((step) => EVENTS[step.event]));
const eventsPtr = harness._malloc(events.length * 4);
harness.HEAPU32.set(events, eventsPtr >>> 2);
const ran = harness._runEvents(screens.indexOf(script.screen), eventsPtr, events.length);
harness._free(eventsPtr);
check('the harness runs the script', ran === 1, harness.UTF8ToString(harness._getLastError()));
const size = harness._getBufferSize();
const firmwareSteps = Array.from({ length: harness._getFrameCount() }, (_, i) => {
  const pointer = harness._getFramePtr(i);
  const screen = screens[harness._getStepScreen(i)] ?? null;
  const calls = JSON.parse(harness.UTF8ToString(harness._getStepCallbacks(i)));
  return {
    frame: harness.HEAPU8.slice(pointer, pointer + size),
    screen,
    callbacks: calls.map((call) => `${call.callback} ${objectNames[screen]?.[call.object] ?? '?'} ${call.trigger}`),
  };
});

// --- Every step: the same frame, screen and callbacks, each as the script says ---
check('both targets kept a frame per step', editorSteps.length === script.steps.length + 1 && firmwareSteps.length === editorSteps.length,
  `${editorSteps.length} and ${firmwareSteps.length}`);
check('activation focuses the ring\'s first member', editorSteps[0]?.focused === 'btn_display', editorSteps[0]?.focused);
for (let i = 0; i < firmwareSteps.length; i += 1) {
  const label = i === 0 ? 'boot' : `step ${i} (${script.steps[i - 1].event})`;
  const device = firmwareSteps[i];
  const canvas = editorSteps[i];
  const want = i === 0 ? { screen: script.screen, callbacks: [] } : script.steps[i - 1];
  check(`${label}: the frame has lit pixels`, lit(device.frame) > 0, `${lit(device.frame)} lit`);
  check(`${label}: the canvas draws the device's frame`, sameBytes(canvas.frame, device.frame), `${lit(canvas.frame)} vs ${lit(device.frame)} lit`);
  check(`${label}: both are on screen '${want.screen}'`, device.screen === want.screen && canvas.screen === want.screen,
    `${device.screen}, ${canvas.screen}`);
  check(`${label}: both reached the script's callbacks`,
    JSON.stringify(device.callbacks) === JSON.stringify(want.callbacks) && JSON.stringify(canvas.callbacks) === JSON.stringify(want.callbacks),
    `${JSON.stringify(device.callbacks)}, ${JSON.stringify(canvas.callbacks)}`);
  if (i > 0) {
    check(`${label}: the canvas focuses '${want.focused}'`, canvas.focused === want.focused, canvas.focused);
  }
}

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('input parity: every step agrees');
