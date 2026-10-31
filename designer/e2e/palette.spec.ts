/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/palette.spec.ts
 * Purpose: The Palette in the real shell (ui_spec §6): the activity bar
 *          switches the primary sidebar between the Explorer and the Palette;
 *          the Palette lists the departures project's tags in their three
 *          groups, from its manifests, and its filter narrows them; and a tag
 *          dragged onto the canvas is inserted there as one new line and one
 *          undo stop, selected, or refused with the reason and nothing written.
 * Description: The departures project, which declares three widgets of its
 *              own, so every group is present. Drops use the browser's own
 *              drag and drop; the text is read back from the Monaco model.
 */

import { expect, test } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, dropTag, openFile, openShell, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('the activity bar shows the Palette: three groups from the manifests, and a filter that narrows them', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);

  // --- The Palette replaces the Explorer in the sidebar, and back ---
  await page.getByRole('button', { name: 'Palette' }).click();
  const palette = page.getByRole('complementary', { name: 'Palette' });
  await expect(palette).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Explorer' })).toHaveCount(0);
  await expect(palette.locator('.palette-group h2')).toHaveText(['Framework', 'Project', 'Drawing']);
  await expect(palette.locator('[data-group="Project"] .palette-tag')).toHaveText(['wd_probe_box', 'wd_service_list', 'wd_train_formation']);
  await expect(palette.locator('[data-group="Framework"] .palette-tag[data-tag="u8g2gl_label"]')).toBeVisible();
  await expect(palette.locator('[data-group="Drawing"] .palette-tag[data-tag="u8g2gl_line"]')).toBeVisible();

  // --- The filter narrows by name; a group left empty goes ---
  await palette.getByRole('searchbox', { name: 'Filter elements' }).fill('service');
  await expect(palette.locator('.palette-group h2')).toHaveText(['Project']);
  await expect(palette.locator('.palette-tag')).toHaveText(['wd_service_list']);
  await palette.getByRole('searchbox', { name: 'Filter elements' }).fill('zzz');
  await expect(palette.locator('.palette-note')).toHaveText(/No element matches/);

  await page.getByRole('button', { name: 'Explorer' }).click();
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
});

test('a tag dropped on the canvas is inserted at the drop point as one new line, selected, and one undo removes it', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await page.getByRole('button', { name: 'Palette' }).click();
  const before = await bufferText(page, SCREEN);

  await dropTag(page, 'u8g2gl_label', 100, 30);
  const inserted = '        <u8g2gl_label name="label_1" x="100" y="30" width="16" height="8" font="u8g2_font_6x10_mr" />';
  await expect.poll(() => bufferText(page, SCREEN)).not.toBe(before);
  const after = (await bufferText(page, SCREEN)).split('\n');
  // One new line, the view's last child, and every other line as it was.
  expect(after.filter((line) => !before.split('\n').includes(line))).toEqual([inserted]);
  expect(after.indexOf(inserted)).toBe(after.indexOf('    </view>') - 1);
  expect(await selectedNames(page)).toEqual({ file: SCREEN, names: ['label_1'] });
  // Revealed in the XML without taking focus: the canvas keeps the keyboard.
  expect(await page.evaluate(() => document.activeElement?.classList.contains('canvas-frame'))).toBe(true);

  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), SCREEN);
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('a drop that would not validate writes nothing, and the canvas says why', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: 'Palette' }).click();
  const before = await bufferText(page, SCREEN);
  // The departures project declares no image, so an xbm has no src to name.
  await dropTag(page, 'u8g2gl_xbm', 100, 30);
  await expect(page.locator('.canvas-tip')).toHaveText("Missing required attribute 'src' on <u8g2gl_xbm>.");
  expect(await bufferText(page, SCREEN)).toBe(before);
});

test('a drop on an element that has children inserts into it, relative to its corner', async ({ page }) => {
  const groups = 'screens/screen_groups.xml';
  const text = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<screen name="groups">',
    '    <view>',
    '        <u8g2gl_obj name="panel" x="40" y="10" width="80" height="40" border="true">',
    '            <u8g2gl_box name="dot" x="2" y="2" width="4" height="4" />',
    '        </u8g2gl_obj>',
    '    </view>',
    '</screen>',
    '',
  ].join('\n');
  session = await startDesign({ files: { [groups]: text } });
  await openShell(page, session.url);
  await openFile(page, groups);
  await page.getByRole('button', { name: 'Palette' }).click();
  await dropTag(page, 'u8g2gl_box', 60, 30);
  await expect.poll(() => bufferText(page, groups)).not.toBe(text);
  const lines = (await bufferText(page, groups)).split('\n');
  const inserted = '            <u8g2gl_box name="box_1" x="20" y="20" width="16" height="8" />';
  expect(lines.indexOf(inserted)).toBe(lines.indexOf('        </u8g2gl_obj>') - 1);
  expect(lines.length).toBe(text.split('\n').length + 1);
});
