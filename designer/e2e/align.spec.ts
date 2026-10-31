/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/align.spec.ts
 * Purpose: The canvas toolbar's align and distribute buttons, end to end: each
 *          of the eight, on a canvas multi-selection, rewrites only the
 *          selected elements' lines and is one undo stop; the buttons are
 *          disabled until enough of the selection can move; and an element
 *          that refuses stays, with the toolbar saying which and why.
 * Description: The departures project, frozen, and a screen of refusing
 *              elements. The selection is made by real clicks; the text and
 *              undo are the Monaco model's own.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens `file`, animation frozen. */
async function open(page: Page, file: string, files: Record<string, string> = {}): Promise<void> {
  session = await startDesign({ files });
  await openShell(page, session.url);
  await openFile(page, file);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
}

/** Undoes once, as ⌘Z does. */
async function undo(page: Page, file: string): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

const LABELS = [
  'Align left edges',
  'Align horizontal centres',
  'Align right edges',
  'Align top edges',
  'Align vertical centres',
  'Align bottom edges',
  'Distribute horizontally',
  'Distribute vertically',
];

test('each align and distribute command rewrites only the selected elements, as one undo stop', async ({ page }) => {
  await open(page, SCREEN);
  const before = await bufferText(page, SCREEN);
  for (const label of LABELS) await expect(page.getByRole('button', { name: label })).toBeDisabled();

  // plat_box, row0 and sys_clock, by clicks on their own pixels.
  await clickCanvas(page, 1, 50);
  await clickCanvas(page, 100, 8, ['Shift']);
  await clickCanvas(page, 200, 55, ['Shift']);
  expect((await selectedNames(page)).names).toEqual(['plat_box', 'row0', 'sys_clock']);

  const selectedLines = before.split('\n').filter((line) => /name="(plat_box|row0|sys_clock)"/.test(line));
  for (const label of LABELS) {
    const button = page.getByRole('button', { name: label });
    await expect(button).toBeEnabled();
    await button.click();
    const after = await bufferText(page, SCREEN);
    expect(after, label).not.toBe(before);
    const lines = after.split('\n');
    expect(lines.length).toBe(before.split('\n').length);
    const changed = before.split('\n').filter((line, i) => line !== lines[i]);
    for (const line of changed) expect(selectedLines, label).toContain(line);
    await undo(page, SCREEN);
    expect(await bufferText(page, SCREEN), label).toBe(before);
  }

  // Left edges, exactly: row0 and sys_clock to plat_box's x of 0.
  await page.getByRole('button', { name: 'Align left edges' }).click();
  const left = (await bufferText(page, SCREEN)).split('\n');
  expect(left.find((line) => line.includes('name="row0"'))).toContain('name="row0" x="0" y="0"');
  expect(left.find((line) => line.includes('name="sys_clock"'))).toContain('name="sys_clock" x="0" y="51"');
});

test('an element that refuses stays, and the toolbar says which and why; with one movable element on an axis its buttons are off', async ({ page }) => {
  const moves = 'screens/screen_moves.xml';
  const text = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<screen name="moves">',
    '    <view>',
    '        <u8g2gl_box name="free" x="10" y="40" width="20" height="10" filled="true" />',
    '        <u8g2gl_box name="far" x="60" y="50" width="20" height="10" filled="true" />',
    '        <u8g2gl_box name="calc" x="30 + 2" y="10" width="20" height="10" filled="true" />',
    '    </view>',
    '</screen>',
    '',
  ].join('\n');
  await open(page, moves, { [moves]: text });

  // free and calc: calc moves on y only, so x has one movable element.
  await clickCanvas(page, 15, 45);
  await clickCanvas(page, 40, 15, ['Shift']);
  expect((await selectedNames(page)).names).toEqual(['free', 'calc']);
  await expect(page.getByRole('button', { name: 'Align left edges' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Distribute vertically' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Align top edges' })).toBeEnabled();

  // With far: right edges to 80 moves free and far's stays; calc refuses and is named.
  await clickCanvas(page, 65, 55, ['Shift']);
  expect((await selectedNames(page)).names).toEqual(['free', 'calc', 'far']);
  await page.getByRole('button', { name: 'Align right edges' }).click();
  await expect(page.locator('.align-note')).toHaveText('Not moved: calc: x is computed from `30 + 2`');
  const after = await bufferText(page, moves);
  const changed = text.split('\n').filter((line, i) => line !== after.split('\n')[i]);
  expect(changed).toEqual(['        <u8g2gl_box name="free" x="10" y="40" width="20" height="10" filled="true" />']);
  expect(after).toContain('<u8g2gl_box name="free" x="60" y="40"');
});
