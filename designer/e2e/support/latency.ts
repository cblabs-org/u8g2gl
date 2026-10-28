/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/support/latency.ts
 * Purpose: What the two latency gates share, said once so they cannot drift
 *          apart: the keystroke gate and the drag gate (EDITOR-DESIGN
 *          §3.4) measure the same 300 inputs per screen after the same warm-up,
 *          on the same two screens, under the same 4× throttle, against the same
 *          16 ms budget and the same 1% allowance for a missed frame.
 * Description: Constants, the 20-element screen, and the percentile arithmetic
 *              the reports use.
 *
 * Exports:
 * - SAMPLES, WARMUP:        Inputs measured per screen, and discarded first
 * - MAX_MISSED_SHARE:       The share that may miss its first frame
 * - BUDGET_MS, THROTTLE:    The p95 budget, and DevTools' CPU throttle
 * - twentyElementScreen():  The 20-element screen of framework elements
 * - Spread, spread():       Median, p95 and maximum of some milliseconds
 * - percentile(), round():  Nearest-rank percentile; two decimals
 */

/** Inputs measured per screen, after the warm-up. */
export const SAMPLES = 300;
/** Inputs made first and discarded: the JIT, Monaco's first layouts. */
export const WARMUP = 30;
/**
 * The share of inputs per screen that may miss their first frame: 1%, so 3 of
 * 300. Rounded down, so a smaller sample allows fewer.
 */
export const MAX_MISSED_SHARE = 0.01;
/** The budget, p95, in milliseconds. */
export const BUDGET_MS = 16;
/** DevTools' CPU throttling factor. */
export const THROTTLE = 4;

/** @brief A 20-element screen of framework elements: labels, boxes and rules. */
export function twentyElementScreen(): string {
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
export interface Spread {
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

/** @brief A percentile by nearest rank. */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? NaN;
}

/** @brief Two decimals, for the report. */
export const round = (value: number): number => Math.round(value * 100) / 100;

/** @brief The median, p95 and maximum of `values`, to two decimals. */
export function spread(values: readonly number[]): Spread {
  return { median: round(percentile(values, 50)), p95: round(percentile(values, 95)), max: round(Math.max(...values)) };
}
