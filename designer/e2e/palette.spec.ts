/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/palette.spec.ts
 * Purpose: The Palette in the real shell (ui_spec §6): the activity bar
 *          switches the primary sidebar between the Explorer and the Palette;
 *          the Palette lists the departures project's elements in their three
 *          groups, filed by category and shown by label and description, from
 *          its manifests; its filter matches a description; a keystroke or a
 *          drag re-renders none of it; and a tag
 *          dragged onto the canvas is inserted there as one new line and one
 *          undo stop, selected, or refused with the reason and nothing written.
 * Description: The departures project, which declares three widgets of its
 *              own, so every group is present. Drops use the browser's own
 *              drag and drop; the text is read back from the Monaco model.
 */

import { expect, test } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, dragCanvas, dropTag, nextFrames, openFile, openShell, placeCaret, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('the activity bar shows the Palette: three groups from the manifests, filed by category, and a filter that narrows them', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);

  // --- The Palette replaces the Explorer in the sidebar, and back ---
  await page.getByRole('button', { name: 'Palette' }).click();
  const palette = page.getByRole('complementary', { name: 'Palette' });
  await expect(palette).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Explorer' })).toHaveCount(0);
  await expect(palette.locator('.palette-group h2')).toHaveText(['Framework', 'Project', 'Drawing']);
  const tags = (group: string): Promise<string[]> =>
    palette.locator(`[data-group="${group}"] .palette-tag`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tag') ?? ''));
  await expect.poll(() => tags('Project')).toEqual(['wd_service_list', 'wd_probe_box', 'wd_train_formation']);
  await expect(palette.locator('[data-group="Framework"] .palette-tag[data-tag="u8g2gl_label"]')).toBeVisible();
  await expect(palette.locator('[data-group="Drawing"] .palette-tag[data-tag="u8g2gl_line"]')).toBeVisible();

  // --- Categories head each group's entries; the project's follow the framework's order ---
  await expect(palette.locator('[data-group="Project"] .palette-category h3')).toHaveText(['Text', 'Indicators']);
  await expect(palette.locator('[data-group="Drawing"] .palette-category h3')).toHaveText(['Drawing']);
  await expect(palette.locator('[data-group="Framework"] .palette-category h3')).not.toHaveCount(0);

  // --- A project widget's entry: its label, its tag muted beside it, its description beneath ---
  const serviceList = palette.locator('.palette-tag[data-tag="wd_service_list"]');
  await expect(serviceList.locator('.palette-label')).toHaveText('Service list');
  await expect(serviceList.locator('.palette-tag-name')).toHaveText('wd_service_list');
  await expect(serviceList.locator('.palette-description')).toHaveText(/one service per row/);

  // --- The filter narrows by name; a group left empty goes ---
  const filter = palette.getByRole('searchbox', { name: 'Filter elements' });
  await filter.fill('service');
  await expect(palette.locator('.palette-group h2')).toHaveText(['Project']);
  await expect.poll(() => tags('Project')).toEqual(['wd_service_list']);
  // --- …and matches a description, where neither the tag nor the label has the word ---
  await filter.fill('ROUNDED CORNERS');
  await expect(palette.locator('.palette-group h2')).toHaveText(['Drawing']);
  await expect.poll(() => tags('Drawing')).toEqual(['u8g2gl_box']);
  await filter.fill('zzz');
  await expect(palette.locator('.palette-note')).toHaveText(/No element matches/);

  await page.getByRole('button', { name: 'Explorer' }).click();
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
});

test('the Palette does not re-render on a keystroke or a drag, and does when its own filter changes', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await page.getByRole('button', { name: 'Palette' }).click();
  const palette = page.getByRole('complementary', { name: 'Palette' });
  await expect(palette.locator('.palette-tag[data-tag="wd_service_list"]')).toBeVisible();
  const renders = async (): Promise<number> => (await page.evaluate(() => (window as unknown as TestHandle).__u8g2glRenders())).Palette ?? 0;
  // Settle: the Wasm status and the first frames have rendered what they will.
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', /none|current|failed/, { timeout: 30_000 });
  await nextFrames(page, 3);

  // --- Keystrokes in the XML: each re-runs the pipeline, none changes a manifest ---
  const beforeTyping = await renders();
  await placeCaret(page, SCREEN, 'name="row0" x="3', 'name="row0" x="3'.length);
  const typed: string[] = [];
  for (const key of ['3', 'Backspace', '4', 'Backspace']) {
    await page.keyboard.press(key);
    await nextFrames(page, 2);
    typed.push((await bufferText(page, SCREEN)).match(/name="row0" x="(\d+)"/)?.[1] ?? '');
  }
  // The keystrokes reached the document: row0's x went 332, 32, 342, 32.
  expect(typed).toEqual(['332', '32', '342', '32']);
  const afterTyping = await renders();

  // --- A drag on the canvas: row0 moved and back ---
  await dragCanvas(page, [100, 8], [106, 11]);
  await nextFrames(page, 2);
  await expect.poll(() => bufferText(page, SCREEN)).toContain('name="row0" x="38" y="3"');
  await dragCanvas(page, [106, 11], [100, 8]);
  await nextFrames(page, 3);
  const afterDrag = await renders();
  console.log(`Palette renders: typing ${afterTyping - beforeTyping}, dragging ${afterDrag - afterTyping}`);
  expect(afterTyping - beforeTyping).toBe(0);
  expect(afterDrag - afterTyping).toBe(0);

  // --- The self-test: the count does move for the Palette's own state ---
  await palette.getByRole('searchbox', { name: 'Filter elements' }).fill('line');
  await expect.poll(renders).toBeGreaterThan(afterDrag);
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
