/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/shape-resize-rules.ts
 * Purpose: What dragging a handle writes on an element that is not placed by
 *          a box (ui_spec §8): a line or triangle, placed
 *          by its points, and a circle or ellipse, placed by a centre and a
 *          radius. `resize-rules.ts` rewrites `x`/`width`-style axes, which
 *          these elements do not have, so on its own it refused them all; this
 *          module gives them the same gesture with the same promise — the
 *          box's opposite edge stays where it is — written in the attributes
 *          they do have. It also plans the drag of one vertex.
 * Description: Which kind of element this is comes from its placement, never a
 *              list of tags ([D-17]): a non-rectangular element with endpoint
 *              coordinates (`x1`, `y0`, …, the resolver's `point` extras) is
 *              placed by points; one with a `length` extra (`radius`, `rx`,
 *              `ry`) by a centre and radii; anything else is a box, and
 *              `planResize()` plans it as before.
 *
 *              Points. The box is the one the canvas draws, around the points
 *              (`drawn-extent.ts`). A handle moves one edge of it per axis,
 *              and every point on that axis is scaled about the opposite edge,
 *              rounded to a whole pixel. An axis whose points all share one
 *              coordinate has no extent to scale, and refuses.
 *
 *              Centre and radii. Whether `x`/`y` is the centre or a corner is
 *              read from the resolver's drawn extent: an edge that reaches
 *              past the centre by the radius was derived from it, and the
 *              `segments` an arc draws decide which edges those are. Moving
 *              one edge changes the radius by the edge's delta over the number
 *              of edges the radius reaches (two for a whole circle, one for a
 *              quadrant), and moves the centre so the opposite edge stays put.
 *              An ellipse's `rx` and `ry` follow their own axes; a circle's one
 *              `radius` follows the larger of the two its axes ask for.
 *
 *              Refusals follow the move rule: every attribute written must be
 *              an integer literal, a bound `x`/`y` refuses its axis, and a
 *              refused axis writes nothing, with the reason. A radius stays at
 *              least one pixel; a box of points at least one (its points may
 *              then coincide, which the validator allows).
 *
 *              A plan is made once, from the text and the drawn frame when the
 *              gesture begins, and each frame's edits are its start values
 *              moved by that frame's delta (`termEdits()`), so a drag is one
 *              undo stop that always says exactly what its pointer says.
 *
 * Exports:
 * - Point:               A device pixel
 * - ShapeAxis:           One axis of a shape's resize: its terms, or why it refuses
 * - ShapePlan:           One element's shape resize
 * - ResizePlan:          A box's plan or a shape's
 * - planHandleResize():  Plan one element's resize by a handle, of either kind
 * - resizeEdits():       A resize at a delta, as edits to the current text
 * - resizeRefusals():    Why a resize does not follow the pointer on an axis it moves along
 * - resizeRefusalReasons(): Every axis a handle could not resize on, for the property panel
 * - vertexPoints():      A line's or triangle's vertices, where they are drawn
 * - planVertex():        Plan one vertex's drag
 */

import type { CstDocument, CstElement, TextEdit } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { drawnExtent, geometryBindingFor, isRectangular, type ResolvedExtra } from '@u8g2gl/core/resolver/index.js';
import { AXIS_ATTRIBUTES, findElement, INTEGER_LITERAL, moveEdits, termEdits, type Axis, type AxisPlan, type AxisTerm, type MovePlan } from './placement-rules';
import { planResize, type Edge, type Handle } from './resize-rules';

/** A device pixel. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point term and where the point was drawn, in device pixels. */
interface PlacedTerm {
  readonly term: AxisTerm;
  readonly at: number;
}

/**
 * One axis of a shape's resize:
 * - `scale`: the points on the axis, scaled about the edge opposite `edge`;
 * - `length`: a centre and a radius, with how many radii the box reaches on
 *   each side of the centre (`reach`, before and after, 0 or 1);
 * - `still`: the handle does not move this axis;
 * - `refused`: it would, and cannot, for `reason`.
 */
export type ShapeAxis =
  | { readonly kind: 'scale'; readonly edge: 'start' | 'end'; readonly min: number; readonly max: number; readonly points: readonly PlacedTerm[] }
  | {
      readonly kind: 'length';
      readonly edge: 'start' | 'end';
      readonly reach: readonly [before: number, after: number];
      readonly centre: AxisTerm;
      readonly length: AxisTerm;
    }
  | { readonly kind: 'still' }
  | { readonly kind: 'refused'; readonly reason: string };

/** One element's shape resize: its name and each axis. */
export interface ShapePlan {
  readonly name: string;
  readonly horizontal: ShapeAxis;
  readonly vertical: ShapeAxis;
}

/** A resize's plan: a box's, written as a move is, or a shape's. */
export type ResizePlan = { readonly kind: 'box'; readonly plan: MovePlan } | { readonly kind: 'shape'; readonly plan: ShapePlan };

/** The two axes, for loops that treat them alike. */
const AXES: readonly Axis[] = ['horizontal', 'vertical'];

// pointsOf
// The resolver's endpoint coordinates on one axis, in its fixed order (§13.9).
function pointsOf(placement: Placement, axis: Axis): ResolvedExtra[] {
  return placement.absolute.extras.filter((extra) => extra.kind === 'point' && extra.axis === axis);
}

// lengthOf
// The radius that extends along one axis from the centre, if the element has one.
function lengthOf(placement: Placement, axis: Axis): ResolvedExtra | undefined {
  return placement.absolute.extras.find((extra) => extra.kind === 'length' && (extra.spans?.includes(axis) ?? false));
}

// shapeKind
// How an element is placed, from its placement alone: by points, by a centre
// and radii, or as a box (which `planResize` handles).
function shapeKind(placement: Placement | undefined): 'points' | 'lengths' | 'box' {
  if (placement === undefined || isRectangular(placement.manifest)) return 'box';
  if (placement.absolute.extras.some((extra) => extra.kind === 'point')) return 'points';
  if (placement.absolute.extras.some((extra) => extra.kind === 'length')) return 'lengths';
  return 'box';
}

// literalTerm
// An attribute as a term the drag may rewrite, or why it may not: it must be
// written, and an integer literal.
//   element   — the element, in the text the gesture starts from
//   attribute — the attribute
function literalTerm(element: CstElement, attribute: string): AxisTerm | string {
  const value = element.attributes.find((attr) => attr.name === attribute)?.value;
  if (value === undefined) return `${attribute} is not written on <${element.name}>`;
  if (!INTEGER_LITERAL.test(value)) return `${attribute} is computed from \`${value}\``;
  return { attribute, from: Number(value), sign: 1, inserted: false };
}

// planPointAxis
// One axis of a line or triangle: every point on it, each a literal, and the
// box they span, which must be more than one pixel to scale.
//   element   — the element, in the text the gesture starts from
//   axis      — the axis
//   edge      — the edge the handle moves on it
//   placement — where it was drawn
function planPointAxis(element: CstElement, axis: Axis, edge: 'start' | 'end', placement: Placement): ShapeAxis {
  // --- Step 1: Every point on the axis, as a literal term at its drawn position ---
  const points: PlacedTerm[] = [];
  for (const extra of pointsOf(placement, axis)) {
    const term = literalTerm(element, extra.attribute);
    if (typeof term === 'string') return { kind: 'refused', reason: term };
    if (extra.coordinate === undefined) return { kind: 'refused', reason: `${extra.attribute} has no position the canvas knows` };
    points.push({ term, at: extra.coordinate.value });
  }
  if (points.length === 0) return { kind: 'refused', reason: `<${element.name}> has no ${AXIS_ATTRIBUTES[axis].size}` };

  // --- Step 2: The box they span; points in one line across the axis have none to scale ---
  const min = Math.min(...points.map((point) => point.at));
  const max = Math.max(...points.map((point) => point.at));
  if (min === max) {
    return { kind: 'refused', reason: `the points of <${element.name}> all share one ${AXIS_ATTRIBUTES[axis].start}, so it has no ${AXIS_ATTRIBUTES[axis].size} to scale` };
  }
  return { kind: 'scale', edge, min, max, points };
}

// planLengthAxis
// One axis of a circle or ellipse: its centre and the radius along the axis,
// each a literal, and on which sides of the centre the drawn box reaches by
// that radius — read from the resolver's drawn extent, which knows the
// `segments` an arc draws.
//   element   — the element, in the text the gesture starts from
//   axis      — the axis
//   edge      — the edge the handle moves on it
//   placement — where it was drawn
function planLengthAxis(element: CstElement, axis: Axis, edge: 'start' | 'end', placement: Placement): ShapeAxis {
  const names = AXIS_ATTRIBUTES[axis];
  const refuse = (reason: string): ShapeAxis => ({ kind: 'refused', reason });

  // --- Step 1: The radius, and how far the drawn box reaches by it on each side ---
  const radius = lengthOf(placement, axis);
  const extent = drawnExtent(placement.absolute, placement.manifest)[axis];
  if (radius?.coordinate === undefined || extent === undefined) return refuse(`<${element.name}> has no ${names.size} the canvas knows`);
  const reach: [number, number] = [extent.min.from.includes(radius.coordinate) ? 1 : 0, extent.max.from.includes(radius.coordinate) ? 1 : 0];
  if (reach[0] + reach[1] === 0) return refuse(`<${element.name}> draws nothing along ${radius.attribute}`);
  const length = literalTerm(element, radius.attribute);
  if (typeof length === 'string') return refuse(length);

  // --- Step 2: The centre: bound refuses; written must be a literal; else inserted where drawn ---
  const binding = geometryBindingFor(names.start).binding;
  const bound = element.attributes.find((attr) => attr.name === binding)?.value;
  if (bound !== undefined) return refuse(`${names.start} is bound to \`${bound}\``);
  let centre: AxisTerm;
  if (element.attributes.some((attr) => attr.name === names.start)) {
    const written = literalTerm(element, names.start);
    if (typeof written === 'string') return refuse(written);
    centre = written;
  } else {
    const drawn = placement.absolute.geometry[names.start]?.value;
    const declared = placement.manifest.api.props.some((prop) => prop.name === names.start);
    if (drawn === undefined || !declared) return refuse(`<${element.name}> has no ${names.start} the canvas can set`);
    // The default centre is written only if the gesture moves it (termEdits).
    centre = { attribute: names.start, from: drawn - placement.origin[names.start], sign: 1, inserted: true };
  }
  return { kind: 'length', edge, reach, centre, length };
}

/**
 * @brief Plans one element's resize by a handle: a shape's where the element
 *        is placed by points or radii, a box's otherwise.
 *
 * An axis the handle does not move is `still` (a box's: no terms), never refused.
 *
 * @param cst       The text the gesture starts from.
 * @param name      The element's name.
 * @param handle    The handle being dragged.
 * @param placement Where the pipeline placed it; undefined if not drawn.
 * @return Its plan; undefined if no element has that name.
 */
export function planHandleResize(cst: CstDocument, name: string, handle: Handle, placement: Placement | undefined): ResizePlan | undefined {
  const kind = shapeKind(placement);
  if (kind === 'box' || placement === undefined) {
    const plan = planResize(cst, name, handle, placement);
    return plan === undefined ? undefined : { kind: 'box', plan };
  }
  const element = findElement(cst, name);
  if (element === undefined) return undefined;
  const axis = (which: Axis, edge: Edge): ShapeAxis => {
    if (edge === undefined) return { kind: 'still' };
    return kind === 'points' ? planPointAxis(element, which, edge, placement) : planLengthAxis(element, which, edge, placement);
  };
  return { kind: 'shape', plan: { name, horizontal: axis('horizontal', handle.horizontal), vertical: axis('vertical', handle.vertical) } };
}

// scalePoint
// A point scaled about the edge opposite `edge` as that edge moves by `delta`,
// rounded to a whole pixel. The opposite edge's points stay exactly put.
//   at       — the point, in device pixels
//   min, max — the box's first and last pixel on this axis (min < max)
function scalePoint(at: number, min: number, max: number, edge: 'start' | 'end', delta: number): number {
  const span = max - min;
  if (edge === 'end') return Math.round(min + ((at - min) * (span + delta)) / span);
  return Math.round(max - ((max - at) * (span - delta)) / span);
}

// lengthFor
// The radius a `length` axis asks for when its edge moves by `delta`: the box
// grows by the delta, shared among the radii it reaches by. At least one pixel.
function lengthFor(axis: Extract<ShapeAxis, { kind: 'length' }>, delta: number): number {
  const growth = axis.edge === 'end' ? delta : -delta;
  return Math.max(1, Math.round(axis.length.from + growth / (axis.reach[0] + axis.reach[1])));
}

// centreFor
// Where the centre goes for a new radius, so the edge opposite the moving one
// stays put: the start edge is centre − before × radius, the end edge
// centre + after × radius.
function centreFor(axis: Extract<ShapeAxis, { kind: 'length' }>, length: number): number {
  const change = length - axis.length.from;
  return axis.edge === 'end' ? axis.centre.from + axis.reach[0] * change : axis.centre.from - axis.reach[1] * change;
}

// shapeTerms
// Every attribute a shape's resize writes at a delta, with the delta each moves by.
function shapeTerms(plan: ShapePlan, dx: number, dy: number): { term: AxisTerm; delta: number }[] {
  const terms: { term: AxisTerm; delta: number }[] = [];
  const deltas: Record<Axis, number> = { horizontal: dx, vertical: dy };

  // --- Step 1: Points: each scaled about the opposite edge ---
  for (const which of AXES) {
    const axis = plan[which];
    if (axis.kind !== 'scale') continue;
    for (const point of axis.points) terms.push({ term: point.term, delta: scalePoint(point.at, axis.min, axis.max, axis.edge, deltas[which]) - point.at });
  }

  // --- Step 2: Radii. One shared by both axes (a circle's) takes the larger they ask for ---
  const lengths = AXES.flatMap((which) => {
    const axis = plan[which];
    return axis.kind === 'length' ? [{ which, axis }] : [];
  });
  const [first, second] = lengths;
  const shared = first !== undefined && second !== undefined && first.axis.length.attribute === second.axis.length.attribute;
  const chosen = new Map<Axis, number>();
  if (shared) {
    // Only an axis the pointer moved asks for anything; with neither, the radius stays.
    const asked = lengths.filter(({ which }) => deltas[which] !== 0).map(({ which, axis }) => lengthFor(axis, deltas[which]));
    const length = asked.length === 0 ? first.axis.length.from : Math.max(...asked);
    for (const { which } of lengths) chosen.set(which, length);
    terms.push({ term: first.axis.length, delta: length - first.axis.length.from });
  } else {
    for (const { which, axis } of lengths) {
      const length = lengthFor(axis, deltas[which]);
      chosen.set(which, length);
      terms.push({ term: axis.length, delta: length - axis.length.from });
    }
  }

  // --- Step 3: Each centre moves so its opposite edge stays put ---
  for (const { which, axis } of lengths) {
    const length = chosen.get(which) ?? axis.length.from;
    terms.push({ term: axis.centre, delta: centreFor(axis, length) - axis.centre.from });
  }
  return terms;
}

/**
 * @brief The edits that put a planned resize at a delta into the current text.
 *
 * @param cst  The current text's CST.
 * @param plan The plan made when the gesture began.
 * @param dx   The horizontal delta of the moving edge, in device pixels; an integer.
 * @param dy   The vertical delta.
 * @return Disjoint edits against `cst.text`; none if the element is gone.
 */
export function resizeEdits(cst: CstDocument, plan: ResizePlan, dx: number, dy: number): TextEdit[] {
  if (plan.kind === 'box') return moveEdits(cst, [plan.plan], dx, dy);
  const element = findElement(cst, plan.plan.name);
  return element === undefined ? [] : termEdits(cst, element, shapeTerms(plan.plan, dx, dy));
}

/**
 * @brief Why a resize does not follow the pointer: each distinct refusal on an
 *        axis the pointer moves along, horizontal first.
 *
 * @param plan The resize.
 * @param dx   The horizontal delta; a refusal on an axis with no delta is not news.
 * @param dy   The vertical delta.
 */
export function resizeRefusals(plan: ResizePlan, dx: number, dy: number): string[] {
  const axes: readonly (readonly [AxisPlan | ShapeAxis, number])[] = [
    [plan.plan.horizontal, dx],
    [plan.plan.vertical, dy],
  ];
  const reasons: string[] = [];
  for (const [axis, delta] of axes) {
    if (axis.kind === 'refused' && delta !== 0 && !reasons.includes(axis.reason)) reasons.push(axis.reason);
  }
  return reasons;
}

/**
 * @brief Every reason a handle could not resize an element, on either axis
 *        and from either edge: what the property panel says about a selected
 *        element before any drag shows it.
 *
 * @param cst       The current text.
 * @param name      The element's name.
 * @param placement Where it was drawn; undefined if not drawn.
 * @return The distinct reasons, horizontal first; empty when every handle works.
 */
export function resizeRefusalReasons(cst: CstDocument, name: string, placement: Placement | undefined): string[] {
  const reasons: string[] = [];
  for (const edge of ['start', 'end'] as const) {
    const plan = planHandleResize(cst, name, { horizontal: edge, vertical: edge }, placement);
    if (plan === undefined) continue;
    for (const reason of resizeRefusals(plan, 1, 1)) if (!reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}

/**
 * @brief A line's or triangle's vertices, where they are drawn: each
 *        horizontal endpoint paired with the vertical one in the same place of
 *        the resolver's fixed order (`x0` with `y0`, `x1` with `y1`).
 *
 * @param placement Where the element was drawn; undefined if not drawn.
 * @return The vertices in device pixels; empty for an element not placed by
 *         points, or one whose points are not all known.
 */
export function vertexPoints(placement: Placement | undefined): Point[] {
  if (shapeKind(placement) !== 'points' || placement === undefined) return [];
  const xs = pointsOf(placement, 'horizontal');
  const ys = pointsOf(placement, 'vertical');
  if (xs.length !== ys.length) return [];
  const points: Point[] = [];
  for (const [i, x] of xs.entries()) {
    const y = ys[i];
    if (x.coordinate === undefined || y?.coordinate === undefined) return [];
    points.push({ x: x.coordinate.value, y: y.coordinate.value });
  }
  return points;
}

/**
 * @brief Plans the drag of one vertex: its two coordinates move with the
 *        pointer, and nothing else does. In a move's shape, so it lands
 *        through `moveEdits()` and refuses as a move does.
 *
 * @param cst       The text the gesture starts from.
 * @param name      The element's name.
 * @param index     The vertex, in `vertexPoints()` order.
 * @param placement Where the element was drawn.
 * @return The plan; undefined if the element or the vertex is not there.
 */
export function planVertex(cst: CstDocument, name: string, index: number, placement: Placement | undefined): MovePlan | undefined {
  const element = findElement(cst, name);
  if (element === undefined || placement === undefined) return undefined;
  const axis = (which: Axis): AxisPlan | undefined => {
    const extra = pointsOf(placement, which)[index];
    if (extra === undefined) return undefined;
    const term = literalTerm(element, extra.attribute);
    return typeof term === 'string' ? { kind: 'refused', reason: term } : { kind: 'move', terms: [term] };
  };
  const horizontal = axis('horizontal');
  const vertical = axis('vertical');
  return horizontal === undefined || vertical === undefined ? undefined : { name, horizontal, vertical };
}
