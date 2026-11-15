/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/build-problems.spec.ts
 * Purpose: Problems says each fault once, and only while it is current. A pin
 *          written into `u8g2gl.xml` on disk fails the project's editor build,
 *          whose text repeats the live refusal; Problems shows the refusal
 *          alone. A refused test run's problems go at the next edit, as its
 *          mismatch overlay does, while its verdict stays, marked stale
 *          (ui_spec, Problems).
 * Description: Both need the project renderer, so they need Emscripten 5.0.3
 *              on PATH and skip with a message without it. The editor build's
 *              failure is the real server's; the refused run's record is
 *              served in the page, since nothing a valid project does makes
 *              the real server refuse a run the canvas could draw.
 */

import { expect, test, type Page } from '@playwright/test';
import { emscriptenOnPath, PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { openFile, openShell, placeCaret } from './support/shell';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Every Problems row's code, as the panel holds them. */
async function problemCodes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.problems.get().map((row) => row.code));
}

test('a pin written into u8g2gl.xml on disk is one problem once the editor build has failed, not two', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  const project = readFileSync(join(PROJECT_FIXTURE, 'u8g2gl.xml'), 'utf8').replace('rotation="R0" />', 'rotation="R0" cs="5" />');
  session = await startDesign({ toolchain: true, files: { 'u8g2gl.xml': project } });
  await openShell(page, session.url);

  // The build runs `generate`, which refuses the pin as the live pipeline does.
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'failed', { timeout: 400_000 });
  await expect(page.locator('.problem[data-code="U8G2GL_REMOVED_ATTRIBUTE"]')).toHaveCount(1);
  expect(await problemCodes(page)).toEqual(['U8G2GL_REMOVED_ATTRIBUTE']);
  await expect(page.locator('.problem[data-code="U8G2GL_EDITOR_BUILD"]')).toHaveCount(0);
});

test("after a refused test run, an edit clears the run's problems; the verdict stays, marked stale", async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await expect(page.locator('.run-button')).toHaveAttribute('data-availability', 'ready');

  // --- The run's record: refused, with one located compiler error ---
  await page.route('**/api/build/test-run', (route) => route.fulfill({ json: { id: 'refused-run', status: 'queued' } }));
  await page.route('**/api/build/refused-run', (route) =>
    route.fulfill({
      json: {
        id: 'refused-run',
        status: 'failed',
        error: "error: widgets/wd_probe_box/wd_probe_box.cpp:12:5\n   expected ';' after expression",
      },
    }),
  );
  await page.locator('.run-button').click();
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'failed', { timeout: 60_000 });
  await expect(page.locator('.problem[data-code="U8G2GL_TEST_RUN_BUILD"]')).toHaveCount(1);

  // --- One edit: the run's problem goes, its verdict stays ---
  await openFile(page, SCREEN);
  await placeCaret(page, SCREEN, 'name="sys_clock"');
  await page.keyboard.type(' ');
  await expect(page.locator('.problem[data-code="U8G2GL_TEST_RUN_BUILD"]')).toHaveCount(0);
  await expect(page.locator('.verdict')).toHaveAttribute('data-verdict', 'failed');
  await expect(page.locator('.verdict')).toContainText('1 edit since');
});
