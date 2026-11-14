/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/project-targets.spec.ts
 * Purpose: The u8g2gl.xml editor end to end (rulings 5–9, D1): the display
 *          picker changes the canvas's size and undo restores it; its impact
 *          preview marks an element the new display would not hold, before
 *          anything is written; a second target is switched to from the status
 *          bar with the file left clean, and the choice survives a reload; an
 *          I²C address is flagged, not dropped, when the wiring becomes SPI;
 *          the last target cannot be removed.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, in the end-to-end test build. The canvas's size is
 *              read from its toolbar, which stays in the page while the form
 *              covers it, and from the status bar.
 */

import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

const SPI = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const I2C = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';

/** The canvas's display size, from its toolbar. */
const canvasSize = (page: Page) => page.locator('.canvas-toolbar .dim');
/** The u8g2gl.xml form. */
const form = (page: Page) => page.locator('.project-form[data-form-file="u8g2gl.xml"]');

// pickDisplay
// Opens the first target's picker, searches, chooses a setup, and waits for its
// impact preview.
async function pickDisplay(page: Page, query: string, setup: string): Promise<void> {
  const picker = form(page).locator('.display-picker').first();
  await picker.getByRole('button', { name: 'Change display…' }).click();
  await picker.getByRole('textbox', { name: 'Search displays' }).fill(query);
  await picker.locator(`.display-option[data-setup="${setup}"]`).click();
  await expect(picker.locator('.impact-preview')).toBeVisible({ timeout: 15_000 });
}

test('the display picker changes the canvas size, as one undo stop; the preview first marks what falls outside', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(canvasSize(page)).toHaveText('256×64');
  await openFile(page, 'u8g2gl.xml');
  const before = await bufferText(page, 'u8g2gl.xml');

  await pickDisplay(page, 'ssd1306 128x64 noname hw_i2c', I2C);
  // --- The preview: every screen at 128×64, the elements past x=128 marked ---
  const screen = form(page).locator('.impact-screen[data-screen="departures"]');
  await expect(screen).toBeVisible();
  const outside = (await screen.getAttribute('data-outside')) ?? '';
  expect(outside.split(' ').filter((name) => name !== '').length).toBeGreaterThan(0);
  await expect(screen.locator('.impact-outside').first()).toBeAttached();
  const ms = Number(await form(page).locator('.impact-preview').getAttribute('data-preview-ms'));
  console.log(`impact preview: departures project, 1 screen at ${I2C}: ${ms} ms, outside: ${outside}`);
  // Nothing is written until the author confirms.
  expect(await bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(canvasSize(page)).toHaveText('256×64');

  // --- Confirmed: one edit, where the setup is written, and the canvas follows ---
  await form(page).getByRole('button', { name: 'Use this display' }).click();
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before.replace(SPI, I2C));
  await expect(canvasSize(page)).toHaveText('128×64');

  // --- Undo restores the text and the canvas ---
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.documents.modelOf('u8g2gl.xml')?.undo());
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toBe(before);
  await expect(canvasSize(page)).toHaveText('256×64');
});

test('a second target is switched to from the status bar: the canvas follows, the file stays clean, and the choice survives a reload', async ({ page }) => {
  const project = `<?xml version="1.0" encoding="UTF-8"?>
<u8g2gl schema="0.6" name="probe" version="1.0.0">
    <targets>
        <target name="primary" setup="${SPI}" rotation="R0" />
        <target name="compact">
            <display setup="${I2C}" address="0x3C" />
        </target>
    </targets>
    <output dir="generated" />
</u8g2gl>
`;
  session = await startDesign({ files: { 'u8g2gl.xml': project } });
  await openShell(page, session.url);
  const switcher = page.locator('.status-bar').getByRole('combobox', { name: 'Target' });
  await expect(switcher).toHaveValue('primary');
  await expect(canvasSize(page)).toHaveText('256×64');

  await switcher.selectOption('compact');
  await expect(canvasSize(page)).toHaveText('128×64');
  await expect(page.locator('.status-item.target')).toContainText('SSD1306 128×64');
  // Never an edit: nothing unsaved, the disk untouched, no undo step.
  await expect(page.locator('.status-bar .unsaved-save')).toHaveCount(0);
  expect(session.read('u8g2gl.xml')).toBe(project);

  await page.reload();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false', { timeout: 20_000 });
  await expect(page.locator('.status-bar').getByRole('combobox', { name: 'Target' })).toHaveValue('compact');
  await expect(canvasSize(page)).toHaveText('128×64');

  // Renaming the chosen target falls back to the first.
  session.write('u8g2gl.xml', project.replace('name="compact"', 'name="small"'));
  await expect(page.locator('.status-bar').getByRole('combobox', { name: 'Target' })).toHaveValue('primary');
  await expect(canvasSize(page)).toHaveText('256×64');
});

test('targets are added, renamed and reordered in the form; the last one cannot be removed', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  await expect(form(page).getByRole('button', { name: 'Remove Target primary' })).toBeDisabled();

  await form(page).getByRole('button', { name: '+ Target' }).click();
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toContain(`<target name="target_1">`);
  expect(await bufferText(page, 'u8g2gl.xml')).toContain(`<display setup="${SPI}" />`);
  await expect(form(page).getByRole('button', { name: 'Remove Target primary' })).toBeEnabled();

  const name = form(page).locator('.form-item[data-node="u8g2gl.xml>targets#1"] .form-field[data-field="target/name"]').getByRole('textbox', { name: 'name' });
  await name.fill('bench');
  await name.press('Enter');
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toContain('<target name="bench">');

  await form(page).getByRole('button', { name: 'Move Target bench up' }).click();
  await expect.poll(async () => (await bufferText(page, 'u8g2gl.xml')).indexOf('bench') < (await bufferText(page, 'u8g2gl.xml')).indexOf('primary')).toBe(true);
});

test('an I²C address is flagged, not dropped, when the wiring changes to SPI; SPI pins appear', async ({ page }) => {
  const project = `<u8g2gl schema="0.6" name="probe" version="1.0.0">
    <targets>
        <target name="primary">
            <display setup="${I2C}" address="0x3C" />
        </target>
    </targets>
</u8g2gl>
`;
  session = await startDesign({ files: { 'u8g2gl.xml': project } });
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const field = (id: string) => form(page).locator(`.form-field[data-field="${id}"]`);
  await expect(field('display/address')).toBeVisible();
  await expect(field('display/cs')).toHaveCount(0);

  await pickDisplay(page, 'ssd1306 128x64 noname 4w_hw_spi', 'U8G2_SSD1306_128X64_NONAME_F_4W_HW_SPI');
  await form(page).getByRole('button', { name: 'Use this display' }).click();
  await expect.poll(() => bufferText(page, 'u8g2gl.xml')).toContain('setup="U8G2_SSD1306_128X64_NONAME_F_4W_HW_SPI" address="0x3C"');
  await expect(field('display/address').locator('[data-flag="not-applicable"]')).toContainText('this display is SPI');
  await expect(field('display/cs')).toBeVisible();
  await expect(field('display/dc')).toBeVisible();
});

test('the Output section shows what generate would write, from the fields as they are', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'u8g2gl.xml');
  const example = form(page).locator('[data-example="output"]');
  await expect(example).toContainText('generated/ui_screen_departures.cpp');
  const dir = form(page).locator('.form-field[data-field="output/dir"]').getByRole('combobox', { name: 'dir' });
  await dir.fill('src/ui');
  await dir.press('Enter');
  await expect(example).toContainText('src/ui/ui_screen_departures.cpp');
  await expect(example).toContainText('ui_screen_departures_init()');
});
