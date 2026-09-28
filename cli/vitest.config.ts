/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: vitest.config.ts
 * Purpose: Vitest test runner configuration for U8G2GL CLI and core.
 * Description: Configures test file patterns and execution environment, and
 *              builds dist/ before any test runs so the integration tests never
 *              execute a stale CLI (see test/helpers/build-dist.ts).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/helpers/build-dist.ts'],
  },
});
