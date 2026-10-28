/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/states.spec.ts
 * Purpose: The canvas when the document is broken (EDITOR-DESIGN §3.8), end to
 *          end: an overflow keeps the frame live with the offending element
 *          hatched over it; an error the scene cannot be built through keeps
 *          the last good frame, dimmed; text that is not well-formed keeps it
 *          too, with the banner *XML not well-formed at L:C*, and turns canvas
 *          editing off until the text parses again.
 * Description: The departures project, frozen, edited by typing in Monaco.
 *              The hatching is read back from the overlay canvas; the frame's
 *              pixels are hashed to show which frame is on the canvas.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { canvasPixels, frameInfo, nextFrames, openFile, openShell, placeCaret } from './support/shell';
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

/** The loop's view of the document: hatched elements, canvas editing, the banner. */
async function state(page: Page): Promise<{ hatched: readonly string[]; canvasEditing: boolean; banner: string | undefined; stale: boolean }> {
  return page.evaluate(() => {
    const loop = (window as unknown as TestHandle).__u8g2gl.loop;
    const frame = loop.frameState.get();
    return { hatched: [...(frame.hatched ?? [])], canvasEditing: loop.canvasEditing.get(), banner: frame.banner, stale: frame.stale };
  });
}

/** How many overlay pixels inside device rectangle `rect` are the hatch's red. */
async function redPixels(page: Page, rect: { x: number; y: number; width: number; height: number }): Promise<number> {
  return page.evaluate(
    ({ rect, margin }) => {
      const overlay = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.overlay')!;
      const frame = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
      const ratio = overlay.width / overlay.getBoundingClientRect().width;
      const zoom = frame.getBoundingClientRect().width / frame.width;
      const x = Math.floor((margin + rect.x * zoom) * ratio);
      const y = Math.floor((margin + rect.y * zoom) * ratio);
      const width = Math.min(overlay.width - x, Math.floor(rect.width * zoom * ratio));
      const height = Math.floor(rect.height * zoom * ratio);
      const data = overlay.getContext('2d')!.getImageData(x, y, width, height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! > 180 && data[i + 2]! < 150 && data[i + 3]! > 0) red += 1;
      return red;
    },
    { rect, margin: MARGIN },
  );
}

test('an overflow keeps the frame live and hatches the element on the overlay, with canvas editing on', async ({ page }) => {
  await open(page);
  expect(await redPixels(page, { x: 190, y: 51, width: 66, height: 13 })).toBe(0);

  // sys_clock's x: 190 → 230, past the display's right edge.
  await placeCaret(page, SCREEN, 'name="sys_clock" x="', 'name="sys_clock" x="'.length);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('23');
  await expect(page.locator('.problem[data-code="U8G2GL_OUT_OF_BOUNDS"]')).toBeVisible();
  await nextFrames(page, 2);

  expect(await state(page)).toMatchObject({ hatched: ['sys_clock'], canvasEditing: true, stale: false });
  expect((await frameInfo(page)).stale).toBe(false);
  expect(await redPixels(page, { x: 230, y: 51, width: 26, height: 13 })).toBeGreaterThan(0);
  // Elsewhere, nothing is hatched.
  expect(await redPixels(page, { x: 0, y: 51, width: 180, height: 13 })).toBe(0);

  // Fixed, the hatching goes.
  await placeCaret(page, SCREEN, 'name="sys_clock" x="', 'name="sys_clock" x="'.length);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('19');
  await expect.poll(async () => (await state(page)).hatched).toEqual([]);
});

test('an error the scene cannot be built through keeps the last good frame, dimmed, with canvas editing on', async ({ page }) => {
  await open(page);
  const good = await canvasPixels(page);
  // An element no manifest declares: the text parses, the scene cannot be built.
  await placeCaret(page, SCREEN, '<u8g2gl_box name="plat_box"', '<u8g2gl_box'.length);
  await page.keyboard.type('_nothing');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'true');
  const now = await state(page);
  expect(now.canvasEditing).toBe(true);
  expect(now.hatched).toEqual([]);
  expect(now.banner).toMatch(/error/);
  expect(await canvasPixels(page)).toBe(good);
  await expect(page.locator('.canvas-banner')).not.toContainText('not well-formed');
});

test('text that is not well-formed keeps the last good frame, dimmed, says where, and turns canvas editing off until it parses', async ({ page }) => {
  await open(page);
  const good = await canvasPixels(page);
  // A stray '<' at the start of the clock's line: the document no longer parses.
  await placeCaret(page, SCREEN, '<u8g2gl_clock', 0);
  await page.keyboard.type('<');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'true');
  await expect(page.locator('.canvas-banner')).toHaveText(/^XML not well-formed at \d+:\d+$/);
  expect((await state(page)).canvasEditing).toBe(false);
  expect(await canvasPixels(page)).toBe(good);

  await page.keyboard.press('Backspace');
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  expect((await state(page)).canvasEditing).toBe(true);
  await expect(page.locator('.canvas-banner')).toHaveCount(0);
});
