/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/font-injection.spec.ts
 * Purpose: Fonts reach the canvas by injection, not by a build (design_spec
 *          §9). Adding a `<builtin>` font and using it on a label draws it in
 *          the next frames with no editor Wasm build requested; and a project
 *          with no widgets draws a font the framework Wasm was never built
 *          with, on a machine with no toolchain at all.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, with Emscripten kept off the server's PATH. Files are
 *              written to disk, as an IDE beside the designer writes them, so
 *              the change goes through the same notice a build would be
 *              requested from. A font drawn from injected bytes leaves no
 *              status-bar warning; one drawn in the bridge's fallback would.
 */

import { expect, test, type Page } from '@playwright/test';
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { canvasPixels, frameInfo, openShell } from './support/shell';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** A built-in font neither the framework fixture nor the departures project declares. */
const FONT = 'u8g2_font_ncenB08_tr';

// newFrame
// Waits for the canvas to draw a fresh, non-stale frame different from `before`.
async function newFrame(page: Page, before: string): Promise<void> {
  await expect.poll(async () => (await frameInfo(page)).stale === false && (await canvasPixels(page)) !== before, { timeout: 10_000 }).toBe(true);
}

test('adding a <builtin> font and using it on a label renders it, with no editor Wasm build requested', async ({ page }) => {
  session = await startDesign();
  const builds: string[] = [];
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/build/')) builds.push(request.url());
    if (request.url().includes('/api/font/builtin')) fonts.push(new URL(request.url()).searchParams.get('name') ?? '');
  });
  await openShell(page, session.url);
  // The session's own first build request has been made (and refused: no toolchain).
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'none', { timeout: 20_000 });
  const before = await canvasPixels(page);
  builds.length = 0;

  // --- The IDE writes both files: declare the font, then use it ---
  session.write('globals.xml', session.read('globals.xml').replace('<fonts>', `<fonts>\n        <builtin name="${FONT}" />`));
  session.write(
    'screens/screen_departures.xml',
    session.read('screens/screen_departures.xml').replace('name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_helvR08_tr"', `name="plat_label" x="5" y="6" width="18" height="13" font="${FONT}"`),
  );
  await newFrame(page, before);
  await expect(page.locator('.status-item.asset-note')).toHaveCount(0);
  expect(fonts).toContain(FONT);
  // Give a build request every chance to be made: none is.
  await page.waitForTimeout(1000);
  expect(builds).toEqual([]);
});

test('a project with no widgets draws a font the framework Wasm was not built with, with no toolchain', async ({ page }) => {
  const screen = (font: string) =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<screen name="departures">',
      '    <view>',
      `        <u8g2gl_label name="hello" x="4" y="4" width="200" height="16" font="${font}" text="Hello, injected font" />`,
      '    </view>',
      '</screen>',
      '',
    ].join('\n');
  session = await startDesign({
    remove: ['widgets'],
    files: {
      'globals.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<globals>\n    <fonts>\n        <builtin name="${FONT}" />\n        <builtin name="u8g2_font_4x6_tr" />\n    </fonts>\n</globals>\n`,
      'screens/screen_departures.xml': screen(FONT),
    },
  });
  await openShell(page, session.url);
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', 'none', { timeout: 20_000 });
  await expect.poll(async () => (await frameInfo(page)).lit, { timeout: 10_000 }).toBeGreaterThan(0);
  // Drawn from the font's own bytes: the bridge's fallback would warn here.
  await expect(page.locator('.status-item.asset-note')).toHaveCount(0);
  const injected = await canvasPixels(page);

  // And it is not the fallback's drawing: the same text in u8g2_font_4x6_tr differs.
  session.write('screens/screen_departures.xml', screen('u8g2_font_4x6_tr'));
  await newFrame(page, injected);
});

test('a module without the injection exports draws its own fonts, and the status bar says why', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await expect(page.locator('.status-item.asset-note')).toHaveCount(0);
  // As a project editor Wasm cached by an older CLI would be: no inject exports.
  await page.evaluate(() => {
    const wasm = (window as unknown as TestHandle).__u8g2gl.wasm;
    const module = wasm.module.get();
    if (module !== undefined) wasm.module.set({ ...module, assetInjection: false });
  });
  await expect(page.locator('.status-item.asset-note')).toContainText('predates font injection');
  expect((await frameInfo(page)).stale).toBe(false);
});
