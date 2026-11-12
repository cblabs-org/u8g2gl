/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/outlines.spec.ts
 * Purpose: The canvas toolbar's Outlines toggle, end to end (ui_spec §4): on,
 *          it boxes every element the frame draws, on the overlay and never
 *          in the frame, so the lit count and the frame's pixels are as they
 *          were; it is remembered across a reload; off, it draws none.
 * Description: The departures project, frozen, with no toolchain so the
 *              framework Wasm stays loaded for the whole test. Outlines are
 *              counted from the loop's composed overlay, and each one is
 *              checked on the overlay canvas itself: the pixel at its box's
 *              centre is blank with the toggle off and tinted with it on.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { canvasPixels, frameInfo, nextFrames, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
/** The overlay's margin past the frame, in CSS pixels (canvas-view.ts). */
const MARGIN = 10;

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

/** Opens the shell on the departures screen, frozen. */
async function open(page: Page, url: string): Promise<void> {
  await openShell(page, url);
  await openFile(page, SCREEN);
  const freeze = page.getByRole('button', { name: /live|frozen/ });
  if ((await freeze.getAttribute('aria-pressed')) !== 'true') await freeze.click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await nextFrames(page, 2);
}

/**
 * The frame's element boxes, how many outlines the loop composed, and the
 * overlay's alpha at the centre of each box.
 */
async function outlineState(page: Page): Promise<{ boxes: number; outlines: number; centreAlpha: number[] }> {
  return page.evaluate((margin) => {
    const loop = (window as unknown as TestHandle).__u8g2gl.loop;
    const overlay = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.overlay')!;
    const frame = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
    const zoom = frame.getBoundingClientRect().width / frame.width;
    const ratio = overlay.width / overlay.getBoundingClientRect().width;
    const context = overlay.getContext('2d')!;
    const boxes = [...loop.bounds.get().values()];
    const centreAlpha = boxes.map((box) => {
      const x = (box.x + box.width / 2) * zoom + margin;
      const y = (box.y + box.height / 2) * zoom + margin;
      return context.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data[3] ?? 0;
    });
    return { boxes: boxes.length, outlines: loop.overlay.filter((rect) => rect.kind === 'outline').length, centreAlpha };
  }, MARGIN);
}

const toggle = (page: Page) => page.getByRole('button', { name: 'Outlines' });

test('the Outlines toggle on boxes every drawn element on the overlay, and the frame and its lit count are unchanged', async ({ page }) => {
  session = await startDesign({ toolchain: false });
  await open(page, session.url);

  // --- Off by default: no outline composed, nothing on the overlay ---
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page)).toHaveAttribute('title', "Show every element's box");
  const off = await outlineState(page);
  expect(off.boxes).toBeGreaterThan(5);
  expect(off.outlines).toBe(0);
  expect(off.centreAlpha.every((alpha) => alpha === 0)).toBe(true);
  const before = await frameInfo(page);
  const pixelsBefore = await canvasPixels(page);

  // --- On: one outline per element box, each visible on the overlay ---
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await nextFrames(page, 2);
  const on = await outlineState(page);
  expect(on.boxes).toBe(off.boxes);
  expect(on.outlines).toBe(on.boxes);
  expect(on.centreAlpha.every((alpha) => alpha > 0)).toBe(true);

  // --- Overlay only: the frame's pixels and lit count are as they were ---
  const after = await frameInfo(page);
  expect(after.lit).toBe(before.lit);
  expect(await canvasPixels(page)).toBe(pixelsBefore);
});

test('the Outlines toggle survives a reload, and off draws none', async ({ page }) => {
  session = await startDesign({ toolchain: false });
  await open(page, session.url);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

  // --- On is remembered by this browser ---
  await open(page, session.url);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  const remembered = await outlineState(page);
  expect(remembered.outlines).toBe(remembered.boxes);
  expect(remembered.centreAlpha.every((alpha) => alpha > 0)).toBe(true);

  // --- Off clears every outline at once, and is remembered too ---
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await nextFrames(page, 1);
  const cleared = await outlineState(page);
  expect(cleared.outlines).toBe(0);
  expect(cleared.centreAlpha.every((alpha) => alpha === 0)).toBe(true);
  await open(page, session.url);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await outlineState(page)).outlines).toBe(0);
});
