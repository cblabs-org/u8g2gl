/**
 * E-D WO1: time each stage of the live editing path (ui_spec §4.1), as it
 * exists on main today, for one canvas nudge: an attribute value rewritten in a
 * screen's text, then everything from parse to pixels.
 *
 * Stages, in the order a nudge runs them:
 *   parse     parseScreenFile() on the edited screen only
 *   pipeline  createScreenPipeline(): expand composites, resolve geometry
 *   realise   realiseScreens(): decide what every element becomes
 *   check     checkProject(): the validator, every pass
 *   capacity  computeCapacities()
 *   scene     emitSceneFile(): the scene description, as JSON text
 *   apply     Wasm applyScene(): parse the JSON in C++, tear down, rebuild
 *   render    Wasm renderFrame(): tick and draw into the U8G2 buffer
 *   blit      1-bit U8G2 tile buffer to RGBA, the ImageData a canvas needs
 * For reference, it also times generate() (the whole firmware build in memory),
 * which an editor would not run per edit.
 *
 * Measurement only, run from the repository root against cli/dist and a built
 * editor Wasm. Node's timer; the browser will differ, which LOOP-BUDGET.md says.
 *
 *   node <this> <project dir> <wasm dir> <screen file> <element name> <attr> [iterations]
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { join, resolve } from 'node:path';

const [projectDir, wasmDir, screenFile, elementName, attrName, itersArg] = process.argv.slice(2);
const ITERATIONS = Number(itersArg ?? 200);
const WARMUP = 30;

const dist = resolve('cli/dist');
const { loadProject } = await import(join(dist, 'node/load-project.js'));
const { parseScreenFile } = await import(join(dist, 'core/parser/index.js'));
const { createScreenPipeline, findTargetDisplay } = await import(join(dist, 'core/resolver/index.js'));
const { realiseScreens, computeCapacities } = await import(join(dist, 'core/realise/index.js'));
const { checkProject, generate } = await import(join(dist, 'core/generator/index.js'));
const { emitSceneFile } = await import(join(dist, 'core/generator/emit/scene.js'));
const { compileProjectAssets } = await import(join(dist, 'core/assets/index.js'));
const { createEditor } = await import(resolve('wasm/u8g2gl_editor.mjs'));

// --- Load once, as the editor would on open ---
const loaded = loadProject(projectDir);
const model = loaded.model;
const compiledAssets = await compileProjectAssets({ globals: model.globals, assets: loaded.assets });
const target = model.project.targets[0];
const display = findTargetDisplay(target, model.catalogue);
const screenText = readFileSync(join(projectDir, 'screens', screenFile), 'utf-8');
const screenIndex = model.screens.findIndex((s) => s.loc?.file?.endsWith(screenFile) ?? false);
if (screenIndex < 0) throw new Error(`screen ${screenFile} not in the loaded model`);

// The nudge: rewrite one attribute value in place, as a CST edit would.
const pattern = new RegExp(`(name="${elementName}"[^>]*?\\s${attrName}=")(-?\\d+)(")`);
const original = Number(screenText.match(pattern)?.[2]);
if (Number.isNaN(original)) throw new Error(`no ${attrName} on ${elementName}`);
const nudged = (i) => screenText.replace(pattern, `$1${original - (i % 2)}$3`);

const editor = await createEditor(resolve(wasmDir));
const { width, height } = { width: display.width, height: display.height };
const rgba = new Uint8ClampedArray(width * height * 4);

// U8G2's full buffer is tile rows: byte (x + (y >> 3) * width), bit (y & 7).
function blit(buffer) {
  for (let y = 0; y < height; y++) {
    const row = (y >> 3) * width;
    const bit = 1 << (y & 7);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const v = buffer[row + x] & bit ? 255 : 0;
      rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 255;
    }
  }
}

const stages = ['parse', 'pipeline', 'realise', 'check', 'capacity', 'scene', 'apply', 'render', 'blit'];
const samples = Object.fromEntries([...stages, 'total', 'generate'].map((s) => [s, []]));
let sceneBytes = 0;
let lit = 0;
let ms = 0;

for (let i = 0; i < WARMUP + ITERATIONS; i++) {
  const t = [performance.now()];
  const parsed = parseScreenFile(nudged(i), model.screens[screenIndex].loc.file);
  const screens = model.screens.map((s, k) => (k === screenIndex ? parsed.value : s));
  const edited = { ...model, screens };
  t.push(performance.now());
  const pipeline = createScreenPipeline({ globals: model.globals, screens, manifests: model.manifests, display });
  t.push(performance.now());
  const realisation = realiseScreens({ globals: model.globals, manifests: model.manifests, expansion: pipeline.expansion });
  t.push(performance.now());
  const checked = checkProject(edited, 'error', target, pipeline, realisation);
  t.push(performance.now());
  const capacities = computeCapacities({ globals: model.globals, screens: realisation.screens });
  t.push(performance.now());
  const scene = emitSceneFile({
    project: {
      project: model.project, globals: model.globals, screens, capacities, manifests: model.manifests,
      images: compiledAssets.images, compiledFonts: compiledAssets.fonts,
      bdfLicenceFiles: loaded.bdfLicenceFiles ?? new Map(), stamp: '',
    },
    realised: realisation.screens,
    resolved: pipeline.resolution.screens,
    manifests: model.manifests,
    generated: { source: 'u8g2gl.xml', schema: model.project.schema, generator: '0.0.0-bench', target: target.name },
  });
  t.push(performance.now());
  if (!editor.applyScene(scene)) throw new Error(`applyScene: ${editor.getLastError()}`);
  t.push(performance.now());
  const buffer = editor.renderFrame((ms += 16));
  if (!buffer) throw new Error(`renderFrame: ${editor.getLastError()}`);
  t.push(performance.now());
  blit(buffer);
  t.push(performance.now());

  const g0 = performance.now();
  generate({ ...edited, generatorVersion: '0.0.0-bench', compiledAssets, bdfLicenceFiles: loaded.bdfLicenceFiles });
  const g1 = performance.now();

  if (checked.errors > 0) throw new Error(`edit made the project invalid: ${JSON.stringify(checked.diagnostics.filter((d) => d.severity === "error"))}`);
  if (i >= WARMUP) {
    stages.forEach((s, k) => samples[s].push(t[k + 1] - t[k]));
    samples.total.push(t[t.length - 1] - t[0]);
    samples.generate.push(g1 - g0);
  }
  sceneBytes = scene.length;
  lit = 0;
  for (const byte of buffer) for (let b = byte; b; b &= b - 1) lit++;
}

const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
console.log(`project ${projectDir}`);
console.log(`node ${process.version}; ${ITERATIONS} iterations after ${WARMUP} warm-up`);
console.log(`display ${width}x${height}; screens ${model.screens.length}; scene ${sceneBytes} bytes; lit pixels ${lit}`);
console.log('stage        median     p95      max   (ms)');
for (const s of [...stages, 'total', 'generate']) {
  const xs = samples[s];
  console.log(`${s.padEnd(10)} ${pct(xs, 50).toFixed(3).padStart(8)} ${pct(xs, 95).toFixed(3).padStart(8)} ${Math.max(...xs).toFixed(3).padStart(8)}`);
}
