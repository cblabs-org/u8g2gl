/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/element-tree.spec.ts
 * Purpose: The Explorer's element rows in the real shell (ui_spec §6): each
 *          screen's elements nested under it, in document order, from the
 *          buffer; the screen the canvas shows expanded when first shown, and
 *          the expanded screens remembered across a reload; a row selecting
 *          its element on the canvas and in the property panel, opening its
 *          screen when another is drawn, and never editing; a canvas
 *          selection lighting its row without taking the keyboard; and the
 *          tree's keys.
 * Description: The departures project, with a second screen holding a
 *              container written into the copy. Rows are read through the
 *              tree's accessible roles; the selection and the drawn screen
 *              through the test build's workspace handle.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell, selectedNames } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
const GROUPS = 'screens/screen_groups.xml';
/** A second screen: a container with two children, then a line. */
const GROUPS_TEXT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<screen name="groups">',
  '    <view>',
  '        <u8g2gl_obj name="panel" x="40" y="10" width="80" height="40" border="true">',
  '            <u8g2gl_box name="dot" x="2" y="2" width="4" height="4" />',
  '            <u8g2gl_label name="caption" x="10" y="2" width="40" height="10" font="u8g2_font_6x10_mr" text="Hi" />',
  '        </u8g2gl_obj>',
  '        <u8g2gl_line name="rule" x1="0" y1="60" x2="100" y2="60" />',
  '    </view>',
  '</screen>',
  '',
].join('\n');

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// tree
// A screen's element tree in the Explorer.
function tree(page: Page, label: string): Locator {
  return page.getByRole('complementary', { name: 'Explorer' }).getByRole('tree', { name: `Elements of ${label}` });
}

// item
// An element row by name, anywhere in the Explorer.
function item(page: Page, name: string): Locator {
  return page.getByRole('complementary', { name: 'Explorer' }).getByRole('treeitem', { name, exact: true });
}

// disclosure
// A screen's ▸ / ▾ button.
function disclosure(page: Page, label: string): Locator {
  return page.getByRole('complementary', { name: 'Explorer' }).getByRole('button', { name: new RegExp(`the elements of ${label}$`) });
}

/** The screen the canvas draws, by its frame state. */
async function drawnScreen(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.loop.frameState.get().screen);
}

/** A document's Monaco version id, which any edit moves; -1 when not open. */
async function versionId(page: Page, path: string): Promise<number> {
  return page.evaluate((p) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(p)?.getVersionId() ?? -1, path);
}

async function open(page: Page): Promise<void> {
  session = await startDesign({ files: { [GROUPS]: GROUPS_TEXT } });
  await openShell(page, session.url);
}

test('the canvas screen’s elements are listed under it, nested and in document order, with each tag; the expansion is remembered', async ({ page }) => {
  await open(page);

  // --- The drawn screen expands on first show; the other screen stays collapsed ---
  await expect(disclosure(page, 'screen_departures.xml')).toHaveAttribute('aria-expanded', 'true');
  await expect(disclosure(page, 'screen_groups.xml')).toHaveAttribute('aria-expanded', 'false');
  await expect(tree(page, 'screen_groups.xml')).toHaveCount(0);
  const departures = tree(page, 'screen_departures.xml');
  await expect(departures.locator('.element-name')).toHaveText([
    'plat_box',
    'plat_label',
    'plat_num',
    'header_sep',
    'row0',
    'message_bar',
    'formation',
    'services',
    'sys_clock',
  ]);
  await expect(departures.locator('.element-tag').first()).toHaveText('u8g2gl_box');
  await expect(departures.locator('.element-tag').last()).toHaveText('u8g2gl_clock');
  await expect(item(page, 'sys_clock').locator('svg.element-icon')).toHaveAttribute('data-icon', /.+/);

  // --- Expanded, a container nests its children one level down ---
  await disclosure(page, 'screen_groups.xml').click();
  const groups = tree(page, 'screen_groups.xml');
  await expect(groups.locator('.element-name')).toHaveText(['panel', 'dot', 'caption', 'rule']);
  await expect(item(page, 'panel')).toHaveAttribute('aria-level', '1');
  await expect(item(page, 'panel')).toHaveAttribute('aria-expanded', 'true');
  await expect(item(page, 'dot')).toHaveAttribute('aria-level', '2');
  await expect(item(page, 'rule')).toHaveAttribute('aria-level', '1');

  // --- Collapsing the departures screen is remembered across a reload ---
  await disclosure(page, 'screen_departures.xml').click();
  await expect(tree(page, 'screen_departures.xml')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false', { timeout: 20_000 });
  await expect(disclosure(page, 'screen_departures.xml')).toHaveAttribute('aria-expanded', 'false');
  await expect(disclosure(page, 'screen_groups.xml')).toHaveAttribute('aria-expanded', 'true');

  // --- The rows follow the buffer, unsaved; text that does not parse keeps them ---
  await openFile(page, GROUPS);
  const edit = (from: string, to: string): Promise<void> =>
    page.evaluate(
      ([path, a, b]) => {
        const model = (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path as string);
        model?.setValue(model.getValue().replace(a as string, b as string));
      },
      [GROUPS, from, to],
    );
  await edit('name="rule"', 'name="rule_b"');
  await expect(item(page, 'rule_b')).toBeVisible();
  await expect(item(page, 'rule')).toHaveCount(0);
  await edit('<u8g2gl_line', '<u8g2gl_li ne=');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'true');
  await expect(groups.locator('.element-name')).toHaveText(['panel', 'dot', 'caption', 'rule_b']);
});

test('a row selects its element on the canvas and in the panel, opening its screen when another is drawn, and edits nothing', async ({ page }) => {
  await open(page);
  await expect(drawnScreen(page)).resolves.toBe('departures');

  // --- A row of the drawn screen ---
  await item(page, 'sys_clock').locator('.element-row').click();
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock'] });
  await expect(item(page, 'sys_clock')).toHaveAttribute('aria-selected', 'true');
  const properties = page.getByRole('complementary', { name: 'Properties' });
  await expect(properties.locator('.panel-title')).toHaveText('u8g2gl_clock');
  await expect(page.locator('.editor-host[data-editor-path="screens/screen_departures.xml"] .selected-element').first()).toBeAttached();
  // The keyboard stays on the row.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-name'))).toBe('sys_clock');

  // --- Cmd/Ctrl-click adds, and again removes ---
  await item(page, 'plat_box').locator('.element-row').click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['sys_clock', 'plat_box'] });
  await item(page, 'sys_clock').locator('.element-row').click({ modifiers: ['Shift'] });
  await expect.poll(() => selectedNames(page)).toEqual({ file: SCREEN, names: ['plat_box'] });
  const departuresVersion = await versionId(page, SCREEN);

  // --- A row of the other screen opens it on the canvas and selects there ---
  await disclosure(page, 'screen_groups.xml').click();
  await item(page, 'caption').locator('.element-row').click();
  await expect.poll(() => drawnScreen(page)).toBe('groups');
  await expect.poll(() => selectedNames(page)).toEqual({ file: GROUPS, names: ['caption'] });
  await expect(properties.locator('.panel-title')).toHaveText('u8g2gl_label');

  // --- Nothing was written ---
  expect(await versionId(page, SCREEN)).toBe(departuresVersion);
  expect(await bufferText(page, GROUPS)).toBe(GROUPS_TEXT);
  await expect(page.locator('.file.dirty')).toHaveCount(0);
});

test('a canvas selection lights its row and scrolls it into view, keeping the keyboard on the canvas', async ({ page }) => {
  await open(page);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  const clock = item(page, 'sys_clock');
  await expect(clock).toHaveAttribute('aria-selected', 'false');

  // --- A click on the canvas lights the row; the keyboard stays on the canvas ---
  // sys_clock: 190, 51, 66 × 13. Nothing overlaps it.
  await clickCanvas(page, 220, 57);
  await expect(clock).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('canvas-frame'))).toBe(true);
  await expect(item(page, 'services')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(clock).toHaveAttribute('aria-selected', 'false');

  // --- A selection made away from the tree scrolls its row into view ---
  // A short window, so the last row starts out of the sidebar's view; the
  // canvas's own selection gesture is then made through the workspace, which
  // is what the gesture calls, since the canvas is too small to aim at.
  await page.setViewportSize({ width: 1400, height: 240 });
  await page.getByRole('complementary', { name: 'Explorer' }).evaluate((sidebar) => sidebar.scrollTo(0, 0));
  await expect(clock.locator('.element-row')).not.toBeInViewport();
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.selection.select(path, ['sys_clock'], 'canvas'), SCREEN);
  await expect(clock).toHaveAttribute('aria-selected', 'true');
  await expect(clock.locator('.element-row')).toBeInViewport();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('treeitem');
});

test('the tree’s keys: Up and Down move, Right and Left expand and collapse, Enter selects, Shift+Enter adds', async ({ page }) => {
  await open(page);
  await disclosure(page, 'screen_groups.xml').click();
  const groups = tree(page, 'screen_groups.xml');
  const focused = (): Promise<string | null | undefined> => page.evaluate(() => document.activeElement?.getAttribute('data-name'));

  // --- One row in the tab order; arrows move through the visible rows ---
  await expect(groups.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await item(page, 'panel').focus();
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('dot');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('rule');
  await page.keyboard.press('ArrowUp');
  expect(await focused()).toBe('caption');

  // --- Left goes to the parent, then collapses it; Right expands, then enters ---
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).toBe('panel');
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'panel')).toHaveAttribute('aria-expanded', 'false');
  await expect(item(page, 'dot')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('rule');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expect(item(page, 'panel')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe('dot');

  // --- Enter selects; Shift+Enter adds; moving never selects ---
  await page.keyboard.press('Enter');
  await expect.poll(() => selectedNames(page)).toEqual({ file: GROUPS, names: ['dot'] });
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => selectedNames(page)).toEqual({ file: GROUPS, names: ['dot'] });
  await page.keyboard.press('Shift+Enter');
  await expect.poll(() => selectedNames(page)).toEqual({ file: GROUPS, names: ['dot', 'caption'] });
  expect(await focused()).toBe('caption');

  // --- The file rows keep their own keys: Shift+F10 still opens a screen's menu ---
  await page.locator(`.file[data-path="${GROUPS}"]`).focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu', { name: /actions$/ })).toBeVisible();
});
