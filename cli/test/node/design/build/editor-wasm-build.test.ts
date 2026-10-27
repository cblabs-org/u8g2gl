/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/editor-wasm-build.test.ts
 * Purpose: The project editor Wasm, really built: G-PROBE-2's departures
 *          project, unmodified, compiled with its own widgets' C++ and
 *          rendered (d1); a widget edit's rebuild, timed (d2, reported, not
 *          gated); the build hash read back from the Wasm; a compile error
 *          located in the widget; and the job on the design server's queue.
 * Description: Needs Emscripten 5.0.3 (on PATH, or the managed install). Without
 *              one every case here is skipped with a message, so the suite
 *              still passes on a machine that has none. All cases share one
 *              build cache, so the framework half compiles once.
 */

import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BuildQueue } from '../../../../src/node/design/build-queue.js';
import { buildEditorWasm, EDITOR_WASM_JOB, type EditorWasmBuild } from '../../../../src/node/design/build/editor-wasm-build.js';
import { registerEditorWasmJob } from '../../../../src/node/design/build/editor-wasm-job.js';
import { detectToolchain, type SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { nodeToolchainHost } from '../../../../src/node/toolchain/toolchain-host.js';
import { toolchainCacheRoot } from '../../../../src/node/toolchain/toolchain-paths.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';
import { fakeHost } from '../../toolchain/fake-host.js';
import { FRAMEWORK_ROOT, PROBE_PROJECT } from './probe-project.js';

const host = nodeToolchainHost();
// Detection only reads the real cache directory; nothing here writes it.
const toolchain: SelectedToolchain | undefined = (await detectToolchain(host, toolchainCacheRoot(host.platform, host.env, host.home)))
  .selected;
if (toolchain === undefined) {
  console.warn('editor-wasm-build.test.ts: skipped, no Emscripten 5.0.3 (run `u8g2gl toolchain install` or put em++ on PATH)');
}

/** The editor API of wasm/u8g2gl_editor.mjs, as these tests use it. */
interface EditorApi {
  applyScene(json: string): boolean;
  applySampleData(json: string): boolean;
  renderFrame(ms: number): Uint8Array | null;
  getLastError(): string;
  getBuildHash(): string | null;
  getPlaceholders(): unknown[];
}

// loadEditor
// The built Wasm through the same wrapper the snapshot test uses.
async function loadEditor(wasmDir: string): Promise<EditorApi> {
  const module = (await import(pathToFileURL(join(FRAMEWORK_ROOT, 'wasm', 'u8g2gl_editor.mjs')).href)) as {
    createEditor(dir: string): Promise<EditorApi>;
  };
  return module.createEditor(wasmDir);
}

// litPixels
// Set bits in a 1-bit frame buffer.
function litPixels(buffer: Uint8Array): number {
  let lit = 0;
  for (let byte of buffer) {
    for (; byte !== 0; byte >>= 1) {
      lit += byte & 1;
    }
  }
  return lit;
}

describe.skipIf(toolchain === undefined)('the project editor Wasm build (needs Emscripten)', () => {
  let cache: string;
  let project: string;
  const build = (optimisation: 'O1' | 'O3' = 'O1', root = project): Promise<EditorWasmBuild> =>
    buildEditorWasm({ projectRoot: root, cacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT, toolchain: toolchain!, host, optimisation });

  beforeAll(() => {
    cache = makeTempDir('e1d-wasm-cache');
    project = join(makeTempDir('e1d-wasm-probe'), 'project');
    cpSync(PROBE_PROJECT, project, { recursive: true });
  });
  afterAll(removeTempDirs);

  it('d1: builds the departures project unmodified and renders it with its real widgets', async () => {
    const result = await build();
    expect(result.status, JSON.stringify(result.diagnostics)).toBe('built');
    if (result.status === 'failed') return;
    expect(result.compiled).toEqual(expect.arrayContaining(['wd_service_list.cpp', 'wd_train_formation.cpp', 'wd_probe_box.cpp']));

    const editor = await loadEditor(result.wasmDir);
    const scene = readFileSync(result.sceneFile, 'utf8');
    // message_text max_len="256" is in the scene, and the bridge accepts it.
    expect(JSON.parse(scene).subjects).toContainEqual({ name: 'message_text', type: 'string', max_len: 256 });
    expect(editor.applyScene(scene), editor.getLastError()).toBe(true);
    expect(editor.getPlaceholders()).toEqual([]);
    expect(editor.getBuildHash()).toBe(result.buildHash);
    const bare = litPixels(editor.renderFrame(0)!);
    expect(editor.applySampleData(JSON.stringify({ platform: '9', row0_dest: 'London Paddington', message_text: 'x'.repeat(256) }))).toBe(true);
    const sampled = litPixels(editor.renderFrame(0)!);
    console.log(`d1: departures project rendered, ${bare} lit pixels bare, ${sampled} with sample subjects`);
    expect(bare).toBeGreaterThan(0);
  }, 300_000);

  it('is current, compiling and linking nothing, when no input changed', async () => {
    const result = await build();
    expect(result.status).toBe('current');
  }, 120_000);

  it('d2: a widget edit recompiles that widget and the hash unit, then links at -O1 (timed)', async () => {
    const before = await build();
    const file = join(project, 'widgets', 'wd_train_formation', 'wd_train_formation.cpp');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n// d2 edit\n`);
    const result = await build();
    expect(result.status).toBe('built');
    if (result.status === 'failed' || before.status === 'failed') return;
    expect([...result.compiled].sort()).toEqual(['ui_editor_build_hash.cpp', 'wd_train_formation.cpp']);
    expect(result.buildHash).not.toBe(before.buildHash);
    const { compileMs, linkMs, totalMs } = result.timings;
    console.log(`d2: widget edit rebuilt in ${totalMs} ms (compile ${compileMs}, link ${linkMs}) against a 2000 ms target`);
  }, 120_000);

  it('links at -O3 for a test run, into its own output', async () => {
    const result = await build('O3');
    expect(result.status).toBe('built');
    if (result.status === 'failed') return;
    expect(result.wasmDir.endsWith('wasm-O3')).toBe(true);
    expect(result.compiled).toEqual([]);
    console.log(`-O3 link: ${result.timings.linkMs} ms`);
  }, 120_000);

  it('locates a compile error in the widget source', async () => {
    const broken = join(makeTempDir('e1d-wasm-broken'), 'project');
    cpSync(PROBE_PROJECT, broken, { recursive: true });
    const file = join(broken, 'widgets', 'wd_probe_box', 'wd_probe_box.cpp');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nint broken( {\n`);
    const result = await build('O1', broken);
    expect(result.status).toBe('failed');
    const lines = readFileSync(file, 'utf8').split('\n').length;
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'U8G2GL_EDITOR_COMPILE', severity: 'error', file: 'widgets/wd_probe_box/wd_probe_box.cpp' }),
    );
    expect(result.diagnostics.find((d) => d.severity === 'error')?.line).toBeLessThanOrEqual(lines);
  }, 120_000);

  it('runs as the editor-wasm job on the design server\'s queue', async () => {
    const queue = new BuildQueue(project);
    registerEditorWasmJob(queue, { buildCacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT });
    const record = queue.submit(EDITOR_WASM_JOB, {});
    await queue.idle();
    const done = queue.get(record!.id);
    expect(done?.status, done?.error).toBe('succeeded');
    expect((done?.result as { buildHash: string }).buildHash).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);
});

describe('the editor-wasm job without a toolchain', () => {
  afterAll(removeTempDirs);

  it('fails with what to do, and runs no compiler', async () => {
    const { host: fake, runs } = fakeHost({ path: '' });
    const queue = new BuildQueue(PROBE_PROJECT);
    registerEditorWasmJob(queue, { host: fake, toolchainCacheRoot: makeTempDir('e1d-no-tc'), frameworkRoot: FRAMEWORK_ROOT });
    const record = queue.submit(EDITOR_WASM_JOB, {});
    await queue.idle();
    expect(queue.get(record!.id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/u8g2gl toolchain install/) });
    expect(runs).toEqual([]);
  });
});
