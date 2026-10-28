/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/pipeline-allocation.test.ts
 * Purpose: How much the text pipeline allocates
 *          per run in each stage during a drag, and how often the collector
 *          runs, so a change meant to cut the GC spikes seen in resolve,
 *          validate and scene can be shown to have done so. Reported, not
 *          gated: allocation varies with the engine version, and the drag
 *          gate is what the user feels.
 * Description: The departures project's texts, with row0's x stepped one pixel
 *              per run as a drag writes it, through `runTextPipeline` exactly
 *              as the edit loop calls it. The pipeline marks the end of each
 *              stage with `performance.mark`; the harness wraps that to read
 *              the heap there, so each stage's allocation is the heap's growth
 *              across it. A run during which the collector ran (the heap
 *              shrank across a stage) is not counted, since its growth is not
 *              its allocation; the stage it ran in is tallied instead. The
 *              collections and their total time come from Node's `gc`
 *              performance entries.
 *              Printed, and written to `test-results/pipeline-allocation.json`.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';
import { expect, test } from '@playwright/test';
import { runTextPipeline, TEXT_STAGES, type TextStage } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project');
const SCREEN = 'screens/screen_departures.xml';
/** Runs discarded first (the JIT), then runs measured. */
const WARMUP = 200;
const RUNS = 2000;

/** The project's XML documents, by project path, as the designer reads them. */
function projectTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'generated_editor' && entry.name !== 'generated') walk(path);
      } else if (entry.name.endsWith('.xml')) {
        texts.set(relative(PROJECT, path).split('\\').join('/'), readFileSync(path, 'utf8'));
      }
    }
  };
  walk(PROJECT);
  return texts;
}

test('allocation and collections per pipeline run during a drag, by stage (reported)', async () => {
  // --- Step 1: The heap at each stage's mark ---
  const texts = projectTexts();
  const screen = texts.get(SCREEN);
  expect(screen).toBeDefined();
  const heapAt = new Map<string, number>();
  const mark = performance.mark.bind(performance);
  performance.mark = ((name: string, options?: PerformanceMarkOptions) => {
    heapAt.set(name, process.memoryUsage().heapUsed);
    return mark(name, options);
  }) as typeof performance.mark;
  let collections = 0;
  let collecting = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      collections += 1;
      collecting += entry.duration;
    }
  });
  observer.observe({ entryTypes: ['gc'] });

  // --- Step 2: A drag of row0, one pixel per run ---
  const cache = new ProjectModelCache();
  const assets = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };
  const totals: Record<TextStage, number[]> = { parse: [], resolve: [], realise: [], validate: [], scene: [] };
  let gcRuns = 0;
  const collectedIn: Record<TextStage, number> = { parse: 0, resolve: 0, realise: 0, validate: 0, scene: 0 };
  try {
    for (let i = 0; i < WARMUP + RUNS; i++) {
      texts.set(SCREEN, (screen ?? '').replace('name="row0" x="32"', `name="row0" x="${(i % 24) + 8}"`));
      heapAt.clear();
      const start = process.memoryUsage().heapUsed;
      runTextPipeline({ texts, cache, assets, activeFile: SCREEN });
      if (i < WARMUP) continue;
      // The heap only shrinks when the collector ran: that run's growth is not its allocation.
      let previous = start;
      const growth: number[] = [];
      for (const stage of TEXT_STAGES) {
        const at = heapAt.get(`u8g2gl:${stage}`) ?? previous;
        growth.push(at - previous);
        previous = at;
      }
      const collected = growth.findIndex((bytes) => bytes < 0);
      if (collected >= 0) {
        gcRuns += 1;
        const stage = TEXT_STAGES[collected];
        if (stage !== undefined) collectedIn[stage] += 1;
        continue;
      }
      TEXT_STAGES.forEach((stage, k) => totals[stage].push(growth[k] ?? 0));
    }
  } finally {
    performance.mark = mark;
  }
  // The collector's entries are delivered on the event loop, after the runs.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const collectionsDuring = collections;
  observer.disconnect();

  // --- Step 3: Report ---
  const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const perStage = Object.fromEntries(TEXT_STAGES.map((stage) => [stage, Math.round(median(totals[stage]) / 1024)]));
  const perRun = TEXT_STAGES.reduce((sum, stage) => sum + median(totals[stage]), 0);
  const report = {
    runs: RUNS,
    medianKiBPerStage: perStage,
    medianKiBPerRun: Math.round(perRun / 1024),
    collections: collectionsDuring,
    runsPerCollection: Math.round((WARMUP + RUNS) / Math.max(1, collectionsDuring)),
    collectingMs: Math.round(collecting),
    runsWithACollection: gcRuns,
    collectionsByStage: collectedIn,
  };
  mkdirSync(join(HERE, '..', '..', 'test-results'), { recursive: true });
  writeFileSync(join(HERE, '..', '..', 'test-results', 'pipeline-allocation.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`pipeline allocation during a drag: ${JSON.stringify(report)}`);
  expect(totals.scene.length).toBeGreaterThan(0);
});
