/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/probe-project.ts
 * Purpose: Where the editor build tests find G-PROBE-2's departures project:
 *          a real project with custom widgets, built-in fonts and a
 *          `max_len="256"` subject. The tests only ever copy it.
 *
 * Exports:
 * - PROBE_PROJECT:   The project directory
 * - FRAMEWORK_ROOT:  The U8G2GL source tree
 */

import { resolve } from 'node:path';

/** G-PROBE-2's departures project. Read-only: tests copy it to a temp directory. */
export const PROBE_PROJECT = resolve(
  __dirname,
  '../../../../../.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project',
);

/** The U8G2GL source tree. */
export const FRAMEWORK_ROOT = resolve(__dirname, '../../../../..');
