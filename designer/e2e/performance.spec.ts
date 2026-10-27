/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/performance.spec.ts
 * Purpose: E1 e2 as checkpoint C3 defines it (PA ruling 8, "measure to the
 *          frame"), with Chromium's CPU throttled 4× as a stand-in for a modest
 *          laptop, on the departures screen and on a 20-element screen, over 300
 *          keystrokes each:
 *          1. **Frame latency:** every keystroke's edit is on the canvas in the
 *             **first** animation frame after its key event — no keystroke
 *             skips a frame.
 *          2. **Work per frame:** from the start of the pipeline run in that
 *             frame to the end of its blit, **p95 under 16 ms**.
 *          Key to blit is reported, not gated: it includes the wait for the
 *          frame, which no schedule removes from what is displayed. A budget
 *          measured only at full speed would prove nothing about the user's
 *          machine (EDITOR-DESIGN §3.4).
 * Description: Real key presses into Monaco, each changing the x of one element
 *              between two valid values, so every keystroke must reach the
 *              canvas. The page's keystroke probe (`src/perf/`) counts animation
 *              frames from the key to the blit, times the run from its start to
 *              the end of its blit, and times key to blit, split into Monaco's
 *              handling, the wait for the frame and each stage. Keys
 *              are spaced by a random delay so they land at every phase of the
 *              frame, as a typist's do. The first 30 are warm-up.
 *
 *              The result is printed and written to
 *              `test-results/e2-performance.json`. Locally both measures gate;
 *              on CI they are reported, not gated, because CI machines vary
 *              (WORKORDERS WO4).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { openFile, openShell, placeCaret } from './support/shell';

/** Keystrokes measured per screen, after the warm-up. */
const KEYSTROKES = 300;
/** Keystrokes typed first and discarded: the JIT, Monaco's first layouts. */
const WARMUP = 30;
/** The budget, p95, in milliseconds. */
const BUDGET_MS = 16;
/** DevTools' CPU throttling factor. */
const THROTTLE = 4;

/** A 20-element screen of framework elements: labels, boxes and rules. */
function twentyElementScreen(): string {
  const elements: string[] = [];
  for (let i = 0; i < 10; i++) {
    elements.push(`        <u8g2gl_label name="l${i}" x="${i === 0 ? 1 : (i % 4) * 64}" y="${Math.floor(i / 4) * 13}" width="60" height="12" font="u8g2_font_6x10_mr" text="label ${i}" />`);
  }
  for (let i = 0; i < 6; i++) {
    elements.push(`        <u8g2gl_box name="b${i}" x="${i * 42}" y="42" width="36" height="10" filled="${i % 2 === 0}" />`);
  }
  for (let i = 0; i < 4; i++) {
    elements.push(`        <u8g2gl_line name="r${i}" x1="0" y1="${54 + i * 3}" x2="255" y2="${54 + i * 3}" />`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<screen name="twenty">\n    <view>\n${elements.join('\n')}\n    </view>\n</screen>\n`;
}

/** Median, p95 and maximum of a set of milliseconds. */
interface Spread {
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

/** One screen's measurement. */
interface ScreenResult {
  readonly screen: string;
  readonly samples: number;
  /** Gated: how many keystrokes were drawn in the first frame after the key, and the worst. */
  readonly frames: { readonly firstFrame: number; readonly worst: number; readonly histogram: Readonly<Record<string, number>> };
  /** Gated: pipeline-run start to blit end. */
  readonly runToBlit: Spread;
  /** Reported only: key event to blit end. */
  readonly keyToBlit: Spread;
  /** Medians of: Monaco's handling of the key, the wait for the frame, then each pipeline stage. */
  readonly stageMedians: Readonly<Record<string, number>>;
  /** p95 of the same, to show which stage the tail comes from. */
  readonly stageP95s: Readonly<Record<string, number>>;
}

/** A percentile by nearest rank. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? NaN;
}

/** Two decimals, for the report. */
const round = (value: number): number => Math.round(value * 100) / 100;

// measure
// Types 2 × (WARMUP + KEYSTROKES) / 2 keys into an open file — alternately a
// digit after the caret and a Backspace — and returns the probe's samples.
//   page   — the shell, with `path` open and the caret after the x value's first digit
//   label  — the screen's name, for the report
async function measure(page: Page, label: string, digit: string): Promise<ScreenResult> {
  type Sample = { keyToBlit: number; wait: number; keyToEdit: number; editToFrame: number; runToBlit: number; frames: number; stages: Record<string, number> };
  const count = (): Promise<number> => page.evaluate(() => (window as unknown as { __u8g2glPerf: { samples: unknown[] } }).__u8g2glPerf.samples.length);
  await page.evaluate(() => (window as unknown as { __u8g2glPerf: { reset(): void } }).__u8g2glPerf.reset());
  for (let i = 0; i < WARMUP + KEYSTROKES; i++) {
    if (i === WARMUP) {
      await page.evaluate(() => (window as unknown as { __u8g2glPerf: { reset(): void } }).__u8g2glPerf.reset());
    }
    const before = await count();
    await page.keyboard.press(i % 2 === 0 ? digit : 'Backspace');
    await page.waitForFunction((n) => (window as unknown as { __u8g2glPerf: { samples: unknown[] } }).__u8g2glPerf.samples.length > n, before);
    // A random gap, so keys arrive at every phase of the display's frame.
    await page.waitForTimeout(Math.random() * 20);
  }
  const samples = await page.evaluate(() => (window as unknown as { __u8g2glPerf: { samples: Sample[] } }).__u8g2glPerf.samples);
  const totals = samples.map((s) => s.keyToBlit);
  const stages: Record<string, number> = {
    keyToEdit: round(percentile(samples.map((s) => s.keyToEdit), 50)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 50)),
  };
  const tails: Record<string, number> = {
    keyToEdit: round(percentile(samples.map((s) => s.keyToEdit), 95)),
    editToFrame: round(percentile(samples.map((s) => s.editToFrame), 95)),
  };
  for (const stage of Object.keys(samples[0]?.stages ?? {})) {
    stages[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 50));
    tails[stage] = round(percentile(samples.map((s) => s.stages[stage] ?? 0), 95));
  }
  const spread = (values: readonly number[]): Spread => ({
    median: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(Math.max(...values)),
  });
  const histogram: Record<string, number> = {};
  for (const sample of samples) histogram[String(sample.frames)] = (histogram[String(sample.frames)] ?? 0) + 1;
  return {
    screen: label,
    samples: samples.length,
    frames: {
      firstFrame: samples.filter((s) => s.frames === 1).length,
      worst: Math.max(...samples.map((s) => s.frames)),
      histogram,
    },
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

test('e2: every keystroke drawn in the first frame after it, run-to-blit p95 under 16 ms, CPU throttled 4×', async ({ page, browserName }) => {
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
  const out = join(test.info().project.outputDir, 'e2-performance.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`e2 (CPU ${THROTTLE}x, ${KEYSTROKES} keystrokes per screen):`);
  for (const r of results) {
    console.log(`  ${r.screen} (${r.samples} samples):`);
    console.log(`    frames key->blit: ${r.frames.firstFrame}/${r.samples} in the first frame, worst ${r.frames.worst}, histogram ${JSON.stringify(r.frames.histogram)}`);
    console.log(`    run->blit: median ${r.runToBlit.median} ms, p95 ${r.runToBlit.p95} ms, max ${r.runToBlit.max} ms`);
    console.log(`    key->blit (reported): median ${r.keyToBlit.median} ms, p95 ${r.keyToBlit.p95} ms, max ${r.keyToBlit.max} ms`);
    console.log(`    stage medians (ms): ${Object.entries(r.stageMedians).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`    stage p95s (ms):    ${Object.entries(r.stageP95s).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  test.info().annotations.push({ type: 'e2', description: JSON.stringify(results) });

  for (const r of results) {
    expect(r.samples).toBe(KEYSTROKES);
    if (process.env.CI === undefined) {
      expect.soft(r.frames.firstFrame, `${r.screen}: keystrokes drawn in the first frame after the key`).toBe(r.samples);
      expect.soft(r.runToBlit.p95, `${r.screen}: run-to-blit p95`).toBeLessThan(BUDGET_MS);
    }
  }
});
