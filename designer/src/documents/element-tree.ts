/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/documents/element-tree.ts
 * Purpose: The element tree the Explorer shows under each screen (ui_spec §6):
 *          a screen's named elements, nested as they are written — a
 *          container's or widget view's children under it — in document
 *          order, which is draw order, so a later row draws over an earlier
 *          one. Built from the screen's current buffer, not from disk, so the
 *          tree is what the canvas draws, unsaved edits included. Kept a pure
 *          function of text, apart from the component, so nesting, order and
 *          the unparsable case are unit-tested without a browser.
 * Description: The named elements come from `namedElements()`, the same lookup
 *              the selection and the caret use, so a row's name is exactly the
 *              name the selection carries. An element nests under the nearest
 *              enclosing *named* element; an unnamed wrapper (`<view>`, a
 *              binding's child tag) adds no row of its own. Text that does not
 *              tokenise has no tree, and `nextTrees()` then keeps the file's
 *              last good one, as the selection keeps its names.
 *
 *              A focus ring's entries (`<focus name>`, §12.2) name elements
 *              rather than being ones, so they are no rows: each member's row
 *              carries its ring position instead, for the Explorer's marker.
 *
 *              The designer's own hiding needs a hidden row's descendants
 *              (`descendantNames()`), so that question is answered here, from
 *              the same tree the rows are drawn from.
 *
 * Exports:
 * - ElementNode:        One row: name, tag, ring position, and the rows nested under it
 * - elementTree():      A text's tree; undefined when it does not tokenise
 * - nextTrees():        Each screen's tree after a run, the last good one kept
 * - sameTree():         Whether two trees would draw the same rows
 * - descendantNames():  The names nested, at any depth, under some names
 * - findNode():         A node by name
 */

import { namedElements } from './element-at';

/** One element row: its name, its tag, and its children in document order. */
export interface ElementNode {
  readonly name: string;
  readonly tag: string;
  readonly children: readonly ElementNode[];
  /** Its 1-based position in the screen's focus ring (§12.2); absent when not a member. */
  readonly ring?: number;
}

/**
 * The tags a `<focus_ring>` lists its members with (the parser reads both).
 * Such a tag names an element rather than being one, so it is no row of its
 * own: its position is the member's marker instead.
 */
const RING_ENTRY_TAGS: ReadonlySet<string> = new Set(['focus', 'entry']);

/** A node under construction, with the span its descendants must fall inside. */
interface OpenNode {
  readonly node: { name: string; tag: string; children: ElementNode[] };
  readonly end: number;
}

/**
 * @brief A document's named elements as a tree, in document order.
 *
 * @param text The document, as the buffer holds it now.
 * @return The top-level rows (the root's own element is never a row); empty
 *         for a document with no named element; undefined when the text does
 *         not tokenise.
 */
export function elementTree(text: string): ElementNode[] | undefined {
  const spans = namedElements(text);
  if (spans === undefined) return undefined;

  // --- Step 1: Walk the spans in document order, keeping the open ancestors ---
  // A span starts after its ancestors' and ends no later than theirs, so the
  // stack of open spans is always the chain of named ancestors.
  // The ring's entries name members, in ring order; the first naming of a
  // member is its position.
  const positions = new Map<string, number>();
  for (const span of spans.filter((candidate) => RING_ENTRY_TAGS.has(candidate.tag))) {
    if (!positions.has(span.name)) positions.set(span.name, positions.size + 1);
  }
  const roots: ElementNode[] = [];
  const open: OpenNode[] = [];
  for (const span of spans) {
    if (RING_ENTRY_TAGS.has(span.tag)) continue;
    while (open.length > 0 && (open[open.length - 1] as OpenNode).end <= span.start) open.pop();

    // --- Step 2: Attach it to the nearest named ancestor, or the top level ---
    const ring = positions.get(span.name);
    const node = { name: span.name, tag: span.tag, children: [] as ElementNode[], ...(ring === undefined ? {} : { ring }) };
    const parent = open[open.length - 1];
    (parent === undefined ? roots : parent.node.children).push(node);
    open.push({ node, end: span.end });
  }
  return roots;
}

/**
 * @brief Each screen's tree after a pipeline run.
 *
 * A screen whose text no longer tokenises keeps its previous tree, so half a
 * typed tag does not empty the Explorer; one with no previous tree has none
 * yet. A screen no longer listed is dropped. When every tree is unchanged the
 * previous map itself is returned, so a subscriber comparing by identity sees
 * no change on a keystroke that moves no row.
 *
 * @param previous      The trees as last published, by project path.
 * @param texts         Each screen's current text, by project path, in listing order.
 * @param previousTexts The texts `previous` was built from, if known: a file
 *                      whose text is the same string is not tokenised again,
 *                      which is every file but the one being edited.
 * @return The trees, in `texts`' order.
 */
export function nextTrees(
  previous: ReadonlyMap<string, readonly ElementNode[]>,
  texts: ReadonlyMap<string, string>,
  previousTexts: ReadonlyMap<string, string> = new Map(),
): ReadonlyMap<string, readonly ElementNode[]> {
  // --- Step 1: Each screen's tree, reusing the previous one where unchanged ---
  const next = new Map<string, readonly ElementNode[]>();
  for (const [file, text] of texts) {
    const before = previous.get(file);
    if (before !== undefined && previousTexts.get(file) === text) {
      next.set(file, before);
      continue;
    }
    const built = elementTree(text);
    if (built === undefined) {
      if (before !== undefined) next.set(file, before);
    } else {
      next.set(file, before !== undefined && sameTree(before, built) ? before : built);
    }
  }

  // --- Step 2: The same files, in the same order, with the same trees: no change ---
  const before = [...previous];
  const after = [...next];
  const unchanged = before.length === after.length && after.every(([file, tree], i) => before[i]?.[0] === file && before[i]?.[1] === tree);
  return unchanged ? previous : next;
}

/**
 * @brief Whether two trees would draw the same rows: the same names and tags,
 *        nested the same way, in the same order.
 */
export function sameTree(a: readonly ElementNode[], b: readonly ElementNode[]): boolean {
  return (
    a.length === b.length &&
    a.every((node, i) => {
      const other = b[i] as ElementNode;
      return node.name === other.name && node.tag === other.tag && node.ring === other.ring && sameTree(node.children, other.children);
    })
  );
}

/**
 * @brief Every name nested, at any depth, under any of `names`, the names
 *        themselves not included unless one is nested under another.
 *
 * @param tree  A screen's tree.
 * @param names The ancestors; a name not in the tree contributes nothing.
 */
export function descendantNames(tree: readonly ElementNode[], names: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  // visit
  // Walks a subtree; `inside` is true once an ancestor is one of `names`.
  const visit = (nodes: readonly ElementNode[], inside: boolean): void => {
    for (const node of nodes) {
      if (inside) found.add(node.name);
      visit(node.children, inside || names.has(node.name));
    }
  };
  visit(tree, false);
  return found;
}

/** @brief The node named `name` anywhere in `tree`; undefined if none. */
export function findNode(tree: readonly ElementNode[], name: string): ElementNode | undefined {
  for (const node of tree) {
    if (node.name === name) return node;
    const inner = findNode(node.children, name);
    if (inner !== undefined) return inner;
  }
  return undefined;
}
