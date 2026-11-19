/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/static-children.spec.ts
 * Purpose: The property panel's table of static children end to end (design_spec
 *          §6.5, ui_spec §6). Selecting a service list shows its `<column>`
 *          children as rows with each argument's own control; a committed
 *          width rewrites exactly that column's line, and one undo restores
 *          it. Adding, moving and removing a row are each one undo stop too.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project and edits through the canvas and the panel,
 *              as a user would; undo is the editor's own key.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
/** The departures screen as the fixture has it. */
const PROJECT_TEXT = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');

/** The `services` list's column lines, as the fixture writes them. */
const SERVICES_COLUMNS = [
  '            <column width="32" align="left" />',
  '            <column width="102" align="left" />',
  '            <column width="16" align="center" />',
  '            <column width="40" align="right" />',
];

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens the shell on the departures screen with a still frame and selects `services`. */
async function openOnServices(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await clickCanvas(page, 100, 57); // services: 0, 51, 190 × 13
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('services');
}

/** Undo once, with the editor's own key, as a user would. */
async function undo(page: Page): Promise<void> {
  await page.locator(`.editor-host[data-editor-path="${SCREEN}"] .view-lines`).click();
  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

/** The panel's region. */
const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties' });

/** The column table. */
const table = (page: Page) => panel(page).locator('[data-static-tag="column"]');

/** The `services` list's column lines in the buffer, in order. */
async function servicesColumns(page: Page): Promise<string[]> {
  const text = await bufferText(page, SCREEN);
  const block = /<wd_service_list name="services"[^>]*>\n([\s\S]*?)\n\s*<\/wd_service_list>/.exec(text)?.[1] ?? '';
  return block.split('\n');
}

test('the panel lists a service list’s columns, one row each, with each argument’s control', async ({ page }) => {
  await openOnServices(page);
  const rows = table(page).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(table(page).locator('thead th').evaluateAll((cells) => cells.map((c) => c.textContent))).resolves.toEqual(['width', 'align', '']);
  await expect(rows.nth(1).locator('[data-arg="width"]').getByRole('textbox', { name: 'width' })).toHaveValue('102');
  // align has three values, so it is the segmented control a three-value enum gets elsewhere.
  await expect(rows.nth(2).locator('[data-arg="align"]').getByRole('button', { name: 'center' })).toHaveAttribute('aria-pressed', 'true');
});

test('editing a column’s width rewrites that column’s line alone, and one undo restores it', async ({ page }) => {
  await openOnServices(page);
  const width = table(page).locator('tbody tr').nth(1).locator('[data-arg="width"]').getByRole('textbox', { name: 'width' });
  await width.fill('90');
  // Typing alone writes nothing.
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
  await width.press('Enter');

  await expect.poll(() => servicesColumns(page)).toEqual([SERVICES_COLUMNS[0], '            <column width="90" align="left" />', SERVICES_COLUMNS[2], SERVICES_COLUMNS[3]]);
  const before = PROJECT_TEXT.split('\n');
  const changed = (await bufferText(page, SCREEN)).split('\n').filter((line, i) => line !== before[i]);
  expect(changed).toEqual(['            <column width="90" align="left" />']);

  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});

test('adding, moving and removing a column are each one undo stop', async ({ page }) => {
  await openOnServices(page);

  // --- Add: a copy of the last column, after it ---
  await table(page).getByRole('button', { name: 'Add <column>' }).click();
  await expect.poll(() => servicesColumns(page)).toEqual([...SERVICES_COLUMNS, SERVICES_COLUMNS[3]]);
  await expect(table(page).locator('tbody tr')).toHaveCount(5);
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);

  // --- Move the first down: the first two swap ---
  await table(page).getByRole('button', { name: 'Move column 1 down' }).click();
  await expect.poll(() => servicesColumns(page)).toEqual([SERVICES_COLUMNS[1], SERVICES_COLUMNS[0], SERVICES_COLUMNS[2], SERVICES_COLUMNS[3]]);
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);

  // --- Remove the third ---
  await table(page).getByRole('button', { name: 'Remove column 3' }).click();
  await expect.poll(() => servicesColumns(page)).toEqual([SERVICES_COLUMNS[0], SERVICES_COLUMNS[1], SERVICES_COLUMNS[3]]);
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});
