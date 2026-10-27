/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/playwright.config.ts
 * Purpose: The designer's end-to-end suite: E1 e1–e8 against the real
 *          `u8g2gl design`, the built designer and a real browser. Served mode
 *          must need nothing Chromium-only (e7), so the editing test also runs
 *          in Firefox and WebKit, Safari's engine.
 * Description: Headless always: no window opens on the desktop. One worker,
 *              because the e2 performance test measures milliseconds and must
 *              not share the machine with another test's browser. Chromium runs
 *              every test; Firefox and WebKit run those tagged `@cross-browser`.
 *              Each test starts and stops its own server (`e2e/support/`).
 *
 * Exports:
 * - default: The configuration
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { headless: true, viewport: { width: 1400, height: 820 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 820 } } },
    { name: 'firefox', grep: /@cross-browser/, use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 820 } } },
    { name: 'webkit', grep: /@cross-browser/, use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 820 } } },
  ],
});
