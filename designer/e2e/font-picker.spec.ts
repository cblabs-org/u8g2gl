/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/font-picker.spec.ts
 * Purpose: The font picker end to end (ui_spec §6.4): "+ Built-in font" opens
 *          it instead of adding an empty font; a search and a choice add one
 *          `<builtin>` as one undo stop; Cancel adds nothing; "Change font…"
 *          on an existing font swaps its name; each row's sample is drawn;
 *          and the samples file is fetched only when a picker first opens,
 *          never by the page load.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, in the end-to-end test build. Undo is the Monaco
 *              model's own, through the test handle, as project-form.spec.ts
 *              does. The samples file is Vite's chunk of
 *              `u8g2-font-samples.json`, recognised by its name.
 */

import { expect, test, type Page, type Request } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// undo
// Undoes the last stop of a file's buffer.
async function undo(page: Page, file: string): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

// globalsForm
// The globals.xml form.
const globalsForm = (page: Page) => page.locator('.project-form[data-form-file="globals.xml"]');

// isSamplesRequest
// Whether a request fetches the font samples: Vite names the JSON's chunk
// after the file.
const isSamplesRequest = (request: Request): boolean => /u8g2-font-samples/.test(request.url());

// litPixels
// How many lit pixels a sample canvas holds, read back from the canvas.
async function litPixels(page: Page, font: string): Promise<number> {
  return page.evaluate((name) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas.font-sample[data-sample-font="${name}"]`);
    const context = canvas?.getContext('2d');
    if (canvas === null || canvas === undefined || context === null || context === undefined) return -1;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 128) lit++;
    return lit;
  }, font);
}

test('"+ Built-in font" opens the picker; a search and a choice add one <builtin> as one undo stop', async ({ page }) => {
  session = await startDesign();
  const samplesRequests: string[] = [];
  page.on('request', (request) => {
    if (isSamplesRequest(request)) samplesRequests.push(request.url());
  });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  await expect(globalsForm(page).locator('.form-section > h3').nth(1)).toHaveText('Fonts (2)');
  // The page load, and a form that only names fonts, fetch no samples.
  expect(samplesRequests).toEqual([]);
  const before = await bufferText(page, 'globals.xml');

  // --- Opening the picker adds nothing, and fetches the samples once ---
  await globalsForm(page).getByRole('button', { name: '+ Built-in font' }).click();
  const picker = globalsForm(page).getByRole('group', { name: 'Add a built-in font' });
  await expect(picker).toBeVisible();
  expect(await bufferText(page, 'globals.xml')).toBe(before);
  await expect.poll(() => samplesRequests.length).toBe(1);

  // --- Declared fonts are marked; a search narrows the rows ---
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('6x10_mr');
  await expect(picker.locator('.font-option[data-font="u8g2_font_6x10_mr"]')).toHaveAttribute('data-declared', 'true');
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('logisoso 16 tf');
  const row = picker.locator('.font-option[data-font="u8g2_font_logisoso16_tf"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-declared', 'false');
  await expect(row).toContainText('px · full (32–255) · transparent');

  // --- Each row's sample is drawn, from U8G2's own pixels ---
  await expect(row.locator('canvas.font-sample')).toBeVisible();
  await expect.poll(() => litPixels(page, 'u8g2_font_logisoso16_tf')).toBeGreaterThan(20);

  // --- Choosing adds the element, once; one undo removes it ---
  await row.click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<builtin name="u8g2_font_logisoso16_tf" />');
  const after = await bufferText(page, 'globals.xml');
  expect(after.split('<builtin ').length - before.split('<builtin ').length).toBe(1);
  await expect(globalsForm(page).locator('.form-section > h3').nth(1)).toHaveText('Fonts (3)');
  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);

  // --- A second picker reuses the samples already fetched ---
  await globalsForm(page).getByRole('button', { name: '+ Built-in font' }).click();
  await expect(globalsForm(page).getByRole('group', { name: 'Add a built-in font' }).locator('canvas.font-sample').first()).toBeVisible();
  expect(samplesRequests.length).toBe(1);
});

test('Cancel closes the picker and adds nothing', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const before = await bufferText(page, 'globals.xml');
  await globalsForm(page).getByRole('button', { name: '+ Built-in font' }).click();
  const picker = globalsForm(page).getByRole('group', { name: 'Add a built-in font' });
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('helv');
  await picker.getByRole('button', { name: 'Cancel' }).click();
  await expect(picker).toHaveCount(0);
  expect(await bufferText(page, 'globals.xml')).toBe(before);
  await expect(globalsForm(page).locator('.form-section > h3').nth(1)).toHaveText('Fonts (2)');
});

test('"Change font…" swaps a <builtin>’s name, filtered by height and set, as one undo stop; the name stays typeable', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const before = await bufferText(page, 'globals.xml');
  const field = globalsForm(page).locator('.form-field[data-field="font-builtin/name"]').first();
  await expect(field.getByRole('textbox', { name: 'name' })).toHaveValue('u8g2_font_6x10_mr');
  await expect(field).toContainText('reduced (ASCII 32–127) · monospace');

  await field.getByRole('button', { name: 'Change font…' }).click();
  const picker = field.getByRole('group', { name: 'Change font' });
  await picker.getByRole('textbox', { name: 'Minimum height' }).fill('9');
  await picker.getByRole('textbox', { name: 'Maximum height' }).fill('9');
  await picker.getByRole('combobox', { name: 'Character set' }).selectOption('n');
  await picker.getByRole('combobox', { name: 'Glyph box' }).selectOption('monospace');
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('6x10');
  await picker.locator('.font-option[data-font="u8g2_font_6x10_mn"]').click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before.replace('u8g2_font_6x10_mr', 'u8g2_font_6x10_mn'));
  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);

  // The text box still writes what is typed.
  const name = field.getByRole('textbox', { name: 'name' });
  await name.fill('u8g2_font_helvB08_tr');
  await name.press('Enter');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before.replace('u8g2_font_6x10_mr', 'u8g2_font_helvB08_tr'));
});
