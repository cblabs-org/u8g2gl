/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/smoke.test.ts
 * Purpose: Baseline smoke test verifying test runner and module resolution.
 * Description: Tests that Vitest executes properly and that the core module
 *              barrel resolves without error.
 */

import { describe, expect, it } from 'vitest';
import * as core from '../src/core/index.js';

describe('smoke test', () => {
  it('verifies vitest test harness runs', () => {
    expect(true).toBe(true);
  });

  it('verifies core module resolves', () => {
    expect(core).toBeDefined();
  });
});
