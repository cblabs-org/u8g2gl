/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/resize-rules.ts
 * Purpose: What dragging a handle writes (EDITOR-DESIGN §3.5):
 *          the same rule as a move — rewrite the attributes that place the
 *          edge, refuse an axis they do not place by literals — applied to
 *          the edge the handle is on. A handle moves one edge per axis and
 *          leaves the opposite edge where it is.
 * Description: Which attributes an edge's position is written in depends on
 *              how the axis is laid out (§7.2):
 *              | Written            | Start edge (left) by d | End edge (right) by d       |
 *              |--------------------|------------------------|-----------------------------|
 *              | `x`, `width`       | `x` + d, `width` − d   | `width` + d                 |
 *              | `right`, `width`   | `width` − d            | `right` − d, `width` + d    |
 *              | `x`, `right`       | `x` + d                | `right` − d                 |
 *              A binding, centring, an expression in any attribute the edge
 *              needs, or a size the manifest does not declare refuses the axis,
 *              with the reason. The plan has a move's shape, so a resize lands
 *              through the same `moveEdits()` at each frame's delta.
 *
 *              The delta is clamped so the size stays at least one pixel: a
 *              zero or negative size is not an overflow to show but an element
 *              that no longer exists to drag back.
 *
 * Exports:
 * - Edge:            Which edge of an axis a handle moves, if any
 * - Handle:          A handle: its edge on each axis
 * - planResize():    Plan one element's resize from its attributes
 * - clampResize():   Keep a resize's delta from collapsing the element
 */

import type { CstDocument, CstElement } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { geometryBindingFor, isCentringOn, isRectangular } from '@u8g2gl/core/resolver/index.js';
import { AXIS_ATTRIBUTES, findElement, INTEGER_LITERAL, type Axis, type AxisPlan, type AxisTerm, type MovePlan } from './placement-rules';

/** The edge of an axis a handle moves: its start (left, top), its end, or neither. */
export type Edge = 'start' | 'end' | undefined;

/** A handle: which edge it moves on each axis (a corner moves two, a side one). */
export interface Handle {
  readonly horizontal: Edge;
  readonly vertical: Edge;
}

// planAxis
// One axis of a resize, by the table in the file header.
//   element   — the element, in the text the gesture starts from
//   axis      — the axis
//   edge      — the edge the handle moves on it
//   placement — where the pipeline placed it, for its manifest
function planAxis(element: CstElement, axis: Axis, edge: 'start' | 'end', placement: Placement | undefined): AxisPlan {
  const names = AXIS_ATTRIBUTES[axis];
  const valueOf = (attribute: string): string | undefined => element.attributes.find((attr) => attr.name === attribute)?.value;
  const refuse = (reason: string): AxisPlan => ({ kind: 'refused', reason });

  // --- Step 1: Bindings and centring refuse, as they do a move ---
  for (const attribute of [names.start, names.size]) {
    const binding = geometryBindingFor(attribute)?.binding;
    const bound = binding === undefined ? undefined : valueOf(binding);
    if (bound !== undefined) return refuse(`${attribute} is bound to \`${bound}\``);
  }
  const rectangular = placement === undefined || isRectangular(placement.manifest);
  const centre = valueOf(names.centre);
  if (rectangular && isCentringOn(centre)) return refuse(`${names.start} is centred by \`${names.centre}="${centre ?? ''}"\``);
  const declaresSize = placement === undefined || placement.manifest.api.props.some((prop) => prop.name === names.size);
  if (!declaresSize) return refuse(`<${element.name}> has no ${names.size}`);

  // --- Step 2: Which attributes the edge is written in ---
  const start = valueOf(names.start);
  const size = valueOf(names.size);
  const end = rectangular ? valueOf(names.end) : undefined;
  const wanted: { attribute: string; value: string | undefined; sign: 1 | -1 }[] = [];
  if (start !== undefined && size !== undefined && end !== undefined) {
    return refuse(`${names.start}, ${names.size} and ${names.end} are all written: the axis is over-constrained`);
  }
  if (size !== undefined && end === undefined) {
    // x and width: the start edge moves x and takes the difference from width.
    if (edge === 'start') wanted.push({ attribute: names.start, value: start, sign: 1 });
    wanted.push({ attribute: names.size, value: size, sign: edge === 'start' ? -1 : 1 });
  } else if (size !== undefined && start === undefined) {
    // right and width: the far anchor holds the end edge.
    if (edge === 'end') wanted.push({ attribute: names.end, value: end, sign: -1 });
    wanted.push({ attribute: names.size, value: size, sign: edge === 'start' ? -1 : 1 });
  } else if (size === undefined && start !== undefined && end !== undefined) {
    // Stretched between its anchors: each edge is its own attribute.
    wanted.push(edge === 'start' ? { attribute: names.start, value: start, sign: 1 } : { attribute: names.end, value: end, sign: -1 });
  } else {
    return refuse(`${names.size} is not written on <${element.name}>`);
  }

  // --- Step 3: Each one a literal, or the axis refuses ---
  const terms: AxisTerm[] = [];
  for (const { attribute, value, sign } of wanted) {
    if (value === undefined) return refuse(`${attribute} is not written on <${element.name}>`);
    if (!INTEGER_LITERAL.test(value)) return refuse(`${attribute} is computed from \`${value}\``);
    terms.push({ attribute, from: Number(value), sign, inserted: false });
  }
  return { kind: 'move', terms };
}

/**
 * @brief Plans one element's resize by a handle, from its attributes in `cst`.
 *
 * An axis the handle does not move has no terms: it is left alone, not refused.
 *
 * @param cst       The text the gesture starts from.
 * @param name      The element's name.
 * @param handle    The handle being dragged.
 * @param placement Where the pipeline placed it; undefined if not drawn.
 * @return Its plan, in a move's shape; undefined if no element has that name.
 */
export function planResize(cst: CstDocument, name: string, handle: Handle, placement: Placement | undefined): MovePlan | undefined {
  const element = findElement(cst, name);
  if (element === undefined) return undefined;
  const axis = (which: Axis, edge: Edge): AxisPlan =>
    edge === undefined ? { kind: 'move', terms: [] } : planAxis(element, which, edge, placement);
  return { name, horizontal: axis('horizontal', handle.horizontal), vertical: axis('vertical', handle.vertical) };
}

/**
 * @brief A resize's delta on one axis, clamped so the element keeps at least
 *        one pixel of size.
 *
 * @param delta The edge's delta, in device pixels.
 * @param edge  The edge being moved.
 * @param size  The element's size on this axis when the gesture began.
 */
export function clampResize(delta: number, edge: Edge, size: number): number {
  if (edge === 'start') return Math.min(delta, size - 1);
  if (edge === 'end') return Math.max(delta, 1 - size);
  return 0;
}
