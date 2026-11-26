/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/focus-ring.ts
 * Purpose: A screen's focus ring (§12.2) as the property panel edits it: an
 *          ordered list the author adds to, removes from and reorders, with
 *          `wrap`. Membership is opt-in and author-curated (Q1a): the ring is
 *          exactly the `<focus name>` entries written, in their order, and this
 *          module never adds one the author did not choose. As everywhere in
 *          the panel, each change is the smallest text edit, computed from the
 *          screen's current text.
 * Description: `focusRingOf()` reads the ring from the screen's CST — under its
 *              `<view>`, or directly under `<screen>`, where the parser also
 *              accepts one — and the named elements written in the screen
 *              that are not members yet, which is all an add may offer.
 *              `focusRingEdits()` turns an action into CST edits: adding the
 *              first member writes the ring at the end of `<view>`; removing
 *              the last removes it, since an empty ring and no ring mean the
 *              same (the screen ignores input). Pure, so it is tested without a
 *              browser; the controller lands the edits as one undo stop.
 *
 * Exports:
 * - FocusRingView:   The ring as written, and what may be added to it
 * - FocusRingEdit:   An action
 * - focusRingOf():   Read the ring of a screen
 * - focusRingEdits(): The text edits one action makes
 * - focusPositions(): Each member's 1-based position, for the Explorer's marker
 */

import {
  insertAttribute,
  insertElement,
  parseCst,
  removeElement,
  replaceAttributeValue,
  type CstDocument,
  type CstElement,
  type TextEdit,
} from '@u8g2gl/core/cst/index.js';

/** A screen's ring as written, and what an add may offer. */
export interface FocusRingView {
  /** Whether the screen declares a `<focus_ring>` at all. */
  readonly exists: boolean;
  /** `wrap` as the parser reads it: true unless written `false`. */
  readonly wrap: boolean;
  /** The members' names, in the ring's order; an entry with no name is ''. */
  readonly members: readonly string[];
  /** Each member's `<focus>` in the text, half-open: what its problems are found by. */
  readonly ranges: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  /** Named elements written in the screen and not in the ring, in document order. */
  readonly candidates: readonly string[];
}

/** An action on the ring. */
export type FocusRingEdit =
  | { readonly kind: 'add'; readonly name: string }
  | { readonly kind: 'remove'; readonly row: number }
  | { readonly kind: 'move'; readonly row: number; readonly by: -1 | 1 }
  | { readonly kind: 'wrap'; readonly wrap: boolean };

// childElements
function childElements(element: CstElement): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element');
}

// viewOf
// The screen's `<view>`, where its elements and its ring are written.
function viewOf(cst: CstDocument): CstElement | undefined {
  return cst.root === undefined ? undefined : childElements(cst.root).find((child) => child.name === 'view');
}

// ringOf
// The screen's `<focus_ring>`: in its `<view>`, or under `<screen>` itself,
// as the parser looks for it.
function ringOf(cst: CstDocument): CstElement | undefined {
  const view = viewOf(cst);
  const inView = view === undefined ? undefined : childElements(view).find((child) => child.name === 'focus_ring');
  return inView ?? (cst.root === undefined ? undefined : childElements(cst.root).find((child) => child.name === 'focus_ring'));
}

// entriesOf
// The ring's `<focus>` entries (the parser also reads `<entry>`), in order.
function entriesOf(ring: CstElement): CstElement[] {
  return childElements(ring).filter((child) => child.name === 'focus' || child.name === 'entry');
}

// nameOf
function nameOf(element: CstElement): string {
  return element.attributes.find((attribute) => attribute.name === 'name')?.value ?? '';
}

// writtenElements
// The named elements written in a view, depth first: those whose tag is an
// element (`isElement`), so a `<style>`, an event or a binding is never one.
//   view      — the screen's view
//   isElement — whether a tag names an element
function writtenElements(view: CstElement, isElement: (tag: string) => boolean): string[] {
  const names: string[] = [];
  const visit = (element: CstElement): void => {
    for (const child of childElements(element)) {
      if (!isElement(child.name)) continue;
      const name = nameOf(child);
      if (name !== '' && !names.includes(name)) names.push(name);
      visit(child);
    }
  };
  visit(view);
  return names;
}

/**
 * @brief The ring of one screen, and the elements an add may offer.
 *
 * @param cst       The screen's current CST.
 * @param isElement Whether a tag names an element (the manifest registry's `has`).
 */
export function focusRingOf(cst: CstDocument, isElement: (tag: string) => boolean): FocusRingView {
  const ring = ringOf(cst);
  const entries = ring === undefined ? [] : entriesOf(ring);
  const members = entries.map(nameOf);
  const view = viewOf(cst);
  const written = view === undefined ? [] : writtenElements(view, isElement);
  const wrapAttribute = ring?.attributes.find((attribute) => attribute.name === 'wrap')?.value;
  return {
    exists: ring !== undefined,
    wrap: wrapAttribute === undefined ? true : wrapAttribute !== 'false',
    members,
    ranges: entries.map((entry) => ({ start: entry.start, end: entry.end })),
    candidates: written.filter((name) => !members.includes(name)),
  };
}

/**
 * @brief Each ring member's 1-based position, by name: what the Explorer's
 *        marker shows. A name listed twice keeps its first position.
 *
 * @param text The screen's current text.
 * @param file Its project path.
 */
export function focusPositions(text: string, file: string): ReadonlyMap<string, number> {
  const { cst } = parseCst(text, file);
  const ring = ringOf(cst);
  const positions = new Map<string, number>();
  (ring === undefined ? [] : entriesOf(ring)).forEach((entry, index) => {
    const name = nameOf(entry);
    if (name !== '' && !positions.has(name)) positions.set(name, index + 1);
  });
  return positions;
}

// escapeAttribute
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * @brief The text edits one ring action makes.
 *
 * @param text   The screen's current text.
 * @param file   Its project path.
 * @param action The action.
 * @return Non-overlapping edits in the coordinates of `text`; empty when the
 *         action changes nothing or names a row the text no longer has.
 */
export function focusRingEdits(text: string, file: string, action: FocusRingEdit): TextEdit[] {
  // --- Step 1: The ring and its entries, as the text is now ---
  const { cst } = parseCst(text, file);
  const ring = ringOf(cst);
  const entries = ring === undefined ? [] : entriesOf(ring);

  // --- Step 2: The action ---
  switch (action.kind) {
    case 'add': {
      if (action.name === '' || entries.some((entry) => nameOf(entry) === action.name)) return [];
      const entry = `<focus name="${escapeAttribute(action.name)}" />`;
      if (ring !== undefined) {
        return insertElement(cst, ring, childElements(ring).length, entry);
      }
      // The first member writes the ring, last in the view, wrapping as the
      // parser's default does.
      const view = viewOf(cst);
      if (view === undefined) return [];
      return insertElement(cst, view, childElements(view).length, `<focus_ring wrap="true">\n  ${entry}\n</focus_ring>`);
    }
    case 'remove': {
      const entry = entries[action.row];
      if (entry === undefined || ring === undefined) return [];
      // The last member takes the ring with it: an empty ring is no ring.
      return entries.length === 1 ? removeElement(cst, ring) : removeElement(cst, entry);
    }
    case 'move': {
      const a = entries[action.row];
      const b = entries[action.row + action.by];
      if (a === undefined || b === undefined) return [];
      const [first, second] = action.by < 0 ? [b, a] : [a, b];
      const textOf = (element: CstElement): string => cst.text.slice(element.start, element.end);
      return [
        { start: first.start, end: first.end, text: textOf(second) },
        { start: second.start, end: second.end, text: textOf(first) },
      ];
    }
    case 'wrap': {
      if (ring === undefined) return [];
      const value = action.wrap ? 'true' : 'false';
      const existing = ring.attributes.find((attribute) => attribute.name === 'wrap');
      if (existing === undefined) return insertAttribute(cst, ring, 'wrap', value);
      return existing.value === value ? [] : replaceAttributeValue(existing, value);
    }
  }
}
