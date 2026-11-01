/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/test-run-build.test.ts
 * Purpose: The test-run harness, really built and run: the departures project
 *          (a fixture with custom widgets) generated for its firmware target,
 *          compiled with its widgets' C++ and the runtime at -O3, and its
 *          real frame loop run on the memory display; its object sharing with
 *          the editor Wasm build; a compile error located in the widget; the
 *          harness's refusal to boot twice; and the `test-run` job on the
 *          design server, testing an unsaved buffer and writing a bug report.
 * Description: Needs Emscripten 5.0.3 (on PATH, or the managed install). Without
 *              one every case here is skipped with a message, so the suite
 *              still passes on a machine that has none. All cases share one
 *              build cache, so the framework half compiles once.
 */

import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEditorWasm } from '../../../../src/node/design/build/editor-wasm-build.js';
import { BuildQueue } from '../../../../src/node/design/build-queue.js';
import { testRunReportRoute } from '../../../../src/node/design/test-run/bug-report.js';
import { loadHarness } from '../../../../src/node/design/test-run/harness-runner.js';
import { registerTestRunJob, TEST_RUN_JOB, type TestRunResult } from '../../../../src/node/design/test-run/test-run-job.js';
import { buildTestRunHarness, HARNESS_FILES, type TestRunBuild } from '../../../../src/node/design/test-run/test-run-build.js';
import { detectToolchain, type SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { nodeToolchainHost } from '../../../../src/node/toolchain/toolchain-host.js';
import { toolchainCacheRoot } from '../../../../src/node/toolchain/toolchain-paths.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';

const host = nodeToolchainHost();
// Detection only reads the real cache directory; nothing here writes it.
const toolchain: SelectedToolchain | undefined = (await detectToolchain(host, toolchainCacheRoot(host.platform, host.env, host.home)))
  .selected;
if (toolchain === undefined) {
  console.warn('test-run-build.test.ts: skipped, no Emscripten 5.0.3 (run `u8g2gl toolchain install` or put em++ on PATH)');
}

/** The test run's fixed frame times, in ms. */
const TIMES = [0, 16, 100, 250, 500, 1000, 2000, 5000];

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

describe.skipIf(toolchain === undefined)('the test-run harness build (needs Emscripten)', () => {
  let cache: string;
  let project: string;
  const build = (root = project): Promise<TestRunBuild> =>
    buildTestRunHarness({ projectRoot: root, cacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT, toolchain: toolchain!, host });

  beforeAll(() => {
    cache = makeTempDir('harness-cache');
    project = join(makeTempDir('harness-departures'), 'project');
    cpSync(DEPARTURES_PROJECT, project, { recursive: true });
  });
  afterAll(removeTempDirs);

  it('builds the departures firmware target unmodified and runs its frame loop at every time', async () => {
    const result = await build();
    expect(result.status, JSON.stringify(result.diagnostics)).toBe('built');
    if (result.status === 'failed') return;
    expect(result.compiled).toEqual(
      expect.arrayContaining(['ui.cpp', 'ui_screen_departures.cpp', 'ui_subjects.cpp', 'wd_service_list.cpp', 'harness.cpp', 'u8g2gl_harness_screens.cpp']),
    );
    expect(result.compiled).not.toContain('bridge.cpp');
    expect(result.compiled).not.toContain('scene_json.cpp');
    expect(result.layout).toEqual({ display: { width: 256, height: 64 }, screens: ['departures'] });

    const harness = await loadHarness(result.harnessDir);
    expect(harness.screens).toEqual(['departures']);
    expect(harness.display).toEqual({ width: 256, height: 64 });
    const run = await harness.run('departures', TIMES);
    expect(run.frames).toHaveLength(TIMES.length);
    for (const frame of run.frames) {
      expect(frame.length).toBe((256 / 8) * 64);
    }
    // The declared subject values reach the first frame: ui_init() sets them
    // before anything binds (§13.7), so the boot frame is not blank.
    expect(litPixels(run.frames[0]!)).toBeGreaterThan(0);
    const { compileMs, linkMs, totalMs } = result.timings;
    console.log(`harness built cold in ${totalMs} ms (compile ${compileMs}, link -O3 ${linkMs}); ${litPixels(run.frames[0]!)} lit pixels at t = 0`);
  }, 300_000);

  it('is current, compiling and linking nothing, when no input changed', async () => {
    const result = await build();
    expect(result.status).toBe('current');
    if (result.status === 'failed') return;
    expect(result.compiled).toEqual([]);
  }, 120_000);

  it('a screen edit recompiles only what that text reaches, and links again', async () => {
    const file = join(project, 'screens', 'screen_departures.xml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('text="Plat"', 'text="Pl"'));
    const result = await build();
    expect(result.status).toBe('built');
    if (result.status === 'failed') return;
    expect(result.compiled).toContain('ui_screen_departures.cpp');
    expect(result.compiled).not.toContain('u8g2_font.c');
    expect(result.compiled).not.toContain('u8g2gl_core.cpp');
    const { compileMs, linkMs, totalMs } = result.timings;
    console.log(`screen edit rebuilt the harness in ${totalMs} ms (compile ${compileMs}, link ${linkMs})`);
  }, 120_000);

  it('shares the editor build\'s U8G2 and runtime objects: building the editor Wasm next compiles neither', async () => {
    const editor = await buildEditorWasm({
      projectRoot: project,
      cacheRoot: cache,
      frameworkRoot: FRAMEWORK_ROOT,
      toolchain: toolchain!,
      host,
      optimisation: 'O1',
    });
    expect(editor.status).toBe('built');
    if (editor.status === 'failed') return;
    expect(editor.compiled).not.toContain('u8g2_font.c');
    expect(editor.compiled).not.toContain('u8g2gl_core.cpp');
    expect(editor.compiled).not.toContain('memory_display.cpp');
    expect(editor.compiled).toEqual(expect.arrayContaining(['bridge.cpp', 'scene_json.cpp', 'ui_editor_registry.cpp']));
  }, 300_000);

  it('boots once per instance: a second run on the same instance is refused, as firmware has no reboot', async () => {
    const result = await build();
    if (result.status === 'failed') throw new Error('departures harness did not build');
    const require = createRequire(join(result.harnessDir, HARNESS_FILES.loader));
    const factory = require(join(result.harnessDir, HARNESS_FILES.loader)) as () => Promise<{
      _malloc(n: number): number;
      _runScreen(index: number, times: number, count: number): number;
      _getLastError(): number;
      UTF8ToString(ptr: number): string;
      HEAPU32: Uint32Array;
    }>;
    const module = await factory();
    const times = module._malloc(4);
    module.HEAPU32[times >>> 2] = 0;
    expect(module._runScreen(0, times, 1)).toBe(1);
    expect(module._runScreen(0, times, 1)).toBe(0);
    expect(module.UTF8ToString(module._getLastError())).toMatch(/already booted/);
  }, 120_000);

  it('refuses frame times that go backwards, before booting', async () => {
    const result = await build();
    if (result.status === 'failed') throw new Error('departures harness did not build');
    const harness = await loadHarness(result.harnessDir);
    await expect(harness.run('departures', [100, 16])).rejects.toThrow(/must not decrease/);
    await expect(harness.run('nowhere', [0])).rejects.toThrow(/no screen 'nowhere'/);
  }, 120_000);

  it('locates a compile error in the widget source, as the editor build does', async () => {
    const broken = join(makeTempDir('harness-broken'), 'project');
    cpSync(DEPARTURES_PROJECT, broken, { recursive: true });
    const file = join(broken, 'widgets', 'wd_probe_box', 'wd_probe_box.cpp');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nint broken( {\n`);
    const result = await build(broken);
    expect(result.status).toBe('failed');
    const lines = readFileSync(file, 'utf8').split('\n').length;
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'U8G2GL_EDITOR_COMPILE', severity: 'error', file: 'widgets/wd_probe_box/wd_probe_box.cpp' }),
    );
    const error = result.diagnostics.find((d) => d.severity === 'error');
    expect(error?.line).toBeGreaterThan(1);
    expect(error?.line).toBeLessThanOrEqual(lines);
    expect(error?.column).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(toolchain === undefined)('the test-run job (needs Emscripten)', () => {
  let cache: string;
  let project: string;
  let queue: BuildQueue;
  const run = async (params: unknown): Promise<{ id: string; result: TestRunResult }> => {
    const record = queue.submit(TEST_RUN_JOB, params);
    await queue.idle();
    const done = queue.get(record!.id);
    expect(done?.status, done?.error).toBe('succeeded');
    return { id: record!.id, result: done!.result as TestRunResult };
  };

  beforeAll(() => {
    cache = makeTempDir('job-cache');
    project = join(makeTempDir('job-departures'), 'project');
    cpSync(DEPARTURES_PROJECT, project, { recursive: true });
    queue = new BuildQueue(project);
    registerTestRunJob(queue, { buildCacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT });
  });
  afterAll(removeTempDirs);

  it('runs the saved project: one hashed frame per time, and the versions tested', async () => {
    const { result } = await run({ screen: 'departures', documents: [] });
    expect(result.frames.map((frame) => frame.time)).toEqual(TIMES);
    for (const frame of result.frames) {
      const bytes = Buffer.from(frame.bytes, 'base64');
      expect(bytes.length).toBe((256 / 8) * 64);
      expect(frame.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(result.versions).toMatchObject({ documents: [], emscripten: toolchain!.version });
    expect(result.versions.generator).toMatch(/^\d+\.\d+\.\d+/);
  }, 300_000);

  it('tests the unsaved buffer, not the file, and leaves the file as it was', async () => {
    const path = 'screens/screen_departures.xml';
    const disk = readFileSync(join(project, path), 'utf8');
    const saved = await run({ screen: 'departures', documents: [] });
    const buffer = disk.replace('x="190" y="51"', 'x="150" y="51"');
    expect(buffer).not.toBe(disk);
    const unsaved = await run({ screen: 'departures', documents: [{ path, content: buffer, version: '42' }] });
    expect(unsaved.result.frames[0]!.sha256).not.toBe(saved.result.frames[0]!.sha256);
    expect(unsaved.result.versions.documents).toEqual([{ path, version: '42' }]);
    expect(readFileSync(join(project, path), 'utf8')).toBe(disk);
    // And back: the saved text again gives the saved frames.
    const again = await run({ screen: 'departures', documents: [] });
    expect(again.result.frames.map((f) => f.sha256)).toEqual(saved.result.frames.map((f) => f.sha256));
  }, 300_000);

  it('reports a compile error in Problems form, file:line:column, as editor-wasm does', async () => {
    const broken = join(makeTempDir('job-broken'), 'project');
    cpSync(DEPARTURES_PROJECT, broken, { recursive: true });
    const file = join(broken, 'widgets', 'wd_probe_box', 'wd_probe_box.cpp');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nint broken( {\n`);
    const brokenQueue = new BuildQueue(broken);
    registerTestRunJob(brokenQueue, { buildCacheRoot: cache, frameworkRoot: FRAMEWORK_ROOT });
    const record = brokenQueue.submit(TEST_RUN_JOB, { screen: 'departures', documents: [] });
    await brokenQueue.idle();
    const done = brokenQueue.get(record!.id);
    expect(done?.status).toBe('failed');
    expect(done?.error).toMatch(/^error: widgets\/wd_probe_box\/wd_probe_box\.cpp:\d+:\d+$/m);
  }, 300_000);

  it('a bug report holds the run\'s own harness frame and the live frame it was sent', async () => {
    const { id, result } = await run({ screen: 'departures', documents: [] });
    const live = Buffer.from(result.frames[2]!.bytes, 'base64');
    live[0] = (live[0] ?? 0) ^ 0x01;
    const route = testRunReportRoute(() => cache, (recordId) => queue.get(recordId));
    const answer = await route({ run: id, time: 100, live: live.toString('base64'), scene: '{}', documents: [] });
    expect(answer.status).toBe(200);
    const { path } = answer.body as { path: string };
    const report = JSON.parse(readFileSync(join(path, 'report.json'), 'utf8'));
    expect(report).toMatchObject({ screen: 'departures', time: 100, differingPixels: 1 });
    expect(report.sha256.harness).toBe(result.frames[2]!.sha256);
    expect(readFileSync(join(path, 'harness-100ms.pbm')).subarray(0, 10).toString()).toBe('P4\n256 64\n');
  }, 300_000);
});
