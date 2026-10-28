/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/manipulation.spec.ts
 * Purpose: Direct manipulation on the canvas, end to end (EDITOR-DESIGN
 *          §3.2–§3.6, ui_spec §8): a press on an element moves it, written
 *          into the text through Monaco's own undo stack; a drag is one undo
 *          stop and the arrow keys' nudges group as typing does; and while the
 *          XML is not well-formed no gesture writes, and the cursor says why.
 * Description: The departures project, frozen. Gestures are real mouse and
 *              key events; the text is read back from the Monaco model, and
 *              undo is the model's own, so the stops counted are Monaco's.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, devicePoint, dragCanvas, openFile, openShell, placeCaret, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
}

/** Undoes once on the screen's Monaco model, as ⌘Z does. */
async function undo(page: Page): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), SCREEN);
}

/** The line of the buffer that names `name`. */
async function lineOf(page: Page, name: string): Promise<string> {
  return (await bufferText(page, SCREEN)).split('\n').find((line) => line.includes(`name="${name}"`)) ?? '';
}

test('dragging an element rewrites its x and y in the text, as one undo stop', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SCREEN);
  // row0: x="32" y="0", 224 × 16. Pressed at (100, 8) and dragged 6 right, 3 down.
  await dragCanvas(page, [100, 8], [106, 11]);
  expect(await lineOf(page, 'row0')).toContain('name="row0" x="38" y="3"');
  expect((await selectedNames(page)).names).toEqual(['row0']);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 38,3 224×16');
  await undo(page);
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('arrow keys nudge the selection 1 px, Shift 8 px; nudges in quick succession are one undo stop', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SCREEN);
  await clickCanvas(page, 100, 8);
  expect((await selectedNames(page)).names).toEqual(['row0']);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await lineOf(page, 'row0')).toContain('name="row0" x="35" y="8"');
  await undo(page);
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('a click on an element selects it without writing; a click on empty canvas still clears', async ({ page }) => {
  await open(page);
  const version = await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.getVersionId(), SCREEN);
  await clickCanvas(page, 100, 8);
  expect((await selectedNames(page)).names).toEqual(['row0']);
  await clickCanvas(page, -3, -3);
  expect((await selectedNames(page)).names).toEqual([]);
  expect(await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.getVersionId(), SCREEN)).toBe(version);
});

test('while the XML is not well-formed no gesture writes, and the cursor and its tip say why', async ({ page }) => {
  await open(page);
  // A stray '<' at the start of the clock's line: the document no longer parses.
  await placeCaret(page, SCREEN, '<u8g2gl_clock', 0);
  await page.keyboard.type('<');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'true');
  const broken = await bufferText(page, SCREEN);

  // Hovering an element says why a press would do nothing.
  const over = await devicePoint(page, 100, 8);
  await page.mouse.move(over.x, over.y);
  await expect(page.locator('.canvas-frame')).toHaveAttribute('title', /not well-formed/);
  expect(await page.locator('.canvas-frame').evaluate((element) => element.style.cursor)).toBe('not-allowed');

  // A drag selects but writes nothing, and the tip at the pointer says why.
  const end = await devicePoint(page, 110, 12);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(page.locator('.canvas-tip')).toBeVisible();
  await expect(page.locator('.canvas-tip')).toHaveText(/Canvas editing is off: the XML is not well-formed/);
  await page.mouse.up();
  await expect(page.locator('.canvas-tip')).toBeHidden();
  expect((await selectedNames(page)).names).toEqual(['row0']);
  expect(await bufferText(page, SCREEN)).toBe(broken);

  // Nor does a nudge.
  await page.keyboard.press('ArrowRight');
  expect(await bufferText(page, SCREEN)).toBe(broken);

  // Once it parses again, the same drag writes.
  await placeCaret(page, SCREEN, '<<u8g2gl_clock', 1);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await dragCanvas(page, [100, 8], [104, 8]);
  expect(await lineOf(page, 'row0')).toContain('name="row0" x="36" y="0"');
});
