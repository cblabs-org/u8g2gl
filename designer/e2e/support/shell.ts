/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/e2e/support/shell.ts
 * Purpose: What the end-to-end tests do in the shell, said once: open a file,
 *          put the caret somewhere, read the canvas, read a buffer. Each acts
 *          as a user would — clicks and keys — and reads back through the
 *          page's own state only to observe, never to drive an edit.
 * Description: Helpers over a Playwright `Page`. The caret is placed through
 *              the workspace's open request, the same path a Problems row
 *              takes, because Monaco's caret cannot be placed by clicking at a
 *              known character reliably across three engines.
 *
 * Exports:
 * - FrameInfo:          The canvas panel's frame state
 * - openShell():        Load the designer and wait for its first frame
 * - openFile():         Open a file in an editor tab
 * - placeCaret():       Put the caret at a text offset in an open file
 * - bufferText():       An open file's buffer
 * - frameInfo():        The current frame state
 * - canvasPixels():     A hash of the frame canvas's pixels
 * - nextFrames():       Resolve after the page has drawn N animation frames
 * - devicePoint():      Where a device pixel's centre is on the page
 * - clickCanvas():      Click a device pixel on the canvas
 * - dragCanvas():       Drag between two device pixels on the canvas
 * - dropTag():          Drag a Palette tag onto a device pixel of the canvas
 * - selectedNames():    The selection's file and names
 */

import { expect, type Page } from '@playwright/test';
import type { TestHandle } from '../../src/test-hooks';

/** The canvas panel's frame state, as its data attributes publish it. */
export interface FrameInfo {
  readonly frame: number;
  readonly lit: number;
  readonly stale: boolean;
}

/** @brief Loads the designer at `url` and waits until the canvas has drawn a frame. */
export async function openShell(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('.sidebar .file').first()).toBeVisible();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-stale', 'false', { timeout: 20_000 });
}

/** @brief Opens a project file in an editor tab, from the explorer. */
export async function openFile(page: Page, path: string): Promise<void> {
  await page.click(`.sidebar .file[data-path="${path}"]`);
  await expect(page.locator(`.editor-host[data-editor-path="${path}"] .monaco-editor`)).toBeVisible();
}

/**
 * @brief Puts the caret in an open file at the first occurrence of `needle`,
 *        `after` characters into it, and focuses the editor.
 */
export async function placeCaret(page: Page, path: string, needle: string, after = 0): Promise<void> {
  await page.evaluate(
    ({ path, needle, after }) => {
      const workspace = (window as unknown as TestHandle).__u8g2gl;
      const model = workspace.documents.modelOf(path);
      if (model === undefined) throw new Error(`${path} is not open`);
      const offset = model.getValue().indexOf(needle);
      if (offset < 0) throw new Error(`'${needle}' is not in ${path}`);
      const position = model.getPositionAt(offset + after);
      workspace.openFile({ path, line: position.lineNumber, column: position.column });
    },
    { path, needle, after },
  );
}

/** @brief An open file's buffer. */
export async function bufferText(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (path) => (window as unknown as TestHandle).__u8g2gl.documents.modelOf(path)?.getValue() ?? '',
    path,
  );
}

/** @brief The canvas panel's frame state. */
export async function frameInfo(page: Page): Promise<FrameInfo> {
  const frame = page.locator('.canvas-frame');
  return {
    frame: Number(await frame.getAttribute('data-frame')),
    lit: Number(await frame.getAttribute('data-lit')),
    stale: (await frame.getAttribute('data-stale')) === 'true',
  };
}

/** @brief A hash of the frame canvas's pixels, to compare two frames. */
export async function canvasPixels(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.canvas-frame canvas.frame');
    const context = canvas?.getContext('2d');
    if (canvas == null || context == null) return '';
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) hash = Math.imul(hash ^ (data[i] ?? 0), 16777619);
    return `${canvas.width}x${canvas.height}:${(hash >>> 0).toString(16)}`;
  });
}

/** @brief Resolves after the page has drawn `count` more animation frames. */
export async function nextFrames(page: Page, count = 1): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

/** @brief The page coordinates of device pixel (x, y)'s centre on the frame canvas. */
export async function devicePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const canvas = page.locator('.canvas-frame canvas.frame');
  const box = await canvas.boundingBox();
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
  if (box === null || size.width === 0) throw new Error('the frame canvas is not laid out');
  return { x: box.x + ((x + 0.5) * box.width) / size.width, y: box.y + ((y + 0.5) * box.height) / size.height };
}

/** @brief Clicks device pixel (x, y) on the canvas, as a user would. */
export async function clickCanvas(page: Page, x: number, y: number, modifiers: ('Shift')[] = []): Promise<void> {
  const point = await devicePoint(page, x, y);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(point.x, point.y);
  for (const key of modifiers) await page.keyboard.up(key);
}

/** @brief Drags from one device pixel to another on the canvas, in steps, as a hand does. */
export async function dragCanvas(page: Page, from: readonly [number, number], to: readonly [number, number]): Promise<void> {
  const start = await devicePoint(page, from[0], from[1]);
  const end = await devicePoint(page, to[0], to[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * @brief Drags a Palette tag onto device pixel (x, y) of the canvas, with the
 *        browser's own drag and drop, as a user would. The Palette must be the
 *        sidebar's view.
 */
export async function dropTag(page: Page, tag: string, x: number, y: number): Promise<void> {
  const point = await devicePoint(page, x, y);
  const source = await page.locator(`.palette-tag[data-tag="${tag}"]`).boundingBox();
  if (source === null) throw new Error(`<${tag}> is not in the Palette`);
  // The mouse, not dragTo: dragTo's target is an offset it rounds again, which
  // at 1× can land on the neighbouring device pixel. A drag event's position
  // is whole screen pixels, so aim at the whole pixel inside the centre.
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.round(point.x), Math.round(point.y), { steps: 5 });
  await page.mouse.up();
}

/** @brief The selection: its file and names. */
export async function selectedNames(page: Page): Promise<{ readonly file: string | undefined; readonly names: readonly string[] }> {
  return page.evaluate(() => {
    const { file, names } = (window as unknown as TestHandle).__u8g2gl.selection.current.get();
    return { file, names: [...names] };
  });
}
