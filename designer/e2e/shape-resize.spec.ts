/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/shape-resize.spec.ts
 * Purpose: Shapes not placed by a box, on the real canvas (ui_spec §8): a
 *          triangle's corner handle scales its vertices about the opposite
 *          corner, a vertex handle drags one vertex alone, each as one undo
 *          stop; a circle, boxed by what it draws, is selected and resized by
 *          its radius with its opposite edge kept; and an element a handle
 *          cannot resize says why in the property panel as soon as it is
 *          selected. A single selected line, hline or vline has no box
 *          handles, only a round handle at each end: an hline's or vline's
 *          end moves along its axis with the other end held, a line's end
 *          moves that vertex alone, and none of them says "Can't resize".
 * Description: A screen of the test's own beside the departures project,
 *              opened so the canvas draws it. Handles are found from the
 *              selection's box and the frame's on-screen scale, as the
 *              overlay draws them; the text is read back from the Monaco model.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { bufferText, clickCanvas, devicePoint, nextFrames, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SHAPES = 'screens/screen_shapes.xml';

// shapesScreen
// A screen holding one element, written as `element`.
function shapesScreen(element: string): string {
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<screen name="shapes">', '    <view>', `        ${element}`, '    </view>', '</screen>', ''].join('\n');
}

// triangleScreen
// A screen holding one triangle, its second vertex written as `x1`.
function triangleScreen(x1: string): string {
  return shapesScreen(`<u8g2gl_triangle name="tri" x0="20" y0="10" x1="${x1}" y1="10" x2="40" y2="40" />`);
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// openScreen
// A screen on the canvas, with the element at device pixel `at` selected by a click.
//   text — the screen
//   name — the element the click selects
//   at   — a device pixel inside its drawn box
async function openScreen(page: Page, text: string, name: string, at: readonly [number, number]): Promise<void> {
  session = await startDesign({ files: { [SHAPES]: text } });
  await openShell(page, session.url);
  await openFile(page, SHAPES);
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('shapes');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await clickCanvas(page, at[0], at[1]);
  await expect.poll(() => page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.selection.current.get().names)).toEqual([name]);
  await nextFrames(page, 2);
}

// open
// The triangle screen on the canvas, with the triangle selected.
async function open(page: Page, x1 = '60'): Promise<void> {
  await openScreen(page, triangleScreen(x1), 'tri', [40, 20]);
}

/** The line of the buffer naming `name`. */
async function lineOf(page: Page, name: string): Promise<string> {
  return (await bufferText(page, SHAPES)).split('\n').find((line) => line.includes(`name="${name}"`))?.trim() ?? '';
}

/** The triangle's line in the buffer. */
async function triangle(page: Page): Promise<string> {
  return lineOf(page, 'tri');
}

// boxHandle
// The page position of a selection handle, as the overlay draws it: on the
// outline one screen pixel outside the drawn box, at (fx, fy) along it.
async function boxHandle(page: Page, rect: { x: number; y: number; width: number; height: number }, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const canvas = page.locator('.canvas-frame canvas.frame');
  const box = await canvas.boundingBox();
  const width = await canvas.evaluate((element: HTMLCanvasElement) => element.width);
  if (box === null) throw new Error('the frame canvas is not laid out');
  const scale = box.width / width;
  return {
    x: box.x + rect.x * scale - 1 + fx * (rect.width * scale + 2),
    y: box.y + rect.y * scale - 1 + fy * (rect.height * scale + 2),
  };
}

// dragBy
// A press at `from` dragged by (dx, dy) device pixels, in steps, as a hand does.
async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const canvas = page.locator('.canvas-frame canvas.frame');
  const box = await canvas.boundingBox();
  const width = await canvas.evaluate((element: HTMLCanvasElement) => element.width);
  if (box === null) throw new Error('the frame canvas is not laid out');
  const scale = box.width / width;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx * scale, from.y + dy * scale, { steps: 8 });
  await page.mouse.up();
}

/** Undoes once on the screen's Monaco model, as ⌘Z does. */
async function undo(page: Page): Promise<void> {
  await page.evaluate((path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.undo(), SHAPES);
}

test('a triangle’s bottom-right handle scales its vertices about the top-left corner, as one undo stop', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SHAPES);
  // The drawn box: x 20..60, y 10..40. Its bottom-right corner has no vertex on it.
  // A triangle keeps its box handles: the white fill a line's box lacks.
  expect(await overlayIsWhite(page, await boxHandle(page, { x: 20, y: 10, width: 41, height: 31 }, 0.5, 0))).toBe(true);
  await dragBy(page, await boxHandle(page, { x: 20, y: 10, width: 41, height: 31 }, 1, 1), 10, 5);
  // x 20..60 becomes 20..70, y 10..40 becomes 10..45.
  await expect.poll(() => triangle(page)).toBe('<u8g2gl_triangle name="tri" x0="20" y0="10" x1="70" y1="10" x2="45" y2="45" />');
  await expect(page.locator('.selection-geometry')).toHaveText('sel 20,10 51×36');
  await undo(page);
  expect(await bufferText(page, SHAPES)).toBe(before);
});

test('a vertex handle drags that vertex alone, as one undo stop', async ({ page }) => {
  await open(page);
  const before = await bufferText(page, SHAPES);
  // The third vertex, (40, 40), at its pixel's centre.
  // Clear of the display's centre line at y = 32, which a drag within reach snaps to.
  await dragBy(page, await devicePoint(page, 40, 40), 3, -4);
  await expect.poll(() => triangle(page)).toBe('<u8g2gl_triangle name="tri" x0="20" y0="10" x1="60" y1="10" x2="43" y2="36" />');
  await undo(page);
  expect(await bufferText(page, SHAPES)).toBe(before);
});

test('a selected element a handle cannot resize says why in the property panel, before any drag', async ({ page }) => {
  await open(page, '50 + 10');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveText("Can't resize: x1 is computed from `50 + 10`");
  // The axis it can resize still follows a handle; the refused one is left as written.
  await dragBy(page, await boxHandle(page, { x: 20, y: 10, width: 41, height: 31 }, 1, 1), 10, 5);
  await expect.poll(() => triangle(page)).toBe('<u8g2gl_triangle name="tri" x0="20" y0="10" x1="50 + 10" y1="10" x2="40" y2="45" />');
});

test('a circle is selected by its drawn box, and its side handle changes the radius, keeping the opposite edge', async ({ page }) => {
  await openScreen(page, shapesScreen('<u8g2gl_circle name="ring" x="80" y="30" radius="10" />'), 'ring', [80, 30]);
  // The drawn box: 70..90 on both axes.
  await expect(page.locator('.selection-geometry')).toHaveText('sel 70,20 21×21');
  const before = await bufferText(page, SHAPES);
  await dragBy(page, await boxHandle(page, { x: 70, y: 20, width: 21, height: 21 }, 1, 0.5), 4, 0);
  // The box grows by 4 to the right: the radius by half of it, the centre with
  // it, so the left edge stays at 70; the other axis grows from its top edge.
  await expect.poll(() => lineOf(page, 'ring')).toBe('<u8g2gl_circle name="ring" x="82" y="32" radius="12" />');
  await expect(page.locator('.selection-geometry')).toHaveText('sel 70,20 25×25');
  await undo(page);
  expect(await bufferText(page, SHAPES)).toBe(before);
});

test('an hline is selected by its one-pixel-thick box, its right end changes its width, and it never says it cannot resize', async ({ page }) => {
  await openScreen(page, shapesScreen('<u8g2gl_hline name="rule" x="10" y="50" width="30" />'), 'rule', [20, 50]);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 10,50 30×1');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveCount(0);
  // The right end: the line's last pixel, x = 39.
  await dragBy(page, await devicePoint(page, 39, 50), 6, 0);
  await expect.poll(() => lineOf(page, 'rule')).toBe('<u8g2gl_hline name="rule" x="10" y="50" width="36" />');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveCount(0);
});

// overlayIsWhite
// Whether the overlay is white at a page position: a box handle's fill, which
// nothing else on the overlay draws.
async function overlayIsWhite(page: Page, at: { x: number; y: number }): Promise<boolean> {
  return page.evaluate(({ x, y }) => {
    const overlay = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.overlay')!;
    const box = overlay.getBoundingClientRect();
    const ratio = overlay.width / box.width;
    const [r, g, b, a] = overlay.getContext('2d')!.getImageData(Math.floor((x - box.x) * ratio), Math.floor((y - box.y) * ratio), 1, 1).data;
    return r! > 200 && g! > 200 && b! > 200 && a! > 200;
  }, at);
}

test('an hline’s left end moves x and width, holding the right end, as one undo stop, and its box has no handles', async ({ page }) => {
  await openScreen(page, shapesScreen('<u8g2gl_hline name="rule" x="10" y="50" width="30" />'), 'rule', [20, 50]);
  const rect = { x: 10, y: 50, width: 30, height: 1 };
  // Where the box's top and bottom middle handles would be: no handle is drawn there.
  expect(await overlayIsWhite(page, await boxHandle(page, rect, 0.5, 0))).toBe(false);
  expect(await overlayIsWhite(page, await boxHandle(page, rect, 0.5, 1))).toBe(false);
  const before = await bufferText(page, SHAPES);
  await dragBy(page, await devicePoint(page, 10, 50), -4, 0);
  // The right end, x + width - 1, stays at 39.
  await expect.poll(() => lineOf(page, 'rule')).toBe('<u8g2gl_hline name="rule" x="6" y="50" width="34" />');
  await expect(page.locator('.selection-geometry')).toHaveText('sel 6,50 34×1');
  await undo(page);
  expect(await bufferText(page, SHAPES)).toBe(before);
});

test('a vline’s bottom end changes its height alone, along its axis', async ({ page }) => {
  await openScreen(page, shapesScreen('<u8g2gl_vline name="post" x="100" y="10" height="30" />'), 'post', [100, 20]);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 100,10 1×30');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveCount(0);
  // The bottom end, y = 39, dragged down and a little sideways: only the height follows.
  await dragBy(page, await devicePoint(page, 100, 39), 3, 7);
  await expect.poll(() => lineOf(page, 'post')).toBe('<u8g2gl_vline name="post" x="100" y="10" height="37" />');
});

test('a horizontal line’s end moves that vertex alone, no box handle is hit, and it never says it cannot resize', async ({ page }) => {
  await openScreen(page, shapesScreen('<u8g2gl_line name="wire" x1="10" y1="20" x2="50" y2="20" />'), 'wire', [30, 20]);
  await expect(page.locator('.selection-geometry')).toHaveText('sel 10,20 41×1');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveCount(0);
  const rect = { x: 10, y: 20, width: 41, height: 1 };
  for (const [fx, fy] of [
    [0.5, 0],
    [0.5, 1],
  ] as const) {
    expect(await overlayIsWhite(page, await boxHandle(page, rect, fx, fy))).toBe(false);
  }
  const before = await bufferText(page, SHAPES);
  // The right end's corner of the box, where a box handle used to sit over the vertex.
  await dragBy(page, await boxHandle(page, rect, 1, 0.5), 6, 0);
  await expect.poll(() => lineOf(page, 'wire')).toBe('<u8g2gl_line name="wire" x1="10" y1="20" x2="56" y2="20" />');
  await expect(page.locator('.property-panel .resize-refusal')).toHaveCount(0);
  await undo(page);
  expect(await bufferText(page, SHAPES)).toBe(before);
});
