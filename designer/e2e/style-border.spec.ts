/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/style-border.spec.ts
 * Purpose: A panel's `border="true"` draws its outline on the canvas, end to
 *          end (design_spec §10). The case that mattered most when `border`
 *          was stored and never drawn: an author outlined a container, saw
 *          nothing, and had no diagnostic. The preview is the runtime ([D-9]),
 *          so this is the runtime's outline seen where the author looks.
 * Description: The departures project plus one screen holding an empty
 *              80×40 `<u8g2gl_obj>` with `border="true"`, frozen, with no
 *              toolchain so the framework Wasm draws it. Every pixel of the
 *              frame canvas is read: the box's one-pixel frame is lit and
 *              nothing else is, so the frame's lit count is the frame's
 *              perimeter. Writing `border="false"` leaves nothing lit.
 */

import { expect, test, type Page } from '@playwright/test';
import { startDesign, type DesignSession } from './support/design-session';
import { frameInfo, nextFrames, openFile, openShell } from './support/shell';
import type { TestHandle } from '../src/test-hooks';

const SCREEN = 'screens/screen_panel.xml';
/** The panel's box, in device pixels. */
const PANEL = { x: 40, y: 10, width: 80, height: 40 };
const TEXT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<screen name="panel">',
  '    <view>',
  `        <u8g2gl_obj name="panel" x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.width}" height="${PANEL.height}" border="true" />`,
  '    </view>',
  '</screen>',
  '',
].join('\n');

let session: DesignSession | undefined;
test.afterEach(async () => {
  await session?.stop();
  session = undefined;
});

// litPixels
// Every pixel of the frame canvas whose colour differs from its top-left
// corner's, which no element covers, as "x,y".
async function litPixels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame')!;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const lit: string[] = [];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const at = (y * canvas.width + x) * 4;
        if (data[at] !== data[0] || data[at + 1] !== data[1] || data[at + 2] !== data[2]) lit.push(`${x},${y}`);
      }
    }
    return lit;
  });
}

// perimeter
// The one-pixel frame on a box, as "x,y", in the order litPixels() reads.
function perimeter(box: typeof PANEL): string[] {
  const out: string[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (x === box.x || x === box.x + box.width - 1 || y === box.y || y === box.y + box.height - 1) out.push(`${x},${y}`);
    }
  }
  return out;
}

test('a panel with border="true" draws its one-pixel outline on the canvas, and border="false" draws none', async ({ page }) => {
  session = await startDesign({ files: { [SCREEN]: TEXT }, toolchain: false });
  await openShell(page, session.url);
  await openFile(page, SCREEN);
  const freeze = page.getByRole('button', { name: /live|frozen/ });
  if ((await freeze.getAttribute('aria-pressed')) !== 'true') await freeze.click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false');
  await nextFrames(page, 2);

  // --- border="true": exactly the box's frame is lit ---
  const frame = perimeter(PANEL);
  await expect.poll(async () => (await frameInfo(page)).lit).toBe(frame.length);
  expect(await litPixels(page)).toEqual(frame);

  // --- border="false": the panel draws nothing at all ---
  await page.evaluate((path) => {
    const model = (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path);
    model?.setValue(model.getValue().replace('border="true"', 'border="false"'));
  }, SCREEN);
  await expect.poll(async () => (await frameInfo(page)).lit).toBe(0);
  await nextFrames(page, 2);
  expect(await litPixels(page)).toEqual([]);
});
