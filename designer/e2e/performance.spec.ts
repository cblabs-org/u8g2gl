/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/performance.spec.ts
 * Purpose: Keystroke latency, measured to the frame the user sees, with
 *          Chromium's CPU throttled 4× as a stand-in for a modest laptop, on
 *          the departures screen and on a 20-element screen, over 300
 *          keystrokes each. Two gates:
 *          1. **Frame latency:** each keystroke's edit is on the canvas in the
 *             **first** animation frame after its key event; at most 1% (3 of
 *             300) may miss it, which allows for the garbage collector and the
 *             JIT, not for a slow pipeline.
 *          2. **Work per frame:** from the start of the pipeline run in that
 *             frame to the end of its blit, **p95 under 16 ms**.
 *          Key to blit is reported, not gated: it includes the wait for the
 *          frame, which no schedule removes from what is displayed. A budget
 *          measured only at full speed would prove nothing about the user's
 *          machine. A self-test forces keystrokes to miss their frame and checks
 *          that the frame gate then fails, so its passing means something.
 * Description: Real key presses into Monaco, each changing the x of one element
 *              between two valid values, so every keystroke must reach the
 *              canvas. The page's key probe (`src/perf/input-probe.ts`) counts animation
 *              frames from the key to the blit, times the run from its start to
 *              the end of its blit, and times key to blit, split into Monaco's
 *              handling, the wait for the frame and each stage. Keys
 *              are spaced by a random delay so they land at every phase of the
 *              frame, as a typist's do. The first 30 are warm-up.
 *
 *              The result is printed and written to
 *              `test-results/chromium/keystroke-performance.json`. Locally both
 *              measures gate; on CI they are reported, not gated, because CI
 *              machines vary.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { BUDGET_MS, MAX_MISSED_SHARE, percentile, round, SAMPLES, spread, type Spread, THROTTLE, twentyElementScreen, WARMUP } from './support/latency';
import { openFile, openShell, placeCaret } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

/** Keystrokes measured per screen, after the warm-up. */
const KEYSTROKES = SAMPLES;

/** One screen's measurement. */
interface ScreenResult {
  readonly screen: string;
  readonly samples: number;
  /**
   * Gated: how many keystrokes were drawn by the first frame after the key
   * (0 or 1 intervals later; see `measure`), the worst, and every count.
   */
  readonly frames: { readonly firstFrame: number; readonly worst: number; readonly histogram: Readonly<Record<string, number>> };
  /** Every keystroke that missed its frame, in full, so a failure can be attributed. */
  readonly misses: readonly { readonly index: number; readonly frames: number; readonly keyToEdit: number; readonly editToFrame: number; readonly runToBlit: number; readonly keyToBlit: number; readonly stages: Readonly<Record<string, number>> }[];
  /** Gated: pipeline-run start to blit end. */
  readonly runToBlit: Spread;
  /** Reported only: key event to blit end. */
  readonly keyToBlit: Spread;
  /** Medians of: Monaco's handling of the key, the wait for the frame, then each pipeline stage. */
  readonly stageMedians: Readonly<Record<string, number>>;
  /** p95 of the same, to show which stage the tail comes from. */
  readonly stageP95s: Readonly<Record<string, number>>;
}

// gateFailures
// Ruling 8's two gates for one screen, as the reasons they fail; empty when
// both pass. The latency test and its self-test judge with this one function,
// so the self-test proves the gate the latency test actually applies.
//   result — one screen's measurement
function gateFailures(result: ScreenResult): string[] {
  const failures: string[] = [];
  const missed = result.samples - result.frames.firstFrame;
  const allowed = Math.floor(result.samples * MAX_MISSED_SHARE);
  if (missed > allowed) {
    failures.push(`${missed} keystroke(s) missed their frame, more than the ${allowed} allowed (worst ${result.frames.worst})`);
  }
  if (!(result.runToBlit.p95 < BUDGET_MS)) {
    failures.push(`run-to-blit p95 ${result.runToBlit.p95} ms is not under ${BUDGET_MS} ms`);
  }
  return failures;
}

// measure
// Types WARMUP + keystrokes keys into an open file — alternately a digit after
// the caret and a Backspace — and returns the probe's samples for the last
// `keystrokes` of them.
//   page       — the shell, with the file open and the caret after the x value's first digit
//   label      — the screen's name, for the report
//   digit      — the digit typed
//   keystrokes — how many keys are measured
//   beforeKey  — called before measured key i, so a test can arrange that key
async function measure(
  page: Page,
  label: string,
  digit: string,
  keystrokes = KEYSTROKES,
  beforeKey: (i: number) => Promise<void> = async () => undefined,
): Promise<ScreenResult> {
  type Sample = { inputToBlit: number; wait: number; inputToEdit: number; editToFrame: number; runToBlit: number; frames: number; stages: Record<string, number> };
  const count = (): Promise<number> => page.evaluate(() => (window as unknown as TestHandle).__u8g2glPerf.samples.length);
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2glPerf.reset());
  for (let i = 0; i < WARMUP + keystrokes; i++) {
    if (i === WARMUP) {
      await page.evaluate(() => (window as unknown as TestHandle).__u8g2glPerf.reset());
    }
    if (i >= WARMUP) await beforeKey(i - WARMUP);
    const before = await count();
    await page.keyboard.press(i % 2 === 0 ? digit : 'Backspace');
    await page.waitForFunction((n) => (window as unknown as TestHandle).__u8g2glPerf.samples.length > n, before);
    // A random gap, so keys arrive at every phase of the display's frame.
    await page.waitForTimeout(Math.random() * 20);
  }
  const samples = await page.evaluate(() => (window as unknown as TestHandle).__u8g2glPerf.samples);
  const totals = samples.map((s) => s.inputToBlit);
  const stages: Record<string, number> = {
    keyToEdit: round(percentile(samples.map((s) => s.inputToEdit), 50)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 50)),
  };
  const tails: Record<string, number> = {
    keyToEdit: round(percentile(samples.map((s) => s.inputToEdit), 95)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 95)),
  };
  for (const stage of Object.keys(samples[0]?.stages ?? {})) {
    stages[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 50));
    tails[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 95));
  }
  const histogram: Record<string, number> = {};
  for (const sample of samples) histogram[String(sample.frames)] = (histogram[String(sample.frames)] ?? 0) + 1;
  return {
    screen: label,
    samples: samples.length,
    frames: {
      // 0 is also the first frame after the key: the frame whose callbacks ran
      // first after the key event had begun (its timestamp) a moment before the
      // key was dispatched, so the key's interval and the blit's are the same.
      firstFrame: samples.filter((s) => s.frames <= 1).length,
      worst: Math.max(...samples.map((s) => s.frames)),
      histogram,
    },
    misses: samples
      .map((s, index) => ({ index, frames: s.frames, keyToEdit: round(s.inputToEdit), editToFrame: round(s.editToFrame), runToBlit: round(s.runToBlit), keyToBlit: round(s.inputToBlit), stages: s.stages }))
      .filter((s) => s.frames > 1),
    runToBlit: spread(samples.map((s) => s.runToBlit)),
    keyToBlit: spread(totals),
    stageMedians: stages,
    stageP95s: tails,
  };
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('keystrokes reach the canvas in their first frame (at most 1% miss) and the work per frame has p95 under 16 ms, CPU throttled 4×', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  test.setTimeout(600_000);
  session = await startDesign({ files: { 'screens/screen_twenty.xml': twentyElementScreen() } });
  await openShell(page, session.url);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  // --- The departures screen: row0's x, "32" ↔ "3" ---
  const results: ScreenResult[] = [];
  await openFile(page, 'screens/screen_departures.xml');
  await placeCaret(page, 'screens/screen_departures.xml', 'name="row0" x="32"', 'name="row0" x="32'.length);
  await page.keyboard.press('Backspace'); // x="3": the loop below types "2" then deletes it
  results.push(await measure(page, 'departures (9 elements)', '2'));

  // --- The 20-element screen: l0's x, "1" ↔ "12" ---
  await openFile(page, 'screens/screen_twenty.xml');
  await placeCaret(page, 'screens/screen_twenty.xml', 'name="l0" x="1"', 'name="l0" x="1'.length);
  results.push(await measure(page, '20 elements', '2'));

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // --- Report, then gate locally ---
  const report = { throttle: THROTTLE, keystrokes: KEYSTROKES, budgetMs: BUDGET_MS, ci: process.env.CI !== undefined, results };
  mkdirSync(test.info().project.outputDir, { recursive: true });
  const out = join(test.info().project.outputDir, 'keystroke-performance.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`keystroke latency (CPU ${THROTTLE}x, ${KEYSTROKES} keystrokes per screen):`);
  for (const r of results) {
    console.log(`  ${r.screen} (${r.samples} samples):`);
    console.log(`    frames key->blit: ${r.frames.firstFrame}/${r.samples} in the first frame, worst ${r.frames.worst}, histogram ${JSON.stringify(r.frames.histogram)}`);
    for (const miss of r.misses) console.log(`    MISSED (${miss.frames} frames): ${JSON.stringify(miss)}`);
    console.log(`    run->blit: median ${r.runToBlit.median} ms, p95 ${r.runToBlit.p95} ms, max ${r.runToBlit.max} ms`);
    console.log(`    key->blit (reported): median ${r.keyToBlit.median} ms, p95 ${r.keyToBlit.p95} ms, max ${r.keyToBlit.max} ms`);
    console.log(`    stage medians (ms): ${Object.entries(r.stageMedians).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`    stage p95s (ms):    ${Object.entries(r.stageP95s).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  test.info().annotations.push({ type: 'keystroke-latency', description: JSON.stringify(results) });

  for (const r of results) {
    expect(r.samples).toBe(KEYSTROKES);
    if (process.env.CI === undefined) {
      expect(gateFailures(r), `${r.screen}: frame-latency and work-per-frame gates`).toEqual([]);
    }
  }
});

// The gate's self-test: before trusting the frame gate passing, show it can
// fail. Four keystrokes of ten — more than the 1% allowed — are each forced
// to miss its frame by a hook the test
// injects into the page through the existing `window.__u8g2gl` handle: the
// loaded editor Wasm's `renderFrame` is wrapped to block the main thread for
// three frame periods inside the pipeline run that draws that keystroke,
// before its blit, and then unwrapped.
// The hook exists only in this file. It needs the `window.__u8g2gl` handle,
// which only the end-to-end test build has (`src/test-hooks.ts`).
test('self-test of the frame gate: keystrokes forced to miss their frame are each counted 2 or more, and over 1% the gate fails', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  session = await startDesign();
  await openShell(page, session.url);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await openFile(page, 'screens/screen_departures.xml');
  await placeCaret(page, 'screens/screen_departures.xml', 'name="row0" x="32"', 'name="row0" x="32'.length);
  await page.keyboard.press('Backspace');

  const FORCED = [1, 3, 5, 7];
  const result = await measure(page, 'departures, four keys forced late', '2', 10, async (i) => {
    if (!FORCED.includes(i)) return;
    await page.evaluate(() => {
      type Module = { renderFrame(ms: number): Uint8Array | undefined };
      const workspace = (window as unknown as TestHandle).__u8g2gl;
      const module = workspace.wasm.module.get();
      if (module === undefined) throw new Error('no editor Wasm loaded');
      const original = module.renderFrame.bind(module);
      // Armed by the next edit, so the block lands in the pipeline run that
      // draws it, not in the animation ticker's render between keys (the
      // ticker does not render while a run is booked).
      let armed = false;
      const disarm = workspace.documents.onDidChangeContent(() => {
        armed = true;
        disarm();
      });
      const __u8g2glForceMissedFrame = (ms: number): Uint8Array | undefined => {
        if (!armed) return original(ms);
        module.renderFrame = original;
        const until = performance.now() + 50;
        while (performance.now() < until) {
          // Block the main thread for three frame periods, inside the run.
        }
        return original(ms);
      };
      module.renderFrame = __u8g2glForceMissedFrame;
    });
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`frame gate self-test: frames per keystroke ${JSON.stringify(result.frames.histogram)}, worst ${result.frames.worst}; gate: ${JSON.stringify(gateFailures(result))}`);

  const samples = await page.evaluate(() => (window as unknown as TestHandle).__u8g2glPerf.samples.map((s) => s.frames));
  for (const i of FORCED) {
    expect(samples[i], `forced keystroke ${i}`).toBeGreaterThanOrEqual(2);
  }
  // Unforced keystrokes landing in one frame is the real gate's claim, and like
  // the real gate it holds only on the owner's machine: a shared CI runner
  // under 4× throttle can let one slip to two frames on its own.
  if (process.env.CI === undefined) {
    expect(samples.filter((frames, i) => !FORCED.includes(i)).every((frames) => frames <= 1), 'every other keystroke').toBe(true);
  }
  expect(gateFailures(result).some((failure) => failure.includes('missed their frame'))).toBe(true);
});
