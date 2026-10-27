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
 */

import { expect, type Page } from '@playwright/test';

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
      const workspace = (window as unknown as { __u8g2gl: { documents: { modelOf(p: string): { getValue(): string; getPositionAt(o: number): { lineNumber: number; column: number } } | undefined }; openFile(r: object): void } }).__u8g2gl;
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
    (path) => (window as unknown as { __u8g2gl: { documents: { modelOf(p: string): { getValue(): string } | undefined } } }).__u8g2gl.documents.modelOf(path)?.getValue() ?? '',
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
