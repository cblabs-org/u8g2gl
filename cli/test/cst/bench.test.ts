/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/bench.test.ts
 * Purpose: Measures a full CST parse of a 100-element stress screen, the
 *          number the editor's per-keystroke budget rests on: the designer
 *          re-parses the whole document on every edit, and that is only
 *          acceptable while a parse costs well under 1 ms.
 * Description: Reports, never gates. CI machines vary too much for a timing
 *              assertion to mean anything, so the median of the measured runs
 *              is printed and the test asserts only that the parse is correct.
 *              Warm-up runs come first, so the median measures the optimised
 *              parser rather than the JIT's first pass.
 */

import { describe, expect, it } from 'vitest';
import { parseCst, printCst } from '../../src/core/cst/index.js';
import { allElements, stressScreen } from './cst-test-helpers.js';

const WARMUP_RUNS = 10;
const MEASURED_RUNS = 50;
const STRESS_ELEMENTS = 100;
/** The per-edit parse budget, in milliseconds. Printed beside the median, never asserted. */
const BUDGET_MS = 1;

describe('CST parse benchmark (reported, not gating)', () => {
  it(`parses the ${STRESS_ELEMENTS}-element stress screen and reports the median of ${MEASURED_RUNS} runs`, () => {
    const text = stressScreen(STRESS_ELEMENTS);

    // --- Step 1: Correctness — the bench parses what it claims to ---
    const { cst, diagnostics } = parseCst(text, 'screens/screen_departures.xml');
    expect(diagnostics).toEqual([]);
    expect(printCst(cst)).toBe(text);
    expect(allElements(cst)).toHaveLength(STRESS_ELEMENTS + 2); // plus <screen> and <view>

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
    // The middle sample for an odd count, the mean of the middle two for an even one.
    const mid = Math.floor(samples.length / 2);
    const median =
      samples.length % 2 === 1
        ? (samples[mid] ?? 0)
        : ((samples[mid - 1] ?? 0) + (samples[mid] ?? 0)) / 2;
    console.log(
      `[cst bench] parseCst(${STRESS_ELEMENTS}-element stress screen, ${text.length} bytes): ` +
        `median ${median.toFixed(4)} ms ` +
        `over ${MEASURED_RUNS} runs (min ${(samples[0] ?? 0).toFixed(4)}, ` +
        `max ${(samples.at(-1) ?? 0).toFixed(4)}); budget ${BUDGET_MS} ms`,
    );
    expect(Number.isFinite(median)).toBe(true);
  });
});
