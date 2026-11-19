/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/static-children.ts
 * Purpose: The property panel's table of an element's static children
 *          (`<column>` inside a service list, design_spec §6.5, ui_spec §6).
 *          They are configuration of the element, written as children in the
 *          XML, so without this table a column's width could only be changed
 *          by hand in the text — a capability the schema has and the panel
 *          would hide (ui_spec §2 principle 8). As with every other field, the
 *          panel never regenerates the element: each change is the smallest
 *          text edit, computed from the document's current text with the
 *          element found by name at that moment.
 * Description: `staticChildTables()` reads one element's static children from
 *              its CST, one table per `<element>` its manifest declares, a row
 *              per child in document order, a column per `<arg>` with the
 *              FieldSpec its type gets elsewhere in the panel.
 *              `staticChildEdits()` turns a table action — set an argument,
 *              add a row (a copy of the last), remove one, move one up or down
 *              — into CST text edits. Pure, so it is tested without a browser;
 *              the controller lands the edits as one undo stop.
 *
 * Exports:
 * - StaticChildRow:       One child: its argument values as written
 * - StaticChildTable:     One `<element>` kind's rows and argument fields
 * - StaticChildAction:    A table action
 * - staticChildTables():  The tables for one element
 * - staticChildEdits():   The text edits one action makes
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
import type { ElementArgDef, ElementDef } from '@u8g2gl/core/schema/widget-manifest.js';
import { namedCstElements } from './element-facts';
import type { FieldSpec } from './panel-layout';

/** One static child: its argument values as written, by argument name. */
export interface StaticChildRow {
  readonly values: ReadonlyMap<string, string>;
}

/** One `<element>` kind of an element: its rows, and a field per `<arg>`. */
export interface StaticChildTable {
  /** The child tag, e.g. "column". */
  readonly tag: string;
  /** The manifest's help for the element, if any. */
  readonly help: string | undefined;
  /** One field per argument, in declaration order. */
  readonly args: readonly FieldSpec[];
  /** The children, in document order. */
  readonly rows: readonly StaticChildRow[];
}

/** A table action: what the user did to one row, or to the table. */
export type StaticChildAction =
  | { readonly kind: 'set'; readonly tag: string; readonly row: number; readonly arg: string; readonly value: string }
  | { readonly kind: 'add'; readonly tag: string }
  | { readonly kind: 'remove'; readonly tag: string; readonly row: number }
  | { readonly kind: 'move'; readonly tag: string; readonly row: number; readonly by: -1 | 1 };

// argField
// An `<arg>` as the FieldSpec its type gets elsewhere in the panel: an enum
// offers its values, and every argument is required, because the access
// method takes every one.
//   arg    — the declaration
//   source — the manifest's tag
function argField(arg: ElementArgDef, source: string): FieldSpec {
  return {
    key: arg.name,
    kind: 'prop',
    type: arg.type,
    subjectTypes: [],
    options: arg.type === 'enum' ? (arg.values ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '') : [],
    default: undefined,
    required: true,
    help: arg.help,
    source,
  };
}

// childrenTagged
// An element's element children with the given tag, in document order.
function childrenTagged(element: CstElement, tag: string): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element' && child.name === tag);
}

/**
 * @brief The static child tables for one element.
 *
 * @param element  The element, in the document's current CST.
 * @param elements Its manifest's own `<element>`s (never inherited).
 * @param source   The manifest's tag, for the fields' `source`.
 * @return One table per declared kind, in declaration order; empty when the
 *         manifest declares none.
 */
export function staticChildTables(element: CstElement, elements: readonly ElementDef[], source: string): StaticChildTable[] {
  return elements.map((declared) => ({
    tag: declared.name,
    help: declared.help,
    args: declared.args.map((arg) => argField(arg, source)),
    rows: childrenTagged(element, declared.name).map((child) => ({
      values: new Map(child.attributes.map((attribute) => [attribute.name, attribute.value])),
    })),
  }));
}

// newChild
// The text of a new row: a copy of the last row's arguments, so a new column
// starts as wide as the one before it; with none, each argument's plainest
// value — 0, false, the first enum value, empty text.
//   declared — the `<element>`
//   last     — the last existing child of that tag, if any
function newChild(declared: ElementDef, last: CstElement | undefined): string {
  const attributes = declared.args.map((arg) => {
    const copied = last?.attributes.find((attribute) => attribute.name === arg.name)?.value;
    const plain =
      arg.type === 'int' ? '0' : arg.type === 'bool' ? 'false' : arg.type === 'enum' ? ((arg.values ?? '').split(',')[0] ?? '').trim() : '';
    return ` ${arg.name}="${escapeAttribute(copied ?? plain)}"`;
  });
  return `<${declared.name}${attributes.join('')} />`;
}

// escapeAttribute
// A value as it may sit inside double quotes.
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// elementIndex
// A child's position among its parent's element children, as insertElement
// counts them.
function elementIndex(parent: CstElement, child: CstElement): number {
  return parent.children.filter((c): c is CstElement => c.kind === 'element').indexOf(child);
}

// setEdits, addEdits, moveEdits
// One action each, against the parsed text.
function setEdits(cst: CstDocument, child: CstElement, arg: string, value: string): TextEdit[] {
  const existing = child.attributes.find((attribute) => attribute.name === arg);
  if (existing === undefined) return insertAttribute(cst, child, arg, value);
  return existing.value === value ? [] : replaceAttributeValue(existing, value);
}
function addEdits(cst: CstDocument, parent: CstElement, declared: ElementDef, rows: readonly CstElement[]): TextEdit[] {
  const last = rows.at(-1);
  // After the last row of its kind, so a new column is the rightmost; the
  // first of its kind goes first among the element's children.
  const index = last === undefined ? 0 : elementIndex(parent, last) + 1;
  return insertElement(cst, parent, index, newChild(declared, last));
}
function moveEdits(cst: CstDocument, a: CstElement, b: CstElement): TextEdit[] {
  // Swap the two children's texts, each in place, so indentation and anything
  // between them stays where it is.
  const textOf = (element: CstElement): string => cst.text.slice(element.start, element.end);
  return [
    { start: a.start, end: a.end, text: textOf(b) },
    { start: b.start, end: b.end, text: textOf(a) },
  ];
}

/**
 * @brief The text edits one table action makes.
 *
 * @param text     The document's current text.
 * @param file     Its project path.
 * @param name     The element's name.
 * @param elements Its manifest's own `<element>`s.
 * @param action   The action.
 * @return Non-overlapping edits in the coordinates of `text`; empty when the
 *         action changes nothing, or names an element, kind or row the text
 *         no longer has (the selection is reconciled after every run, so that
 *         is a race, not an intent).
 */
export function staticChildEdits(
  text: string,
  file: string,
  name: string,
  elements: readonly ElementDef[],
  action: StaticChildAction,
): TextEdit[] {
  // --- Step 1: The element, the kind and its rows, as the text is now ---
  const { cst } = parseCst(text, file);
  const parent = namedCstElements(cst).get(name);
  const declared = elements.find((element) => element.name === action.tag);
  if (parent === undefined || declared === undefined) return [];
  const rows = childrenTagged(parent, declared.name);

  // --- Step 2: The action ---
  switch (action.kind) {
    case 'add':
      return addEdits(cst, parent, declared, rows);
    case 'set': {
      const child = rows[action.row];
      return child === undefined ? [] : setEdits(cst, child, action.arg, action.value);
    }
    case 'remove': {
      const child = rows[action.row];
      return child === undefined ? [] : removeElement(cst, child);
    }
    case 'move': {
      const a = rows[action.row];
      const b = rows[action.row + action.by];
      if (a === undefined || b === undefined) return [];
      return action.by < 0 ? moveEdits(cst, b, a) : moveEdits(cst, a, b);
    }
  }
}
