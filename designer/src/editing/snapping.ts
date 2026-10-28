/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/snapping.ts
 * Purpose: Alignment while dragging (ui_spec §8): edge and centre guides
 *          against the other elements and the display, with a snap threshold
 *          of 3 **screen** pixels so it stays usable at 1× and does not grab at
 *          8×; and integer snapping, so the text never holds a value the canvas
 *          did not show (EDITOR-DESIGN §3.5).
 * Description: Pure geometry in device pixels. An element's three guide lines
 *              per axis are its two edges — the pixel boundaries at `x` and
 *              `x + width`, which is where its outline is drawn — and its
 *              centre. A drag offers the moving box's edges (and, for a move,
 *              its centre) at the pointer's exact, unrounded delta; the
 *              nearest guide within the threshold wins and the delta becomes
 *              whatever puts that edge on it, rounded to an integer. With none
 *              in reach the delta is simply rounded. The guides that the
 *              final box's edges lie on are returned to be drawn.
 *
 * Exports:
 * - SNAP_THRESHOLD:  Screen pixels within which an edge snaps to a guide
 * - Guides:          The candidate lines on each axis
 * - guidesFor():     The guides of the other elements and the display
 * - snapAxis():      One axis's integer delta, snapped, and the lines it lies on
 */

import type { Rect } from '../pipeline/live-pipeline';

/** Screen pixels within which an edge snaps to a guide (ui_spec §8). */
export const SNAP_THRESHOLD = 3;

/** Candidate guide positions, in device pixels: x positions for vertical lines, y for horizontal. */
export interface Guides {
  readonly vertical: readonly number[];
  readonly horizontal: readonly number[];
}

/**
 * @brief The guides a drag can snap to: the edges and centre of every element
 *        not being dragged, and of the display.
 *
 * @param bounds   The drawn elements' rectangles by name.
 * @param moving   The names being dragged, which offer no guides.
 * @param display  The display's size, if known.
 */
export function guidesFor(
  bounds: ReadonlyMap<string, Rect>,
  moving: readonly string[],
  display: { readonly width: number; readonly height: number } | undefined,
): Guides {
  const vertical: number[] = [];
  const horizontal: number[] = [];
  const add = (rect: Rect): void => {
    vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width);
    horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height);
  };
  if (display !== undefined) add({ x: 0, y: 0, width: display.width, height: display.height });
  for (const [name, rect] of bounds) {
    if (!moving.includes(name)) add(rect);
  }
  return { vertical, horizontal };
}

/**
 * @brief One axis of a drag: the integer delta to write, snapped to the
 *        nearest guide within {@link SNAP_THRESHOLD} screen pixels.
 *
 * @param edges  The moving box's lines on this axis before the drag (its
 *               edges, and its centre for a move), in device pixels.
 * @param raw    The pointer's delta, unrounded, in device pixels.
 * @param guides This axis's guide positions.
 * @param zoom   Screen pixels per device pixel.
 * @return The delta, an integer, and the guides the moved lines then lie on.
 */
export function snapAxis(edges: readonly number[], raw: number, guides: readonly number[], zoom: number): { delta: number; lines: number[] } {
  // --- Step 1: The nearest guide to any moving line, in screen pixels ---
  let best: { distance: number; delta: number } | undefined;
  for (const edge of edges) {
    for (const guide of guides) {
      const distance = Math.abs(edge + raw - guide) * zoom;
      // A guide through a half pixel (an odd width's centre) is not a position
      // the text can hold; snapping to it would round away from it again.
      const delta = guide - edge;
      if (distance <= SNAP_THRESHOLD && Number.isInteger(delta) && (best === undefined || distance < best.distance)) {
        best = { distance, delta };
      }
    }
  }

  // --- Step 2: Snapped, or rounded; then every guide a moved line lies on ---
  const delta = best?.delta ?? Math.round(raw);
  const lines: number[] = [];
  for (const edge of edges) {
    for (const guide of guides) {
      if (edge + delta === guide && !lines.includes(guide)) lines.push(guide);
    }
  }
  return { delta, lines };
}
