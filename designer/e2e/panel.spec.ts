/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/panel.spec.ts
 * Purpose: The property panel end to end (ui_spec §9): generated from the
 *          departures project's manifests, it shows the selected element's
 *          fields with geometry first, the element's own props, and the
 *          collapsed *From u8g2gl_obj* group ([Q-10]); with nothing selected,
 *          the screen's own. Each type has its control (§9.1), and each
 *          committed value — Enter, blur, a stepper, a toggle, a choice — is
 *          one undo stop with a one-line diff; typing alone writes nothing,
 *          and reset removes the attribute.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project and selects and edits through the canvas and
 *              the panel, as a user would; undo is the editor's own key.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
/** The departures screen as the fixture has it. */
const PROJECT_TEXT = readFileSync(join(PROJECT_FIXTURE, SCREEN), 'utf8');

/** The lines of the buffer that differ from the fixture's. */
async function changedLines(page: Page): Promise<string[]> {
  const before = PROJECT_TEXT.split('\n');
  return (await bufferText(page, SCREEN)).split('\n').filter((line, i) => line !== before[i]);
}

/**
 * Undo once, with the editor's own key, as a user would. Monaco binds its
 * modifier by the user agent's platform, not the keyboard's, so the key is
 * chosen the same way.
 */
async function undo(page: Page): Promise<void> {
  await page.locator(`.editor-host[data-editor-path="${SCREEN}"] .view-lines`).click();
  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

/** A field of the panel by attribute. */
const field = (page: Page, key: string) => panel(page).locator(`[data-field="${key}"]`);

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens the shell on the departures screen with a still frame. */
async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
}

/** The panel's region. */
const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties' });

test('selecting an element shows its manifest’s fields: geometry first, its own props, and u8g2gl_obj’s collapsed', async ({ page }) => {
  await open(page);
  // sys_clock: 190, 51, 66 × 13.
  await clickCanvas(page, 220, 57);
  await expect(panel(page).locator('.panel-title')).toHaveText('u8g2gl_clock');
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('sys_clock');
  const sections = panel(page).locator('.panel-section');
  await expect(sections).toHaveCount(3);
  await expect(sections.nth(0).locator('.field').evaluateAll((fields) => fields.map((f) => f.getAttribute('data-field')))).resolves.toEqual(['x', 'y', 'width', 'height']);
  await expect(sections.nth(1).locator('.field').evaluateAll((fields) => fields.map((f) => f.getAttribute('data-field')))).resolves.toEqual([
    'time',
    'format',
    'font',
    'secondary_font',
    'blink',
    'bind_time',
  ]);
  const inherited = panel(page).locator('details.inherited');
  await expect(inherited.locator('summary')).toHaveText('From u8g2gl_obj');
  await expect(inherited).not.toHaveAttribute('open', '');
  // Help renders beneath the control, not on hover (ui_spec §9.2).
  await expect(panel(page).locator('[data-field="blink"] .field-help')).toHaveText('Enable 1Hz colon blink animation.');
});

test('with nothing selected the panel shows the screen’s own properties', async ({ page }) => {
  await open(page);
  await expect(panel(page).locator('.panel-title')).toHaveText('<screen>');
  await expect(panel(page).locator('[data-field="name"]')).toBeVisible();
  await expect(panel(page).locator('.panel-note').first()).toHaveText('Display 256×64');
});

test('typing in a field writes nothing until Enter; the commit is a one-line diff and one undo stop', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock
  const x = field(page, 'x').getByRole('textbox', { name: 'x' });
  await x.fill('180');
  await page.waitForTimeout(100);
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
  await x.press('Enter');
  await expect.poll(() => changedLines(page)).toEqual([
    '        <u8g2gl_clock name="sys_clock" x="180" y="51" width="66" height="13" font="u8g2_font_6x10_mr" format="hh_mm_ss" blink="false" bind_time="system_time" />',
  ]);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 180,51 66×13');
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});

test('blur commits, Escape abandons the draft, and a draft the type refuses is flagged as typed and not written', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57);
  const width = field(page, 'width').getByRole('textbox', { name: 'width' });
  await width.fill('60');
  await width.press('Escape');
  await width.blur();
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
  await expect(width).toHaveValue('66');

  await width.fill('6x');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'width').locator('.field-problem.draft')).toContainText('integer');
  await width.press('Enter');
  await width.blur();
  expect(await bufferText(page, SCREEN)).toBe(PROJECT_TEXT);

  await width.fill('60');
  await width.blur();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('width="60"');
});

test('each stepper click commits one value and one undo stop', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57);
  await field(page, 'y').getByRole('button', { name: 'y − 1' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="50"');
  await field(page, 'y').getByRole('button', { name: 'y − 1' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="49"');
  await undo(page);
  await expect.poll(async () => (await changedLines(page))[0]).toContain('y="50"');
  await undo(page);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(PROJECT_TEXT);
});

test('a toggle, a segmented control and a dropdown each commit their choice; reset removes the attribute', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock: blink="false", format="hh_mm_ss"
  const blink = field(page, 'blink').getByRole('switch', { name: 'blink' });
  await expect(blink).toHaveAttribute('aria-checked', 'false');
  await blink.click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('blink="true"');
  await expect(blink).toHaveAttribute('aria-checked', 'true');

  // Two options: a segmented control.
  await field(page, 'format').getByRole('button', { name: 'hh_mm', exact: true }).click();
  await expect.poll(async () => (await changedLines(page))[0]).toContain('format="hh_mm"');

  // A font: a dropdown of the project's fonts.
  await field(page, 'font').getByRole('combobox', { name: 'font' }).selectOption('u8g2_font_helvR08_tr');
  await expect.poll(async () => (await changedLines(page))[0]).toContain('font="u8g2_font_helvR08_tr"');

  // Reset: the attribute goes, and the field shows the default, greyed.
  await field(page, 'blink').getByRole('button', { name: 'Reset blink' }).click();
  await expect.poll(async () => (await changedLines(page))[0]).not.toContain('blink=');
  await expect(field(page, 'blink')).toHaveAttribute('data-written', 'false');
  await expect(field(page, 'blink').getByRole('button', { name: 'Reset blink' })).toHaveCount(0);
});

test('a binding’s dropdown offers only subjects of a type it accepts, and choosing one binds it', async ({ page }) => {
  await open(page);
  await clickCanvas(page, 220, 57); // sys_clock: bind_time takes a time subject
  const bindTime = field(page, 'bind_time').getByRole('combobox', { name: 'bind_time' });
  const options = await bindTime.locator('option').allTextContents();
  expect(options).toEqual(['not bound', 'system_time · time']);
  // message_bar's bind_text accepts string or int subjects. formation is drawn
  // over it, so the second click at that point cycles down to it.
  await clickCanvas(page, 100, 22);
  await clickCanvas(page, 100, 22);
  await expect(panel(page).locator('.panel-subtitle')).toHaveText('message_bar');
  const bindText = field(page, 'bind_text').getByRole('combobox', { name: 'bind_text' });
  expect(await bindText.locator('option').allTextContents()).toEqual([
    'not bound',
    'platform · string',
    'row0_time · string',
    'row0_dest · string',
    'row0_status · string',
    'box_fill · int',
    'message_text · string',
  ]);
  await bindText.selectOption('row0_dest');
  await expect.poll(async () => (await changedLines(page))[0]).toContain('bind_text="row0_dest"');
});
