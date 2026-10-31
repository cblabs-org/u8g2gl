/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/panel-budget.spec.ts
 * Purpose: The property panel inside the shell's 8 ms slice (EDITOR-DESIGN
 *          §3.3), under the per-frame rule: a field re-renders only when its
 *          value changes. Until the canvas drag exists, a scripted stand-in
 *          does what a drag does to the text — the selected element's `x`
 *          rewritten once a frame for 300 frames — with Chromium's CPU
 *          throttled 4×. Two gates:
 *          1. **The panel's share:** its controller update plus the render it
 *             causes, **p95 under 8 ms**.
 *          2. **The render rule:** across those frames only the `x` field
 *             renders — once per frame — and no other panel component at all.
 *          Locally both gate; on CI the share is reported, not gated, because
 *          CI machines vary (the render rule gates everywhere: it counts, it
 *          does not time). A self-test slows the panel's update and checks the
 *          share gate then fails, so its passing means something.
 * Description: The stand-in edits through the page's own Monaco model, one
 *              edit per animation frame, alternating `x` between two values,
 *              so every frame's pipeline run changes the field. The panel probe
 *              (`src/perf/panel-probe.ts`) times each controller update and
 *              the panel's React render and commit after it; the render
 *              counter counts each component's renders. The first 30 frames
 *              are warm-up. The result is printed and written to
 *              `test-results/chromium/panel-budget.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { clickCanvas, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
/** Frames measured, after the warm-up. */
const FRAMES = 300;
/** Frames run first and discarded: the JIT, the first renders. */
const WARMUP = 30;
/** The shell's slice of the 16 ms frame, p95, in milliseconds (EDITOR-DESIGN §3.3). */
const SHELL_SLICE_MS = 8;
/** DevTools' CPU throttling factor. */
const THROTTLE = 4;

/** Median, p95 and maximum. */
interface Spread {
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

/** One stand-in run's measurement. */
interface BudgetResult {
  readonly samples: number;
  /** Gated: the panel's share of each frame. */
  readonly total: Spread;
  /** Of which, the controller's update. */
  readonly update: Spread;
  /** And the React render and commit it caused. */
  readonly render: Spread;
  /** Renders per component across the measured frames. */
  readonly renders: Readonly<Record<string, number>>;
}

/** A percentile by nearest rank. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? NaN;
}

/** Two decimals, for the report. */
const round = (value: number): number => Math.round(value * 100) / 100;

/** Median, p95 and maximum of some milliseconds. */
function spread(values: readonly number[]): Spread {
  return { median: round(percentile(values, 50)), p95: round(percentile(values, 95)), max: round(Math.max(...values)) };
}

// shareGateFailures
// The share gate, as the reason it fails; empty when it passes. The budget
// test and its self-test judge with this one function.
//   result — one stand-in run's measurement
function shareGateFailures(result: BudgetResult): string[] {
  return result.total.p95 < SHELL_SLICE_MS ? [] : [`the panel's share p95 ${result.total.p95} ms is not under ${SHELL_SLICE_MS} ms`];
}

// standIn
// Rewrites row0's x once per animation frame, `frames` times, alternating two
// values, and resolves once the last edit's frame has been drawn.
//   page   — the shell, row0 selected
//   frames — how many edits
async function standIn(page: Page, frames: number): Promise<void> {
  await page.evaluate(
    async ({ path, frames }) => {
      const workspace = (window as unknown as TestHandle).__u8g2gl;
      const model = workspace.documents.modelOf(path);
      if (model === undefined) throw new Error(`${path} is not open`);
      const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));
      for (let i = 0; i < frames; i++) {
        await nextFrame();
        // The value of row0's x, found afresh each frame as a drag's edit would
        // be, moved between two values where it fits the display, so only x changes.
        const text = model.getValue();
        const at = text.indexOf('name="row0" x="') + 'name="row0" x="'.length;
        const end = text.indexOf('"', at);
        const start = model.getPositionAt(at);
        const stop = model.getPositionAt(end);
        model.pushEditOperations(
          [],
          [{ range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: stop.lineNumber, endColumn: stop.column }, text: i % 2 === 0 ? '31' : '32' }],
          () => null,
        );
      }
      await nextFrame();
      await nextFrame();
    },
    { path: SCREEN, frames },
  );
}

// measure
// The warm-up, then `frames` measured frames: the panel probe's samples and
// the render counts across them.
async function measure(page: Page, frames = FRAMES): Promise<BudgetResult> {
  await standIn(page, WARMUP);
  const before = await page.evaluate(() => {
    (window as unknown as TestHandle).__u8g2glPanel.reset();
    return (window as unknown as TestHandle).__u8g2glRenders();
  });
  await standIn(page, frames);
  const { samples, after } = await page.evaluate(() => ({
    samples: (window as unknown as TestHandle).__u8g2glPanel.samples(),
    after: (window as unknown as TestHandle).__u8g2glRenders(),
  }));
  const renders = Object.fromEntries(
    Object.keys(after)
      .map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)] as const)
      .filter(([, count]) => count > 0),
  );
  return {
    samples: samples.length,
    total: spread(samples.map((s) => s.total)),
    update: spread(samples.map((s) => s.update)),
    render: spread(samples.map((s) => s.render)),
    renders,
  };
}

/** Opens the departures screen, frozen, with row0 selected, and throttles the CPU. */
async function setUp(page: Page): Promise<() => Promise<void>> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await clickCanvas(page, 100, 5); // row0
  await expect(page.locator('.property-panel .panel-subtitle')).toHaveText('row0');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  return async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  };
}

// Tracing records a DOM snapshot on every page call, and these tests poll the
// page between inputs: on, it would be timed as part of the shell.
test.use({ trace: 'off' });

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('a field rewritten every frame re-renders only that field, and the panel’s share stays under 8 ms p95, CPU throttled 4×', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  test.setTimeout(300_000);
  const unthrottle = await setUp(page);
  const result = await measure(page);
  await unthrottle();

  // --- Report ---
  const report = { throttle: THROTTLE, frames: FRAMES, sliceMs: SHELL_SLICE_MS, ci: process.env.CI !== undefined, result };
  mkdirSync(test.info().project.outputDir, { recursive: true });
  writeFileSync(join(test.info().project.outputDir, 'panel-budget.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`panel budget (CPU ${THROTTLE}x, ${result.samples} updates over ${FRAMES} frames):`);
  console.log(`  panel share: median ${result.total.median} ms, p95 ${result.total.p95} ms, max ${result.total.max} ms`);
  console.log(`    update:   median ${result.update.median} ms, p95 ${result.update.p95} ms, max ${result.update.max} ms`);
  console.log(`    render:   median ${result.render.median} ms, p95 ${result.render.p95} ms, max ${result.render.max} ms`);
  console.log(`  renders: ${JSON.stringify(result.renders)}`);
  test.info().annotations.push({ type: 'panel-budget', description: JSON.stringify(result) });

  // --- The render rule: only x, once per frame ---
  const panelRenders = Object.fromEntries(Object.entries(result.renders).filter(([name]) => name === 'PropertyPanel' || name.startsWith('Panel')));
  expect(Object.keys(panelRenders)).toEqual(['PanelField:x']);
  expect(panelRenders['PanelField:x']).toBeGreaterThanOrEqual(FRAMES * 0.9);
  expect(panelRenders['PanelField:x']).toBeLessThanOrEqual(FRAMES);

  // --- The share, gated locally ---
  expect(result.samples).toBeGreaterThanOrEqual(FRAMES * 0.9);
  if (process.env.CI === undefined) {
    expect(shareGateFailures(result), 'the panel’s share of the frame').toEqual([]);
  }
});

// The share gate's self-test: before trusting it passing, show it can fail.
// The controller reads the selected file's text through the documents on every
// update; wrapping that read to block the main thread for 10 ms puts the delay
// inside the measured update, as a slow panel would.
test('self-test of the share gate: a panel slowed by 10 ms per update fails it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
  test.setTimeout(120_000);
  const unthrottle = await setUp(page);
  await page.evaluate(() => {
    const documents = (window as unknown as TestHandle).__u8g2gl.documents;
    const original = documents.textOf.bind(documents);
    documents.textOf = (path: string): string | undefined => {
      const until = performance.now() + 10;
      while (performance.now() < until) {
        // Block, inside the panel's update.
      }
      return original(path);
    };
  });
  const result = await measure(page, 20);
  await unthrottle();
  console.log(`share gate self-test: panel share p95 ${result.total.p95} ms; gate: ${JSON.stringify(shareGateFailures(result))}`);
  expect(shareGateFailures(result)).not.toEqual([]);
});
