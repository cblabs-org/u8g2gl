/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/test-run-job.test.ts
 * Purpose: The test run's server half, where no compiler is needed: the job's
 *          params, the staged copy of the project (the text the canvas
 *          showed, never written to the project), the bug report's images
 *          and directory, the report route, and the job's failure codes
 *          without a toolchain or a source tree, which match editor-wasm's.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BuildQueue, type BuildJobRecord } from '../../../../src/node/design/build-queue.js';
import { startDesignServer, type DesignServer } from '../../../../src/node/design/design-server.js';
import {
  differingPixels,
  framePbm,
  TEST_RUN_REPORT_ROUTE,
  testRunReportRoute,
  writeBugReport,
} from '../../../../src/node/design/test-run/bug-report.js';
import { registerTestRun } from '../../../../src/node/design/test-run/register-test-run.js';
import { checkStagedDocuments, stageProject } from '../../../../src/node/design/test-run/stage-project.js';
import {
  parseTestRunParams,
  registerTestRunJob,
  TEST_RUN_JOB,
  TEST_RUN_TIMES,
  type TestRunResult,
} from '../../../../src/node/design/test-run/test-run-job.js';
import { fakeHost } from '../../toolchain/fake-host.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { MINIMAL_PROJECT, makeTempDir, removeTempDirs, writeFiles } from '../temp-project.js';

afterAll(removeTempDirs);

describe('the test-run params', () => {
  it('takes the screen and the dirty documents, and the fixed times by default', () => {
    expect(parseTestRunParams({ screen: 'home', documents: [] })).toEqual({ screen: 'home', documents: [], times: TEST_RUN_TIMES });
    expect(TEST_RUN_TIMES).toEqual([0, 16, 100, 250, 500, 1000, 2000, 5000]);
    const document = { path: 'screens/screen_home.xml', content: '<screen/>', version: '7' };
    expect(parseTestRunParams({ screen: 'home', documents: [document], times: [0, 0, 5] })).toEqual({
      screen: 'home',
      documents: [document],
      times: [0, 0, 5],
    });
  });

  it('refuses what is not a run of the text the canvas showed', () => {
    for (const params of [
      undefined,
      {},
      { screen: '', documents: [] },
      { screen: 'home' },
      { screen: 'home', documents: [{ path: 'screens/a.xml', content: 1, version: '1' }] },
      { screen: 'home', documents: [], times: [] },
      { screen: 'home', documents: [], times: [16, 0] },
      { screen: 'home', documents: [], times: [0.5] },
      { screen: 'home', documents: [], times: [-1] },
    ]) {
      expect(typeof parseTestRunParams(params), JSON.stringify(params)).toBe('string');
    }
  });

  it('stages only project XML documents, each once, by a path the project rule accepts', () => {
    const doc = (path: string): { path: string; content: string; version: string } => ({ path, content: '', version: '1' });
    expect(checkStagedDocuments([doc('screens/screen_home.xml'), doc('globals.xml')])).toBeUndefined();
    expect(checkStagedDocuments([doc('../outside.xml')])).toMatch(/not a project source path/);
    expect(checkStagedDocuments([doc('/abs.xml')])).toMatch(/not a project source path/);
    expect(checkStagedDocuments([doc('generated/ui.xml')])).toMatch(/not a project source path/);
    expect(checkStagedDocuments([doc('widgets/w/w.cpp')])).toMatch(/not an XML document/);
    expect(checkStagedDocuments([doc('globals.xml'), doc('globals.xml')])).toMatch(/twice/);
  });
});

describe('the staged copy', () => {
  it('holds the disk\'s files with the buffers in place, and never writes the project', () => {
    const project = makeTempDir('stage-project');
    writeFiles(project, { ...MINIMAL_PROJECT, 'generated/ui.cpp': '// generated', 'widgets/w/w.cpp': 'int w;' });
    const before = readFileSync(join(project, 'u8g2gl.xml'), 'utf8');
    const cache = makeTempDir('stage-cache');
    const edited = before.replace('<u8g2gl', '<u8g2gl data-edited="1"');
    const staged = stageProject(project, cache, [{ path: 'u8g2gl.xml', content: edited, version: '2' }]);

    expect(readFileSync(join(staged.root, 'u8g2gl.xml'), 'utf8')).toBe(edited);
    expect(readFileSync(join(project, 'u8g2gl.xml'), 'utf8')).toBe(before);
    expect(readFileSync(join(staged.root, 'widgets', 'w', 'w.cpp'), 'utf8')).toBe('int w;');
    // generated/ is the generator's output, not source: the build makes its own.
    expect(existsSync(join(staged.root, 'generated'))).toBe(false);
    expect(staged.root.startsWith(cache)).toBe(true);
  });

  it('is synchronised, not rebuilt: an unchanged run writes nothing, a deleted file goes', () => {
    const project = makeTempDir('stage-sync');
    writeFiles(project, { ...MINIMAL_PROJECT, 'screens/extra.xml': '<screen name="extra"/>' });
    const cache = makeTempDir('stage-sync-cache');
    const first = stageProject(project, cache, []);
    expect(first.changed).toContain('screens/extra.xml');
    expect(stageProject(project, cache, []).changed).toEqual([]);

    writeFileSync(join(project, 'screens', 'extra.xml'), '<screen name="extra2"/>');
    expect(stageProject(project, cache, []).changed).toEqual(['screens/extra.xml']);
    const buffer = stageProject(project, cache, [{ path: 'screens/extra.xml', content: '<screen name="buffer"/>', version: '9' }]);
    expect(buffer.changed).toEqual(['screens/extra.xml']);
    // Back to disk when the buffer is saved or reverted.
    expect(stageProject(project, cache, []).changed).toEqual(['screens/extra.xml']);
  });
});

describe('the bug report', () => {
  it('writes a frame as binary PBM, most significant bit first, 1 for a lit pixel', () => {
    // 8 × 8: column 0 lit at y = 0 (bit 0) and column 7 lit at y = 7 (bit 7).
    const frame = new Uint8Array(8);
    frame[0] = 0x01;
    frame[7] = 0x80;
    const pbm = framePbm(frame, 8, 8);
    const header = 'P4\n8 8\n';
    expect(new TextDecoder().decode(pbm.slice(0, header.length))).toBe(header);
    expect([...pbm.slice(header.length)]).toEqual([0x80, 0, 0, 0, 0, 0, 0, 0x01]);
  });

  it('counts differing pixels', () => {
    expect(differingPixels(new Uint8Array([0b1010, 0]), new Uint8Array([0b0110, 0xff]))).toBe(10);
    expect(differingPixels(new Uint8Array(4), new Uint8Array(4))).toBe(0);
  });

  it('writes both frames, the scene, the staged text and the versions to test-runs/<stamp>/', () => {
    const cache = makeTempDir('report-cache');
    const harness = new Uint8Array(16);
    const live = new Uint8Array(16);
    live[3] = 0x04;
    const result = syntheticResult(harness);
    const written = writeBugReport({
      cacheRoot: cache,
      runId: '12',
      result,
      time: 16,
      live,
      scene: '{"format":"u8g2gl-scene"}',
      documents: [{ path: 'screens/screen_home.xml', content: '<screen name="home"/>', version: '4' }],
      now: new Date('2026-11-01T13:14:15.678Z'),
    });
    if (typeof written === 'string') throw new Error(written);
    expect(written.dir).toBe(join(cache, 'test-runs', '20261101-131415-run12'));
    expect([...written.files].sort()).toEqual(
      ['harness-16ms.pbm', 'live-16ms.pbm', 'report.json', 'scene.json', 'staged/screens/screen_home.xml'].sort(),
    );
    const report = JSON.parse(readFileSync(join(written.dir, 'report.json'), 'utf8'));
    expect(report).toMatchObject({ screen: 'home', time: 16, differingPixels: 1, harnessHash: 'h'.repeat(64) });
    expect(report.sha256.harness).toBe(result.frames[1]!.sha256);
    expect(report.versions.documents).toEqual([{ path: 'screens/screen_home.xml', version: '4' }]);
    expect(readFileSync(join(written.dir, 'staged', 'screens', 'screen_home.xml'), 'utf8')).toBe('<screen name="home"/>');
  });

  it('refuses a time the run has no frame for, and a live frame of another size', () => {
    const base = {
      cacheRoot: makeTempDir('report-refused'),
      runId: '1',
      result: syntheticResult(new Uint8Array(16)),
      scene: '{}',
      documents: [],
      now: new Date(),
    };
    expect(writeBugReport({ ...base, time: 7, live: new Uint8Array(16) })).toMatch(/no frame at 7 ms/);
    expect(writeBugReport({ ...base, time: 0, live: new Uint8Array(8) })).toMatch(/8 bytes/);
  });

  it('the route answers 404 for anything but a succeeded test run, and 400 for a malformed body', async () => {
    const records: Record<string, BuildJobRecord> = {
      '1': { id: '1', job: 'editor-wasm', status: 'succeeded', result: {} },
      '2': { id: '2', job: TEST_RUN_JOB, status: 'failed', error: 'x' },
    };
    const route = testRunReportRoute(() => makeTempDir('report-route'), (id) => records[id]);
    const body = { time: 0, live: '', scene: '{}', documents: [] };
    expect((await route({ ...body, run: '1' })).status).toBe(404);
    expect((await route({ ...body, run: '2' })).status).toBe(404);
    expect((await route({ ...body, run: '3' })).status).toBe(404);
    expect((await route({ run: '1' })).status).toBe(400);
    expect((await route({ ...body, run: '1', documents: [{ path: '../x.xml', content: '', version: '1' }] })).status).toBe(400);
  });
});

describe('the test-run job and route on a design server', () => {
  let server: DesignServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves the report route with the token, like every route', async () => {
    const project = makeTempDir('report-server');
    writeFiles(project, MINIMAL_PROJECT);
    server = await startDesignServer({ projectRoot: project });
    registerTestRun(server, { buildCacheRoot: makeTempDir('report-server-cache'), frameworkRoot: FRAMEWORK_ROOT });
    const url = `http://127.0.0.1:${server.port}${TEST_RUN_REPORT_ROUTE}`;
    const body = JSON.stringify({ run: '99', time: 0, live: '', scene: '{}', documents: [] });
    expect((await fetch(url, { method: 'POST', body })).status).toBe(403);
    const answer = await fetch(url, { method: 'POST', body, headers: { Authorization: `Bearer ${server.token}` } });
    expect(answer.status).toBe(404);
    expect(await answer.json()).toMatchObject({ code: 'unknown-run' });
    expect(() => server!.registerJsonRoute(TEST_RUN_REPORT_ROUTE, async () => ({ status: 200, body: {} }))).toThrow();
    expect(() => server!.registerJsonRoute('/api/build/x', async () => ({ status: 200, body: {} }))).toThrow();
  });

  it('without a toolchain fails with editor-wasm\'s code, and runs no compiler', async () => {
    const { host, runs } = fakeHost({ path: '' });
    const queue = new BuildQueue(DEPARTURES_PROJECT);
    registerTestRunJob(queue, { host, toolchainCacheRoot: makeTempDir('test-run-no-toolchain'), frameworkRoot: FRAMEWORK_ROOT });
    const record = queue.submit(TEST_RUN_JOB, { screen: 'departures', documents: [] });
    await queue.idle();
    expect(queue.get(record!.id)).toMatchObject({ status: 'failed', code: 'no-emscripten', error: expect.stringMatching(/u8g2gl toolchain install/) });
    expect(runs).toEqual([]);
  });

  it('without the runtime sources fails with editor-wasm\'s code, and runs no compiler', async () => {
    const { host, runs } = fakeHost({ path: '' });
    const queue = new BuildQueue(DEPARTURES_PROJECT);
    registerTestRunJob(queue, { host, toolchainCacheRoot: makeTempDir('test-run-no-source'), frameworkRoot: null });
    const record = queue.submit(TEST_RUN_JOB, { screen: 'departures', documents: [] });
    await queue.idle();
    expect(queue.get(record!.id)).toMatchObject({ status: 'failed', code: 'no-source-tree' });
    expect(runs).toEqual([]);
  });

  it('refuses malformed params before looking for a toolchain', async () => {
    const { host, runs } = fakeHost({ path: '' });
    const queue = new BuildQueue(DEPARTURES_PROJECT);
    registerTestRunJob(queue, { host, toolchainCacheRoot: makeTempDir('test-run-bad'), frameworkRoot: FRAMEWORK_ROOT });
    const record = queue.submit(TEST_RUN_JOB, { documents: [] });
    await queue.idle();
    const done = queue.get(record!.id);
    expect(done).toMatchObject({ status: 'failed', error: expect.stringMatching(/screen/) });
    expect(done?.code).toBeUndefined();
    expect(runs).toEqual([]);
  });
});

// syntheticResult
// A succeeded run's result with every frame equal to `frame`, 8 × 16 pixels.
function syntheticResult(frame: Uint8Array): TestRunResult {
  return {
    screen: 'home',
    display: { width: 8, height: 16 },
    frames: TEST_RUN_TIMES.map((time) => ({
      time,
      sha256: createHash('sha256').update(frame).digest('hex'),
      bytes: Buffer.from(frame).toString('base64'),
    })),
    build: 'current',
    harnessHash: 'h'.repeat(64),
    versions: { documents: [{ path: 'screens/screen_home.xml', version: '4' }], generator: '0.15.0', runtime: '0.10.0', emscripten: '5.0.3' },
    timings: { stageMs: 0, prepareMs: 0, compileMs: 0, linkMs: 0, runMs: 0, totalMs: 0 },
    diagnostics: [],
  };
}
