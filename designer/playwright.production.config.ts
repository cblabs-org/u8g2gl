/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/playwright.production.config.ts
 * Purpose: Runs the editing test against the **production** designer build,
 *          the one users are served, which has no test hooks. The main suite
 *          needs the test build; this proves the shipped build works without
 *          them, in all three engines.
 * Description: The `e2e-production/` tests, headless, one worker, Chromium,
 *              Firefox and WebKit. `designer/dist` must be `npm run build`'s.
 *
 * Exports:
 * - default: The configuration
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-production',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  outputDir: 'test-results/production',
  use: { headless: true, viewport: { width: 1400, height: 820 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 820 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 820 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 820 } } },
  ],
});
