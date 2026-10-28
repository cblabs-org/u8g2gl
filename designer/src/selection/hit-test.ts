/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/selection/hit-test.ts
 * Purpose: Canvas to XML, first half (ui_spec §4.3, §8): which element a click
 *          or a marquee on the canvas means. It works on the rectangles the
 *          pipeline placed for the drawn screen, so a hit is exactly where the
 *          element is drawn, and it answers with element **names**, which the
 *          selection holds.
 * Description: Targets are in draw order ([D-4]): document order, so the last
 *              drawn is on top. A point hits every target containing it,
 *              topmost first. Repeated clicks at the same device pixel cycle
 *              down through that stack, and a click anywhere else starts again
 *              at the top. A marquee selects every target whose rectangle
 *              intersects it.
 *
 *              A composite's child is never the answer: each target carries the
 *              name of the element **written in the screen** that it belongs
 *              to, so a hit on a child resolves to its instance (ui_spec §8:
 *              composites are not editable in place). One instance with
 *              several drawn children is one answer, at its topmost child.
 *
 * Exports:
 * - HitTarget:      One drawn element's rectangle and the name it selects
 * - hitsAt():       The names under a point, topmost first
 * - marqueeHits():  The names a rectangle intersects, in document order
 * - ClickCycler:    Repeated clicks at one point, cycling through overlaps
 */

import type { Rect } from '../pipeline/live-pipeline';

/** One drawn element: where it is, and what a hit on it selects. */
export interface HitTarget {
  /** The name a hit selects: the element itself, or the composite instance it is drawn for. */
  readonly name: string;
  /** Its rectangle, in device pixels. */
  readonly rect: Rect;
}

// contains
// Whether device pixel (x, y) is inside `rect`. Half-open: a 10-wide element at
// x = 0 covers pixels 0..9, as it is drawn.
function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * @brief The names under device pixel (x, y), topmost first, each once.
 *
 * @param targets Draw order: the last is drawn on top.
 * @param x, y    A device pixel.
 */
export function hitsAt(targets: readonly HitTarget[], x: number, y: number): string[] {
  const names: string[] = [];
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (target !== undefined && contains(target.rect, x, y) && !names.includes(target.name)) {
      names.push(target.name);
    }
  }
  return names;
}

/**
 * @brief The names whose rectangles intersect `area`, in document order, each once.
 *
 * Touching counts as intersecting only where a pixel is shared, so a marquee
 * that ends exactly at an element's left edge does not select it.
 *
 * @param targets Draw order.
 * @param area    The marquee, in device pixels; any width or height of 0 selects nothing.
 */
export function marqueeHits(targets: readonly HitTarget[], area: Rect): string[] {
  const names: string[] = [];
  for (const { name, rect } of targets) {
    const overlaps =
      rect.x < area.x + area.width && area.x < rect.x + rect.width && rect.y < area.y + area.height && area.y < rect.y + rect.height;
    if (overlaps && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Repeated clicks on one point (ui_spec §4.3): the first selects the topmost
 * element there, each further click at the same device pixel the next one
 * down, wrapping at the bottom. A click at any other pixel, or on a stack that
 * has changed since, starts again at the top.
 */
export class ClickCycler {
  private point: { readonly x: number; readonly y: number } | undefined;
  private stack: readonly string[] = [];
  private index = 0;

  /**
   * @brief The name a click at device pixel (x, y) selects.
   *
   * @return The name, or undefined for a click on no element.
   */
  click(targets: readonly HitTarget[], x: number, y: number): string | undefined {
    const stack = hitsAt(targets, x, y);
    const again =
      this.point?.x === x && this.point.y === y && stack.length === this.stack.length && stack.every((name, i) => name === this.stack[i]);
    this.index = again && stack.length > 0 ? (this.index + 1) % stack.length : 0;
    this.point = { x, y };
    this.stack = stack;
    return stack[this.index];
  }

  /** @brief Forgets the point, so the next click starts at the top (Esc). */
  reset(): void {
    this.point = undefined;
    this.stack = [];
    this.index = 0;
  }
}
