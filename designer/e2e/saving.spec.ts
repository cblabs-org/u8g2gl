/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/saving.spec.ts
 * Purpose: Saving end to end — the designer as a co-author beside the user's
 *          IDE, which has the same files open: a save changes only what was
 *          edited; a file changed on disk reloads when its buffer is clean and
 *          offers the three-way choice when it is dirty, overwriting nothing;
 *          and a file opened and closed without an edit is never rewritten,
 *          even when names were generated into its buffer.
 * Description: The "IDE" is the test writing the project copy directly, as an
 *              editor beside the designer would; the server's watcher reports
 *              it. Bytes and modification times are read from disk.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell, placeCaret } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
const ORIGINAL = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// replaceRow0X
// One edit as a user makes it: select row0's x value and type a new one.
async function replaceRow0X(page: Page, value: string): Promise<void> {
  await placeCaret(page, SCREEN, 'name="row0" x="', 'name="row0" x="'.length);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type(value);
}

/** The editor host of the screen, which carries the dirty flag. */
const host = (page: Page) => page.locator(`.editor-host[data-editor-path="${SCREEN}"]`);

test('saving after one edit changes only that edit\'s bytes on disk', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  const before = readFileSync(session.file(SCREEN));
  await replaceRow0X(page, '4');
  await expect(host(page)).toHaveAttribute('data-dirty', 'true');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');

  const after = readFileSync(session.file(SCREEN));
  // Everything before and after the edited value is byte-identical.
  const at = before.indexOf('name="row0" x="') + 'name="row0" x="'.length;
  expect(after.subarray(0, at).equals(before.subarray(0, at))).toBe(true);
  expect(after.subarray(at, at + 1).toString()).toBe('4');
  expect(after.subarray(at + 1).equals(before.subarray(at + 2))).toBe(true);
  expect(after.length).toBe(before.length - 1);
});

test('a file changed on disk while its buffer is clean reloads silently', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  const theirs = ORIGINAL.replace('text="Plat"', 'text="Pl"');
  session.write(SCREEN, theirs);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(theirs);
  await expect(page.locator('.conflict-bar')).toHaveCount(0);
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');
  expect(session.read(SCREEN)).toBe(theirs);
});

test('a file changed on disk while its buffer is dirty offers keep, take or compare, and overwrites nothing', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await replaceRow0X(page, '4');
  const mine = await bufferText(page, SCREEN);
  const theirs = ORIGINAL.replace('text="Plat"', 'text="Pl"');
  session.write(SCREEN, theirs);

  // The choice is offered; the buffer and the disk are both left alone.
  const bar = page.locator('.conflict-bar');
  await expect(bar).toBeVisible();
  expect(await bufferText(page, SCREEN)).toBe(mine);
  expect(session.read(SCREEN)).toBe(theirs);

  // Saving now is refused rather than overwriting theirs.
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForTimeout(500);
  expect(session.read(SCREEN)).toBe(theirs);
  await expect(bar).toBeVisible();

  // Compare shows both sides.
  await bar.getByRole('button', { name: 'Compare' }).click();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible();

  // Keep mine, then save: now theirs is replaced, because the user chose it.
  await bar.getByRole('button', { name: 'Keep mine' }).click();
  await expect(bar).toHaveCount(0);
  await page.locator(`.editor-host[data-editor-path="${SCREEN}"] .monaco-editor`).first().click();
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => session?.read(SCREEN)).toBe(mine);
});

test('take theirs replaces the buffer with the disk, clean', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await replaceRow0X(page, '4');
  const theirs = ORIGINAL.replace('text="Plat"', 'text="Pl"');
  session.write(SCREEN, theirs);
  const bar = page.locator('.conflict-bar');
  await bar.getByRole('button', { name: 'Take theirs' }).click();
  await expect(bar).toHaveCount(0);
  expect(await bufferText(page, SCREEN)).toBe(theirs);
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');
  expect(session.read(SCREEN)).toBe(theirs);
});

test('a file opened and closed without an edit is not rewritten, even with names generated in its buffer', async ({ page }) => {
  const unnamed = ORIGINAL.replace('<u8g2gl_box name="plat_box" ', '<u8g2gl_box ');
  session = await startDesign({ files: { [SCREEN]: unnamed } });
  await page.goto(session.url);
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
  const path = session.file(SCREEN);
  const bytes = readFileSync(path);
  const mtime = statSync(path).mtimeMs;

  await openFile(page, SCREEN);
  const buffer = await bufferText(page, SCREEN);
  expect(buffer).toMatch(/<u8g2gl_box name="[a-z0-9_]+" x="0"/);
  expect(buffer).not.toBe(unnamed);
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');

  await page.locator('.dv-tab', { hasText: 'screen_departures.xml' }).locator('.dv-default-tab-action').click();
  await expect(page.locator(`.editor-host[data-editor-path="${SCREEN}"]`)).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(readFileSync(path).equals(bytes)).toBe(true);
  expect(statSync(path).mtimeMs).toBe(mtime);
});
