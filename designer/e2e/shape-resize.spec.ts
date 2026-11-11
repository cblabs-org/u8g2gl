/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/shape-resize.spec.ts
 * Purpose: Shapes placed by points, on the real canvas (ui_spec §8): a
 *          triangle's corner handle scales its vertices about the opposite
 *          corner, a vertex handle drags one vertex alone, each as one undo
 *          stop, and an element a handle cannot resize says why in the
 *          property panel as soon as it is selected.
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
// A screen holding one triangle, its second vertex written as `x1`.
function shapesScreen(x1: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<screen name="shapes">',
    '    <view>',
    `        <u8g2gl_triangle name="tri" x0="20" y0="10" x1="${x1}" y1="10" x2="40" y2="40" />`,
    '    </view>',
    '</screen>',
    '',
  ].join('\n');
}

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// open
// The shapes screen on the canvas, with the triangle selected.
async function open(page: Page, x1 = '60'): Promise<void> {
  session = await startDesign({ files: { [SHAPES]: shapesScreen(x1) } });
  await openShell(page, session.url);
  await openFile(page, SHAPES);
  await expect(page.locator('.canvas-toolbar .screen-name')).toHaveText('shapes');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await clickCanvas(page, 40, 20);
  await expect.poll(() => page.evaluate(() => (window as unknown as TestHandle).__u8g2gl.selection.current.get().names)).toEqual(['tri']);
  await nextFrames(page, 2);
}

/** The triangle's line in the buffer. */
async function triangle(page: Page): Promise<string> {
  return (await bufferText(page, SHAPES)).split('\n').find((line) => line.includes('name="tri"'))?.trim() ?? '';
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
