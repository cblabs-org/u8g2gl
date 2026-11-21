/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/subjects-table.spec.ts
 * Purpose: globals.xml's subjects table end to end (ui_spec §6.4): each
 *          subject shows its cost and who binds it; a click on a binding
 *          selects that element on its screen; removing a subject still bound
 *          is refused, naming the binding; and an edit in the table is a text
 *          edit that one undo takes back.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, whose `platform` is bound by `plat_num` and whose
 *              `box_fill` is bound by nothing. Undo is the Monaco model's own,
 *              through the test handle.
 */

import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell, selectedNames } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// table
// The globals.xml form's subjects table.
const table = (page: Page) => page.locator('.project-form[data-form-file="globals.xml"] table.subjects-table');

// row
// One subject's row.
const row = (page: Page, name: string) => table(page).locator(`tr[data-subject="${name}"]`);

// open
// The session, with globals.xml's form shown.
async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
}

test('the table shows each subject’s type, boot value, cost and users', async ({ page }) => {
  await open(page);
  await expect(table(page).locator('th[data-column="value"]')).toContainText('Initial value');
  await expect(table(page).locator('th[data-column="value"] .field-info')).toHaveAttribute('title', /compiled in/);
  await expect(row(page, 'platform').locator('[data-column="type"]')).toHaveText('string');
  await expect(row(page, 'platform').getByRole('textbox', { name: 'value' })).toHaveValue('9');
  await expect(row(page, 'platform').locator('.subject-cost')).toHaveAttribute('data-bytes', '9');
  await expect(row(page, 'box_fill').locator('.subject-cost')).toHaveCount(0);
  await expect(row(page, 'platform').locator('.subject-users button')).toHaveText(['departures.plat_num']);
  await expect(row(page, 'system_time').locator('.subject-users button')).toHaveText(['departures.sys_clock']);
  await expect(row(page, 'box_fill').locator('[data-column="users"]')).toHaveText('not used');
});

test('a click on a user selects that element on its screen', async ({ page }) => {
  await open(page);
  await row(page, 'message_text').locator('.subject-users button', { hasText: 'departures.message_bar' }).click();
  await expect.poll(() => selectedNames(page)).toEqual({ file: 'screens/screen_departures.xml', names: ['message_bar'] });
});

test('removing a subject still bound is refused, naming the binding, and writes nothing', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  await row(page, 'platform').getByRole('button', { name: 'Remove String subject platform' }).click();
  await expect(page.locator('.project-form[data-form-file="globals.xml"] .form-banner.refusal')).toContainText("Subject 'platform' is still used by departures.plat_num");
  expect(await bufferText(page, 'globals.xml')).toBe(before);

  // An unbound one goes.
  await row(page, 'box_fill').getByRole('button', { name: 'Remove Int subject box_fill' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).not.toContain('name="box_fill"');
});

test('an edit in the table changes the XML, and one undo restores it', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  const value = row(page, 'box_fill').getByRole('textbox', { name: 'value' });
  await value.fill('12');
  await value.press('Enter');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before.replace('<int name="box_fill" value="8" />', '<int name="box_fill" value="12" />'));
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.documents.modelOf('globals.xml')?.undo());
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
  await expect(value).toHaveValue('8');
});
