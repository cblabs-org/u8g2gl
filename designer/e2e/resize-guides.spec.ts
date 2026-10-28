/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/resize-guides.spec.ts
 * Purpose: Resizing, snapping and overflow on the canvas, end to end (ui_spec
 *          §8, EDITOR-DESIGN §3.5): a handle rewrites the edge it is on; a drag
 *          snaps to a guide within 3 screen pixels, at more than one zoom, and
 *          the guide is drawn on the overlay while it holds; and a drag past
 *          the display's edge is allowed, written, hatched and raised in
 *          Problems, never stopped at the edge.
 * Description: The departures project, frozen, driven with real mouse events.
 *              The overlay is read back from its own canvas.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, devicePoint, dragCanvas, nextFrames, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
/** The overlay's margin past the frame, in CSS pixels (canvas-view.ts). */
const MARGIN = 10;

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

async function open(page: Page): Promise<void> {
  session = await startDesign();
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  await page.getByRole('button', { name: /live/ }).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
}

/** The line of the buffer that names `name`. */
async function lineOf(page: Page, name: string): Promise<string> {
  return (await bufferText(page, SCREEN)).split('\n').find((line) => line.includes(`name="${name}"`)) ?? '';
}

/** The current zoom: CSS pixels per device pixel. */
async function zoomOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
    return frame.getBoundingClientRect().width / frame.width;
  });
}

/** Whether the overlay at CSS point (x, y) from the frame's corner is the guides' magenta. */
async function isGuide(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ({ x, y, margin }) => {
      const overlay = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.overlay')!;
      const ratio = overlay.width / overlay.getBoundingClientRect().width;
      const [r = 0, g = 0, b = 0, a = 0] = overlay.getContext('2d')!.getImageData(Math.floor((x + margin) * ratio), Math.floor((y + margin) * ratio), 1, 1).data;
      return a > 0 && r > 200 && g < 140 && b > 150;
    },
    { x, y, margin: MARGIN },
  );
}

test('dragging a selected element’s handle resizes it by the edge the handle is on', async ({ page }) => {
  await open(page);
  // sys_clock: x="190" y="51" width="66" height="13". Its left-middle handle,
  // at the outline's left edge, dragged 5 device pixels left.
  await clickCanvas(page, 220, 57);
  const zoom = await zoomOf(page);
  const box = await page.locator('.canvas-frame canvas.frame').boundingBox();
  if (box === null) throw new Error('no frame');
  const handle = { x: box.x + 190 * zoom - 1, y: box.y + 57.5 * zoom };
  await page.mouse.move(handle.x, handle.y);
  expect(await page.locator('.canvas-frame').evaluate((element) => element.style.cursor)).toBe('ew-resize');
  await page.mouse.down();
  await page.mouse.move(handle.x - 5 * zoom, handle.y, { steps: 6 });
  await page.mouse.up();
  expect(await lineOf(page, 'sys_clock')).toContain('name="sys_clock" x="185" y="51" width="71" height="13"');
});

for (const zoom of [1, 2] as const) {
  test(`at ${zoom}×, a drag snaps to a guide 2 screen pixels away, shown while it holds, and not to one 4 away`, async ({ page }) => {
    await open(page);
    await page.getByLabel('Zoom').selectOption(String(zoom));
    await nextFrames(page, 2);
    expect(await zoomOf(page)).toBe(zoom);

    // plat_box: x="0", 28 wide. Pressed at (2, 10), where nothing covers it, and
    // dragged so its right edge (28) ends 2 screen pixels past the display's
    // centre (128): the guide takes it back to exactly x = 100.
    const start = await devicePoint(page, 2, 10);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 100 * zoom + 2, start.y, { steps: 10 });
    await nextFrames(page, 2);
    expect(await isGuide(page, 128 * zoom - 1, 60 * zoom)).toBe(true);
    await page.mouse.up();
    expect(await lineOf(page, 'plat_box')).toContain('name="plat_box" x="100" y="0"');
    await nextFrames(page, 1);
    expect(await isGuide(page, 128 * zoom - 1, 60 * zoom), 'guides go with the drag').toBe(false);

    // Undo, then 4 screen pixels past: out of reach, so the delta is only rounded.
    await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), SCREEN);
    await nextFrames(page, 2);
    await dragCanvas(page, [2, 10], [2 + 100 + 4 / zoom, 10]);
    expect(await lineOf(page, 'plat_box')).toContain(`name="plat_box" x="${100 + 4 / zoom}" y="0"`);
  });
}

test('a drag past the display’s edge is written, and the element hatched and raised in Problems', async ({ page }) => {
  await open(page);
  // row0: x="32", 224 wide, so its right edge is on the display's (256). Ten more.
  await dragCanvas(page, [100, 8], [110, 8]);
  expect(await lineOf(page, 'row0')).toContain('name="row0" x="42" y="0"');
  await expect
    .poll(() => page.evaluate(() => [...((window as unknown as TestHandle).__u8g2gl.loop.frameState.get().hatched ?? [])]))
    .toContain('row0');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  const problems = await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.problems.get().map((row) => row.message));
  expect(problems.some((message) => /row0|display|bounds|overflow|extends/i.test(message)), JSON.stringify(problems)).toBe(true);
});
