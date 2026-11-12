/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/line-ends.ts
 * Purpose: Handles for line-shaped elements (ui_spec §8). A line's box is
 *          redundant: a horizontal or vertical one has a flat box, its eight
 *          handles stack on the ends, win the grab, and say the line "has no
 *          height to scale". So a single selected line shows one round handle
 *          at each end and no box handles, and dragging an end moves that end
 *          alone. This module says which elements those are, where their ends
 *          are, and what dragging an end writes.
 * Description: Which elements are line-shaped is read from what the element
 *              is, never from whether its drawn box happens to be flat, and
 *              never from a list of tags ([D-17]):
 *              - placed by exactly two points (`vertexPoints()`): a line
 *                between two points, such as `u8g2gl_line`, diagonal or not;
 *              - placed by a box whose manifest declares `x`, `y` and a size on
 *                one axis only: a span along that axis, such as
 *                `u8g2gl_hline` (`width`) and `u8g2gl_vline` (`height`).
 *              A triangle (three points), a pixel (no size) and every box
 *              (both sizes) are not line-shaped.
 *
 *              A two-point line's ends are its vertex handles, planned by
 *              `planVertex()`. A span's ends are its first and last
 *              pixel on its axis; dragging one is a resize by that edge alone
 *              (`planResize()`), so the start end moves `x` and takes the
 *              difference from `width` and the far end changes `width`, with
 *              the same literal-only refusals and, in `DragEdit`, the same
 *              clamp: at least one pixel long, never past the other end. Each
 *              end moves along the line's own axis only.
 *
 * Exports:
 * - LineShape:              How a line-shaped element is placed
 * - lineShape():            An element's line shape, or undefined if it is not one
 * - isLineShaped():         Whether an element gets end handles instead of a box's
 * - endPoints():            The round handles a single selected element shows
 * - planLineEnd():          Plan the drag of one end of a span
 * - handleRefusalReasons(): Why the selected element's handles could not edit it
 */

import type { CstDocument } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { AXIS_ATTRIBUTES, refusals, type Axis, type MovePlan } from './placement-rules';
import { planResize } from './resize-rules';
import { planVertex, resizeRefusalReasons, vertexPoints, type Point } from './shape-resize-rules';

/**
 * How a line-shaped element is placed: by two points (`points`), or as a span
 * along one axis from `x`, `y` and that axis's size.
 */
export type LineShape = { readonly kind: 'points' } | { readonly kind: 'span'; readonly axis: Axis };

/**
 * @brief An element's line shape, from its placement: two points, or a span
 *        along the one axis its manifest gives a size.
 *
 * @param placement Where the element was drawn; undefined if not drawn.
 * @return Its shape; undefined for an element that is not line-shaped.
 */
export function lineShape(placement: Placement | undefined): LineShape | undefined {
  if (placement === undefined) return undefined;

  // --- Step 1: Two points make a line; three a triangle, which is not one ---
  if (placement.absolute.extras.some((extra) => extra.kind === 'point')) {
    return vertexPoints(placement).length === 2 ? { kind: 'points' } : undefined;
  }

  // --- Step 2: A box placed by x and y with a size on exactly one axis is a span ---
  const props = placement.manifest.api.props;
  const declares = (name: string): boolean => props.some((prop) => prop.name === name);
  if (!declares('x') || !declares('y')) return undefined;
  const sized = (['horizontal', 'vertical'] as const).filter((axis) => declares(AXIS_ATTRIBUTES[axis].size));
  const [axis] = sized;
  return sized.length === 1 && axis !== undefined ? { kind: 'span', axis } : undefined;
}

/** @brief Whether a selected element shows end handles instead of a box's eight. */
export function isLineShaped(placement: Placement | undefined): boolean {
  return lineShape(placement) !== undefined;
}

/**
 * @brief The round handles a single selected element shows, in device pixels:
 *        a span's two ends (start first), or a line's or triangle's vertices.
 *
 * @param placement Where the element was drawn; undefined if not drawn.
 * @return The points; empty for any other element, or one whose position the
 *         canvas does not know.
 */
export function endPoints(placement: Placement | undefined): Point[] {
  const shape = lineShape(placement);
  if (placement === undefined || shape?.kind !== 'span') return vertexPoints(placement);
  const geometry = placement.absolute.geometry;
  const x = geometry.x?.value;
  const y = geometry.y?.value;
  const length = geometry[AXIS_ATTRIBUTES[shape.axis].size]?.value;
  if (x === undefined || y === undefined || length === undefined) return [];
  // The far end is the line's last pixel, not one past it: the handle sits on
  // a pixel the line draws, as a vertex handle does.
  const last = Math.max(0, length - 1);
  return shape.axis === 'horizontal' ? [{ x, y }, { x: x + last, y }] : [{ x, y }, { x, y: y + last }];
}

/**
 * @brief Plans the drag of one end of a span: a resize by that edge of its
 *        axis alone. The other axis has no terms, so it never moves and never
 *        refuses.
 *
 * @param cst       The text the gesture starts from.
 * @param name      The element's name.
 * @param end       Which end: `start` (left, top) or `end` (right, bottom).
 * @param placement Where the element was drawn.
 * @return The plan, in a move's shape; undefined if the element is not a span
 *         or not there.
 */
export function planLineEnd(cst: CstDocument, name: string, end: 'start' | 'end', placement: Placement | undefined): MovePlan | undefined {
  const shape = lineShape(placement);
  if (shape?.kind !== 'span') return undefined;
  const handle = shape.axis === 'horizontal' ? { horizontal: end, vertical: undefined } : { horizontal: undefined, vertical: end };
  return planResize(cst, name, handle, placement);
}

/**
 * @brief Every reason the handles a single selected element shows could not
 *        edit it: what the property panel says before any drag. A line-shaped
 *        element is asked only about its ends, so an axis it has no handle on
 *        is never reported; any other element about its box's handles.
 *
 * @param cst       The current text.
 * @param name      The element's name.
 * @param placement Where it was drawn; undefined if not drawn.
 * @return The distinct reasons; empty when every handle works.
 */
export function handleRefusalReasons(cst: CstDocument, name: string, placement: Placement | undefined): string[] {
  const shape = lineShape(placement);
  if (shape === undefined) return resizeRefusalReasons(cst, name, placement);

  // --- Step 1: Each end's plan: a vertex of a two-point line, or an end of a span ---
  const plans: MovePlan[] = [];
  if (shape.kind === 'points') {
    for (const index of [0, 1]) {
      const plan = planVertex(cst, name, index, placement);
      if (plan !== undefined) plans.push(plan);
    }
  } else {
    for (const end of ['start', 'end'] as const) {
      const plan = planLineEnd(cst, name, end, placement);
      if (plan !== undefined) plans.push(plan);
    }
  }

  // --- Step 2: Why any of them would not follow a drag, on any axis it moves along ---
  return refusals(plans, 1, 1);
}
