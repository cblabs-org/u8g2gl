/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/structure-edits.ts
 * Purpose: The canvas's two edits to a document's structure rather than to an
 *          attribute: deleting the selected elements and duplicating them.
 *          Each is a set of disjoint `TextEdit`s against the text as it is
 *          now, computed from the CST, so the author's layout and comments
 *          around them survive and the diff is the elements and nothing else.
 * Description: **Delete** removes each selected element's whole range with the
 *              CST's `removeElement`: on lines of its own, its leading
 *              indentation and its line break go with it; sharing a line, only
 *              it and the spaces before it. An element inside another selected
 *              one goes with its ancestor and is not removed twice.
 *
 *              **Duplicate** copies each selected element's source text
 *              verbatim — attributes, children, comments, layout — and inserts
 *              it as the next sibling of its original, with the original's
 *              indentation (`insertElement`). Only names change: the copy's
 *              own and every named descendant's get fresh generated names
 *              (`element-names.ts`), because a copied child's name would
 *              otherwise duplicate its original's in the same screen. A copy is
 *              placed where its original is; moving it is the caller's (the
 *              Alt-drag's placement rules).
 *
 * Exports:
 * - Placed:             A selected element and its parent
 * - topSelected():      The selected elements that are not inside another selected one
 * - deleteEdits():      Remove the selected elements
 * - Duplication:        A duplicate's edits and the copies' names
 * - duplicateEdits():   Copy the selected elements after themselves
 */

import { applyEdits, insertElement, removeElement, replaceAttributeValue, type CstContent, type CstDocument, type CstElement, type TextEdit } from '@u8g2gl/core/cst/index.js';
import { nextElementName } from '../documents/element-names';

/** A selected element and the element it is a child of. */
export interface Placed {
  readonly element: CstElement;
  readonly parent: CstElement;
}

// nameOf
// An element's written `name`, if any.
function nameOf(element: CstElement): string | undefined {
  return element.attributes.find((attr) => attr.name === 'name')?.value;
}

/**
 * @brief The selected elements, in document order, without any that lies
 *        inside another selected element — what an edit to the selection acts on.
 *
 * @param cst   The document.
 * @param names The selected names.
 * @return Each such element with its parent, in document order.
 */
export function topSelected(cst: CstDocument, names: readonly string[]): Placed[] {
  const found: Placed[] = [];
  const walk = (parent: CstElement): void => {
    for (const child of parent.children) {
      if (child.kind !== 'element') continue;
      const name = nameOf(child);
      if (name !== undefined && names.includes(name)) found.push({ element: child, parent });
      else walk(child);
    }
  };
  if (cst.root !== undefined) walk(cst.root);
  return found;
}

/**
 * @brief The edits that delete the selected elements, as one command.
 *
 * @param cst   The current text's CST.
 * @param names The selected names; any not in the document are ignored.
 * @return Disjoint edits against `cst.text`; none when nothing is found.
 */
export function deleteEdits(cst: CstDocument, names: readonly string[]): TextEdit[] {
  return topSelected(cst, names).flatMap(({ element }) => removeElement(cst, element));
}

/** A duplicate: its edits, and each original's copy's name, in document order. */
export interface Duplication {
  readonly edits: readonly TextEdit[];
  readonly copies: ReadonlyMap<string, string>;
}

// renamedCopy
// An element's source text with its own name and every named descendant's
// replaced by fresh ones, its lines after the first dedented by its own
// line's indentation so `insertElement` can indent it again.
//   cst     — the document
//   element — the element copied
//   taken   — names in use; each fresh one is added
function renamedCopy(cst: CstDocument, element: CstElement, taken: Set<string>): { text: string; name: string | undefined } {
  // --- Step 1: Fresh names, as edits relative to the element's own text ---
  const edits: TextEdit[] = [];
  let ownName: string | undefined;
  const rename = (node: CstElement): void => {
    const attr = node.attributes.find((a) => a.name === 'name');
    if (attr !== undefined) {
      const fresh = nextElementName(node.name, taken);
      taken.add(fresh);
      if (node === element) ownName = fresh;
      for (const edit of replaceAttributeValue(attr, fresh)) edits.push({ ...edit, start: edit.start - element.start, end: edit.end - element.start });
    }
    for (const child of node.children) if (child.kind === 'element') rename(child);
  };
  rename(element);
  const text = applyEdits(cst.text.slice(element.start, element.end), edits);

  // --- Step 2: Dedent the lines after the first by the element's indentation ---
  const lineStart = cst.text.lastIndexOf('\n', element.start - 1) + 1;
  const indent = /^[ \t]*/.exec(cst.text.slice(lineStart, element.start))?.[0] ?? '';
  const lines = text.split(/\r?\n/);
  const dedented = lines.map((line, i) => (i > 0 && indent !== '' && line.startsWith(indent) ? line.slice(indent.length) : line)).join('\n');
  return { text: dedented, name: ownName };
}

/**
 * @brief The edits that put a copy of each selected element after it.
 *
 * @param cst   The current text's CST.
 * @param names The selected names.
 * @param taken Every name the project uses; the copies' names are added to it.
 * @return The edits, disjoint against `cst.text`, and the copies' names.
 */
export function duplicateEdits(cst: CstDocument, names: readonly string[], taken: Set<string>): Duplication {
  const edits: TextEdit[] = [];
  const copies = new Map<string, string>();
  for (const { element, parent } of topSelected(cst, names)) {
    const original = nameOf(element);
    const copy = renamedCopy(cst, element, taken);
    const siblings = parent.children.filter((child: CstContent): child is CstElement => child.kind === 'element');
    edits.push(...insertElement(cst, parent, siblings.indexOf(element) + 1, copy.text));
    if (original !== undefined && copy.name !== undefined) copies.set(original, copy.name);
  }
  return { edits, copies };
}
