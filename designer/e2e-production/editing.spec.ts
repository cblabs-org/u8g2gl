/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e-production/editing.spec.ts
 * Purpose: The production designer edits and renders: an edit to an element's
 *          `x` in Monaco reaches the canvas in the next frame, with no test
 *          hook in the page. It also checks the hooks really are absent.
 * Description: Only what a user can do and see: the explorer, the Monaco
 *              editor's own text, keys, and the canvas's pixels and frame
 *              attributes. The caret is placed by double-clicking the value's
 *              token on row0's line, which selects the number. Without a
 *              toolchain row0 is a placeholder drawn at its rectangle, so
 *              moving it moves pixels.
 */

import { expect, test } from '@playwright/test';
import { startDesign, type DesignSession } from '../e2e/support/design-session';
import { canvasPixels, frameInfo, nextFrames, openFile } from '../e2e/support/shell';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('the production build: editing x on row0 moves it on the canvas in the next frame, with no test hooks', async ({ page }) => {
  session = await startDesign({ build: 'production' });
  await page.goto(session.url);
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false', { timeout: 20_000 });
  expect(await page.evaluate(() => '__u8g2gl' in window || '__u8g2glPerf' in window)).toBe(false);

  await openFile(page, SCREEN);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', /none|current|failed/, { timeout: 30_000 });
  await page.getByRole('button', { name: /live/ }).click(); // freeze: a still frame to compare

  // Select row0's x value, "32", by double-clicking its token in the editor.
  const line = page.locator('.view-line', { hasText: 'name="row0"' });
  await line.locator('span', { hasText: /^"32"$/ }).first().dblclick();
  await nextFrames(page, 2);
  const before = await frameInfo(page);
  const pixelsBefore = await canvasPixels(page);
  await page.keyboard.press('4');
  await nextFrames(page, 1);

  await expect(page.locator('.view-line', { hasText: 'name="row0"' })).toContainText('x="4"');
  const after = await frameInfo(page);
  expect(after.frame).toBeGreaterThan(before.frame);
  expect(after.stale).toBe(false);
  expect(await canvasPixels(page)).not.toBe(pixelsBefore);
});
