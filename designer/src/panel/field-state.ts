/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/field-state.ts
 * Purpose: What one property field shows right now: the value written, or the
 *          default greyed; *mixed* across a multi-selection; the diagnostics at
 *          that attribute; and, when the field must not be edited, why. The
 *          panel teaches by saying why (ui_spec §9.2), so a disabled field
 *          always carries its reason. Kept apart from the layout because it
 *          changes on every edit while the layout almost never does: a drag
 *          changes one field's state and nothing else (EDITOR-DESIGN §3.3).
 * Description: `fieldState()` applies, in order of precedence:
 *              - text that is not well-formed: nothing is editable (§3.8);
 *              - `bind_<prop>` written: `<prop>` is live data (ui_spec §9.2);
 *              - `right` written disables `x`, `bottom` disables `y` (§7.2
 *                forbids over-constraint);
 *              - several elements: geometry shows their bounding box,
 *                read-only (§9.4).
 *              A geometry value written as an expression or constant offers
 *              **Detach**, the literal the scene computed for it (EDITOR-DESIGN
 *              §3.5). These are generic rules over attribute names that every
 *              element shares, never a rule about one widget ([UD-5]).
 *              `sameFieldState()` is the equality the field's observable uses,
 *              so an unchanged field is never re-rendered.
 *
 * Exports:
 * - FieldState:        What a field shows
 * - FieldContext:      What the rules need beyond the elements
 * - DETACHABLE:        The geometry props Detach applies to
 * - fieldState():      A field's state for the selected elements
 * - sameFieldState():  Whether two states would render the same
 * - isIntegerLiteral(): Whether a written value is a plain integer
 * - intDraftError():   Why an int field's draft would be refused, as typed
 */

import { INT32_MAX, INT32_MIN } from '@u8g2gl/core/resolver/expression.js';
import type { ElementFacts, FieldProblem } from './element-facts';
import type { FieldSpec } from './panel-layout';
import type { Rect } from '../pipeline/live-pipeline';

/** What a field shows. */
export interface FieldState {
  /** The value written on every selected element alike; undefined if none writes it, or if mixed. */
  readonly value: string | undefined;
  /** The selected elements disagree: some differ, or some write it and some do not. */
  readonly mixed: boolean;
  /** At least one selected element writes the attribute, so it can be reset. */
  readonly written: boolean;
  /** Diagnostics at this attribute, on any selected element. */
  readonly problems: readonly FieldProblem[];
  /** Why the field cannot be edited, or undefined when it can. */
  readonly disabled: string | undefined;
  /** The literal Detach would write, when the value is an expression or constant. */
  readonly detach: string | undefined;
  /**
   * The attribute *Edit in XML* reveals, when the panel cannot or should not
   * edit this field itself: the binding or anchor that disables it, or the
   * field's own expression. Undefined when the field edits normally.
   */
  readonly reveal: string | undefined;
  /** A read-only value shown instead of the written one (a multi-selection's bounding box). */
  readonly shown: string | undefined;
}

/** What the rules need beyond the elements themselves. */
export interface FieldContext {
  /** False while the document is not well-formed: no edit may be computed from it. */
  readonly wellFormed: boolean;
  /** The bounding box of the selected elements as drawn, for a multi-selection's geometry. */
  readonly box: Rect | undefined;
}

/** The geometry props whose computed literal Detach can write (EDITOR-DESIGN §3.5). */
export const DETACHABLE: readonly (keyof Rect)[] = ['x', 'y', 'width', 'height'];

/** The anchors that take over an axis (§7.2), by the prop they disable. */
const ANCHORS: Readonly<Record<string, string>> = { x: 'right', y: 'bottom' };

/** @brief Whether a written value is a plain integer literal, `-?[0-9]+`. */
export function isIntegerLiteral(value: string): boolean {
  return /^\s*-?[0-9]+\s*$/.test(value);
}

/**
 * @brief Why an `int` draft would be refused, as typed (ui_spec §9.2's live
 *        validation); undefined when it is acceptable.
 *
 * An integer within `int32_t`, or an expression over integers and
 * `#constants` (§7.2), which the validator evaluates once committed.
 */
export function intDraftError(draft: string): string | undefined {
  const text = draft.trim();
  if (/^-?[0-9]+$/.test(text)) {
    const value = Number(text);
    return value >= INT32_MIN && value <= INT32_MAX ? undefined : 'Outside int32_t, which an int property is (§13.2).';
  }
  if (/^[#$A-Za-z0-9_+\-*/()\s]+$/.test(text) && /[#$]/.test(text)) return undefined;
  return 'An int is an integer, or an expression of integers and #constants such as #margin + 4 (§7.2).';
}

/**
 * @brief The state of one field for the selected elements.
 *
 * @param spec     The field, from the layout.
 * @param elements The selected elements' facts; at least one.
 * @param context  Well-formedness and the selection's bounding box.
 */
export function fieldState(spec: FieldSpec, elements: readonly ElementFacts[], context: FieldContext): FieldState {
  // --- Step 1: The value: common, mixed, or unwritten ---
  const values = elements.map((element) => element.attributes.get(spec.key));
  const first = values[0];
  const mixed = values.some((value) => value !== first);
  const written = values.some((value) => value !== undefined);
  const problems = uniqueProblems(elements.flatMap((element) => element.problems.get(spec.key) ?? []));

  // --- Step 2: Why it cannot be edited, most fundamental first ---
  const geometry = (DETACHABLE as readonly string[]).includes(spec.key);
  const several = elements.length > 1;
  const box = context.box;
  let disabled: string | undefined;
  let shown: string | undefined;
  let reveal: string | undefined;
  const subject = spec.kind === 'prop' ? boundBy(spec.key, elements) : undefined;
  const anchor = ANCHORS[spec.key];
  const anchorValue = anchoredBy(spec.key, elements);
  if (!context.wellFormed) {
    disabled = 'The XML is not well-formed, so no edit can be placed in it; the panel edits again once it parses.';
  } else if (subject !== undefined) {
    disabled = `${spec.key} is bound to '${subject}' by bind_${spec.key}: the subject's value replaces it, so edit the binding or the sample data instead (§8.4).`;
    reveal = `bind_${spec.key}`;
  } else if (anchor !== undefined && anchorValue !== undefined) {
    disabled = `${spec.key} is set by ${anchor}="${anchorValue}": the element is anchored to its container's ${anchor} edge, and setting both would over-constrain it (§7.2).`;
    reveal = anchor;
  } else if (several && geometry) {
    disabled = `The bounding box of ${elements.length} elements, read-only here: move or align them on the canvas.`;
    shown = box === undefined ? undefined : String(box[spec.key as keyof Rect]);
  }

  // --- Step 3: Detach, for one element's geometry written as an expression ---
  // Only when nothing disabled it: a bound value is live data, not a
  // computation, so it offers Edit in XML and never Detach (EDITOR-DESIGN §3.5).
  let detach: string | undefined;
  const placed = elements[0]?.placed;
  if (!several && geometry && disabled === undefined && first !== undefined && !isIntegerLiteral(first) && placed !== undefined) {
    detach = String(placed[spec.key as keyof Rect]);
    reveal = spec.key;
  }
  // A multi-selection has no single attribute to reveal.
  if (several) reveal = undefined;

  return { value: mixed ? undefined : first, mixed, written, problems, disabled, detach, shown, reveal };
}

/**
 * @brief Whether two states would render identically, so the field's
 *        observable stays silent and the field does not re-render.
 */
export function sameFieldState(a: FieldState, b: FieldState): boolean {
  return (
    a.value === b.value &&
    a.mixed === b.mixed &&
    a.written === b.written &&
    a.disabled === b.disabled &&
    a.detach === b.detach &&
    a.reveal === b.reveal &&
    a.shown === b.shown &&
    a.problems.length === b.problems.length &&
    a.problems.every((p, i) => p.message === b.problems[i]?.message && p.severity === b.problems[i]?.severity)
  );
}

// boundBy
// The subject a `bind_<prop>` names on any selected element, if one does.
function boundBy(prop: string, elements: readonly ElementFacts[]): string | undefined {
  for (const element of elements) {
    const subject = element.attributes.get(`bind_${prop}`);
    if (subject !== undefined) return subject;
  }
  return undefined;
}

// anchoredBy
// The value of the anchor that takes over `prop`'s axis, on any selected element.
function anchoredBy(prop: string, elements: readonly ElementFacts[]): string | undefined {
  const anchor = ANCHORS[prop];
  if (anchor === undefined) return undefined;
  for (const element of elements) {
    const value = element.attributes.get(anchor);
    if (value !== undefined) return value;
  }
  return undefined;
}

// uniqueProblems
// One entry per distinct message, in first-seen order.
function uniqueProblems(problems: readonly FieldProblem[]): FieldProblem[] {
  const seen = new Set<string>();
  const unique: FieldProblem[] = [];
  for (const problem of problems) {
    if (seen.has(problem.message)) continue;
    seen.add(problem.message);
    unique.push(problem);
  }
  return unique;
}
