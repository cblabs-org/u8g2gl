/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/ranges-usage.spec.ts
 * Purpose: globals.xml's fonts section end to end (ui_spec §12): a `<bdf>`'s
 *          range presets show what each costs, and choosing one writes `range`
 *          as one undo stop; each font shows its size and users; removing a
 *          font still in use is refused, naming its users, and removing an
 *          unused one works.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, given the compile fixture's 4x6.bdf as an unused
 *              `<bdf name="tiny">`. Undo is the Monaco model's own, through
 *              the test handle.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { PROJECT_FIXTURE, REPO, startDesign, type DesignSession } from './support/design-session';
import { bufferText, openFile, openShell } from './support/shell';

const BDF = readFileSync(join(REPO, 'test', 'generated_fixture', 'assets', 'fonts', '4x6.bdf'), 'utf8');
const GLOBALS = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8').replace(
  '<builtin name="u8g2_font_helvR08_tr" />',
  '<builtin name="u8g2_font_helvR08_tr" />\n        <bdf name="tiny" src="fonts/4x6.bdf" />',
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
  session = await startDesign({ files: { 'globals.xml': GLOBALS, 'fonts/4x6.bdf': BDF } });
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
}

// undo
// Undoes globals.xml's last stop.
async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.documents.modelOf('globals.xml')?.undo());
}

test('a range preset shows its cost, writes range as one undo stop, and one undo removes it', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  const presets = form(page).getByRole('group', { name: 'Range presets for tiny' });
  const ascii = presets.locator('[data-preset="ascii"]');
  const all = presets.locator('[data-preset="all"]');
  await expect(ascii).toHaveAttribute('data-bytes', /^\d+$/);
  await expect(all).toHaveAttribute('data-bytes', /^\d+$/);
  expect(Number(await ascii.getAttribute('data-bytes'))).toBeLessThan(Number(await all.getAttribute('data-bytes')));
  await expect(all).toHaveAttribute('aria-pressed', 'true');

  await ascii.click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain('<bdf name="tiny" src="fonts/4x6.bdf" range="0x20-0x7E" />');
  await expect(ascii).toHaveAttribute('aria-pressed', 'true');
  await undo(page);
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
});

test('each font shows its size and users; removing a used font is refused, naming its users', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, 'globals.xml');
  const facts = form(page).locator('.asset-facts[data-asset="u8g2_font_6x10_mr"]');
  await expect(facts.locator('.asset-size')).toHaveAttribute('data-bytes', '1152');
  await expect(facts.locator('summary')).toHaveText(/^used by \d+ elements?$/);
  await form(page).getByRole('button', { name: 'Remove Built-in font u8g2_font_6x10_mr' }).click();
  const refusal = form(page).locator('.form-banner.refusal');
  await expect(refusal).toContainText("Font 'u8g2_font_6x10_mr' is still used by departures.row0");
  expect(await bufferText(page, 'globals.xml')).toBe(before);
});

test('removing an unused font works', async ({ page }) => {
  await open(page);
  await expect(form(page).locator('.asset-facts[data-asset="tiny"] .asset-users')).toHaveText('not used');
  await form(page).getByRole('button', { name: 'Remove BDF font tiny' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).not.toContain('<bdf name="tiny"');
  await expect(form(page).locator('.form-banner.refusal')).toHaveCount(0);
});
