/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/bench.test.ts
 * Purpose: E-1a a8 — measures a full CST parse of the stress100 screen, the
 *          number the editor's per-keystroke budget (LOOP-BUDGET §1, §5.3)
 *          rests on: the designer re-parses the whole document on every edit,
 *          and that is only acceptable while a parse costs well under 1 ms.
 * Description: Reports, never gates. CI machines vary too much for a timing
 *              assertion to mean anything, so the median of 50 runs is printed
 *              and the test asserts only that the parse is correct. Ten warm-up
 *              runs first, so the median measures the optimised parser rather
 *              than the JIT's first pass.
 */

import { describe, expect, it } from 'vitest';
import { parseCst, printCst } from '../../src/core/cst/index.js';
import { allElements, stressScreen } from './cst-test-helpers.js';

const WARMUP_RUNS = 10;
const MEASURED_RUNS = 50;

describe('CST parse benchmark (a8, reported, not gating)', () => {
  it('parses the stress100 screen and reports the median of 50 runs', () => {
    const text = stressScreen(100);

    // --- Step 1: Correctness — the bench parses what it claims to ---
    const { cst, diagnostics } = parseCst(text, 'screens/screen_departures.xml');
    expect(diagnostics).toEqual([]);
    expect(printCst(cst)).toBe(text);
    expect(allElements(cst)).toHaveLength(102); // screen, view, 100 widgets

    // --- Step 2: Warm up, then time each run individually ---
    for (let i = 0; i < WARMUP_RUNS; i++) {
      parseCst(text, 'screens/screen_departures.xml');
    }
    const samples: number[] = [];
    for (let i = 0; i < MEASURED_RUNS; i++) {
      const t0 = performance.now();
      parseCst(text, 'screens/screen_departures.xml');
      samples.push(performance.now() - t0);
    }

    // --- Step 3: Report the median; the budget line is information, not a gate ---
    samples.sort((a, b) => a - b);
    const median = ((samples[24] ?? 0) + (samples[25] ?? 0)) / 2;
    console.log(
      `[a8] parseCst(stress100, ${text.length} bytes): median ${median.toFixed(4)} ms ` +
        `over ${MEASURED_RUNS} runs (min ${(samples[0] ?? 0).toFixed(4)}, ` +
        `max ${(samples.at(-1) ?? 0).toFixed(4)}); budget 1 ms`,
    );
    expect(Number.isFinite(median)).toBe(true);
  });
});
