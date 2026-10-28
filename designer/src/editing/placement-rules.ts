/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/placement-rules.ts
 * Purpose: What a move writes (EDITOR-DESIGN §3.5): the canvas rewrites **the
 *          attribute that places the element** on each axis, never a position
 *          the text does not hold. This module reads, from an element's own
 *          attributes in the CST, which attributes those are and whether the
 *          canvas may rewrite them, and turns a move into the smallest
 *          `TextEdit[]` that makes the text say it.
 * Description: A move is planned once, when the gesture starts, from the text
 *              then: per element and per axis, either the attributes to
 *              rewrite with the values they started at, or a refusal with the
 *              reason the user is told. Each frame then writes start value plus
 *              the gesture's integer delta into the **current** text's CST,
 *              finding the element again by name, so the text after any frame
 *              is exactly what that frame's pointer says.
 *
 *              The rules, per axis, first match wins:
 *              - bound (`bind_x`): refused, *x is bound to `…`*; the value is
 *                live data, and sample data moves it, not the mouse;
 *              - centred (`hcenter`): refused, the position is derived;
 *              - every attribute that places the axis — the start (`x`), the
 *                far anchor (`right`, rewritten **inverted**: dragging left
 *                raises it) and the axis's endpoints (`x1`, `x2`) — must be an
 *                integer literal, and each is rewritten; one that is not
 *                refuses the axis, *x is computed from `…`*, and the element
 *                moves on the other axis only;
 *              - nothing written: the start attribute is inserted, at the
 *                position the element was drawn at, if its manifest declares
 *                it; otherwise refused.
 *              Nothing here turns an expression into a literal: Detach is the
 *              property panel's, explicit and undoable.
 *
 *              Which attribute is which comes from the layout contract (§7.2's
 *              axis names, [D-20]'s bindings), the element's manifest and the
 *              resolver's own list of the endpoints it read, never from a list
 *              of element names ([D-17]).
 *
 * Exports:
 * - Axis:              Horizontal or vertical
 * - AXIS_ATTRIBUTES:   Each axis's start, size, far anchor and centring names
 * - INTEGER_LITERAL:   The only value the canvas rewrites
 * - AxisTerm:          One attribute a move rewrites
 * - AxisPlan:          An axis's terms, or why it refuses
 * - MovePlan:          One element's two axes
 * - findElement():     An element of a document by its name
 * - planMove():        Plan one element's move from its attributes
 * - refusals():        The reasons a planned move refuses on the axes it moves along
 * - termEdits():       Terms at a delta, as edits to one element
 * - moveEdits():       Planned moves at a delta, as edits to the current text
 */

import {
  insertAttribute,
  removeAttribute,
  replaceAttributeValue,
  type CstContent,
  type CstDocument,
  type CstElement,
  type TextEdit,
} from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { geometryBindingFor, isCentringOn, isRectangular } from '@u8g2gl/core/resolver/index.js';

/** One of the two axes a move goes along. */
export type Axis = 'horizontal' | 'vertical';

/**
 * Each axis's attributes in the layout contract (§7.2): the start edge, the
 * size, the far-edge anchor and the centring switch. These name the contract,
 * not elements, as the resolver's own axis table does.
 */
export const AXIS_ATTRIBUTES: Readonly<
  Record<Axis, { readonly start: 'x' | 'y'; readonly size: 'width' | 'height'; readonly end: 'right' | 'bottom'; readonly centre: string }>
> = {
  horizontal: { start: 'x', size: 'width', end: 'right', centre: 'hcenter' },
  vertical: { start: 'y', size: 'height', end: 'bottom', centre: 'vcenter' },
};

/** An integer literal, the only value the canvas rewrites (§3.5). */
export const INTEGER_LITERAL = /^-?[0-9]+$/;

/** One attribute a move rewrites, and the value it had when the move began. */
export interface AxisTerm {
  readonly attribute: string;
  /** Its integer value when the gesture began. */
  readonly from: number;
  /** +1 when the attribute grows with the delta, −1 when it shrinks (a far anchor). */
  readonly sign: 1 | -1;
  /**
   * True when the attribute was not written and the move adds it. At a delta
   * of 0 it is removed again, so a gesture that ends where it began leaves the
   * text as it was.
   */
  readonly inserted: boolean;
}

/** An axis's plan: the attributes to rewrite, or the reason it refuses. */
export type AxisPlan =
  | { readonly kind: 'move'; readonly terms: readonly AxisTerm[] }
  | { readonly kind: 'refused'; readonly reason: string };

/** One element's move: its name, and each axis's plan. */
export interface MovePlan {
  readonly name: string;
  readonly horizontal: AxisPlan;
  readonly vertical: AxisPlan;
}

/**
 * @brief The element below the document's root whose `name` is `name`.
 *
 * @return The first such element in document order; undefined if none.
 */
export function findElement(cst: CstDocument, name: string): CstElement | undefined {
  const search = (children: readonly CstContent[]): CstElement | undefined => {
    for (const child of children) {
      if (child.kind !== 'element') continue;
      if (child.attributes.some((attr) => attr.name === 'name' && attr.value === name)) return child;
      const found = search(child.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return cst.root === undefined ? undefined : search(cst.root.children);
}

// planAxis
// One axis of one element, by the table in the file header.
//   element   — the element, in the text the gesture starts from
//   axis      — the axis
//   placement — where the pipeline placed it, for its manifest, its endpoints
//               and the position a default puts it at; undefined if not drawn
function planAxis(element: CstElement, axis: Axis, placement: Placement | undefined): AxisPlan {
  const names = AXIS_ATTRIBUTES[axis];
  const valueOf = (attribute: string): string | undefined => element.attributes.find((attr) => attr.name === attribute)?.value;

  // --- Step 1: Bound: the value is live data ---
  const binding = geometryBindingFor(names.start)?.binding;
  const bound = binding === undefined ? undefined : valueOf(binding);
  if (binding !== undefined && bound !== undefined) {
    return { kind: 'refused', reason: `${names.start} is bound to \`${bound}\`` };
  }

  // --- Step 2: Centred: the position is derived from the container ---
  // Anchors and centring are §7.2's rectangle contract; an element without the
  // rectangle (a line) has neither, as the resolver reads it.
  const rectangular = placement === undefined || isRectangular(placement.manifest);
  const centre = valueOf(names.centre);
  if (rectangular && isCentringOn(centre)) {
    return { kind: 'refused', reason: `${names.start} is centred by \`${names.centre}="${centre ?? ''}"\`` };
  }

  // --- Step 3: Every attribute that places the axis, each a literal ---
  const placing: { attribute: string; sign: 1 | -1 }[] = [{ attribute: names.start, sign: 1 }];
  if (rectangular) placing.push({ attribute: names.end, sign: -1 });
  for (const extra of placement?.absolute.extras ?? []) {
    if (extra.kind === 'point' && extra.axis === axis) placing.push({ attribute: extra.attribute, sign: 1 });
  }
  const terms: AxisTerm[] = [];
  for (const { attribute, sign } of placing) {
    const value = valueOf(attribute);
    if (value === undefined) continue;
    if (!INTEGER_LITERAL.test(value)) {
      return { kind: 'refused', reason: `${attribute} is computed from \`${value}\`` };
    }
    terms.push({ attribute, from: Number(value), sign, inserted: false });
  }
  if (terms.length > 0) return { kind: 'move', terms };

  // --- Step 4: Nothing written: insert the start, at the drawn position ---
  const declared = placement?.manifest.api.props.some((prop) => prop.name === names.start) ?? false;
  const drawn = placement?.absolute.geometry[names.start]?.value;
  if (!declared || placement === undefined || drawn === undefined) {
    return { kind: 'refused', reason: `<${element.name}> has no ${names.start} the canvas can set` };
  }
  const relative = drawn - placement.origin[names.start];
  return { kind: 'move', terms: [{ attribute: names.start, from: relative, sign: 1, inserted: true }] };
}

/**
 * @brief Plans one element's move from its attributes in `cst`.
 *
 * @param cst       The text the gesture starts from.
 * @param name      The element's name.
 * @param placement Where the pipeline placed it on the drawn frame; undefined
 *                  when it is not drawn (it then moves only where literals place it).
 * @return Its plan; undefined if no element has that name.
 */
export function planMove(cst: CstDocument, name: string, placement: Placement | undefined): MovePlan | undefined {
  const element = findElement(cst, name);
  if (element === undefined) return undefined;
  return { name, horizontal: planAxis(element, 'horizontal', placement), vertical: planAxis(element, 'vertical', placement) };
}

/**
 * @brief Why the planned moves do not follow the pointer on an axis it moves
 *        along: each distinct refusal, in plan order.
 *
 * @param plans The moves.
 * @param dx    The horizontal delta; a refusal on an axis with no delta is not news.
 * @param dy    The vertical delta.
 */
export function refusals(plans: readonly MovePlan[], dx: number, dy: number): string[] {
  const reasons: string[] = [];
  for (const plan of plans) {
    for (const [axisPlan, delta] of [
      [plan.horizontal, dx],
      [plan.vertical, dy],
    ] as const) {
      if (axisPlan.kind === 'refused' && delta !== 0 && !reasons.includes(axisPlan.reason)) reasons.push(axisPlan.reason);
    }
  }
  return reasons;
}

/**
 * @brief The edits that set an element's terms to their start values moved by
 *        a delta.
 *
 * A value already right is left alone. An inserted term is added when its
 * attribute is missing and removed again at its start value, so a gesture that
 * returns to where it began leaves the text as it found it. Two attributes
 * added at once land in one insertion, in term order, since both would
 * otherwise insert at the same offset.
 *
 * @param cst     The current text's CST.
 * @param element An element of `cst`.
 * @param terms   Each attribute and the delta it moves by.
 * @return Disjoint edits against `cst.text`.
 */
export function termEdits(cst: CstDocument, element: CstElement, terms: readonly { readonly term: AxisTerm; readonly delta: number }[]): TextEdit[] {
  const edits: TextEdit[] = [];
  let insertion: TextEdit | undefined;
  for (const { term, delta } of terms) {
    const value = term.from + term.sign * delta;
    const attr = element.attributes.find((a) => a.name === term.attribute);
    if (attr !== undefined) {
      edits.push(...(term.inserted && value === term.from ? removeAttribute(cst, attr) : replaceAttributeValue(attr, String(value))));
    } else if (!term.inserted || value !== term.from) {
      const [added] = insertAttribute(cst, element, term.attribute, String(value));
      if (added !== undefined) insertion = insertion === undefined ? added : { ...insertion, text: insertion.text + added.text };
    }
  }
  if (insertion !== undefined) edits.push(insertion);
  return edits;
}

/**
 * @brief The edits that put planned moves at a delta into the current text.
 *
 * Each term's attribute is set to its start value plus `sign × delta`. An
 * element that no longer has its name is skipped.
 *
 * @param cst   The current text's CST.
 * @param plans The plans made when the gesture began.
 * @param dx    The horizontal delta, in device pixels; an integer.
 * @param dy    The vertical delta.
 * @return Disjoint edits against `cst.text`.
 */
export function moveEdits(cst: CstDocument, plans: readonly MovePlan[], dx: number, dy: number): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const plan of plans) {
    const element = findElement(cst, plan.name);
    if (element === undefined) continue;
    const terms: { term: AxisTerm; delta: number }[] = [];
    if (plan.horizontal.kind === 'move') for (const term of plan.horizontal.terms) terms.push({ term, delta: dx });
    if (plan.vertical.kind === 'move') for (const term of plan.vertical.terms) terms.push({ term, delta: dy });
    edits.push(...termEdits(cst, element, terms));
  }
  return edits;
}
