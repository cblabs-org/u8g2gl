/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/fonts-view.spec.ts
 * Purpose: The Fonts view end to end (ui_spec §12): browse the built-ins,
 *          each sample drawn only as its row nears the view, and add one to
 *          the project as one undo stop; the string ruler's width is the
 *          width the canvas draws the same text at; and "Browse
 *          fonts…" from a label's font field, choosing a font the project has
 *          not declared, changes two documents, each undone on its own.
 * Description: Against the real `u8g2gl design` on a copy of the departures
 *              project, with no toolchain: the framework editor Wasm draws
 *              every font by injection. Undo is each Monaco model's own,
 *              through the test handle, as project-form.spec.ts does. The
 *              canvas's width of a label is the lit pixels inside its
 *              rectangle, read back from the frame canvas.
 */

import { expect, test, type Page } from '@playwright/test';
import FONT_NAMES from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import type { TestHandle } from '../src/test-hooks';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, openFile, openShell } from './support/shell';

const SCREEN = 'screens/screen_departures.xml';
/** A built-in font the departures project does not declare. */
const FONT = 'u8g2_font_ncenB08_tr';

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// undo
// Undoes the last stop of one file's buffer.
async function undo(page: Page, file: string): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), file);
}

// fontsView
// The Fonts view in the sidebar.
const fontsView = (page: Page) => page.getByRole('complementary', { name: 'Fonts' });

// openFontsView
// Opens the view from the activity bar.
async function openFontsView(page: Page): Promise<void> {
  await page.locator('.activity-bar').getByRole('button', { name: 'Fonts' }).click();
  await expect(fontsView(page)).toBeVisible();
}

// chooseBuiltin
// Searches the view's built-in list for a font and selects it.
async function chooseBuiltin(page: Page, name: string): Promise<void> {
  await fontsView(page).getByRole('textbox', { name: 'Search fonts' }).fill(name);
  await fontsView(page).locator(`.font-option[data-font="${name}"]`).click();
  await expect(fontsView(page).locator(`.font-detail[data-font="${name}"]`)).toBeVisible();
}

// canvasInk
// The lit pixels' box inside a device rectangle of the frame canvas.
async function canvasInk(page: Page, rect: readonly [number, number, number, number]): Promise<{ width: number; height: number }> {
  return page.evaluate(([rx, ry, rw, rh]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame');
    const context = canvas?.getContext('2d');
    if (canvas == null || context == null) return { width: -1, height: -1 };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if ((data[(y * canvas.width + x) * 4] ?? 0) > 128) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return maxX < 0 ? { width: 0, height: 0 } : { width: maxX - minX + 1, height: maxY - minY + 1 };
  }, rect);
}

test('browse the built-ins, see a font\'s glyphs, Add to project as one undo stop, and undo it', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  const before = await bufferText(page, 'globals.xml');
  await openFontsView(page);
  await expect(fontsView(page).locator('.font-project-row')).toHaveCount(2);
  // Every built-in is listed, but a sample is drawn only near the view.
  const options = fontsView(page).locator('.font-option');
  await expect(options).toHaveCount(FONT_NAMES.length);
  const drawn = await fontsView(page).locator('.font-option[data-drawn="true"]').count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(100);
  await options.nth(FONT_NAMES.length - 1).scrollIntoViewIfNeeded();
  await expect(options.nth(FONT_NAMES.length - 1)).toHaveAttribute('data-drawn', 'true');

  await chooseBuiltin(page, FONT);
  // The grid is drawn by the editor Wasm, one cell per glyph: 95 for a _tr font.
  await expect(fontsView(page).locator('canvas.glyph-grid')).toHaveAttribute('data-cells', '95');
  await expect(fontsView(page).getByRole('button', { name: 'Add to project' })).toBeVisible();
  await fontsView(page).getByRole('button', { name: 'Add to project' }).click();
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain(`<builtin name="${FONT}" />`);
  await expect(fontsView(page).locator('.font-project-row')).toHaveCount(3);
  await expect(fontsView(page).getByRole('button', { name: 'Add to project' })).toHaveCount(0);

  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(before);
});

test('the ruler\'s width and height are the canvas\'s for the same text in the same font', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFontsView(page);
  // plat_label draws "Plat" in u8g2_font_helvR08_tr inside x 5, y 6, 18 x 13.
  await fontsView(page).locator('.font-project-row[data-font="u8g2_font_helvR08_tr"]').click();
  await fontsView(page).getByRole('textbox', { name: 'Ruler text' }).fill('Plat');
  const reading = fontsView(page).locator('.font-ruler-reading');
  await expect(reading).toHaveText(/^\d+ × \d+ px, as drawn$/);
  // Its rectangle's last rows overlap the train formation's top edge (y 17),
  // so only the rows above it are read: "Plat" has no descender to lose.
  const canvas = await canvasInk(page, [5, 6, 18, 11]);
  expect(canvas.width).toBeGreaterThan(0);
  await expect(reading).toHaveAttribute('data-width', String(canvas.width));
  await expect(reading).toHaveAttribute('data-height', String(canvas.height));
});

test('"Browse fonts…" from a label, choosing an undeclared font, is two edits in two documents, each undone in its own', async ({ page }) => {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, 'globals.xml');
  await openFile(page, SCREEN);
  const globalsBefore = await bufferText(page, 'globals.xml');
  const screenBefore = await bufferText(page, SCREEN);
  await clickCanvas(page, 12, 12); // plat_label
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await panel.locator('[data-field="font"]').getByRole('button', { name: 'Browse fonts…' }).click();

  // --- The view opens for the field, and says what an undeclared choice costs ---
  await expect(fontsView(page).locator('.fonts-request')).toContainText('plat_label.font');
  await chooseBuiltin(page, FONT);
  await expect(fontsView(page).locator('[data-note="two-edits"]')).toContainText('two edits');
  await fontsView(page).getByRole('button', { name: 'Use for plat_label.font' }).click();

  // --- Two documents changed, and the view went back to the Explorer ---
  await expect.poll(() => bufferText(page, 'globals.xml')).toContain(`<builtin name="${FONT}" />`);
  await expect.poll(() => bufferText(page, SCREEN)).toContain(`name="plat_label" x="5" y="6" width="18" height="13" font="${FONT}"`);
  await expect(fontsView(page)).toHaveCount(0);

  // --- One undo in each document restores it ---
  await undo(page, SCREEN);
  await expect.poll(() => bufferText(page, SCREEN)).toBe(screenBefore);
  expect(await bufferText(page, 'globals.xml')).not.toBe(globalsBefore);
  await undo(page, 'globals.xml');
  await expect.poll(() => bufferText(page, 'globals.xml')).toBe(globalsBefore);
});
