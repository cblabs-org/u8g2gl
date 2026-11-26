/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/input.spec.ts
 * Purpose: Input (§12) authored and previewed entirely from the designer, with
 *          no XML typed: a focus ring built from the screen's panel, events
 *          from each element's, then the canvas preview stepping focus,
 *          toggling a bound switch, loading another screen and going back —
 *          the device's own code running in the bridge — and the files on disk
 *          holding exactly what the forms wrote.
 * Description: `u8g2gl design` on a copy of the departures project with two
 *              screens of framework elements added and a bool subject in its
 *              globals, so the framework editor Wasm draws them all.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_FIXTURE, startDesign, type DesignSession } from './support/design-session';
import { bufferText, canvasPixels, clickCanvas, litIn, openFile, openShell } from './support/shell';

const MENU = 'screens/screen_menu.xml';
const DETAIL = 'screens/screen_detail.xml';

const FONT = 'font="u8g2_font_6x10_mr"';
const MENU_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="menu">
    <view>
        <u8g2gl_button name="go" x="0" y="0" width="60" height="14" ${FONT} text="Go" />
        <u8g2gl_switch name="sw" x="70" y="2" width="24" height="12" bind_value="wifi" />
        <u8g2gl_label name="about" x="0" y="30" width="60" height="12" ${FONT} text="About" />
    </view>
</screen>
`;
const DETAIL_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="detail">
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="100" height="12" ${FONT} text="Detail" />
        <u8g2gl_button name="back" x="0" y="30" width="60" height="14" ${FONT} text="Back" />
    </view>
</screen>
`;
/** The fixture's globals with a bool subject for the switch. */
const GLOBALS_TEXT = readFileSync(join(PROJECT_FIXTURE, 'globals.xml'), 'utf8').replace(
  '    <subjects>\n',
  '    <subjects>\n        <bool name="wifi" value="false" />\n',
);

/** The go button's box, in device pixels, and how many lit pixels mean it is drawn inverted. */
const GO = { x: 0, y: 0, width: 60, height: 14 };
const GO_INVERTED = (60 * 14) / 2;

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** The panel's region. */
const panel = (page: Page) => page.getByRole('complementary', { name: 'Properties' });
/** The input preview's state, on the toolbar. */
const previewState = (page: Page) => page.locator('.input-preview-state');

/** The frame's pixels once two reads a frame apart agree: a frame, not a frame in between. */
async function settledPixels(page: Page): Promise<string> {
  let last = await canvasPixels(page);
  for (;;) {
    await page.waitForTimeout(100);
    const now = await canvasPixels(page);
    if (now === last) return now;
    last = now;
  }
}

/** Opens a screen with a still frame and nothing selected. */
async function showScreen(page: Page, path: string): Promise<void> {
  await openFile(page, path);
  await page.keyboard.press('Escape');
  await expect(panel(page).locator('[data-section="focus-ring"]')).toBeVisible();
}

/** Adds `name` to the shown screen's ring from its panel. */
async function addToRing(page: Page, name: string): Promise<void> {
  const ring = panel(page).locator('[data-section="focus-ring"]');
  await ring.getByRole('combobox', { name: 'Element to add to the ring' }).selectOption(name);
  await ring.getByRole('button', { name: 'Add to ring' }).click();
  await expect(ring.locator(`[data-member="${name}"]`)).toBeVisible();
}

/** Selects an element on the canvas by a device pixel inside it. */
async function select(page: Page, name: string, x: number, y: number): Promise<void> {
  await clickCanvas(page, x, y);
  await expect(panel(page).locator('.panel-subtitle')).toHaveText(name);
}

/** Adds an event to the selected element from its panel. */
async function addEvent(page: Page, label: string): Promise<void> {
  const input = panel(page).locator('[data-section="input"]');
  await input.getByRole('combobox', { name: 'New event action' }).selectOption({ label });
  await input.getByRole('button', { name: 'Add event' }).click();
}

test('a focus ring and events authored from the forms alone, previewed on the canvas, and written to disk as the forms said', async ({ page }) => {
  session = await startDesign({ files: { [MENU]: MENU_TEXT, [DETAIL]: DETAIL_TEXT, 'globals.xml': GLOBALS_TEXT } });
  await openShell(page, session.url);
  await openFile(page, MENU);
  await page.getByRole('button', { name: /live/ }).click();

  // --- The menu's ring: picked members only, in the order picked ---
  await showScreen(page, MENU);
  const ring = panel(page).locator('[data-section="focus-ring"]');
  await expect(ring.getByRole('combobox', { name: 'Element to add to the ring' }).locator('option')).toHaveText(['go', 'sw', 'about']);
  await addToRing(page, 'go');
  await addToRing(page, 'sw');
  await expect(ring.locator('[data-member]')).toHaveText([/^go/, /^sw/]);
  // The highlight-only check (Q1a): go has no events yet, so it is flagged.
  await expect(ring.locator('[data-member="go"] .field-problem')).toContainText('has no events');
  // The Explorer marks each member with its stop.
  await expect(page.locator('.element-tree [aria-label="focus ring stop 1"]')).toBeVisible();

  // --- go loads the detail screen ---
  await select(page, 'go', 10, 7);
  await expect(panel(page).locator('[data-section="input"] .panel-note')).toHaveText('Focus ring stop 1.');
  await addEvent(page, 'Load screen');
  await panel(page).getByRole('combobox', { name: 'Event 1 screen' }).selectOption('detail');
  await expect(ring).toHaveCount(0);  // an element is selected: the screen's ring is not shown

  // --- The detail screen: back is its one stop, and goes back ---
  await showScreen(page, DETAIL);
  await addToRing(page, 'back');
  await select(page, 'back', 10, 36);
  await addEvent(page, 'Back');

  // --- The buffers hold exactly what the forms wrote ---
  const menu = await bufferText(page, MENU);
  expect(menu).toContain('<u8g2gl_button name="go" x="0" y="0" width="60" height="14" font="u8g2_font_6x10_mr" text="Go">');
  expect(menu).toContain('<screen_load_event trigger="press" screen="detail" />');
  expect(menu).toMatch(/<focus_ring wrap="true">\s*<focus name="go" \/>\s*<focus name="sw" \/>\s*<\/focus_ring>\s*<\/view>/);
  const detail = await bufferText(page, DETAIL);
  expect(detail).toContain('<screen_back_event trigger="press" />');
  expect(detail).toMatch(/<focus_ring wrap="true">\s*<focus name="back" \/>\s*<\/focus_ring>/);

  // --- Preview: step focus, toggle the bound switch, load and go back ---
  await openFile(page, MENU);
  await page.keyboard.press('Escape');
  await expect.poll(() => litIn(page, GO)).toBeLessThan(GO_INVERTED);
  const editing = await settledPixels(page);
  await page.getByRole('button', { name: '◎ Preview input' }).click();
  await expect(previewState(page)).toHaveAttribute('data-focused', 'go');
  // The focused button draws inverted (Q3a): the frame is no longer the editing one.
  await expect.poll(() => canvasPixels(page)).not.toBe(editing);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(previewState(page)).toHaveAttribute('data-focused', 'sw');
  const off = await canvasPixels(page);
  await page.getByRole('button', { name: 'Press', exact: true }).click();
  await expect.poll(() => canvasPixels(page)).not.toBe(off);  // the thumb moved: focus did not
  await page.keyboard.press('ArrowLeft');  // the key does what Previous does
  await expect(previewState(page)).toHaveAttribute('data-focused', 'go');
  // Settled: the go button drawn inverted, as focus draws it (Q3a).
  await expect.poll(() => litIn(page, GO)).toBeGreaterThan(GO_INVERTED);
  const goWithSwitchOn = await canvasPixels(page);
  await page.keyboard.press('Enter');
  await expect(previewState(page)).toHaveAttribute('data-screen', 'detail');
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('detail');
  await expect(previewState(page)).toHaveAttribute('data-focused', 'back');
  await page.getByRole('button', { name: 'Press', exact: true }).click();
  await expect(previewState(page)).toHaveAttribute('data-screen', 'menu');
  await expect(previewState(page)).toHaveAttribute('data-focused', 'go');
  // The same frame as before the load: focus restored, and the switch still on,
  // because the subject kept its value across the load and back.
  // Settled: the go button inverted again, as before the load.
  await expect.poll(() => litIn(page, GO)).toBeGreaterThan(GO_INVERTED);
  await expect.poll(() => canvasPixels(page)).toBe(goWithSwitchOn);

  // --- Leaving restores the editing state: no focus, the switch as the text says ---
  await page.getByRole('button', { name: '◎ Stop preview' }).click();
  await expect(page.getByRole('button', { name: '◎ Preview input' })).toBeVisible();
  await expect.poll(() => litIn(page, GO)).toBeLessThan(GO_INVERTED);
  await expect.poll(() => settledPixels(page)).toBe(editing);

  // --- Saved, the files on disk are the buffers ---
  await page.locator('.status-bar .unsaved-save').click();
  await expect.poll(() => session!.read(MENU)).toBe(menu);
  await expect.poll(() => session!.read(DETAIL)).toBe(detail);
});

test('an event added and then undone leaves the text as it was', async ({ page }) => {
  session = await startDesign({ files: { [MENU]: MENU_TEXT, [DETAIL]: DETAIL_TEXT, 'globals.xml': GLOBALS_TEXT } });
  await openShell(page, session.url);
  await openFile(page, MENU);
  await page.getByRole('button', { name: /live/ }).click();
  await select(page, 'sw', 80, 7);
  await addEvent(page, 'Callback');
  await expect.poll(() => bufferText(page, MENU)).toContain('<event_cb trigger="press" callback="on_event" />');
  await panel(page).getByRole('combobox', { name: 'Event 1 trigger' }).selectOption('value_changed');
  await expect.poll(() => bufferText(page, MENU)).toContain('<event_cb trigger="value_changed" callback="on_event" />');

  const mac = await page.evaluate(() => /Macintosh/.test(navigator.userAgent));
  await page.locator(`.editor-host[data-editor-path="${MENU}"] .view-lines`).click();
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
  await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
  await expect.poll(() => bufferText(page, MENU)).toBe(MENU_TEXT);
});
