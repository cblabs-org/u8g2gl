/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/departures-project.ts
 * Purpose: Where the editor build tests find the departures project: a
 *          real project with three custom widgets, built-in fonts and a
 *          `max_len="256"` subject, kept as a fixture under
 *          `test/fixtures/departures-project/`. The tests only ever copy it.
 *
 * Exports:
 * - DEPARTURES_PROJECT:  The fixture project directory
 * - FRAMEWORK_ROOT:      The U8G2GL source tree
 */

import { resolve } from 'node:path';

/** The departures project fixture. Read-only: tests copy it to a temp directory. */
export const DEPARTURES_PROJECT = resolve(__dirname, '../../../fixtures/departures-project');

/** The U8G2GL source tree. */
export const FRAMEWORK_ROOT = resolve(__dirname, '../../../../..');
