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
 *          the screen's own.
 * Description: Each test starts `u8g2gl design` on a fresh copy of the
 *              departures project and selects through the canvas, as a user
 *              would.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { clickCanvas, openFile, openShell } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';

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
