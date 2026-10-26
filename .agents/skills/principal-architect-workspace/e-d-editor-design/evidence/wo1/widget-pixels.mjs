/**
 * E-D WO1: render the probe project's scene through the probe editor Wasm, with
 * the custom widgets' real C++ linked in, and count lit pixels inside each
 * element's rectangle. Shows whether a custom widget draws anything when the
 * editor can give it no data: its rows arrive through C++ methods
 * (begin/add_row/commit), which neither the bridge nor sample data can reach.
 *   node <this> <scene json> <wasm dir>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEditor } from '../../../../../../wasm/u8g2gl_editor.mjs';

const [scenePath, wasmDir] = process.argv.slice(2);
const sceneText = readFileSync(scenePath, 'utf-8');
const scene = JSON.parse(sceneText);
const editor = await createEditor(resolve(wasmDir));
if (!editor.applyScene(sceneText)) throw new Error(editor.getLastError());
editor.applySampleData(JSON.stringify({ platform: '9', message_text: 'Calling at Reading', system_time: 71700 }));
const buf = editor.renderFrame(1000);
const { width } = editor.getDisplaySize();
const lit = (x, y) => (buf[(y >> 3) * width + x] >> (y & 7)) & 1;
let total = 0;
for (let i = 0; i < buf.length; i++) for (let b = buf[i]; b; b &= b - 1) total++;
console.log(`total lit pixels: ${total}`);
for (const el of scene.screens[0].elements) {
  if (!el.rect) continue;
  const [x, y, w, h] = el.rect;
  let n = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) n += lit(xx, yy);
  console.log(`${String(el.name).padEnd(12)} ${String(el.class ?? el.tag).padEnd(20)} rect ${x},${y} ${w}x${h}  lit ${n}`);
}
