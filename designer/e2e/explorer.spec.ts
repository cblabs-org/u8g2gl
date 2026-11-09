/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/explorer.spec.ts
 * Purpose: The Explorer in the real shell (ui_spec §6): grouped by what an
 *          author edits — Project, Screens, Widgets by name, Assets — with a
 *          widget's C++ carried by its entry rather than listed, a widget's
 *          entry opening its manifest, and the editor target's generated
 *          output hidden like the firmware's.
 * Description: The departures project, with a font and a `generated_editor/`
 *              file written into the copy, read back through the sidebar's
 *              accessible structure.
 */

import { expect, test } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { openFile, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

test('groups the project by what an author edits; a widget is one entry, opening its manifest; generated_editor/ is hidden', async ({ page }) => {
  session = await startDesign({
    files: { 'fonts/small.bdf': 'STARTFONT 2.1\nENDFONT\n', 'generated_editor/ui_editor_registry.cpp': '// GENERATED\n' },
  });
  await openShell(page, session.url);
  const explorer = page.getByRole('complementary', { name: 'Explorer' });

  // --- The groups, in order, and what each lists ---
  await expect(explorer.locator('.file-group h2')).toHaveText(['Project', 'Screens', 'Widgets', 'Assets']);
  const group = (title: string) => explorer.locator('.file-group').filter({ has: page.getByRole('heading', { name: title }) });
  await expect(group('Widgets').locator('.file')).toHaveText(['wd_probe_box', 'wd_service_list', 'wd_train_formation']);
  await expect(group('Assets').locator('.file')).toHaveText(['fonts/small.bdf']);

  // --- Neither a widget's C++ nor anything generated is listed ---
  await expect(explorer.locator('.file[data-path$=".cpp"], .file[data-path$=".hpp"]')).toHaveCount(0);
  await expect(explorer.locator('.file[data-path^="generated"]')).toHaveCount(0);

  // --- A widget's entry opens its manifest ---
  await openFile(page, 'widgets/wd_service_list/wd_service_list.xml');
  await expect(group('Widgets').locator('.file.active')).toHaveText('wd_service_list');
});
