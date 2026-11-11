/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/saving.spec.ts
 * Purpose: Saving end to end — the designer as a co-author beside the user's
 *          IDE, which has the same files open: a save changes only what was
 *          edited, and keeps a byte-order mark the file had; a file changed
 *          on disk reloads when its buffer is clean and offers the three-way
 *          choice when it is dirty, overwriting nothing; a file opened and
 *          closed without an edit is never rewritten, even when names were
 *          generated into its buffer; and saving is visible: the status bar's
 *          "● N unsaved · Save", the canvas toolbar's Save, the Explorer's ●,
 *          and ⌘S with no editor tab saving the screen the canvas draws.
 * Description: The "IDE" is the test writing the project copy directly, as an
 *              editor beside the designer would; the server's watcher reports
 *              it. Bytes and modification times are read from disk.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, dragCanvas, nextFrames, openFile, openShell, placeCaret } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

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

test('a file with a byte-order mark keeps it through open, edit and save', async ({ page }) => {
  session = await startDesign({ files: { [SCREEN]: `\uFEFF${ORIGINAL}` } });
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await replaceRow0X(page, '4');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(host(page)).toHaveAttribute('data-dirty', 'false');

  const after = readFileSync(session.file(SCREEN));
  expect([...after.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(after.subarray(3).toString('utf8')).toBe(ORIGINAL.replace('name="row0" x="32"', 'name="row0" x="4"'));
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

// --- Visible saving: the affordances an author finds without knowing ⌘S ---

/** The status bar's save-all button. */
const statusSave = (page: Page) => page.locator('.status-bar .unsaved-save');
/** The canvas toolbar's Save. */
const canvasSave = (page: Page) => page.locator('.canvas-toolbar .canvas-save');
/** The screen's Explorer row. */
const explorerRow = (page: Page) => page.locator(`.sidebar .file[data-path="${SCREEN}"]`);

// moveRow0OnCanvas
// An edit made only on the canvas: row0 (x="32" y="0", 224 × 16) dragged 6
// right and 3 down, with the animation frozen so the frame is stable.
async function moveRow0OnCanvas(page: Page): Promise<void> {
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  // A canvas edit is written into the document's Monaco model, which can open
  // only once Monaco has loaded, a moment after the first frame.
  await expect.poll(() => page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.open(path) !== undefined, SCREEN)).toBe(true);
  // Selected first: a canvas selection opens its file in an editor tab, which
  // narrows the canvas, so the drag is measured on the settled layout.
  await clickCanvas(page, 100, 8);
  await expect(page.locator(`.editor-host[data-editor-path="${SCREEN}"]`)).toBeVisible();
  await nextFrames(page, 2);
  await dragCanvas(page, [100, 8], [106, 11]);
  await expect.poll(() => bufferText(page, SCREEN)).toContain('name="row0" x="38" y="3"');
}

test('after a canvas edit, the status bar offers "● 1 unsaved · Save", a click saves to disk, and it disappears', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(statusSave(page)).toHaveCount(0);
  await expect(canvasSave(page)).toBeDisabled();
  await expect(explorerRow(page).locator('.dirty-mark')).toHaveCount(0);

  // --- The edit: every affordance says so ---
  await moveRow0OnCanvas(page);
  await expect(statusSave(page)).toHaveText('● 1 unsaved · Save');
  const title = (await statusSave(page).getAttribute('title')) ?? '';
  expect(title).toContain(SCREEN);
  expect(title).toContain('⌘⌥S / Ctrl-Alt-S');
  expect(title).toContain('⌘S / Ctrl-S');
  await expect(canvasSave(page)).toBeEnabled();
  await expect(explorerRow(page).locator('.dirty-mark')).toBeVisible();
  await expect(explorerRow(page).locator('.dirty-mark')).toHaveText('●');

  // --- The click saves the file on disk, and every affordance clears ---
  await statusSave(page).click();
  await expect(statusSave(page)).toHaveCount(0);
  expect(readFileSync(session.file(SCREEN), 'utf8')).toContain('name="row0" x="38" y="3"');
  await expect(canvasSave(page)).toBeDisabled();
  await expect(explorerRow(page).locator('.dirty-mark')).toHaveCount(0);
});

test('⌘S with no editor tab, only the canvas, saves the screen the canvas draws', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await moveRow0OnCanvas(page);

  // A canvas selection shows its file in an editor tab; close it, so the canvas is all there is.
  const tab = page.locator('.dv-tab', { hasText: 'screen_departures.xml' });
  if ((await tab.count()) > 0) await tab.locator('.dv-default-tab-action').click();
  await expect(page.locator('.editor-host')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.activeFile.get())).toBeUndefined();
  await expect(statusSave(page)).toHaveText('● 1 unsaved · Save');

  await page.keyboard.press('ControlOrMeta+s');
  await expect(statusSave(page)).toHaveCount(0);
  expect(readFileSync(session.file(SCREEN), 'utf8')).toContain('name="row0" x="38" y="3"');
});

test('the canvas Save is enabled exactly while the drawn screen is unsaved, and ⌘⌥S saves every unsaved file', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await expect(canvasSave(page)).toBeDisabled();

  // --- An edit in the XML enables it, and its click saves the file ---
  await replaceRow0X(page, '40');
  await expect(canvasSave(page)).toBeEnabled();
  await canvasSave(page).click();
  await expect(canvasSave(page)).toBeDisabled();
  expect(readFileSync(session.file(SCREEN), 'utf8')).toContain('name="row0" x="40"');

  // --- ⌘⌥S: save all, here the one file ---
  await replaceRow0X(page, '60');
  await expect(canvasSave(page)).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Alt+s');
  await expect(canvasSave(page)).toBeDisabled();
  await expect(statusSave(page)).toHaveCount(0);
  expect(readFileSync(session.file(SCREEN), 'utf8')).toContain('name="row0" x="60"');
});
