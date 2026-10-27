/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/editing.spec.ts
 * Purpose: E1 e1, e6 and e8 end to end: an edit in Monaco reaches the canvas in
 *          the next frame — in Chromium, Firefox and WebKit (e7) — a Problems
 *          row lands the caret on the fault, and with no toolchain the project
 *          still opens with framework elements drawn, project widgets as
 *          placeholders, and the status bar saying why. With Emscripten on the
 *          runner's PATH, the project's own renderer replaces the placeholders.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project. Without a toolchain the canvas draws with the
 *              framework editor Wasm, where `row0` (a project widget) is a
 *              placeholder at its real rectangle, so moving it moves pixels.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { emscriptenOnPath, PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, canvasPixels, frameInfo, nextFrames, openFile, openShell, placeCaret } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';

/** The placeholders the canvas drew, as the page reports them. */
async function placeholders(page: import('@playwright/test').Page): Promise<{ name: string; tag: string; rect: number[] }[]> {
  return page.evaluate(() => (window as unknown as { __u8g2gl: { loop: { frameState: { get(): { placeholders: { name: string; tag: string; rect: number[] }[] } } } } }).__u8g2gl.loop.frameState.get().placeholders);
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('e1: editing x on row0 in Monaco moves it on the canvas in the next frame @cross-browser', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  // Settled: the build request has answered, so nothing but the keystroke books a run.
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', /none|current|failed/, { timeout: 30_000 });
  await page.getByRole('button', { name: /live/ }).click(); // freeze: a still frame to compare
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  expect((await placeholders(page)).find((p) => p.name === 'row0')?.rect).toEqual([32, 0, 224, 16]);

  // One keystroke: "32" selected and replaced by "4".
  await placeCaret(page, SCREEN, 'name="row0" x="', 'name="row0" x="'.length);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await nextFrames(page, 2);
  const before = await frameInfo(page);
  const pixelsBefore = await canvasPixels(page);
  await page.keyboard.press('4');
  await nextFrames(page, 1);

  expect(await bufferText(page, SCREEN)).toContain('name="row0" x="4" y="0"');
  // One animation frame after the key, the canvas already shows the edit.
  const after = await frameInfo(page);
  expect(after.frame).toBeGreaterThan(before.frame);
  expect(after.stale).toBe(false);
  expect((await placeholders(page)).find((p) => p.name === 'row0')?.rect).toEqual([4, 0, 224, 16]);
  expect(await canvasPixels(page)).not.toBe(pixelsBefore);
});

test('e6: a Problems row opens the file with the caret at its line and column', async ({ page }) => {
  const original = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');
  session = await startDesign({ files: { [SCREEN]: original.replace('name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_helvR08_tr"', 'name="plat_label" x="5" y="6" width="18" height="13" font="no_such_font"') } });
  await page.goto(session.url);
  const row = page.locator('.problem[data-code="U8G2GL_UNKNOWN_FONT"]');
  await expect(row).toBeVisible({ timeout: 20_000 });
  const where = (await row.locator('.where').textContent()) ?? '';
  const [, file = '', line = '0', column = '0'] = /^(.+):(\d+):(\d+)$/.exec(where) ?? [];
  expect(file).toBe(SCREEN);

  await row.click();
  await expect(page.locator(`.editor-host[data-editor-path="${SCREEN}"] .monaco-editor`)).toBeVisible();
  await page.keyboard.type('Z');
  const lines = (await bufferText(page, SCREEN)).split('\n');
  expect(lines[Number(line) - 1]?.[Number(column) - 1]).toBe('Z');
  // The caret landed on the fault: the font name, which is what the diagnostic is about.
  expect(lines[Number(line) - 1]?.slice(Number(column))).toMatch(/^no_such_font"/);
});

test('e8: with no toolchain the project opens, framework elements render, project widgets are placeholders, and the status bar says why', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  const status = page.locator('.status-item.wasm');
  await expect(status).toHaveAttribute('data-wasm', 'none', { timeout: 30_000 });
  await expect(status).toContainText('no toolchain');
  await expect(status).toContainText('u8g2gl toolchain install');

  const drawn = await placeholders(page);
  expect(drawn.map((p) => `${p.name}:${p.tag}`).sort()).toEqual(['formation:wd_train_formation', 'row0:wd_service_list', 'services:wd_service_list']);
  const frame = await frameInfo(page);
  expect(frame.stale).toBe(false);
  // The framework elements are drawn: the platform box and label, the rule, the
  // clock. The placeholders alone would light far fewer.
  expect(frame.lit).toBeGreaterThan(1000);
  await expect(page.locator('.placeholder-note')).toContainText('3 elements shown as placeholders');
});

test('with Emscripten 5.0.3 on PATH, the project renderer replaces the placeholders', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(420_000);
  session = await startDesign({ toolchain: true });
  await openShell(page, session.url);
  const status = page.locator('.status-item.wasm');
  await expect(status).toHaveAttribute('data-wasm', 'current', { timeout: 400_000 });
  await expect(status).toContainText(/current [0-9a-f]{8}/);
  await expect.poll(async () => (await placeholders(page)).length).toBe(0);
});
