/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/test-run.test.ts
 * Purpose: Run's decisions, without a page, a Wasm or a server: the frame
 *          comparison (first differing frame, its pixels), the toolbar's text
 *          in every state, the staleness count, the reasons Run is
 *          unavailable, and the controller's state machine — waiting for a
 *          rebuild, queueing at most one run, the overlay clearing at the
 *          next edit, a failed run's diagnostics for Problems, and *Run after
 *          a pause*: off by default, kept per browser, 2 s after the last edit.
 * Description: The controller is driven through a fake target and a fake
 *              `fetch` that answers the job's records; the live frames come
 *              from a fake editor module that draws a fixed frame.
 */

import { expect, test } from '@playwright/test';
import { AFTER_PAUSE_KEY, PAUSE_MS, TestRunController, type TestRunTarget } from '../../src/test-run/test-run-controller';
import {
  compareFrames,
  differingPixels,
  formatAgo,
  runAvailability,
  TEST_RUN_TIMES,
  verdictText,
  type RunInputs,
} from '../../src/test-run/verdict';
import { Observable } from '../../src/state/observable';
import type { WasmStatus } from '../../src/wasm/editor-wasm-controller';
import type { EditorModule } from '../../src/wasm/editor-module';
import type { CompletedRun } from '../../src/pipeline/edit-loop';

/** An 8 × 8 frame with the given pixels lit. */
function frame(...pixels: Array<[number, number]>): Uint8Array {
  const bytes = new Uint8Array(8);
  for (const [x, y] of pixels) bytes[(y >> 3) * 8 + x]! |= 1 << (y & 7);
  return bytes;
}

test('frames are compared in time order; the first differing one is reported with its pixels', () => {
  const same = TEST_RUN_TIMES.map(() => frame([1, 1]));
  expect(compareFrames(TEST_RUN_TIMES, same, same.map((f) => f.slice()), 8, 8)).toEqual({ kind: 'parity' });
  const harness: Uint8Array[] = same.map((f) => f.slice());
  harness[3] = frame([1, 1], [2, 5]);
  harness[5] = frame();
  expect(compareFrames(TEST_RUN_TIMES, same, harness, 8, 8)).toEqual({ kind: 'mismatch', index: 3, time: 250, pixels: [{ x: 2, y: 5 }] });
  expect(differingPixels(frame([0, 0], [7, 7]), frame([7, 7], [3, 4]), 8, 8)).toEqual([
    { x: 0, y: 0 },
    { x: 3, y: 4 },
  ]);
  // A frame of another size is a mismatch, never a parity.
  expect(compareFrames([0], [new Uint8Array(8)], [new Uint8Array(4)], 8, 8).kind).toBe('mismatch');
});

test('the toolbar says each state as EDITOR-DESIGN §2.2 and §4.2 draw it', () => {
  expect(verdictText({ kind: 'none' }, 0)).toBe('');
  expect(verdictText({ kind: 'running' }, 0)).toBe('running…');
  expect(verdictText({ kind: 'parity', finishedAt: 1000, editsSince: 0 }, 3500)).toBe('✓ parity · 2 s ago');
  expect(verdictText({ kind: 'parity', finishedAt: 0, editsSince: 4 }, 125_000)).toBe('✓ parity · 2 min ago · 4 edits since');
  expect(verdictText({ kind: 'parity', finishedAt: 0, editsSince: 1 }, 0)).toBe('✓ parity · 0 s ago · 1 edit since');
  expect(verdictText({ kind: 'mismatch', finishedAt: 0, editsSince: 0, pixels: 14, time: 250 }, 0)).toBe('≠ 14 px differ at 250 ms');
  expect(verdictText({ kind: 'failed', finishedAt: 0, editsSince: 2 }, 0)).toBe('✕ test run failed · 2 edits since');
  expect(verdictText({ kind: 'waiting', reason: 'the editor Wasm is being rebuilt' }, 0)).toBe('waiting: the editor Wasm is being rebuilt');
  expect(formatAgo(3 * 3_600_000)).toBe('3 h ago');
  expect(formatAgo(-5)).toBe('0 s ago');
});

test('Run is unavailable for each of ruling 7\'s reasons, and waits for a rebuild rather than refusing', () => {
  const ready: RunInputs = { cannotBuild: undefined, wasm: 'current', placeholders: 0, wellFormed: true, live: true };
  expect(runAvailability(ready)).toEqual({ state: 'ready' });
  const reason = (inputs: Partial<RunInputs>): string => {
    const result = runAvailability({ ...ready, ...inputs });
    return result.state === 'ready' ? 'ready' : `${result.state}: ${result.reason}`;
  };
  expect(reason({ wasm: 'none', cannotBuild: 'no-emscripten' })).toMatch(/^unavailable: no toolchain/);
  expect(reason({ wasm: 'none', cannotBuild: 'no-source-tree' })).toMatch(/^unavailable: no U8G2GL source tree/);
  expect(reason({ wasm: 'stale' })).toBe('wait: the editor Wasm is being rebuilt');
  expect(reason({ wasm: 'building' })).toBe('wait: the editor Wasm is being rebuilt');
  expect(reason({ wasm: 'failed' })).toMatch(/^unavailable: the editor Wasm is not current/);
  expect(reason({ placeholders: 2 })).toBe('unavailable: the canvas shows placeholders: the frames are not comparable');
  expect(reason({ wellFormed: false })).toBe('unavailable: the document is not well-formed');
  expect(reason({ live: false })).toMatch(/^unavailable: the canvas shows the last good frame/);
  // The machine first: no toolchain outranks a malformed document.
  expect(reason({ wasm: 'none', cannotBuild: 'no-emscripten', wellFormed: false })).toMatch(/no toolchain/);
});

/** A fake target, a fake server, and a controller over them. */
function harness(options: { harnessFrame?: Uint8Array; fail?: string } = {}) {
  const status = new Observable<WasmStatus>({ kind: 'current', hash: 'h' });
  const canvas = new Observable<{ placeholders: readonly unknown[]; stale: boolean }>({ placeholders: [], stale: false });
  const wellFormed = new Observable<boolean>(true);
  const live = frame([1, 1]);
  const module: EditorModule = {
    applyScene: () => true,
    selectScreen: () => true,
    applySampleData: () => true,
    renderFrame: () => live,
    displaySize: () => ({ width: 8, height: 8 }),
    lastError: () => '',
    placeholders: () => [],
    buildHash: () => 'h',
  };
  const editListeners = new Set<() => void>();
  const posted: unknown[] = [];
  const restored: number[] = [];
  const logs: string[] = [];
  let release: (() => void) | undefined;
  const target: TestRunTarget = {
    session: { origin: 'http://127.0.0.1:1', token: 't'.repeat(64) },
    wasmStatus: status,
    module: new Observable<EditorModule | undefined>(module),
    lastRun: new Observable<CompletedRun | undefined>({
      result: { scene: '{}', screen: 'home', subjectValues: '{}' },
      assets: undefined,
    } as unknown as CompletedRun),
    wellFormed,
    canvas,
    settled: () => Promise.resolve(),
    restoreCanvas: () => restored.push(1),
    dirtyDocuments: () => [{ path: 'screens/screen_home.xml', content: '<screen/>', version: '3' }],
    onEdit: (listener) => {
      editListeners.add(listener);
      return () => editListeners.delete(listener);
    },
    log: (line) => logs.push(line),
  };
  const bytes = Buffer.from(options.harnessFrame ?? live).toString('base64');
  let nextId = 0;
  // The job's records: queued at submission, finished when released.
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      nextId++;
      return new Response(JSON.stringify({ id: String(nextId), status: 'queued' }));
    }
    await new Promise<void>((resolve) => (release = resolve));
    const id = url.slice(url.lastIndexOf('/') + 1);
    return new Response(
      JSON.stringify(
        options.fail !== undefined
          ? { id, status: 'failed', error: options.fail }
          : {
              id,
              status: 'succeeded',
              result: { display: { width: 8, height: 8 }, frames: TEST_RUN_TIMES.map((time) => ({ time, sha256: '', bytes })) },
            },
      ),
    );
  }) as typeof fetch;
  const controller = new TestRunController(target);
  controller.start();
  const until = async (done: () => boolean): Promise<void> => {
    for (let i = 0; i < 200 && !done(); i++) {
      release?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return { controller, status, canvas, wellFormed, posted, restored, logs, until, edit: () => editListeners.forEach((l) => l()) };
}

test('a run posts the dirty text, restores the canvas, and shows parity; each edit after makes it one edit staler', async () => {
  const h = harness();
  h.controller.run();
  expect(h.controller.view.get().kind).toBe('running');
  await h.until(() => h.controller.view.get().kind === 'parity');
  expect(h.controller.view.get()).toMatchObject({ kind: 'parity', editsSince: 0 });
  expect(h.posted).toEqual([
    { screen: 'home', documents: [{ path: 'screens/screen_home.xml', content: '<screen/>', version: '3' }], times: TEST_RUN_TIMES },
  ]);
  expect(h.restored).toEqual([1]);
  h.edit();
  h.edit();
  expect(h.controller.view.get()).toMatchObject({ kind: 'parity', editsSince: 2 });
});

test('a mismatch shows the overlay, which the next edit clears; the verdict stays, marked stale', async () => {
  const h = harness({ harnessFrame: frame([1, 1], [6, 6]) });
  h.controller.run();
  await h.until(() => h.controller.view.get().kind === 'mismatch');
  expect(h.controller.view.get()).toMatchObject({ kind: 'mismatch', pixels: 1, time: 0, editsSince: 0 });
  expect(h.controller.mismatch.get()?.pixels).toEqual([{ x: 6, y: 6 }]);
  expect(h.controller.mismatch.get()?.liveSha256).toMatch(/^[0-9a-f]{64}$/);
  h.edit();
  expect(h.controller.mismatch.get()).toBeUndefined();
  expect(h.controller.view.get()).toMatchObject({ kind: 'mismatch', editsSince: 1 });
});

test('a failed run reports its located diagnostics for Problems', async () => {
  const h = harness({ fail: 'error: widgets/w/w.cpp:12:5\n  expected expression' });
  h.controller.run();
  await h.until(() => h.controller.view.get().kind === 'failed');
  expect(h.controller.diagnostics.get()).toEqual([
    { code: 'U8G2GL_TEST_RUN_BUILD', severity: 'error', file: 'widgets/w/w.cpp', line: 12, column: 5, message: 'expected expression' },
  ]);
});

test('Run during a rebuild waits for it, then runs; Run while unavailable does nothing', async () => {
  const h = harness();
  h.status.set({ kind: 'stale', hash: 'h' });
  h.controller.run();
  expect(h.controller.view.get()).toEqual({ kind: 'waiting', reason: 'the editor Wasm is being rebuilt' });
  expect(h.posted).toEqual([]);
  h.status.set({ kind: 'current', hash: 'h2' });
  await h.until(() => h.controller.view.get().kind === 'parity');
  expect(h.posted).toHaveLength(1);

  h.wellFormed.set(false);
  expect(h.controller.availability.get()).toEqual({ state: 'unavailable', reason: 'the document is not well-formed' });
  h.controller.run();
  expect(h.posted).toHaveLength(1);
});

test('Runs pressed while one is in flight queue at most one, which runs after it', async () => {
  const h = harness();
  h.controller.run();
  h.controller.run();
  h.controller.run();
  h.controller.run();
  expect(h.controller.busy).toBe(true);
  await h.until(() => h.posted.length === 2 && !h.controller.busy);
  expect(h.posted).toHaveLength(2);
  expect(h.controller.view.get().kind).toBe('parity');
});

test('Run after a pause is off by default; on, it runs once, PAUSE_MS after the last of several edits, and is remembered', async () => {
  const stored = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) },
  });
  try {
    const off = harness();
    expect(off.controller.afterPause.get()).toBe(false);
    off.edit();
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS + 200));
    expect(off.posted).toHaveLength(0);

    off.controller.setAfterPause(true);
    expect(stored.get(AFTER_PAUSE_KEY)).toBe('on');
    const on = harness();
    expect(on.controller.afterPause.get()).toBe(true);
    on.edit();
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS / 2));
    on.edit();
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS / 2 + 100));
    expect(on.posted).toHaveLength(0);
    await on.until(() => on.posted.length === 1 && on.controller.view.get().kind === 'parity');
    expect(on.posted).toHaveLength(1);
    expect(on.controller.view.get()).toMatchObject({ kind: 'parity', editsSince: 0 });
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
