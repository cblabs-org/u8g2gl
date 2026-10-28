/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/overlays.spec.ts
 * Purpose: What the canvas draws *about* the selection, end to end (ui_spec §6,
 *          §8): each selected element gets handles and an `x, y, w×h` badge,
 *          a marquee shows while it is dragged, and the status bar reads the
 *          selection's geometry — all drawn over the framebuffer, never into
 *          it, and crisp on a high-density screen at every zoom. And the
 *          per-frame rule (EDITOR-DESIGN §3.3): a selection change re-renders
 *          only what shows the selection — the status bar's geometry readout
 *          and the property panel; every other component of the shell
 *          renders not once.
 * Description: The departures project, frozen, at a device pixel ratio of 2.
 *              The overlay is read back from its own canvas; the frame's pixels
 *              are hashed before and after selecting. Render counts come from
 *              the test build's counter (`src/perf/render-count.ts`).
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { canvasPixels, clickCanvas, devicePoint, nextFrames, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_departures.xml';
/** The overlay's margin past the frame, in CSS pixels (canvas-view.ts). */
const MARGIN = 10;

test.use({ deviceScaleFactor: 2 });

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

/** The overlay's size, its backing store, and its pixel at CSS point (x, y) from the frame's corner. */
async function overlayAt(page: Page, x: number, y: number): Promise<{ css: number; backing: number; rgba: number[] }> {
  return page.evaluate(
    ({ x, y, margin }) => {
      const overlay = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.overlay');
      if (overlay === null) throw new Error('no overlay');
      const ratio = overlay.width / overlay.getBoundingClientRect().width;
      const data = overlay.getContext('2d')!.getImageData(Math.floor((x + margin) * ratio), Math.floor((y + margin) * ratio), 1, 1).data;
      return { css: overlay.getBoundingClientRect().width, backing: overlay.width, rgba: [...data] };
    },
    { x, y, margin: MARGIN },
  );
}

/** The current zoom: CSS pixels per device pixel. */
async function zoomOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
    return frame.getBoundingClientRect().width / frame.width;
  });
}

const isWhite = (rgba: number[]): boolean => rgba[0]! > 200 && rgba[1]! > 200 && rgba[2]! > 200 && rgba[3]! > 200;
const isBlank = (rgba: number[]): boolean => rgba[3] === 0;

for (const zoom of ['1', '8'] as const) {
  test(`a selected element has handles and a badge on the overlay, crisp at ${zoom}×, and the frame is untouched`, async ({ page }) => {
    await open(page);
    await page.getByLabel('Zoom').selectOption(zoom);
    await nextFrames(page, 2);
    const scale = await zoomOf(page);
    expect(scale).toBe(Number(zoom));
    const frameBefore = await canvasPixels(page);
    expect(isBlank((await overlayAt(page, -1, -1)).rgba)).toBe(true);

    // plat_box: 0, 0, 28 × 51, against the display's top-left corner, so its
    // outline and handles lie in the overlay's margin and its badge goes below.
    await clickCanvas(page, 2, 2);
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.selection.current.get().names))).toEqual(['plat_box']);
    await nextFrames(page, 2);
    const left = -1;
    const top = -1;
    const right = 28 * scale + 1;
    const bottom = 51 * scale + 1;
    // Crisp: the overlay's backing store is its CSS size at the device pixel ratio.
    const corner = await overlayAt(page, left, top);
    expect(corner.backing).toBe(Math.round(corner.css * 2));
    // A handle on each corner and edge midpoint, white inside a blue edge.
    for (const [x, y] of [[left, top], [right, top], [(left + right) / 2, top], [right, (top + bottom) / 2], [left, bottom], [right, bottom]] as const) {
      expect(isWhite((await overlayAt(page, x, y)).rgba), `handle at ${x},${y}`).toBe(true);
    }
    // No room above, so the badge sits below the element, in the selection's blue.
    const badge = await overlayAt(page, left + 2, bottom + 3 + 3);
    expect(badge.rgba[2]!, 'badge').toBeGreaterThan(200);
    expect(badge.rgba[3]).toBe(255);
    // The frame's own pixels are exactly what they were.
    expect(await canvasPixels(page)).toBe(frameBefore);
  });
}

test('a marquee shows on the overlay while it is dragged, and is gone on release', async ({ page }) => {
  await open(page);
  const scale = await zoomOf(page);
  const start = await devicePoint(page, 150, 52);
  const end = await devicePoint(page, 230, 62);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await nextFrames(page, 1);
  const inside = await overlayAt(page, 190 * scale, 57 * scale);
  expect(inside.rgba[3], 'marquee fill').toBeGreaterThan(0);
  await page.mouse.up();
  await nextFrames(page, 1);
  // Released: the two elements it touched are selected, and no marquee remains
  // between their outlines.
  await expect(page.locator('.selection-geometry')).toHaveText('sel 2 · 0,51 256×13');
  expect(isBlank((await overlayAt(page, 170 * scale, 57 * scale)).rgba)).toBe(true);
});

test('the status bar reads one element’s geometry, or the box around several', async ({ page }) => {
  await open(page);
  await expect(page.locator('.selection-geometry')).toHaveCount(0);
  await clickCanvas(page, 220, 57);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 190,51 66×13');
  await clickCanvas(page, 4, 2, ['Shift']); // plat_box, 0,0 28×51
  await expect(page.locator('.selection-geometry')).toHaveText('sel 2 · 0,0 256×64');
  await page.keyboard.press('Escape');
  await expect(page.locator('.selection-geometry')).toHaveCount(0);
});

test('a selection change re-renders only what shows the selection: the status bar’s geometry readout and the property panel', async ({ page }) => {
  await open(page);
  const counts = (): Promise<Record<string, number>> => page.evaluate(() => (window as unknown as TestHandle).__u8g2glRenders());
  // Settle: the Wasm status and the first frames have rendered what they will.
  await expect(page.locator('.status-item.wasm')).toHaveAttribute('data-wasm', /none|current|failed/, { timeout: 30_000 });
  await clickCanvas(page, 220, 57);
  await nextFrames(page, 3);
  await page.keyboard.press('Escape');
  await nextFrames(page, 3);

  const before = await counts();
  // Click, cycle, another element, a marquee, Esc: five selection changes.
  await clickCanvas(page, 10, 25);
  await nextFrames(page, 2);
  await clickCanvas(page, 10, 25);
  await nextFrames(page, 2);
  await clickCanvas(page, 220, 57);
  await nextFrames(page, 2);
  const start = await devicePoint(page, 150, 52);
  const end = await devicePoint(page, 230, 62);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await nextFrames(page, 2);
  await page.keyboard.press('Escape');
  await nextFrames(page, 3);
  const after = await counts();

  const rendered = Object.fromEntries(
    Object.keys({ ...before, ...after })
      .map((name) => [name, (after[name] ?? 0) - (before[name] ?? 0)] as const)
      .filter(([, n]) => n > 0),
  );
  console.log(`renders across five selection changes: ${JSON.stringify(rendered)}`);
  // The property panel shows the selection, so it re-renders for it; nothing
  // else in the shell may.
  const showsSelection = (name: string): boolean => name === 'SelectionGeometry' || name === 'PropertyPanel' || name.startsWith('Panel');
  expect(Object.keys(rendered).filter((name) => !showsSelection(name))).toEqual([]);
  expect(rendered.SelectionGeometry).toBeGreaterThanOrEqual(5);
});

// The render-count check's self-test: a change that does re-render another
// component must show up, so the check above passing means something. Toggling
// the freeze re-renders the canvas panel's toolbar.
test('self-test of the render count: a change to the canvas panel’s own state is counted there', async ({ page }) => {
  await open(page);
  const counts = (): Promise<Record<string, number>> => page.evaluate(() => (window as unknown as TestHandle).__u8g2glRenders());
  const before = await counts();
  await page.getByRole('button', { name: /frozen/ }).click();
  await nextFrames(page, 2);
  const after = await counts();
  expect((after.CanvasPanel ?? 0) - (before.CanvasPanel ?? 0)).toBeGreaterThan(0);
});
