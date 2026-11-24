/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/sample-set-parity.test.ts
 * Purpose: Parity per sample set ([D-9], ruling 9): with each of the departures
 *          project's four conventional sets applied, the firmware target's
 *          frames (the harness, filled through the subject setters and each
 *          widget's own begin / access / commit) must equal the editor
 *          target's (filled through `applySampleData` and the registry's fill
 *          thunk, `applyCollectionData`), pixel for pixel at every time. And
 *          the sets must really reach the frame: two blank frames agree, so
 *          each set's frame is also checked for what it should draw.
 * Description: The sets are the designer's conventional sets for the
 *              departures fixture (`fixtures/departures-samples/`: typical,
 *              empty, longest-plausible, worst-case), applied as the designer
 *              applies them: values over the initial ones, rows by element and
 *              data name for the screen, and keyed by screen name for the
 *              firmware half. Needs Emscripten 5.0.3; skipped without, with the
 *              other Emscripten tests' message.
 */

import { cpSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildEditorWasm } from '../../../../src/node/design/build/editor-wasm-build.js';
import { differingPixels } from '../../../../src/node/design/test-run/bug-report.js';
import { loadHarness } from '../../../../src/node/design/test-run/harness-runner.js';
import type { TestRunSampleSet } from '../../../../src/node/design/test-run/sample-set-unit.js';
import { TEST_RUN_TIMES } from '../../../../src/node/design/test-run/test-run-job.js';
import { buildTestRunHarness } from '../../../../src/node/design/test-run/test-run-build.js';
import { loadProject } from '../../../../src/node/load-project.js';
import { detectToolchain, type SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { nodeToolchainHost } from '../../../../src/node/toolchain/toolchain-host.js';
import { toolchainCacheRoot } from '../../../../src/node/toolchain/toolchain-paths.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { injectProjectAssets } from '../build/inject-project-assets.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';

const host = nodeToolchainHost();
// Detection only reads the real cache directory; nothing here writes it.
const toolchain: SelectedToolchain | undefined = (await detectToolchain(host, toolchainCacheRoot(host.platform, host.env, host.home)))
  .selected;
if (toolchain === undefined) {
  console.warn('sample-set-parity.test.ts: skipped, no Emscripten 5.0.3 (run `u8g2gl toolchain install` or put em++ on PATH)');
}

const SAMPLES = join(__dirname, 'fixtures', 'departures-samples');
const SCREEN = 'departures';
const SCREEN_FILE = 'screens/screen_departures.xml';
const WIDTH = 256;

/** Where the departures screen draws what the sets fill. */
const SERVICES = { x: 0, y: 51, width: 190, height: 13 };
const FORMATION = { x: 0, y: 17, width: 256, height: 32 };
const ROW0 = { x: 32, y: 0, width: 224, height: 16 };

/** The editor API of wasm/u8g2gl_editor.mjs, as this test drives it. */
interface EditorApi {
  applyScene(json: string): boolean;
  applySampleData(json: string): boolean;
  renderFrame(ms: number): Uint8Array | null;
  getLastError(): string;
  _module: { ccall(name: string, returns: string, types: string[], args: unknown[]): number };
}

// lit
// Lit pixels of a frame in a rectangle (U8G2's vertical_top_lsb layout).
function lit(frame: Uint8Array, rect: { x: number; y: number; width: number; height: number }): number {
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) count += (frame[Math.floor(y / 8) * WIDTH + x]! >> (y % 8)) & 1;
  }
  return count;
}

// applied
// A conventional set's file as the designer applies it: its values, and its
// rows for the screen keyed by element then data name (one <data> each).
function applied(name: string, dataNames: ReadonlyMap<string, string>): { values: Record<string, unknown>; byElement: Record<string, Record<string, unknown[]>> } {
  const set = JSON.parse(readFileSync(join(SAMPLES, `${name}.json`), 'utf8')) as { values: Record<string, unknown>; rows: Record<string, Record<string, unknown[]>> };
  const byElement: Record<string, Record<string, unknown[]>> = {};
  for (const [element, rows] of Object.entries(set.rows[SCREEN_FILE] ?? {})) byElement[element] = { [dataNames.get(element) ?? '']: rows };
  return { values: set.values, byElement };
}

describe.skipIf(toolchain === undefined)('parity with each conventional sample set (needs Emscripten)', () => {
  afterAll(removeTempDirs);

  it('departures: every set, every time, pixel for pixel, and each set draws what it holds', async () => {
    // --- Step 1: The sets, as the designer sends and applies them ---
    const project = join(makeTempDir('set-parity'), 'project');
    cpSync(DEPARTURES_PROJECT, project, { recursive: true });
    const model = loadProject(project).model;
    const dataNames = new Map<string, string>();
    for (const child of model.screens[0]?.view.children ?? []) {
      const data = 'tag' in child ? model.manifests.get(child.tag)?.api.data?.[0]?.name : undefined;
      if (data !== undefined && 'attributes' in child) dataNames.set(child.attributes.name, data);
    }
    const names = readdirSync(SAMPLES).map((file) => file.replace(/\.json$/, '')).sort();
    expect(names).toEqual(['empty', 'longest-plausible', 'typical', 'worst-case']);
    const sets = new Map(names.map((name) => [name, applied(name, dataNames)]));
    const firmwareSets: TestRunSampleSet[] = names.map((name) => {
      const set = sets.get(name)!;
      return { name, values: set.values as TestRunSampleSet['values'], rows: { [SCREEN]: set.byElement as TestRunSampleSet['rows'][string] } };
    });

    // --- Step 2: Both targets ---
    const cache = makeTempDir('set-parity-cache');
    const common = { projectRoot: project, cacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT, toolchain: toolchain!, host };
    const harnessBuild = await buildTestRunHarness({ ...common, sets: firmwareSets });
    const editorBuild = await buildEditorWasm({ ...common, optimisation: 'O1' });
    expect(harnessBuild.status, JSON.stringify(harnessBuild.diagnostics)).not.toBe('failed');
    expect(editorBuild.status, JSON.stringify(editorBuild.diagnostics)).not.toBe('failed');
    if (harnessBuild.status === 'failed' || editorBuild.status === 'failed') return;
    const harness = await loadHarness(harnessBuild.harnessDir);
    expect(harness.sets).toEqual(names);
    const scene = readFileSync(editorBuild.sceneFile, 'utf8');
    const { createEditor } = (await import(pathToFileURL(join(FRAMEWORK_ROOT, 'wasm', 'u8g2gl_editor.mjs')).href)) as { createEditor(dir: string): Promise<EditorApi> };
    const initial = JSON.parse(harnessFrameValues(model)) as Record<string, unknown>;

    // --- Step 3: Each set, both halves, every time ---
    const mismatches: string[] = [];
    const firstFrames = new Map<string, Uint8Array>();
    for (const name of [undefined, ...names]) {
      const firmware = await harness.run(SCREEN, TEST_RUN_TIMES, name);
      const editor = await createEditor(editorBuild.wasmDir);
      await injectProjectAssets(editor._module, project);
      const set = name === undefined ? undefined : sets.get(name);
      expect(editor.applyScene(scene), editor.getLastError()).toBe(true);
      expect(editor._module.ccall('selectScreen', 'number', ['string'], [SCREEN]), editor.getLastError()).toBe(1);
      expect(editor.applySampleData(JSON.stringify({ ...initial, ...(set?.values ?? {}) })), editor.getLastError()).toBe(true);
      if (set !== undefined) {
        expect(editor._module.ccall('applyCollectionData', 'number', ['string'], [JSON.stringify(set.byElement)]), editor.getLastError()).toBe(1);
      }
      TEST_RUN_TIMES.forEach((time, i) => {
        const live = editor.renderFrame(time);
        const fw = firmware.frames[i];
        if (live === null || fw === undefined) {
          mismatches.push(`${name ?? 'initial'} @ ${time} ms: no frame (${editor.getLastError()})`);
          return;
        }
        if (i === 0) firstFrames.set(name ?? 'initial', fw);
        const differ = differingPixels(live, fw);
        if (differ !== 0) mismatches.push(`${name ?? 'initial'} @ ${time} ms: ${differ} px differ`);
      });
    }
    console.log(`departures: ${names.length + 1} cases × ${TEST_RUN_TIMES.length} frames, ${mismatches.length} differ`);
    expect(mismatches, 'a parity mismatch is a framework bug: diagnose and report it, do not adjust this test').toEqual([]);

    // --- Step 4: Each set draws what it holds: blank frames do not agree their way to a pass ---
    const at = (name: string, rect: typeof SERVICES): number => lit(firstFrames.get(name)!, rect);
    // With the initial values alone, and with *empty*, the collections draw nothing.
    for (const name of ['initial', 'empty']) {
      expect(at(name, SERVICES), `${name}: services`).toBe(0);
      expect(at(name, ROW0), `${name}: row0`).toBe(0);
    }
    // typical: one carriage and one service, each with text; worst-case: full.
    expect(at('typical', SERVICES)).toBeGreaterThan(20);
    expect(at('typical', FORMATION)).toBeGreaterThan(at('empty', FORMATION));
    expect(at('worst-case', SERVICES)).toBeGreaterThan(at('typical', SERVICES));
    expect(at('worst-case', FORMATION)).toBeGreaterThan(at('typical', FORMATION));
    // longest-plausible starts as a copy of typical, so it draws the same.
    expect(Buffer.from(firstFrames.get('longest-plausible')!).equals(Buffer.from(firstFrames.get('typical')!))).toBe(true);
    // Particular pixels: the worst case's services row is lit from its first column.
    expect(lit(firstFrames.get('worst-case')!, { x: 0, y: 51, width: 8, height: 13 })).toBeGreaterThan(0);
  }, 600_000);
});

// harnessFrameValues
// The subjects' initial values as the designer applies them (live-pipeline.ts).
function harnessFrameValues(model: ReturnType<typeof loadProject>['model']): string {
  const values: Record<string, unknown> = {};
  for (const subject of model.globals.subjects ?? []) {
    const value = subject.default;
    if (value === undefined) continue;
    if (subject.type === 'int' || subject.type === 'time') values[subject.name] = Number(value);
    else if (subject.type === 'bool') values[subject.name] = value === 'true';
    else values[subject.name] = value;
  }
  return JSON.stringify(values);
}
