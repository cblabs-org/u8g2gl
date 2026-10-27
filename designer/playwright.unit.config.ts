/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/playwright.unit.config.ts
 * Purpose: Runs the designer's unit tests — the pure modules: scheduling,
 *          diagnostics mapping, the framebuffer, sessions, project files —
 *          with Playwright's test runner and no browser. One runner for unit
 *          and end-to-end tests keeps the designer to the dependencies it was
 *          approved (no second test framework).
 * Description: Tests under `test/unit/`, in Node, in parallel.
 *
 * Exports:
 * - default: The configuration
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/unit',
  testMatch: '**/*.test.ts',
  reporter: 'list',
});
