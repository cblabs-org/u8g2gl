/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/palette.spec.ts
 * Purpose: The Palette in the real shell (ui_spec §6): the activity bar
 *          switches the primary sidebar between the Explorer and the Palette;
 *          the Palette lists the departures project's tags in their three
 *          groups, from its manifests, and its filter narrows them.
 * Description: The departures project, which declares three widgets of its
 *              own, so every group is present.
 */

import { expect, test } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('the activity bar shows the Palette: three groups from the manifests, and a filter that narrows them', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);

  // --- The Palette replaces the Explorer in the sidebar, and back ---
  await page.getByRole('button', { name: 'Palette' }).click();
  const palette = page.getByRole('complementary', { name: 'Palette' });
  await expect(palette).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Explorer' })).toHaveCount(0);
  await expect(palette.locator('.palette-group h2')).toHaveText(['Framework', 'Project', 'Drawing']);
  await expect(palette.locator('[data-group="Project"] .palette-tag')).toHaveText(['wd_probe_box', 'wd_service_list', 'wd_train_formation']);
  await expect(palette.locator('[data-group="Framework"] .palette-tag[data-tag="u8g2gl_label"]')).toBeVisible();
  await expect(palette.locator('[data-group="Drawing"] .palette-tag[data-tag="u8g2gl_line"]')).toBeVisible();

  // --- The filter narrows by name; a group left empty goes ---
  await palette.getByRole('searchbox', { name: 'Filter elements' }).fill('service');
  await expect(palette.locator('.palette-group h2')).toHaveText(['Project']);
  await expect(palette.locator('.palette-tag')).toHaveText(['wd_service_list']);
  await palette.getByRole('searchbox', { name: 'Filter elements' }).fill('zzz');
  await expect(palette.locator('.palette-note')).toHaveText(/No element matches/);

  await page.getByRole('button', { name: 'Explorer' }).click();
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
});
