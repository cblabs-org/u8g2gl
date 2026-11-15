/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/file-chooser.spec.ts
 * Purpose: The file chooser end to end (ui_spec §6.4): "+ BDF font" offers the
 *          project's own `.bdf` files and choosing one adds `<bdf>` with a
 *          name derived from the file, as one undo stop; Import writes a file
 *          from the author's computer under `fonts/` and adds the element,
 *          and the file is on disk; importing over an existing file is
 *          refused and the disk is unchanged; Cancel adds nothing;
 *          "+ Converted image" fills `width` and `height` from the PNG; and a
 *          `src` field's "Choose file…" swaps the path.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, in the end-to-end test build. The browser's file
 *              dialog is never shown: Playwright's `filechooser` event takes
 *              it and supplies the file. Undo is the Monaco model's own,
 *              through the test handle, as project-form.spec.ts does.
 */

import { readFileSync, existsSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** A BDF the project already holds, planted in the copy. */
const MINE_BDF = 'STARTFONT 2.1\nFONT -mine\nSIZE 8 75 75\nFONTBOUNDINGBOX 1 1 0 0\nCHARS 0\nENDFONT\n';

// undo
// Undoes the last stop of a file's buffer.
async function undo(page: Page, file: string): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

// globalsForm
// The globals.xml form.
const globalsForm = (page: Page) => page.locator('.project-form[data-form-file="globals.xml"]');

// chunk
// One PNG chunk: length, type, data and the CRC over type and data.
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// png
// A valid grayscale PNG of a size, all white.
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const rows = Buffer.alloc((width + 1) * height, 0xff);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

// importThrough
// Clicks Import in a chooser and answers the browser's file dialog with a file.
async function importThrough(page: Page, chooser: Locator, name: string, buffer: Buffer): Promise<void> {
  const dialog = page.waitForEvent('filechooser');
  await chooser.getByRole('button', { name: 'Import from your computer…' }).click();
  await (await dialog).setFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test('"+ BDF font" offers the project’s .bdf files; choosing one adds <bdf> with a derived name, as one undo stop', async ({ page }) => {
  session = await startDesign({ files: { 'fonts/mine.bdf': MINE_BDF, 'images/logo.xbm': '#define logo_width 1\n' } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const before = await bufferText(page, 'globals.xml');

  await globalsForm(page).getByRole('button', { name: '+ BDF font' }).click();
  const chooser = globalsForm(page).getByRole('group', { name: 'Add a BDF font' });
  // Only the font is offered, not the XBM beside it; opening adds nothing.
  await expect(chooser.getByRole('option')).toHaveText(['fonts/mine.bdf']);
  expect(await bufferText(page, 'globals.xml')).toBe(before);
  await expect(chooser).toContainText('Undo does not remove it');

  await chooser.getByRole('option', { name: 'fonts/mine.bdf' }).click();
  await expect(chooser).toHaveCount(0);
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<bdf name="mine" src="fonts/mine.bdf" />');
  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
});

test('Import writes the file under fonts/ and adds the element; an existing path is refused and the disk is unchanged', async ({ page }) => {
  session = await startDesign({ files: { 'fonts/mine.bdf': MINE_BDF } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');

  // --- A new file: proposed under fonts/, written, and named ---
  await globalsForm(page).getByRole('button', { name: '+ BDF font' }).click();
  let chooser = globalsForm(page).getByRole('group', { name: 'Add a BDF font' });
  const imported = Buffer.from(MINE_BDF.replace('-mine', '-helv'));
  await importThrough(page, chooser, 'Helv-Bold.bdf', imported);
  await expect(chooser.getByRole('textbox', { name: 'Import path' })).toHaveValue('fonts/Helv-Bold.bdf');
  await chooser.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<bdf name="helv_bold" src="fonts/Helv-Bold.bdf" />');
  expect(readFileSync(session.file('fonts/Helv-Bold.bdf')).equals(imported)).toBe(true);

  // --- The same name again: refused before any write, the file untouched ---
  const text = await bufferText(page, 'globals.xml');
  await globalsForm(page).getByRole('button', { name: '+ BDF font' }).click();
  chooser = globalsForm(page).getByRole('group', { name: 'Add a BDF font' });
  await importThrough(page, chooser, 'mine.bdf', Buffer.from('replacement'));
  await expect(chooser.getByRole('alert')).toContainText('fonts/mine.bdf already exists');
  await expect(chooser.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  expect(session.read('fonts/mine.bdf')).toBe(MINE_BDF);

  // --- Renamed, it imports, with a name unique among the fonts ---
  await chooser.getByRole('textbox', { name: 'Import path' }).fill('fonts/mine2.bdf');
  await chooser.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<bdf name="mine2" src="fonts/mine2.bdf" />');
  expect(session.read('fonts/mine2.bdf')).toBe('replacement');
  expect(session.read('fonts/mine.bdf')).toBe(MINE_BDF);
  expect((await bufferText(page, 'globals.xml')).length).toBeGreaterThan(text.length);
});

test('Cancel adds nothing and writes nothing', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const before = await bufferText(page, 'globals.xml');
  await globalsForm(page).getByRole('button', { name: '+ XBM image' }).click();
  const chooser = globalsForm(page).getByRole('group', { name: 'Add an XBM image' });
  await expect(chooser).toContainText('No .xbm file in the project yet');
  await importThrough(page, chooser, 'icon.xbm', Buffer.from('#define icon_width 1\n'));
  await chooser.getByRole('button', { name: 'Cancel' }).click();
  await expect(chooser).toHaveCount(0);
  expect(await bufferText(page, 'globals.xml')).toBe(before);
  expect(existsSync(session.file('images/icon.xbm'))).toBe(false);
});

test('"+ Converted image" fills width and height from the PNG; "Choose file…" swaps a src', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');

  // --- Imported: the size comes from the bytes in hand ---
  await globalsForm(page).getByRole('button', { name: '+ Converted image' }).click();
  let chooser = globalsForm(page).getByRole('group', { name: 'Add a PNG image' });
  await importThrough(page, chooser, 'Logo.png', png(24, 10));
  await expect(chooser.getByRole('textbox', { name: 'Import path' })).toHaveValue('images/Logo.png');
  await chooser.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<convert name="logo" src="images/Logo.png" width="24" height="10" />');

  // --- Already in the project: the size is read from the file ---
  await globalsForm(page).getByRole('button', { name: '+ Converted image' }).click();
  chooser = globalsForm(page).getByRole('group', { name: 'Add a PNG image' });
  await importThrough(page, chooser, 'wide.png', png(40, 8));
  await chooser.getByRole('textbox', { name: 'Import path' }).fill('images/wide.png');
  await chooser.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<convert name="wide" src="images/wide.png" width="40" height="8" />');
  await globalsForm(page).getByRole('button', { name: '+ Converted image' }).click();
  chooser = globalsForm(page).getByRole('group', { name: 'Add a PNG image' });
  await chooser.getByRole('option', { name: 'images/wide.png' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<convert name="wide_2" src="images/wide.png" width="40" height="8" />');

  // --- A src field: "Choose file…" swaps the path, the text box stays ---
  const before = await bufferText(page, 'globals.xml');
  const src = globalsForm(page).locator('.form-field[data-field="image-convert/src"]').first();
  // A text box with a list of the kind's files: a combobox, still typeable.
  await expect(src.getByRole('combobox', { name: 'src' })).toHaveValue('images/Logo.png');
  await src.getByRole('button', { name: 'Choose file…' }).click();
  const change = src.getByRole('group', { name: 'Choose the PNG image' });
  await expect(change.getByRole('option', { name: 'images/Logo.png' })).toHaveAttribute('aria-selected', 'true');
  await change.getByRole('option', { name: 'images/wide.png' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before.replace('src="images/Logo.png"', 'src="images/wide.png"'));
  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
});
