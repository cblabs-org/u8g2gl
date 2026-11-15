/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/departures-project.test.ts
 * Purpose: Keeps the departures fixture an input only. Every test copies it
 *          and generates afresh, so committed `generated/` or
 *          `generated_editor/` output in it would be a second copy of
 *          generator output that nothing checks, and would only drift. One
 *          stale since CLI 0.13.1 is why this test exists.
 * Description: Fails if either directory is present, as a stray
 *              `u8g2gl generate` run inside the fixture would leave it.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPARTURES_PROJECT } from './departures-project.js';

describe('the departures fixture holds no generated output', () => {
  it.each(['generated', 'generated_editor'])('%s/ is absent', (dir) => {
    expect(existsSync(join(DEPARTURES_PROJECT, dir))).toBe(false);
  });
});
