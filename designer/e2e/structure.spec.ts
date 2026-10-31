/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/structure.spec.ts
 * Purpose: Delete and duplicate from the canvas, end to end: Delete removes
 *          the selected elements' lines as one undo stop, one or several; an
 *          Alt-drag inserts a renamed copy after each selected element and
 *          moves the copies, the originals untouched, as one undo stop, and a
 *          copy refuses an axis as a move would.
 * Description: The departures project, frozen, with a screen of refusing
 *              elements for the last test. Real mouse and key events; the text
 *              and undo are the Monaco model's own.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, devicePoint, openFile, openShell, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens `file` in the shell, animation frozen. */
async function open(page: Page, file = SCREEN, files: Record<string, string> = {}): Promise<void> {
  session = await startDesign({ files });
  await openShell(page, session.url);
  await openFile(page, file);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
}

/** Undoes once, as ⌘Z does. */
async function undo(page: Page, file = SCREEN): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

/** Lines in `after` that `before` lacks, and lines of `before` that `after` lacks. */
function diff(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  return { added: b.filter((line) => !a.includes(line)), removed: a.filter((line) => !b.includes(line)) };
}

/** Alt-drags from one device pixel to another. */
async function altDrag(page: Page, from: readonly [number, number], to: readonly [number, number]): Promise<void> {
  const start = await devicePoint(page, from[0], from[1]);
  const end = await devicePoint(page, to[0], to[1]);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
}

test('Delete removes the selected element’s line; with two selected, both; each is one undo stop', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SCREEN);
  const row0 = before.split('\n').find((line) => line.includes('name="row0"')) ?? '';
  const clock = before.split('\n').find((line) => line.includes('name="sys_clock"')) ?? '';

  await clickCanvas(page, 100, 8);
  await page.keyboard.press('Delete');
  expect(diff(before, await bufferText(page, SCREEN))).toEqual({ added: [], removed: [row0] });
  expect((await selectedNames(page)).names).toEqual([]);
  await undo(page);
  expect(await bufferText(page, SCREEN)).toBe(before);

  await clickCanvas(page, 100, 8);
  await clickCanvas(page, 200, 55, ['Shift']);
  expect((await selectedNames(page)).names).toEqual(['row0', 'sys_clock']);
  await page.keyboard.press('Backspace');
  expect(diff(before, await bufferText(page, SCREEN))).toEqual({ added: [], removed: [row0, clock] });
  await undo(page);
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('an Alt-drag duplicates: a renamed copy after the original, moved, selected; one undo removes it', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SCREEN);
  // row0: x="32" y="0", 224 × 16; Alt-dragged 6 right and 3 down.
  await altDrag(page, [100, 8], [106, 11]);
  const after = await bufferText(page, SCREEN);
  const lines = after.split('\n');
  const copy = '        <wd_service_list name="service_list_1" x="38" y="3" width="224" height="16" font="u8g2_font_6x10_mr" max_rows="1" />';
  expect(diff(before, after)).toEqual({ added: [copy], removed: [] });
  expect(lines.indexOf(copy)).toBe(lines.findIndex((line) => line.includes('name="row0"')) + 1);
  expect((await selectedNames(page)).names).toEqual(['service_list_1']);
  await undo(page);
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('an Alt-drag copy of a bound element refuses that axis, as a move does, and says why', async ({ page }) => {
  const moves = 'screens/screen_moves.xml';
  const text = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<screen name="moves">',
    '    <view>',
    '        <u8g2gl_box name="tied" x="80" y="0" bind_y="box_fill" width="20" height="10" filled="true" />',
    '    </view>',
    '</screen>',
    '',
  ].join('\n');
  await open(page, moves, { [moves]: text });
  const start = await devicePoint(page, 85, 4);
  const end = await devicePoint(page, 95, 20);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator('.canvas-tip')).toHaveText('y is bound to `box_fill`');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(diff(text, await bufferText(page, moves)).added).toEqual(['        <u8g2gl_box name="box_1" x="90" y="0" bind_y="box_fill" width="20" height="10" filled="true" />']);
});
