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
 *          output hidden like the firmware's. And the entry's context menu
 *          (ui_spec §6): opened by right-click, Shift+F10 or the context-menu
 *          key, driven by the arrow keys, closed by Escape or a click outside;
 *          View source's read-only C++ tab; Open in editor and Reveal as
 *          token-carrying requests; Copy path; and a Problems row on a C++
 *          file landing in that tab at its line.
 * Description: The departures project, with a font and a `generated_editor/`
 *              file written into the copy, read back through the sidebar's
 *              accessible structure. Open in editor and Reveal are answered in
 *              the page by `page.route`, so no request reaches the server and
 *              nothing is started on the desktop; the session's own editor is
 *              a no-op besides (`support/design-session.ts`).
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { emscriptenOnPath, startDesign, type DesignSession } from './support/design-session';
import { openFile, openShell } from './support/shell';

const WIDGET = 'widgets/wd_service_list/wd_service_list.xml';
const WIDGET_CPP = 'widgets/wd_service_list/wd_service_list.cpp';

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

// row
// An Explorer entry by the path it opens.
function row(page: Page, path: string): Locator {
  return page.getByRole('complementary', { name: 'Explorer' }).locator(`.file[data-path="${path}"]`);
}

// menu
// The open context menu's top level.
function menu(page: Page): Locator {
  return page.getByRole('menu', { name: /actions$/ });
}

// focusedItem
// The label of the menu item with focus.
async function focusedItem(page: Page): Promise<string> {
  return page.evaluate(() => (document.activeElement?.getAttribute('role') === 'menuitem' ? (document.activeElement.textContent ?? '') : ''));
}

// interceptOpeners
// Answers /api/open and /api/reveal in the page, recording each request, so
// none reaches the server. Matched on the exact path, not a glob.
async function interceptOpeners(page: Page): Promise<{ route: string; body: unknown; token: boolean }[]> {
  const seen: { route: string; body: unknown; token: boolean }[] = [];
  await page.route(
    (url) => url.pathname === '/api/open' || url.pathname === '/api/reveal',
    async (route) => {
      const request = route.request();
      seen.push({
        route: new URL(request.url()).pathname,
        body: request.postDataJSON() as unknown,
        token: /^Bearer [0-9a-f]{64}$/.test(request.headers()['authorization'] ?? ''),
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    },
  );
  return seen;
}

test('the context menu opens by right-click, Shift+F10 and the context-menu key, moves by arrows, and closes by Escape or a click outside', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  const entry = row(page, WIDGET);

  // --- Right-click: the menu, focus on its first item ---
  await entry.click({ button: 'right' });
  // The label follows the browser's platform, which Playwright's device
  // emulation may report differently from the host's; read it from the page.
  const platform = await page.evaluate(
    () => (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform,
  );
  const reveal = /mac/i.test(platform) ? 'Reveal in Finder' : 'Reveal in file manager';
  await expect(menu(page).getByRole('menuitem')).toHaveText(['View source…›', 'Open in editor', reveal, 'Copy path']);
  expect(await focusedItem(page)).toBe('View source…›');

  // --- Arrows move and wrap; Escape closes and gives the row its focus back ---
  await page.keyboard.press('ArrowDown');
  expect(await focusedItem(page)).toBe('Open in editor');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focusedItem(page)).toBe('Copy path');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(entry).toBeFocused();

  // --- Shift+F10 and the context-menu key, from the focused row ---
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.press('ContextMenu');
  await expect(menu(page)).toBeVisible();

  // --- A submenu opens on → and closes on ←, back to its parent ---
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', { name: 'View source…' }).getByRole('menuitem')).toHaveText([
    'wd_service_list.xml',
    'wd_service_list.cpp',
    'wd_service_list.hpp',
  ]);
  expect(await focusedItem(page)).toBe('wd_service_list.xml');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menu', { name: 'View source…' })).toHaveCount(0);
  expect(await focusedItem(page)).toBe('View source…›');

  // --- A click outside closes it, runs nothing, and leaves focus where it went ---
  await page.locator('.canvas-frame').click({ position: { x: 5, y: 5 } });
  await expect(menu(page)).toHaveCount(0);
  await expect(entry).not.toBeFocused();

  // --- A row with nothing to view has no View source… ---
  await row(page, 'globals.xml').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page).getByRole('menuitem')).toHaveCount(3);
});

test('View source opens a read-only C++ tab, highlighted, read through the server; the manifest opens in its editor', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await row(page, WIDGET).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /View source/ }).hover();
  await page.getByRole('menu', { name: 'View source…' }).getByRole('menuitem', { name: 'wd_service_list.cpp' }).click();
  await expect(menu(page)).toHaveCount(0);

  // --- The tab: titled read-only, showing the file's text in C++ colours ---
  await expect(page.locator('.dv-tab', { hasText: 'wd_service_list.cpp (read-only)' })).toBeVisible();
  const host = page.locator(`.editor-host[data-source-path="${WIDGET_CPP}"]`);
  await expect(host.locator('.view-lines')).toContainText('#include "wd_service_list.hpp"');
  const tokenClasses = await host.locator('.view-lines span[class^="mtk"]').evaluateAll((spans) => new Set(spans.map((span) => span.className)).size);
  expect(tokenClasses).toBeGreaterThan(2);

  // --- Typing changes nothing, on screen or on disk ---
  const disk = session.read(WIDGET_CPP);
  await host.locator('.view-lines').click();
  await page.keyboard.type('xyz');
  await expect(host.locator('.view-lines')).not.toContainText('xyz');
  expect(session.read(WIDGET_CPP)).toBe(disk);

  // --- A change on disk reaches the open tab ---
  session.write(WIDGET_CPP, `// changed outside\n${disk}`);
  await expect(host.locator('.view-lines')).toContainText('// changed outside');

  // --- The manifest, from the same submenu, opens as the document it is ---
  await row(page, WIDGET).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /View source/ }).press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator(`.editor-host[data-editor-path="${WIDGET}"] .monaco-editor`)).toBeVisible();
});

test('Open in editor and Reveal send the project path with the token; Copy path copies it', async ({ page, context }) => {
  session = await startDesign();
  const seen = await interceptOpeners(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openShell(page, session.url);

  for (const name of ['Open in editor', /^Reveal in /]) {
    await row(page, WIDGET).click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name }).click();
    await expect(menu(page)).toHaveCount(0);
  }
  await expect.poll(() => seen.length).toBe(2);
  expect(seen).toEqual([
    { route: '/api/open', body: { path: WIDGET }, token: true },
    { route: '/api/reveal', body: { path: WIDGET }, token: true },
  ]);

  await row(page, 'globals.xml').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Copy path' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('globals.xml');
});

test('a Problems row on a widget\'s C++ opens its read-only tab at the line', async ({ page }) => {
  test.skip(!emscriptenOnPath(), 'skipped, no Emscripten 5.0.3 on PATH');
  test.setTimeout(600_000);
  const broken = 'widgets/wd_probe_box/wd_probe_box.cpp';
  session = await startDesign({ toolchain: true });
  // A syntax error at a known line, so the editor Wasm build fails there.
  const text = session.read(broken).split('\n');
  const line = text.length + 1;
  session.write(broken, `${text.join('\n')}\nint u8g2gl_broken = ;\n`);
  await openShell(page, session.url);

  const problem = page.locator('.problem', { hasText: `${broken}:${line}:` }).first();
  await expect(problem).toBeVisible({ timeout: 400_000 });
  await problem.click();

  // --- The read-only tab, with the caret on the faulty line ---
  const host = page.locator(`.editor-host[data-source-path="${broken}"]`);
  await expect(page.locator('.dv-tab', { hasText: 'wd_probe_box.cpp (read-only)' })).toBeVisible();
  await expect(host.locator('.view-lines')).toContainText('int u8g2gl_broken = ;');
  // Monaco marks the caret's line number in the gutter.
  await expect(host.locator('.line-numbers.active-line-number')).toHaveText(String(line));
});
