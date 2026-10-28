/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/test-hooks.ts
 * Purpose: What the end-to-end tests reach into the page through, kept out of
 *          the production designer. The handle gives a script the whole
 *          workspace — the project file system, which holds the session token,
 *          and the loaded editor Wasm — so it exists only in the test build
 *          (`vite build --mode e2e`). `main.tsx` imports this module only behind
 *          `__U8G2GL_TEST_HOOKS__`, which a production build sets to `false`,
 *          so neither this module nor the keystroke probe reaches its bundle.
 * Description: Installs the keystroke probe and publishes the workspace as
 *              `window.__u8g2gl`, and the shell's render counts.
 *              `TestHandle` is the handle's one typed description, which the
 *              tests import rather than restating it.
 *
 * Exports:
 * - TestHandle:          The window properties the test build adds
 * - installTestHooks():  Add them
 */

import { installKeystrokeProbe, type KeystrokeProbe } from './perf/keystroke-probe';
import { renderCounts } from './perf/render-count';
import type { Workspace } from './workspace';

/** The window properties the test build adds. */
export interface TestHandle {
  /** The session's workspace. */
  readonly __u8g2gl: Workspace;
  /** The keystroke probe's samples. */
  readonly __u8g2glPerf: KeystrokeProbe;
  /** Each shell component's render count so far (`perf/render-count.ts`). */
  readonly __u8g2glRenders: () => Record<string, number>;
}

/**
 * @brief Installs the probe and publishes the workspace for the tests.
 *
 * Called before `workspace.start()`, so the probe is listening before the
 * first frame and the first key.
 */
export function installTestHooks(workspace: Workspace): void {
  const probe = installKeystrokeProbe(workspace.loop, workspace.documents);
  Object.assign(window, { __u8g2gl: workspace, __u8g2glPerf: probe, __u8g2glRenders: renderCounts } satisfies TestHandle);
}
