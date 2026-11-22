/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/rename.spec.ts
 * Purpose: Renaming across files end to end (ui_spec §6.4, §14): "Rename…"
 *          on a subject bound on two screens lists each file and the setter
 *          that changes, then changes all three files, and an undo in one
 *          screen takes back only that screen. A name field asks before it
 *          renames something referenced, with Rename everywhere, Only here
 *          and Cancel, and commits at once when nothing references it. A
 *          refused rename writes nothing.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, given a second screen that also binds `platform`.
 *              Undo is each Monaco model's own, through the test handle.
 */

import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

const SECOND = 'screens/screen_second.xml';
const DEPARTURES = 'screens/screen_departures.xml';
const SECOND_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="second">
    <view>
        <u8g2gl_label name="second_plat" x="0" y="0" width="40" height="13" font="u8g2_font_6x10_mr" bind_text="platform" />
    </view>
</screen>
`;

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// form
// The globals.xml form.
const form = (page: Page) => page.locator('.project-form[data-form-file="globals.xml"]');

// dialog
// The rename dialog.
const dialog = (page: Page) => form(page).locator('xpath=..').getByRole('dialog');

// row
// One subject's row in the subjects table.
const row = (page: Page, name: string) => form(page).locator(`table.subjects-table tr[data-subject="${name}"]`);

// open
// The session, with globals.xml's form shown.
async function open(page: Page): Promise<void> {
  session = await startDesign({ files: { [SECOND]: SECOND_TEXT } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  await expect(row(page, 'platform').locator('.subject-users button')).toHaveText(['departures.plat_num', 'second.second_plat']);
}

// textOf
// A document's text as the designer holds it: its buffer once open, else the
// text it was read with.
async function textOf(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => (window as unknown as TestHandle).__u8g2gl.documents.textOf(p) ?? '', path);
}

// texts
// globals.xml's and both screens' texts.
async function texts(page: Page): Promise<readonly string[]> {
  return [await textOf(page, 'globals.xml'), await textOf(page, DEPARTURES), await textOf(page, SECOND)];
}

// undo
// Undoes one document's last stop.
async function undo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(p)?.undo(), path);
}

test('Rename… lists each file and the setter, renames across both screens, and an undo in one screen restores only it', async ({ page }) => {
  await open(page);
  const [globals, departures, second] = await texts(page);
  await row(page, 'platform').getByRole('button', { name: 'Rename String subject platform' }).click();
  await dialog(page).getByRole('textbox', { name: 'New name' }).fill('origin');
  await expect(dialog(page).locator('.rename-files li')).toHaveText(['globals.xml 1 change', `${DEPARTURES} 1 change`, `${SECOND} 1 change`]);
  await expect(dialog(page).locator('.rename-symbols li[data-from="ui_set_platform()"]')).toHaveAttribute('data-to', 'ui_set_origin()');
  await expect(dialog(page)).toContainText('will not compile until you update it by hand');
  await expect(dialog(page)).toContainText('undo takes the rename back one file at a time');
  await dialog(page).getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);

  const renamed = [
    globals?.replace('name="platform"', 'name="origin"'),
    departures?.replace('bind_text="platform"', 'bind_text="origin"'),
    second?.replace('bind_text="platform"', 'bind_text="origin"'),
  ];
  await expect.poll(() => texts(page)).toEqual(renamed);

  await undo(page, SECOND);
  await expect.poll(() => texts(page)).toEqual([renamed[0], renamed[1], second]);
});

test('a name field asks before renaming what is referenced: Cancel, Only here, Rename everywhere', async ({ page }) => {
  await open(page);
  const before = await texts(page);
  const name = row(page, 'platform').getByRole('textbox', { name: 'name' });

  // --- Cancel: nothing written, and the field shows the old name ---
  await name.fill('origin');
  await name.press('Enter');
  await expect(dialog(page)).toHaveAttribute('aria-label', "You're renaming platform. Rename it in the files that reference it too?");
  await expect(dialog(page).locator('.rename-files li')).toHaveCount(3);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(name).toHaveValue('platform');
  expect(await texts(page)).toEqual(before);

  // --- Only here: the one globals.xml edit ---
  await name.fill('origin');
  await name.press('Enter');
  await dialog(page).getByRole('button', { name: 'Only here' }).click();
  await expect.poll(() => texts(page)).toEqual([before[0]?.replace('name="platform"', 'name="origin"'), before[1], before[2]]);
  await undo(page, 'globals.xml');
  await expect.poll(() => texts(page)).toEqual(before);

  // --- Rename everywhere: every file ---
  const again = row(page, 'platform').getByRole('textbox', { name: 'name' });
  await again.fill('origin');
  await again.press('Enter');
  await dialog(page).getByRole('button', { name: 'Rename everywhere' }).click();
  await expect.poll(() => texts(page)).toEqual([
    before[0]?.replace('name="platform"', 'name="origin"'),
    before[1]?.replace('bind_text="platform"', 'bind_text="origin"'),
    before[2]?.replace('bind_text="platform"', 'bind_text="origin"'),
  ]);
});

test('a name nothing references commits at once, with no question', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  const name = row(page, 'box_fill').getByRole('textbox', { name: 'name' });
  await name.fill('fill_level');
  await name.press('Enter');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before.replace('name="box_fill"', 'name="fill_level"'));
  await expect(dialog(page)).toHaveCount(0);
});

test('a refused rename says why and writes nothing', async ({ page }) => {
  await open(page);
  const before = await texts(page);
  await row(page, 'platform').getByRole('button', { name: 'Rename String subject platform' }).click();
  const input = dialog(page).getByRole('textbox', { name: 'New name' });
  await input.fill('message_text');
  await expect(dialog(page).getByRole('alert')).toHaveText("A subject called 'message_text' already exists. Renaming to it would merge the two.");
  await expect(dialog(page).getByRole('button', { name: 'Rename', exact: true })).toBeDisabled();
  await input.fill('Platform');
  await expect(dialog(page).getByRole('alert')).toContainText("Invalid name 'Platform'");
  await input.press('Enter');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  expect(await texts(page)).toEqual(before);
});
