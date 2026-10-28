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
 *              An axis is placed by an integer literal on its start attribute
 *              (`x`, `y`): rewritten. Anything else refuses that axis, so the
 *              element moves on the other one only; nothing here ever turns an
 *              author's expression into a literal.
 *
 * Exports:
 * - Axis:            Horizontal or vertical
 * - AxisTerm:        One attribute a move rewrites
 * - AxisPlan:        An axis's terms, or why it refuses
 * - MovePlan:        One element's two axes
 * - findElement():   An element of a document by its name
 * - planMove():      Plan one element's move from its attributes
 * - moveEdits():     A planned move at a delta, as edits to the current text
 */

import { replaceAttributeValue, type CstContent, type CstDocument, type CstElement, type TextEdit } from '@u8g2gl/core/cst/index.js';

/** One of the two axes a move goes along. */
export type Axis = 'horizontal' | 'vertical';

/** One attribute a move rewrites, and the value it had when the move began. */
export interface AxisTerm {
  readonly attribute: string;
  /** Its integer value when the gesture began. */
  readonly from: number;
  /** +1 when the attribute grows with the delta, −1 when it shrinks. */
  readonly sign: 1 | -1;
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

/** Each axis's start attribute: the layout contract's names (§7.2), not element knowledge. */
const START: Readonly<Record<Axis, string>> = { horizontal: 'x', vertical: 'y' };

/** An integer literal, the only value the canvas rewrites (ruling 3). */
const LITERAL = /^-?[0-9]+$/;

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
// One axis of one element: its start attribute rewritten if it is an integer
// literal, refused otherwise.
//   element — the element, in the text the gesture starts from
//   axis    — the axis
function planAxis(element: CstElement, axis: Axis): AxisPlan {
  const attribute = START[axis];
  const written = element.attributes.find((attr) => attr.name === attribute);
  if (written === undefined) {
    return { kind: 'refused', reason: `${attribute} is not written on <${element.name}>` };
  }
  if (!LITERAL.test(written.value)) {
    return { kind: 'refused', reason: `${attribute} is computed from \`${written.value}\`` };
  }
  return { kind: 'move', terms: [{ attribute, from: Number(written.value), sign: 1 }] };
}

/**
 * @brief Plans one element's move from its attributes in `cst`.
 *
 * @param cst  The text the gesture starts from.
 * @param name The element's name.
 * @return Its plan; undefined if no element has that name.
 */
export function planMove(cst: CstDocument, name: string): MovePlan | undefined {
  const element = findElement(cst, name);
  if (element === undefined) return undefined;
  return { name, horizontal: planAxis(element, 'horizontal'), vertical: planAxis(element, 'vertical') };
}

/**
 * @brief The edits that put planned moves at a delta into the current text.
 *
 * Each term's attribute is set to its start value plus `sign × delta`. A value
 * already right is left alone, so a frame that changes nothing edits nothing,
 * and an element that no longer has its name, or its attribute, is skipped.
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
    for (const [axisPlan, delta] of [
      [plan.horizontal, dx],
      [plan.vertical, dy],
    ] as const) {
      if (axisPlan.kind !== 'move') continue;
      for (const term of axisPlan.terms) {
        const attr = element.attributes.find((a) => a.name === term.attribute);
        if (attr !== undefined) edits.push(...replaceAttributeValue(attr, String(term.from + term.sign * delta)));
      }
    }
  }
  return edits;
}
