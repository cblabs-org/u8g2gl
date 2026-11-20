/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: wasm/test/collection-data.test.mjs
 * Purpose: The editor's fill path (schema 0.7 `<data>`, design_spec §9.2), in
 *          the real Wasm. A train formation and a service list — the departures
 *          fixture's own widgets — filled by name through applyCollectionData()
 *          must draw exactly what the same widgets draw when hand-written C++
 *          fills them through their own methods (collection_reference.cpp).
 *          Then every refusal the bridge promises: rows over an instance's
 *          capacity, a bad row named by element, index and field, an unknown
 *          element or data name; and a refused call changes nothing.
 * Description: Loads the collection-data test Wasm (build-wasm/wasm/collections/,
 *              built by wasm/CMakeLists.txt) and test/collection_data/'s
 *              committed scene. PASS/FAIL lines, exit 1 on any failure.
 *
 * Usage: node wasm/test/collection-data.test.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor } from '../u8g2gl_editor.mjs';
import { injectAssets, projectAssets } from './inject-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const scene = readFileSync(join(root, 'test', 'collection_data', 'generated_editor', 'ui_scene.json'), 'utf-8');

// The rows collection_reference.cpp fills by hand; a change to one must be made to the other.
const DATA = {
  formation: {
    carriages: [
      { number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 40 },
      { number: 2, class_type: 'standard', wheelchair: false, bike: true, loading_pct: 85 },
      { number: 3, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 10 },
    ],
  },
  services: {
    rows: [
      { cells: ['10:02', 'Reading', '4', 'On time'] },
      { cells: ['10:15', 'Oxford', '1', 'Exp 10:19'] },
      { cells: ['10:31', 'Didcot', '11', 'Cancelled'] },
    ],
  },
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

const editor = await createEditor(join(root, 'build-wasm', 'wasm', 'collections'));
// The editor Wasm compiles in no project font or image: the fixture's are
// injected first, as the designer injects a project's (design_spec §9).
injectAssets(editor._module, await projectAssets(fileURLToPath(new URL('../../test/collection_data', import.meta.url))));
const module = editor._module;

// The hand-written frame: built, filled and drawn by collection_reference.cpp.
function reference() {
  const pointer = module._renderReference();
  return new Uint8Array(module.HEAPU8.buffer.slice(pointer, pointer + 128 * 64 / 8));
}

// A fresh scene, so every case starts from empty widgets.
function fresh() {
  if (!editor.applyScene(scene)) throw new Error(`applyScene: ${editor.getLastError()}`);
}

function sameBytes(a, b) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// --- Parity: filled by name equals filled by hand ---
fresh();
const empty = editor.renderFrame(0);
check('both widgets draw nothing before they are filled', lit(empty) === 0, `${lit(empty)} lit`);
const applied = editor.applyCollectionData(JSON.stringify(DATA));
check('applyCollectionData fills the formation and the service list', applied, editor.getLastError());
const filled = editor.renderFrame(0);
const expected = reference();
check('the filled frame is the hand-written one, byte for byte', sameBytes(filled, expected), `${lit(filled)} lit, reference ${lit(expected)}`);
check('and it draws something', lit(expected) > 0, `${lit(expected)} lit`);

// --- A refused call changes nothing: the rows already there stay ---
function refuses(name, data, message) {
  fresh();
  if (!editor.applyCollectionData(JSON.stringify(DATA))) throw new Error(editor.getLastError());
  const before = editor.renderFrame(0);
  const ok = editor.applyCollectionData(JSON.stringify(data));
  const error = editor.getLastError();
  const after = editor.renderFrame(0);
  check(`${name} is refused`, !ok && error.includes(message), error);
  check(`${name} changes nothing`, sameBytes(before, after));
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ cells: [`${i}`] }));
refuses('more rows than the instance capacity', { services: { rows: rows(4) } }, 'services rows: 4 rows, over the capacity of 3');
refuses(
  'more carriages than max_carriages',
  { formation: { carriages: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 0 })) } },
  'formation carriages: 9 rows, over the capacity of 8',
);
refuses(
  'an int outside its bounds',
  { formation: { carriages: [{ number: 1, class_type: 'first', wheelchair: true, bike: false, loading_pct: 101 }] } },
  'formation carriages[0].loading_pct: 101 is outside 0..100',
);
refuses(
  'an enum outside its values',
  { formation: { carriages: [{ number: 1, class_type: 'business', wheelchair: true, bike: false, loading_pct: 1 }] } },
  "formation carriages[0].class_type: 'business' is not one of standard, first",
);
refuses(
  'a missing field',
  { formation: { carriages: [{ number: 1, class_type: 'first', wheelchair: true, loading_pct: 1 }] } },
  'formation carriages[0].bike: missing',
);
refuses('a field of the wrong type', { formation: { carriages: [{ number: '1', class_type: 'first', wheelchair: true, bike: false, loading_pct: 1 }] } }, 'formation carriages[0].number: must be an integer');
refuses('an unknown field', { services: { rows: [{ cells: ['a'], colour: 'red' }] } }, 'services rows[0].colour: no such field');
refuses('more cells than max_cols', { services: { rows: [{ cells: ['a', 'b', 'c', 'd', 'e'] }] } }, 'services rows[0].cells: 5 values, more than its 4');
refuses('a bad row after good ones, and the good block before it', { formation: DATA.formation, services: { rows: [{ cells: ['a'] }, { cells: [7] }] } }, 'services rows[1].cells: must be an array of strings');
refuses('an element the screen does not have', { arrivals: { rows: [] } }, 'arrivals: the active screen has no object of that name');
refuses('a data name the class does not declare', { services: { carriages: [] } }, '<wd_service_list> declares no <data name="carriages">');

// --- Fewer cells than columns, and an empty block, are fine ---
fresh();
check('a short row is accepted', editor.applyCollectionData(JSON.stringify({ services: { rows: [{ cells: ['10:02'] }, {}] } })), editor.getLastError());
check('an empty block empties the widget', editor.applyCollectionData(JSON.stringify({ services: { rows: [] } })) && lit(editor.renderFrame(0)) === 0, editor.getLastError());

if (failures > 0) {
  console.error(`Collection-data test failed: ${failures} check(s).`);
  process.exit(1);
}
console.log('Collection-data test passed.');
