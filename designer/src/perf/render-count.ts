/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/render-count.ts
 * Purpose: Lets a test prove the per-frame rule (EDITOR-DESIGN §3.3): a change
 *          re-renders only the components whose data changed. Each shell
 *          component counts its own renders, so a test can make a change and
 *          see exactly which components rendered for it.
 * Description: A count per component name, kept only in the end-to-end test
 *              build: `countRender` tests `__U8G2GL_TEST_HOOKS__` first, which a
 *              production build defines as `false`, so there the call does
 *              nothing and the counting is removed. The test build publishes
 *              `renderCounts` through `test-hooks.ts`.
 *
 * Exports:
 * - countRender():   Count one render of a component
 * - renderCounts():  Every component's count so far
 */

// The build flag's declaration, for the end-to-end tests' compile, which reaches
// this module through test-hooks.ts without the rest of src/.
/// <reference path="../build-flags.d.ts" />

/** Renders per component, in the test build only. */
const counts = new Map<string, number>();

/** @brief Counts one render of `component`; nothing outside the test build. */
export function countRender(component: string): void {
  if (__U8G2GL_TEST_HOOKS__) {
    counts.set(component, (counts.get(component) ?? 0) + 1);
  }
}

/** @brief Every component's render count so far, by name. */
export function renderCounts(): Record<string, number> {
  return Object.fromEntries(counts);
}
