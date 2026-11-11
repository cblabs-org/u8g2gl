/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/session-lifecycle.spec.ts
 * Purpose: What the designer does when its design session ends under an open
 *          tab, as a user meets it: the page says the server has stopped and
 *          names the unsaved files instead of looking alive; a save that
 *          cannot reach the server says so in the status bar and in Output;
 *          and a reload with unsaved changes asks first, while one without
 *          them never does.
 * Description: The server is stopped with the session helper's `stop()`, which
 *              is SIGINT, as Ctrl-C in the terminal would be.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell, placeCaret } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// editRow0X
// One edit as a user makes it: select row0's x value and type a new one.
async function editRow0X(page: Page): Promise<void> {
  await placeCaret(page, SCREEN, 'name="row0" x="', 'name="row0" x="'.length);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('4');
}

/**
 * Undo once, with the editor's own key, as a user would. Monaco binds its
 * modifier by the user agent's platform, not the keyboard's, so the key is
 * chosen the same way (as in panel.spec.ts). The caret is already in the editor.
 */
async function undo(page: Page): Promise<void> {
  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

/** The editor host of the screen, which carries the dirty flag. */
const host = (page: Page) => page.locator(`.editor-host[data-editor-path="${SCREEN}"]`);
/** The session banner. */
const banner = (page: Page) => page.locator('.session-banner[role="alert"]');

test('stopping the server shows the banner, naming the unsaved file and the command to run', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(banner(page)).toHaveCount(0);
  await openFile(page, SCREEN);
  await editRow0X(page);
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');

  await session.stop();
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText('The design server has stopped.');
  await expect(banner(page)).toContainText(`Your unsaved changes to ${SCREEN} are still in this tab.`);
  await expect(banner(page).locator('code')).toHaveText('npx u8g2gl design');
  await expect(banner(page)).toContainText('Until then, saving is not possible.');

  // Editing stays possible: nothing is taken away.
  await page.keyboard.type('0');
  await expect.poll(() => bufferText(page, SCREEN)).toContain('name="row0" x="40"');
});

test('with nothing unsaved, the banner says so', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await session.stop();
  await expect(banner(page)).toContainText('There are no unsaved changes.');
});

test('a save after the server stopped shows "not saved" and brings Output forward; undoing to clean clears it', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  const outputTab = page.getByRole('tab', { name: 'Output', exact: true });
  await expect(outputTab).toHaveAttribute('aria-selected', 'false');
  await editRow0X(page);
  await session.stop();
  await expect(banner(page)).toBeVisible();

  await page.keyboard.press('ControlOrMeta+s');
  const item = page.locator('.status-bar .not-saved');
  await expect(item).toHaveText(`✕ not saved: ${SCREEN}`);
  await expect(outputTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('pre.output')).toContainText(`could not save ${SCREEN}`);
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');

  // Undo back to the text on disk: nothing is left unsaved, so the item goes.
  await undo(page);
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');
  await expect(item).toHaveCount(0);
});

test('a reload with unsaved changes raises the browser\'s leave-page prompt', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await editRow0X(page);
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');

  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    // Dismissing keeps the page, and the edit in it.
    void dialog.dismiss();
  });
  // A dismissed prompt cancels the navigation, so the reload does not settle.
  await page.reload({ timeout: 2000 }).catch(() => undefined);
  expect(dialogs).toEqual(['beforeunload']);
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');
});

test('a reload with nothing unsaved never asks', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  // An edit undone is clean again, so the guard is disarmed as well as unarmed.
  await editRow0X(page);
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');
  await undo(page);
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');

  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.reload();
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
  expect(dialogs).toEqual([]);
});
