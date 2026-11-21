/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/styles-consts.spec.ts
 * Purpose: globals.xml's style cards and constants end to end (ui_spec §6.4,
 *          §10): a style's card shows its preview, drawn by the real renderer
 *          and drawn again when the style changes, its users and its radius
 *          bound; a constant lists a reference written inside an expression;
 *          and removing a style or a constant still used is refused, naming
 *          the users.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, given a style `boxed` and a constant `gap`, both used
 *              by `plat_label` (`x="#gap + 3"`, an 18×13 label).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

const GLOBALS = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8').replace(
  '</globals>',
  '    <styles>\n        <style name="boxed" border="true" padding="1" />\n    </styles>\n\n    <consts>\n        <int name="gap" value="2" />\n    </consts>\n</globals>',
);
const SCREEN = 'screens/screen_departures.xml';
const SCREEN_TEXT = readFileSync(join(PROJECT_FIXTURE, ...SCREEN.split('/')), 'utf8').replace(
  '<u8g2gl_label name="plat_label" x="5"',
  '<u8g2gl_label name="plat_label" style="boxed" x="#gap + 3"',
);

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// form
// The globals.xml form.
const form = (page: Page) => page.locator('.project-form[data-form-file="globals.xml"]');

// open
// The session, with globals.xml's form shown.
async function open(page: Page): Promise<void> {
  session = await startDesign({ files: { 'globals.xml': GLOBALS, [SCREEN]: SCREEN_TEXT } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
}

// previewOf
// A style preview's pixels, as a data URL.
async function previewOf(page: Page, style: string): Promise<string> {
  return page.locator(`canvas[data-style-preview="${style}"]`).evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

test('a style card shows its preview, users and radius bound, and an edit to the style redraws the preview', async ({ page }) => {
  await open(page);
  const card = form(page).locator('.form-item[data-element="style"]');
  const preview = card.locator('canvas[data-style-preview="boxed"]');
  await expect(preview).not.toHaveAttribute('data-drawn', '0');
  await expect(card.locator('.style-facts .field-problem')).toHaveCount(0);
  await expect(card.locator('.globals-users button')).toHaveText(['departures.plat_label']);
  await expect(card.locator('.style-radius')).toHaveAttribute('data-radius-bound', '6');
  await expect(card.locator('.style-radius')).toContainText('departures.plat_label is 18×13');

  const drawn = Number(await preview.getAttribute('data-drawn'));
  const before = await previewOf(page, 'boxed');
  // A label draws a style's font, colour, font mode and alignment; alignment moves its text.
  await card.locator('.form-field[data-field="style/align"]').getByRole('button', { name: 'right' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<style name="boxed" border="true" padding="1" align="right" />');
  await expect.poll(async () => Number(await preview.getAttribute('data-drawn'))).toBeGreaterThan(drawn);
  await expect.poll(() => previewOf(page, 'boxed')).not.toBe(before);
});

test('a constant lists each reference by file and attribute, one inside an expression included', async ({ page }) => {
  await open(page);
  const facts = form(page).locator('.const-facts[data-const="gap"]');
  await expect(facts.locator('.globals-users button')).toHaveText([`${SCREEN}: plat_label.x`]);
});

test('removing a style or a constant still used is refused, naming the users, and writes nothing', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  const refusal = form(page).locator('.form-banner.refusal');

  await form(page).getByRole('button', { name: 'Remove Style boxed' }).click();
  await expect(refusal).toContainText("Style 'boxed' is still used by departures.plat_label");
  await form(page).getByRole('button', { name: 'Remove Int constant gap' }).click();
  await expect(refusal).toContainText("Constant 'gap' is still used by departures.plat_label");
  expect(await bufferText(page, 'globals.xml')).toBe(before);
});
