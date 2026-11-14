/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-model.ts
 * Purpose: What the project-file form shows, read from a `u8g2gl.xml` or
 *          `globals.xml` text: one section per part of the file, one list per
 *          repeating element, one field per attribute the vocabulary declares
 *          (`core/schema/project-vocabulary.ts`), and for each field where its
 *          value is written. The form is built from the vocabulary, never
 *          from a list of its own, so every attribute the parsers read has a
 *          control (ui_spec §2 principle 8), and the coverage tests can say so.
 * Description: Read from the CST, not the parsed model: an edit must land
 *              where the value is written, which the model has forgotten.
 *              A field reads every spelling the parser accepts, in the
 *              parser's order of preference (`attributeSpellings`); the first
 *              one written supplies the value, and any other one written is
 *              kept as `ignored`, because the parser does not read it either.
 *              A place read only while an element is absent (`unlessPresent`)
 *              counts as unread while that element is there.
 *
 *              Nodes have keys built from vocabulary ids and list positions
 *              (`u8g2gl.xml>targets#1>display`), so a key computed from one
 *              text finds the same node in the text after an edit.
 *
 *              Text that is not well-formed has no form: `buildFormModel`
 *              says why, and the caller keeps the last good one.
 *
 * Exports:
 * - FormFile:          The two files that have a form
 * - FieldPlace:        Where a value is written
 * - FieldCandidate:    A place a value may be written
 * - FormField:         One attribute's field
 * - FormNode:          One element's fields, parts and lists
 * - FormList:          The items of one repeating element
 * - FormSection:       One top-level section of the form
 * - FormModel:         A whole file's form
 * - FormReading:       A form, or why the text has none
 * - isFormFile():      Whether a project path has a form
 * - buildFormModel():  The form for a text
 * - findNode():        A node of a form by key
 * - findList():        A list of a form by key
 * - allNodes():        Every node of a form, depth first
 */

import { parseCst, type CstAttribute, type CstDocument, type CstElement } from '@u8g2gl/core/cst/index.js';
import {
  attributeSpellings,
  vocabularyChildren,
  vocabularyElement,
  vocabularyRoots,
  type VocabularyAttribute,
  type VocabularyElement,
  type VocabularyFile,
} from '@u8g2gl/core/schema/index.js';

/** The project files that have a form. */
export type FormFile = VocabularyFile;

/** Where a value is written: the element, the spelling used, and the value's offsets. */
export interface FieldPlace {
  /** The vocabulary id of the element it is written on. */
  readonly elementId: string;
  /** The attribute's name as written there. */
  readonly name: string;
  /** The attribute, from its name to its closing quote. */
  readonly start: number;
  readonly end: number;
}

/** One attribute's field. */
export interface FormField {
  /** Unique in the form: the node's key and the attribute's canonical name. */
  readonly key: string;
  /** The vocabulary element the attribute is declared on. */
  readonly elementId: string;
  readonly attribute: VocabularyAttribute;
  /** The value the parser reads, decoded; undefined when no spelling of it is written. */
  readonly value: string | undefined;
  /** Where that value is written. */
  readonly at: FieldPlace | undefined;
  /** Other spellings written, which the parser does not read because `at` wins or the place is shadowed. */
  readonly ignored: readonly (FieldPlace & { readonly value: string })[];
  /**
   * Every place the attribute may be written, in the parser's order, with the
   * element there if it is written: where an edit decides to write a new value.
   */
  readonly places: readonly FieldCandidate[];
}

/** One place an attribute may be written. */
export interface FieldCandidate {
  readonly elementId: string;
  readonly name: string;
  /** The element at that place, when written. */
  readonly host: CstElement | undefined;
  /** The canonical place: where a value is written new. */
  readonly canonical: boolean;
  /** Read before the canonical place (`<bus>`). */
  readonly beforeCanonical: boolean;
  /** Not read while another element is written (a target's bus pins, while it has a display). */
  readonly shadowed: boolean;
}

/** One element's form: its own fields, the parts shown inside it, and its lists. */
export interface FormNode {
  readonly key: string;
  readonly element: VocabularyElement;
  /** Whether the element is written; a part that is not still shows its fields. */
  readonly present: boolean;
  /** The element's offsets, when present: what the XML highlights. */
  readonly range: { readonly start: number; readonly end: number } | undefined;
  /** The element itself, when present. */
  readonly cst: CstElement | undefined;
  readonly fields: readonly FormField[];
  /** Non-repeating children shown inside this node (a target's display). */
  readonly parts: readonly FormNode[];
  /** Repeating children, as lists. */
  readonly lists: readonly FormList[];
  /** For a list item: its position among the items of its list. */
  readonly index?: number;
  /**
   * For a list item: where the element it is written inside starts. Two items
   * with the same one can swap places; an item can move only among them.
   */
  readonly parentStart?: number;
}

/** The items of one repeating element. */
export interface FormList {
  readonly key: string;
  /** The element the items belong to (`targets`, `subjects`). */
  readonly container: VocabularyElement;
  readonly present: boolean;
  readonly range: { readonly start: number; readonly end: number } | undefined;
  /** The container element, when present. */
  readonly cst: CstElement | undefined;
  /** Every kind of item it may hold, in vocabulary order. */
  readonly kinds: readonly VocabularyElement[];
  readonly items: readonly FormNode[];
}

/** One section of the form, as the Explorer lists it. */
export interface FormSection {
  readonly key: string;
  readonly title: string;
  /** A section of fields (`Project`, `Output`) has a node; a section of items (`Targets`) a list. */
  readonly node?: FormNode;
  readonly list?: FormList;
  readonly range: { readonly start: number; readonly end: number } | undefined;
}

/** A whole file's form. */
export interface FormModel {
  readonly file: FormFile;
  /** The text it was read from. */
  readonly text: string;
  readonly cst: CstDocument;
  readonly root: FormNode;
  readonly sections: readonly FormSection[];
}

/** A form, or why the text has none. */
export type FormReading =
  | { readonly kind: 'form'; readonly model: FormModel }
  | { readonly kind: 'unreadable'; readonly problem: string; readonly line: number; readonly column: number };

/** @brief Whether a project path has a form: `u8g2gl.xml` and `globals.xml`, at the root. */
export function isFormFile(path: string | undefined): path is FormFile {
  return path === 'u8g2gl.xml' || path === 'globals.xml';
}

/** A node's place in the CST while reading: its element, what it is, and its parent's place. */
interface Scope {
  readonly elementId: string;
  readonly cst: CstElement | undefined;
  readonly parent: Scope | undefined;
}

// elementChildren
// An element's element children, in document order.
function elementChildren(element: CstElement | undefined): CstElement[] {
  return element === undefined ? [] : element.children.filter((child): child is CstElement => child.kind === 'element');
}

// locate
// The CST element a vocabulary id names, seen from `scope`: the scope itself
// or an ancestor with that id, or a child of one of them with that tag whose
// vocabulary parent the ancestor is. A target's display is its child; a
// display's alternatives on the target are its parent.
function locate(id: string, scope: Scope | undefined): CstElement | undefined {
  const wanted = vocabularyElement(id);
  if (wanted === undefined) return undefined;
  for (let at = scope; at !== undefined; at = at.parent) {
    if (at.elementId === id) return at.cst;
    if (wanted.parent === at.elementId) {
      const child = elementChildren(at.cst).find((c) => c.name === wanted.tag);
      if (child !== undefined) return child;
    }
  }
  return undefined;
}

// placeOf
// An attribute as a FieldPlace.
function placeOf(elementId: string, attribute: CstAttribute): FieldPlace {
  return { elementId, name: attribute.name, start: attribute.start, end: attribute.end };
}

// readField
// One attribute's field: the first spelling written that the parser reads,
// and every other written spelling as ignored.
function readField(nodeKey: string, element: VocabularyElement, attribute: VocabularyAttribute, scope: Scope): FormField {
  let value: string | undefined;
  let at: FieldPlace | undefined;
  const ignored: (FieldPlace & { value: string })[] = [];
  const places: FieldCandidate[] = [];
  for (const spelling of attributeSpellings(element, attribute)) {
    const host = locate(spelling.element, scope);
    const shadowed = (spelling.unlessPresent ?? []).some((id) => locate(id, scope) !== undefined);
    places.push({
      elementId: spelling.element,
      name: spelling.name,
      host,
      canonical: spelling.element === element.id && spelling.name === attribute.name,
      beforeCanonical: spelling.beforeCanonical === true,
      shadowed,
    });
    const written = host?.attributes.find((a) => a.name === spelling.name);
    if (written === undefined) continue;
    if (at === undefined && !shadowed) {
      value = written.value;
      at = placeOf(spelling.element, written);
    } else {
      ignored.push({ ...placeOf(spelling.element, written), value: written.value });
    }
  }
  return { key: `${nodeKey}|${element.id}/${attribute.name}`, elementId: element.id, attribute, value, at, ignored, places };
}

// rangeOf
// An element's offsets, if it is written.
function rangeOf(element: CstElement | undefined): { start: number; end: number } | undefined {
  return element === undefined ? undefined : { start: element.start, end: element.end };
}

// repeatingKinds
// The kinds of item a container holds: its repeating children.
function repeatingKinds(id: string): VocabularyElement[] {
  return vocabularyChildren(id).filter((child) => child.repeats && child.parent === id);
}

// readNode
// One element's node: its fields, its non-repeating canonical children as
// parts, and a list per container child.
function readNode(element: VocabularyElement, cst: CstElement | undefined, key: string, parent: Scope | undefined, extra: Partial<FormNode> = {}): FormNode {
  const scope: Scope = { elementId: element.id, cst, parent };
  const parts: FormNode[] = [];
  const lists: FormList[] = [];
  for (const child of vocabularyChildren(element.id).filter((c) => c.parent === element.id)) {
    if (child.repeats || !child.canonical) continue;
    if (repeatingKinds(child.id).length > 0) {
      lists.push(readList(child, scope, `${key}>${child.id}`));
    } else {
      const childCst = elementChildren(cst).find((c) => c.name === child.tag);
      parts.push(readNode(child, childCst, `${key}>${child.id}`, scope));
    }
  }
  return {
    key,
    element,
    present: cst !== undefined,
    range: rangeOf(cst),
    cst,
    fields: element.attributes.map((attribute) => readField(key, element, attribute, scope)),
    parts,
    lists,
    ...extra,
  };
}

// readList
// A container's items, in the order the parser reads them: walking the
// container's parent, each container's items in turn and, where an item kind
// is also accepted directly in that parent (a <target> under <u8g2gl>), each
// such item where it is written.
function readList(container: VocabularyElement, parentScope: Scope, key: string): FormList {
  const kinds = repeatingKinds(container.id);
  const items: FormNode[] = [];
  let containerCst: CstElement | undefined;
  for (const child of elementChildren(parentScope.cst)) {
    if (child.name === container.tag) {
      containerCst ??= child;
      const scope: Scope = { elementId: container.id, cst: child, parent: parentScope };
      for (const item of elementChildren(child)) {
        const kind = kinds.find((k) => k.tag === item.name);
        if (kind === undefined) continue;
        items.push(readNode(kind, item, `${key}#${items.length}`, scope, { index: items.length, parentStart: child.start }));
      }
      continue;
    }
    const direct = kinds.find((k) => k.tag === child.name && k.alternativeParents?.includes(parentScope.elementId) === true);
    if (direct !== undefined) {
      items.push(readNode(direct, child, `${key}#${items.length}`, parentScope, { index: items.length, parentStart: parentScope.cst?.start ?? 0 }));
    }
  }
  return { key, container, present: containerCst !== undefined, range: rangeOf(containerCst), cst: containerCst, kinds, items };
}

/**
 * @brief The form for a project file's text.
 *
 * @param file Which file it is.
 * @param text Its current text.
 * @return The form; or, when the text is not well-formed or its root is not
 *         the file's, the first problem, so the caller can keep its last
 *         good form and say why.
 */
export function buildFormModel(file: FormFile, text: string): FormReading {
  // --- Step 1: Well-formed, with the file's own root ---
  const { cst, diagnostics } = parseCst(text, file);
  const first = diagnostics[0];
  if (first !== undefined) return { kind: 'unreadable', problem: first.message, line: first.line, column: first.column };
  const rootElement = vocabularyRoots().get(file);
  if (rootElement === undefined) throw new Error(`no vocabulary root for ${file}`);
  if (cst.root?.name !== rootElement.tag) {
    const at = cst.root === undefined ? { line: 1, column: 1 } : cst.lines.locate(cst.root.start);
    return { kind: 'unreadable', problem: `Expected root element <${rootElement.tag}>`, line: at.line, column: at.column };
  }

  // --- Step 2: The root's node, and a section per part of it, in vocabulary order ---
  const root = readNode(rootElement, cst.root, file, undefined);
  const sections: FormSection[] = [];
  if (root.fields.length > 0) {
    sections.push({ key: `${file}>${rootElement.id}`, title: rootElement.label, node: { ...root, parts: [], lists: [] }, range: root.range });
  }
  for (const child of vocabularyChildren(rootElement.id)) {
    const list = root.lists.find((l) => l.container.id === child.id);
    if (list !== undefined) sections.push({ key: list.key, title: child.label, list, range: list.range });
    const part = root.parts.find((p) => p.element.id === child.id);
    if (part !== undefined) sections.push({ key: part.key, title: child.label, node: part, range: part.range });
  }
  return { kind: 'form', model: { file, text, cst, root, sections } };
}

/** @brief Every node of a form, depth first: the root, then each part and list item in order. */
export function allNodes(model: FormModel): FormNode[] {
  const out: FormNode[] = [];
  const walk = (node: FormNode): void => {
    out.push(node);
    node.parts.forEach(walk);
    for (const list of node.lists) list.items.forEach(walk);
  };
  walk(model.root);
  return out;
}

/** @brief A node of a form by key, or undefined. */
export function findNode(model: FormModel, key: string): FormNode | undefined {
  return allNodes(model).find((node) => node.key === key);
}

/** @brief A list of a form by key, or undefined. */
export function findList(model: FormModel, key: string): FormList | undefined {
  for (const node of allNodes(model)) {
    const list = node.lists.find((l) => l.key === key);
    if (list !== undefined) return list;
  }
  return undefined;
}
