/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/panel-probe.ts
 * Purpose: Measures the property panel's share of a frame, which the shell's
 *          8 ms slice bounds (EDITOR-DESIGN §3.3): the controller's update
 *          after a pipeline run, plus the React render and commit of whatever
 *          panel component that update changed. A drag rewrites one attribute
 *          every frame, so this is the panel's cost per frame of a drag.
 * Description: Like `render-count.ts`, it counts only in the end-to-end test
 *              build: every function tests `__U8G2GL_TEST_HOOKS__` first, which
 *              a production build defines as `false`. Each controller update
 *              opens a sample. A panel component's render notes the first
 *              render start after it, and its layout effect the last commit,
 *              so the sample is the update's own time plus the span from the
 *              first panel render to the last panel commit that followed it —
 *              React renders an external store's change in a microtask after
 *              the update, inside the same frame. The test build publishes
 *              the samples through `test-hooks.ts`.
 *
 * Exports:
 * - PanelSample:           One update's cost, in milliseconds
 * - panelUpdateStarted():  The controller begins an update
 * - panelUpdateEnded():    It has finished
 * - panelRenderStarted():  A panel component begins to render
 * - panelCommitted():      A panel component's render has been committed
 * - panelSamples():        Every sample so far
 * - resetPanelSamples():   Clear them
 */

/// <reference path="../build-flags.d.ts" />

/** One controller update and the panel rendering it caused. */
export interface PanelSample {
  /** The controller's update, from the run's result to every field's state set. */
  readonly update: number;
  /** From the first panel render after the update to the last panel commit; 0 if nothing rendered. */
  readonly render: number;
  /** The two together: the panel's share of the frame. */
  readonly total: number;
}

/** An update being measured. */
interface OpenSample {
  readonly start: number;
  end: number;
  renderStart: number | undefined;
  committed: number | undefined;
}

/** Samples kept; a session that runs long keeps only the latest. */
const LIMIT = 5000;
const samples: OpenSample[] = [];

/** @brief The controller begins an update: a new sample. */
export function panelUpdateStarted(): void {
  if (__U8G2GL_TEST_HOOKS__) {
    samples.push({ start: performance.now(), end: 0, renderStart: undefined, committed: undefined });
    if (samples.length > LIMIT) samples.shift();
  }
}

/** @brief The controller's update has finished. */
export function panelUpdateEnded(): void {
  if (__U8G2GL_TEST_HOOKS__) {
    const current = samples.at(-1);
    if (current !== undefined) current.end = performance.now();
  }
}

/** @brief A panel component begins to render. */
export function panelRenderStarted(): void {
  if (__U8G2GL_TEST_HOOKS__) {
    const current = samples.at(-1);
    if (current !== undefined && current.renderStart === undefined) current.renderStart = performance.now();
  }
}

/** @brief A panel component's render has been committed (its layout effect ran). */
export function panelCommitted(): void {
  if (__U8G2GL_TEST_HOOKS__) {
    const current = samples.at(-1);
    if (current !== undefined) current.committed = performance.now();
  }
}

/** @brief Every closed sample so far, oldest first. */
export function panelSamples(): PanelSample[] {
  return samples
    .filter((sample) => sample.end > 0)
    .map((sample) => {
      const update = sample.end - sample.start;
      const render = sample.renderStart !== undefined && sample.committed !== undefined ? sample.committed - sample.renderStart : 0;
      return { update, render, total: update + render };
    });
}

/** @brief Clears the samples, to measure from now. */
export function resetPanelSamples(): void {
  samples.length = 0;
}
