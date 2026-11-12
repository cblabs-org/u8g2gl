/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/canvas/outlines.ts
 * Purpose: The canvas's Outlines toggle (ui_spec §4): a box around every drawn
 *          element, so an author sees where each one is even when it lights no
 *          pixel. The framework Wasm's placeholder hatch used to show this for
 *          project widgets only, and only until the project's own Wasm loaded;
 *          the toggle shows it for every element, for as long as it is on.
 * Description: Pure helpers the edit loop and the toolbar share, kept apart from
 *              both so they are unit-tested without a browser: the setting's
 *              storage, and the overlay rectangles for a frame's element
 *              boxes. The setting is remembered per browser, as the test run's
 *              *Run after a pause* is. Storage can be unavailable or throw (a
 *              private window, a test page): the toggle is then off, still
 *              works, and is simply not remembered. Outlines are overlay only,
 *              never the frame's pixels, so parity, the diff and the lit count
 *              are untouched by them.
 *
 * Exports:
 * - OUTLINES_KEY:      Where this browser remembers the setting
 * - readOutlines():    The remembered setting; off when storage fails
 * - writeOutlines():   Remember the setting, if storage allows
 * - outlineRects():    The overlay's `outline` rectangles for a frame's boxes
 */

import type { OverlayRect } from './canvas-view';

/** Where this browser remembers the Outlines setting. */
export const OUTLINES_KEY = 'u8g2gl.canvas.outlines';

/**
 * The storage the setting is kept in: the browser's, unless a test passes one;
 * null where there is none.
 */
type SettingStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

/**
 * @brief Reads the remembered Outlines setting.
 *
 * @param storage Where it is kept; the browser's `localStorage` by default.
 * @return True only when the setting was stored as on. Missing storage, a
 *         missing key or a storage that throws all read as off.
 */
export function readOutlines(storage: SettingStorage = browserStorage()): boolean {
  try {
    return storage?.getItem(OUTLINES_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * @brief Remembers the Outlines setting, when storage allows.
 *
 * A storage that is missing or throws keeps nothing, and is not an error: the
 * toggle still works for this page's life.
 *
 * @param on      The setting.
 * @param storage Where it is kept; the browser's `localStorage` by default.
 */
export function writeOutlines(on: boolean, storage: SettingStorage = browserStorage()): void {
  try {
    storage?.setItem(OUTLINES_KEY, on ? 'on' : 'off');
  } catch {
    // Not kept: see readOutlines.
  }
}

/**
 * @brief The overlay's `outline` rectangle for each element box, in the
 *        boxes' order.
 *
 * @param bounds The drawn screen's element rectangles, by name, in device pixels.
 */
export function outlineRects(
  bounds: ReadonlyMap<string, { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>,
): OverlayRect[] {
  return [...bounds.values()].map(({ x, y, width, height }) => ({ x, y, width, height, kind: 'outline' }));
}

// browserStorage
// The page's localStorage, or null where there is none. Reading the property
// itself can throw (a sandboxed frame), so it is guarded as well.
function browserStorage(): SettingStorage {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
