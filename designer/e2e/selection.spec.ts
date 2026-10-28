/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/selection.spec.ts
 * Purpose: Selection both ways, end to end (ui_spec §4.3, §8; EDITOR-DESIGN
 *          §3.7): a click on the canvas selects the element drawn there and
 *          the XML editor decorates it without taking the keyboard; clicks at
 *          one pixel cycle through a stack of overlaps; a marquee selects what
 *          it touches; Esc clears; the caret selects its element and typing in
 *          it changes nothing; a rename keeps the selection. And neither
 *          direction edits the document: its version id is unchanged across
 *          every selection gesture.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project and acts through real pointer and key events
 *              on the canvas and in Monaco. Device pixels are turned into page
 *              coordinates from the frame canvas's box, so the tests hold at
 *              whatever zoom the panel fits.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { clickCanvas, dragCanvas, openFile, openShell, placeCaret, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
/** The departures screen as the fixture has it. */
const PROJECT_TEXT = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');

/** The screen document's Monaco version id, which any edit moves. */
async function versionId(page: Page): Promise<number> {
  return page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.getVersionId() ?? -1, SCREEN);
}

/** Whether the keyboard is in a Monaco editor. */
async function monacoHasFocus(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('.monaco-editor') != null);
}

/** The text of each element the screen's editor decorates as selected. */
async function decoratedText(page: Page): Promise<string[]> {
  return page.evaluate((path) => {
    const model = (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path);
    if (model === undefined) return [];
    return model
      .getAllDecorations()
      .filter((decoration) => decoration.options.className === 'selected-element')
      .map((decoration) => model.getValueInRange(decoration.range));
  }, SCREEN);
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click(); // a still frame
}

test('a click on the canvas selects the element drawn there and decorates its XML, keeping the keyboard on the canvas @cross-browser', async ({ page }) => {
  await open(page);
  const version = await versionId(page);

  // sys_clock: 190, 51, 66 × 13. Nothing overlaps it.
  await clickCanvas(page, 220, 57);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock'] });
  await expect(page.locator(`.editor-host[data-editor-path="${SCREEN}"] .selected-element`).first()).toBeAttached();
  const decorated = await decoratedText(page);
  expect(decorated).toHaveLength(1);
  expect(decorated[0]).toMatch(/^<u8g2gl_clock name="sys_clock" .*\/>$/);
  expect(await monacoHasFocus(page)).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.classList.contains('canvas-frame'))).toBe(true);

  // A click on another element moves the selection; nothing has been written.
  await clickCanvas(page, 100, 60);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['services'] });
  expect(await versionId(page)).toBe(version);
});

test('an element selected on the canvas but outside the editor’s view is scrolled into it, without an edit or taking the keyboard', async ({ page }) => {
  // A long comment ahead of the clock, so its line starts far below the editor's view.
  const padding = Array.from({ length: 200 }, (_, i) => `        <!-- spacer ${i} -->`).join('\n');
  const text = PROJECT_TEXT.replace('        <u8g2gl_clock name="sys_clock"', `${padding}\n        <u8g2gl_clock name="sys_clock"`);
  session = await startDesign({ files: { [SCREEN]: text } });
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  const lines = page.locator(`.editor-host[data-editor-path="${SCREEN}"] .view-line`);
  await expect(lines.filter({ hasText: 'name="sys_clock"' })).toHaveCount(0);
  const version = await versionId(page);

  await clickCanvas(page, 220, 57);
  await expect(lines.filter({ hasText: 'name="sys_clock"' })).toHaveCount(1);
  expect(await monacoHasFocus(page)).toBe(false);
  expect(await versionId(page)).toBe(version);
});

test('repeated clicks at one point cycle down through a stack of overlaps; a click elsewhere starts again', async ({ page }) => {
  await open(page);
  const version = await versionId(page);
  // At (10, 25): formation (drawn last) over plat_num over plat_box.
  const names: string[] = [];
  for (let i = 0; i < 4; i++) {
    await clickCanvas(page, 10, 25);
    names.push(...(await selectedNames(page)).names);
  }
  expect(names).toEqual(['formation', 'plat_num', 'plat_box', 'formation']);
  await clickCanvas(page, 10, 25);
  await clickCanvas(page, 11, 25); // another pixel: back to the top
  expect((await selectedNames(page)).names).toEqual(['formation']);
  expect(await versionId(page)).toBe(version);
});

test('a marquee selects every element it touches; Shift adds; Esc clears', async ({ page }) => {
  await open(page);
  const version = await versionId(page);
  // Across the bottom row: services (0..189) and sys_clock (190..255), below
  // header_sep (y 50). It starts in the frame's margin below the display: a
  // press on an element would move it.
  await dragCanvas(page, [200, 64.25], [180, 52]);
  expect(await selectedNames(page)).toEqual({ file: SCREEN, names: ['services', 'sys_clock'] });
  await clickCanvas(page, 4, 2, ['Shift']); // plat_box, added
  expect((await selectedNames(page)).names).toEqual(['services', 'sys_clock', 'plat_box']);
  await page.keyboard.press('Escape');
  expect((await selectedNames(page)).names).toEqual([]);
  expect(await decoratedText(page)).toEqual([]);
  // A click on no element also clears.
  await clickCanvas(page, 100, 60);
  await clickCanvas(page, -3, -3);
  expect((await selectedNames(page)).names).toEqual([]);
  expect(await versionId(page)).toBe(version);
});

test('the caret selects its element; typing inside it keeps the selection, and a rename follows it', async ({ page }) => {
  await open(page);
  const version = await versionId(page);
  await placeCaret(page, SCREEN, 'bind_text="platform"', 'bind_text="plat'.length);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['plat_num'] });
  // Moving the caret is not an edit.
  expect(await versionId(page)).toBe(version);

  // The canvas selects another element; typing at the caret, still in
  // plat_num, does not take the selection back.
  await clickCanvas(page, 220, 57);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock'] });
  // Focus the editor's input without a click, which would move the caret.
  await page.locator(`.editor-host[data-editor-path="${SCREEN}"]`).locator('.native-edit-context, textarea.inputarea').first().focus();
  expect(await monacoHasFocus(page)).toBe(true);
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  expect(await versionId(page)).toBeGreaterThan(version);
  expect((await selectedNames(page)).names).toEqual(['sys_clock']);

  // The caret moved into another element selects it; renaming it by typing
  // keeps it selected under the new name.
  await placeCaret(page, SCREEN, 'name="message_bar"', 'name="message_bar'.length);
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['message_bar'] });
  await page.keyboard.type('_2');
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['message_bar_2'] });
});
