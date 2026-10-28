/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/drag-performance.spec.ts
 * Purpose: EDITOR-DESIGN §3.4's acceptance test for direct manipulation: a
 *          scripted drag of 300 frames on the departures screen and on a
 *          20-element screen, with the whole shell running and Chromium's CPU
 *          throttled 4× as a stand-in for a modest laptop. Two gates (E-2b
 *          ruling 7):
 *          1. **Input to paint:** from each pointer event to the end of the
 *             blit that shows its edit, **p95 under 16 ms**.
 *          2. **No dropped frame at 60 Hz:** each pointer event's edit is on
 *             the canvas in the **first** animation frame after it; at most 1%
 *             (3 of 300) may miss it, as the keystroke gate rules.
 *          Run to blit is reported beside them, as the keystroke gate gates it.
 *          A self-test forces pointer events to miss their frame and checks the
 *          frame gate then fails, so its passing means something.
 * Description: A real press on an element and real pointer moves, each moving
 *              it by enough device pixels that it can never snap to where the
 *              last one did, so every move is an edit. The page's drag probe
 *              (`src/perf/input-probe.ts`) times each move from its event to
 *              the blit and counts the frame intervals between. Moves are
 *              spaced by a random delay, so they land at every phase of the
 *              frame. The first 30 are warm-up.
 *
 *              The result is printed and written to
 *              `test-results/chromium/drag-performance.json`. Locally both
 *              gates apply; on CI they are reported, not gated (programme
 *              ruling 1), because CI machines vary.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { BUDGET_MS, MAX_MISSED_SHARE, percentile, round, SAMPLES, spread, type Spread, THROTTLE, twentyElementScreen, WARMUP } from './support/latency';
import { devicePoint, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

/**
 * Milliseconds between pointer events: a 250 Hz pointer, within the 125-1000 Hz
 * of real mice, so several arrive per frame as they do from a hand.
 */
const POINTER_MS = 4;
/** Device pixels the drag travels before it turns back. */
const SPAN = 30;

/** One screen's drag. */
interface DragResult {
  readonly screen: string;
  readonly samples: number;
  /** Gated: how many moves were drawn by the first frame after them, the worst, and every count. */
  readonly frames: { readonly firstFrame: number; readonly worst: number; readonly histogram: Readonly<Record<string, number>> };
  /** Every move that missed its frame, in full, so a failure can be attributed. */
  readonly misses: readonly Record<string, unknown>[];
  /** Gated: pointer event to blit end. */
  readonly inputToBlit: Spread;
  /** Reported: pipeline-run start to blit end. */
  readonly runToBlit: Spread;
  /** Medians and p95s of the gesture's handling, the wait for the frame, and each stage. */
  readonly stageMedians: Readonly<Record<string, number>>;
  readonly stageP95s: Readonly<Record<string, number>>;
}

// gateFailures
// Ruling 7's two gates for one screen, as the reasons they fail; empty when
// both pass. The drag test and its self-test judge with this one function.
//   result — one screen's drag
function gateFailures(result: DragResult): string[] {
  const failures: string[] = [];
  const missed = result.samples - result.frames.firstFrame;
  const allowed = Math.floor(result.samples * MAX_MISSED_SHARE);
  if (missed > allowed) {
    failures.push(`${missed} pointer move(s) missed their frame, more than the ${allowed} allowed (worst ${result.frames.worst})`);
  }
  if (!(result.inputToBlit.p95 < BUDGET_MS)) {
    failures.push(`input-to-blit p95 ${result.inputToBlit.p95} ms is not under ${BUDGET_MS} ms`);
  }
  return failures;
}

// drag
// Presses on device pixel `from` and drags back and forth along x as a hand
// does, with pointer events arriving every few milliseconds — far faster than
// frames, so the browser coalesces them and dispatches the latest at each
// frame — until WARMUP + `moves` moves have been drawn; returns the probe's
// samples for the last `moves`.
//   page    — the shell, with the screen on the canvas
//   cdp     — the page's DevTools session, which sends the pointer events
//   label   — the screen's name, for the report
//   from    — where to press: on the element to drag, with nothing over it
//   moves   — how many moves are measured
//   onDrawn — called as measured moves are drawn, with how many so far
async function drag(
  page: Page,
  cdp: CDPSession,
  label: string,
  from: readonly [number, number],
  moves = SAMPLES,
  onDrawn: (count: number) => Promise<void> = async () => undefined,
): Promise<DragResult> {
  // --- Step 1: Press on the element ---
  const zoom = await page.evaluate(() => {
    const frame = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
    return frame.getBoundingClientRect().width / frame.width;
  });
  const start = await devicePoint(page, from[0], from[1]);
  const count = (): Promise<number> => page.evaluate(() => (window as unknown as TestHandle).__u8g2glDragPerf.samples.length);
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2glDragPerf.reset());
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });

  // --- Step 2: A pointer moving one device pixel every POINTER_MS, back and forth ---
  let tick = 0;
  const pump = setInterval(() => {
    tick += 1;
    const phase = tick % (2 * SPAN);
    const offset = phase <= SPAN ? phase : 2 * SPAN - phase;
    void cdp
      .send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + offset * zoom, y: start.y, button: 'left', buttons: 1 })
      .catch(() => undefined);
  }, POINTER_MS);
  try {
    for (let drawn = await count(); drawn < WARMUP + moves; drawn = await count()) {
      if (drawn >= WARMUP) await onDrawn(drawn - WARMUP);
      await page.waitForTimeout(5);
    }
  } finally {
    clearInterval(pump);
  }
  const end = start.x + (tick % (2 * SPAN) <= SPAN ? tick % (2 * SPAN) : 2 * SPAN - (tick % (2 * SPAN))) * zoom;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end, y: start.y, button: 'left', buttons: 0, clickCount: 1 });

  // --- Step 3: The report, of the measured moves only ---
  const samples = (await page.evaluate(() => (window as unknown as TestHandle).__u8g2glDragPerf.samples)).slice(WARMUP, WARMUP + moves);
  const medians: Record<string, number> = {
    inputToEdit: round(percentile(samples.map((s) => s.inputToEdit), 50)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 50)),
  };
  const tails: Record<string, number> = {
    inputToEdit: round(percentile(samples.map((s) => s.inputToEdit), 95)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 95)),
  };
  for (const stage of Object.keys(samples[0]?.stages ?? {})) {
    medians[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 50));
    tails[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 95));
  }
  const histogram: Record<string, number> = {};
  for (const sample of samples) histogram[String(sample.frames)] = (histogram[String(sample.frames)] ?? 0) + 1;
  return {
    screen: label,
    samples: samples.length,
    frames: {
      // 0 is also the first frame after the move: that frame had begun (its
      // timestamp) a moment before the event was dispatched.
      firstFrame: samples.filter((s) => s.frames <= 1).length,
      worst: Math.max(...samples.map((s) => s.frames)),
      histogram,
    },
    misses: samples
      .map((s, index) => ({ index, frames: s.frames, inputToEdit: round(s.inputToEdit), editToFrame: round(s.editToFrame), runToBlit: round(s.runToBlit), inputToBlit: round(s.inputToBlit), stages: s.stages }))
      .filter((s) => s.frames > 1),
    inputToBlit: spread(samples.map((s) => s.inputToBlit)),
    runToBlit: spread(samples.map((s) => s.runToBlit)),
    stageMedians: medians,
    stageP95s: tails,
  };
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('a 300-frame drag paints each move in its first frame (at most 1% miss) with input-to-paint p95 under 16 ms, CPU throttled 4×', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  test.setTimeout(600_000);
  session = await startDesign({ files: { 'screens/screen_twenty.xml': twentyElementScreen() } });
  await openShell(page, session.url);
  const cdp = await page.context().newCDPSession(page);

  // --- The departures screen: plat_box, pressed where nothing covers it ---
  const results: DragResult[] = [];
  await openFile(page, 'screens/screen_departures.xml');
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('departures');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  results.push(await drag(page, cdp, 'departures (9 elements)', [2, 10]));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // --- The 20-element screen: l0 ---
  await openFile(page, 'screens/screen_twenty.xml');
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('twenty');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  results.push(await drag(page, cdp, '20 elements', [5, 5]));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // --- Report, then gate locally ---
  const report = { throttle: THROTTLE, moves: SAMPLES, budgetMs: BUDGET_MS, ci: process.env.CI !== undefined, results };
  mkdirSync(test.info().project.outputDir, { recursive: true });
  writeFileSync(join(test.info().project.outputDir, 'drag-performance.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`drag latency (CPU ${THROTTLE}x, ${SAMPLES} pointer moves per screen):`);
  for (const r of results) {
    console.log(`  ${r.screen} (${r.samples} samples):`);
    console.log(`    frames move->blit: ${r.frames.firstFrame}/${r.samples} in the first frame, worst ${r.frames.worst}, histogram ${JSON.stringify(r.frames.histogram)}`);
    for (const miss of r.misses) console.log(`    MISSED: ${JSON.stringify(miss)}`);
    console.log(`    input->blit: median ${r.inputToBlit.median} ms, p95 ${r.inputToBlit.p95} ms, max ${r.inputToBlit.max} ms`);
    console.log(`    run->blit (reported): median ${r.runToBlit.median} ms, p95 ${r.runToBlit.p95} ms, max ${r.runToBlit.max} ms`);
    console.log(`    stage medians (ms): ${Object.entries(r.stageMedians).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`    stage p95s (ms):    ${Object.entries(r.stageP95s).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  test.info().annotations.push({ type: 'drag-latency', description: JSON.stringify(results) });

  for (const r of results) {
    expect(r.samples).toBe(SAMPLES);
    if (process.env.CI === undefined) {
      expect(gateFailures(r), `${r.screen}: frame and input-to-paint gates`).toEqual([]);
    }
  }
});

// The gate's self-test: before trusting the gates passing, show they can fail.
// Four moves of twenty — more than the 1% allowed — are each forced to miss their
// frame by a hook the test injects through the `window.__u8g2gl` handle (only
// the end-to-end build has it): the editor Wasm's `renderFrame` is wrapped to
// block the main thread for three frame periods inside the run that draws each
// of those moves. The hook exists only in this file.
test('self-test of the drag gate: moves forced to miss their frame are each counted 2 or more, and over 1% the gate fails', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'screens/screen_departures.xml');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  // The hook goes in once, before the drag: the run that draws a forced move
  // (the first render after an edit, so never the animation ticker's) blocks.
  // It records the samples it forced, so the check below knows exactly which.
  const MOVES = 20;
  const TARGETS = [1, 5, 9, 13];
  await page.evaluate(
    (forcedAt) => {
      type Module = { renderFrame(ms: number): Uint8Array | undefined };
      const forced = window as unknown as { __u8g2glForced?: number[] };
      const workspace = (window as unknown as TestHandle).__u8g2gl;
      const probe = (window as unknown as TestHandle).__u8g2glDragPerf;
      const module: Module | undefined = workspace.wasm.module.get();
      if (module === undefined) throw new Error('no editor Wasm loaded');
      const original = module.renderFrame.bind(module);
      forced.__u8g2glForced = [];
      let edited = false;
      workspace.documents.onDidChangeContent(() => {
        edited = true;
      });
      const __u8g2glForceMissedFrame = (ms: number): Uint8Array | undefined => {
        // The sample this run closes is the next one the probe pushes.
        const sample = probe.samples.length;
        if (edited && forcedAt.includes(sample)) {
          forced.__u8g2glForced?.push(sample);
          const until = performance.now() + 50;
          while (performance.now() < until) {
            // Block the main thread for three frame periods, inside the run.
          }
        }
        edited = false;
        return original(ms);
      };
      module.renderFrame = __u8g2glForceMissedFrame;
    },
    TARGETS.map((t) => WARMUP + t),
  );
  const result = await drag(page, cdp, 'departures, four moves forced late', [2, 10], MOVES);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`drag gate self-test: frames per move ${JSON.stringify(result.frames.histogram)}, worst ${result.frames.worst}; gate: ${JSON.stringify(gateFailures(result))}`);

  const all = await page.evaluate(() => (window as unknown as TestHandle).__u8g2glDragPerf.samples.map((s) => s.frames));
  const forced = (await page.evaluate(() => (window as unknown as { __u8g2glForced?: number[] }).__u8g2glForced ?? [])).filter((i) => i >= WARMUP && i < WARMUP + MOVES);
  const samples = all.slice(WARMUP, WARMUP + MOVES);
  const FORCED = forced.map((i) => i - WARMUP);
  expect(FORCED, 'the moves forced').toEqual(TARGETS);
  for (const i of FORCED) {
    expect(samples[i], `forced move ${i}`).toBeGreaterThanOrEqual(2);
  }
  // Unforced moves landing in one frame is the real gate's claim, and like the
  // real gate it holds only on the owner's machine.
  if (process.env.CI === undefined) {
    expect(samples.filter((frames, i) => !FORCED.includes(i)).every((frames) => frames <= 1), `every other move: ${JSON.stringify(samples)}`).toBe(true);
  }
  expect(gateFailures(result).some((failure) => failure.includes('missed their frame'))).toBe(true);
});
