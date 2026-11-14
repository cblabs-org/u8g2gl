/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-edits.ts
 * Purpose: Turns a project-file form change — set a field, add an item,
 *          remove one, move one — into the smallest text edit that makes it
 *          ([UD-3], ui_spec §2 principle 5). The author's comments, layout and
 *          spellings survive: a value is rewritten where it is written, and
 *          only something new is written in the canonical form design_spec
 *          §5.1 shows.
 * Description: Pure, so it is tested without a browser. Every change is
 *              computed against the text as it is now, from a form read from
 *              that text, and returned as **one** `TextEdit` (the minimal
 *              difference between the text before and after), which the form
 *              lands as one undo stop. A change that needs an element that is
 *              not written yet (a value for an absent `<display>`, the first
 *              subject of a file with no `<subjects>`) creates it first, as a
 *              step, and reads the form again; the steps never show, because
 *              only the final difference is returned.
 *
 *              Where a new value goes, in order:
 *              1. where the parser reads it now, if it is written;
 *              2. a place the parser reads first, if that element is written
 *                 (a `<bus>` child supplies every bus value);
 *              3. the canonical place, if its element is written;
 *              4. when the canonical element is absent, beside the values of
 *                 that element that are written elsewhere (a target that
 *                 writes `setup` on itself, with no `<display>`, gets its
 *                 `rotation` there too, so the parser keeps reading them
 *                 together);
 *              5. otherwise the canonical place, creating its element.
 *
 * Exports:
 * - FormChange:      What the form asks for
 * - FormEditResult:  The edit, or why there is none
 * - formEdit():      The edit for a change
 * - minimalEdit():   The one edit that turns one text into another
 * - newItemName():   A name no item of a kind has yet
 */

import {
  applyEdits,
  encodeAttributeValue,
  indentStep,
  insertAttribute,
  insertElement,
  parseCst,
  removeAttribute,
  removeElement,
  replaceAttributeValue,
  type CstDocument,
  type CstElement,
  type TextEdit,
} from '@u8g2gl/core/cst/index.js';
import { vocabularyChildren, vocabularyElement, type VocabularyAttribute, type VocabularyElement } from '@u8g2gl/core/schema/index.js';
import { buildFormModel, findList, findNode, type FormField, type FormFile, type FormList, type FormModel, type FormNode } from './form-model';

/** What the form asks for. */
export type FormChange =
  /** Set a field to a value, or remove it (reset) with undefined. */
  | { readonly kind: 'set'; readonly field: string; readonly value: string | undefined }
  /** Add an item of a kind at the end of a list, its required attributes seeded. */
  | { readonly kind: 'add'; readonly list: string; readonly itemKind: string; readonly values?: Readonly<Record<string, string>> }
  /** Remove a list item. */
  | { readonly kind: 'remove'; readonly item: string }
  /** Move a list item one place earlier (-1) or later (+1). */
  | { readonly kind: 'move'; readonly item: string; readonly delta: -1 | 1 };

/** The edit, or why the change makes none. */
export interface FormEditResult {
  /** One edit, or none when the text already says it or the change is refused. */
  readonly edits: readonly TextEdit[];
  /** Why the change was refused, for the form to show. */
  readonly refused?: string;
}

/**
 * @brief The one edit that turns `before` into `after`: their common prefix
 *        and suffix are left alone, the rest replaced.
 */
export function minimalEdit(before: string, after: string): TextEdit[] {
  if (before === after) return [];
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < shortest - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  return [{ start, end: before.length - tail, text: after.slice(start, after.length - tail) }];
}

// --- Reading ------------------------------------------------------------------

// read
// The form for a text that must have one: a change is only offered on a form.
function read(file: FormFile, text: string): FormModel {
  const reading = buildFormModel(file, text);
  if (reading.kind !== 'form') throw new Error(`${file} is not readable: ${reading.problem}`);
  return reading.model;
}

// elementAtStart
// The element of a tree that starts at an offset.
function elementAtStart(cst: CstDocument, start: number): CstElement | undefined {
  const walk = (element: CstElement): CstElement | undefined => {
    if (element.start === start) return element;
    for (const child of element.children) {
      if (child.kind === 'element' && child.start <= start && start < child.end) return walk(child);
    }
    return undefined;
  };
  return cst.root === undefined ? undefined : walk(cst.root);
}

// fieldOf
// A field by key: its node and the field.
function fieldOf(model: FormModel, key: string): { node: FormNode; field: FormField } | undefined {
  const nodeKey = key.slice(0, key.indexOf('|'));
  const node = findNode(model, nodeKey);
  const field = node?.fields.find((f) => f.key === key);
  return node === undefined || field === undefined ? undefined : { node, field };
}

// parentKeyOf
// The key of what holds a node or list: its key without its last segment.
function parentKeyOf(key: string): string {
  const cut = Math.max(key.lastIndexOf('>'), key.lastIndexOf('#'));
  return cut < 0 ? key : key.slice(0, cut);
}

// elementChildren
// An element's element children.
function elementChildren(element: CstElement): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element');
}

// childIndexFor
// Where a new child goes among a parent's element children: after the last
// one the vocabulary puts before it, so new parts land in §5.1's order.
function childIndexFor(parentId: string, parent: CstElement, childId: string): number {
  const order = vocabularyChildren(parentId).map((child) => child.tag);
  const rank = order.indexOf(vocabularyElement(childId)?.tag ?? '');
  const children = elementChildren(parent);
  let index = 0;
  children.forEach((child, i) => {
    const at = order.indexOf(child.name);
    if (at !== -1 && at <= rank) index = i + 1;
  });
  return index;
}

// hostOfKey
// The written element a node or list key stands for, and its vocabulary id.
function hostOfKey(model: FormModel, key: string): { element: CstElement | undefined; id: string } | undefined {
  const node = findNode(model, key);
  if (node !== undefined) return { element: node.cst, id: node.element.id };
  const list = findList(model, key);
  if (list !== undefined) return { element: list.cst, id: list.container.id };
  return undefined;
}

/**
 * The text with the element a key stands for written, creating it, and any
 * absent element it is inside, as an empty element where the vocabulary
 * orders it. Unchanged when it is already written.
 */
function ensureWritten(file: FormFile, text: string, key: string): string {
  const model = read(file, text);
  const host = hostOfKey(model, key);
  if (host === undefined) throw new Error(`no form node ${key}`);
  if (host.element !== undefined) return text;
  const parentKey = parentKeyOf(key);
  const withParent = ensureWritten(file, text, parentKey);
  const after = read(file, withParent);
  const parent = hostOfKey(after, parentKey);
  if (parent?.element === undefined) throw new Error(`could not write ${parentKey}`);
  const tag = vocabularyElement(host.id)?.tag ?? host.id;
  return applyEdits(withParent, insertElement(after.cst, parent.element, childIndexFor(parent.id, parent.element, host.id), `<${tag} />`));
}

// --- Setting a field ------------------------------------------------------------

// setField
// The text after a field is set, or removed for undefined, following the
// order in this file's header.
function setField(file: FormFile, text: string, key: string, value: string | undefined): string {
  const model = read(file, text);
  const found = fieldOf(model, key);
  if (found === undefined) throw new Error(`no form field ${key}`);
  const { node, field } = found;
  const cst = model.cst;

  // --- Step 1: Written where the parser reads it: rewrite or remove it there ---
  if (field.at !== undefined) {
    const host = elementAtStart(cst, hostStart(field, field.at.elementId, field.at.name));
    const attribute = host?.attributes.find((a) => a.start === field.at?.start);
    if (attribute === undefined) throw new Error(`lost ${key}`);
    return applyEdits(text, value === undefined ? removeAttribute(cst, attribute) : replaceAttributeValue(attribute, value));
  }
  if (value === undefined) return text;

  // --- Step 2: A place read before the canonical one, if written ---
  const first = field.places.find((place) => place.beforeCanonical && place.host !== undefined);
  if (first?.host !== undefined) return applyEdits(text, insertAttribute(cst, first.host, first.name, value));

  // --- Step 3: The canonical place, if written ---
  const canonical = field.places.find((place) => place.canonical);
  if (canonical?.host !== undefined) return applyEdits(text, insertAttribute(cst, canonical.host, canonical.name, value));

  // --- Step 4: Beside this element's other values, where they are written instead ---
  const beside = node.fields.flatMap((other) => (other.at !== undefined && other.at.elementId !== node.element.id ? [other.at.elementId] : []))[0];
  const there = field.places.find((place) => place.elementId === beside && place.host !== undefined && !place.shadowed);
  if (there?.host !== undefined) return applyEdits(text, insertAttribute(cst, there.host, there.name, value));

  // --- Step 5: Create the canonical element, then write it there ---
  const created = ensureWritten(file, text, node.key);
  return setField(file, created, key, value);
}

// hostStart
// The start of the element a field's value is written on, found again from
// the field's places.
function hostStart(field: FormField, elementId: string, name: string): number {
  const place = field.places.find((p) => p.elementId === elementId && p.name === name);
  if (place?.host === undefined) throw new Error(`no host for ${field.key}`);
  return place.host.start;
}

// --- Lists ------------------------------------------------------------------------

/**
 * @brief A name no item of a list has yet: the kind's tag (or `target`),
 *        then `_1`, `_2`…
 */
export function newItemName(list: FormList, kind: VocabularyElement): string {
  const taken = new Set(list.items.map((item) => item.fields.find((f) => f.attribute.name === 'name')?.value ?? ''));
  const stem = kind.parent === 'subjects' ? 'subject' : kind.parent === 'consts' ? 'const' : kind.tag === 'builtin' || kind.tag === 'bdf' ? 'font' : kind.parent === 'images' ? 'image' : kind.tag;
  for (let n = 1; ; n++) {
    const name = `${stem}_${n}`;
    if (!taken.has(name)) return name;
  }
}

// seedValue
// What a required attribute of a new item starts as: a fresh name, the
// caller's value, the default, or the plainest value of its type.
function seedValue(list: FormList, kind: VocabularyElement, attribute: VocabularyAttribute, values: Readonly<Record<string, string>>): string {
  const given = values[attribute.name];
  if (given !== undefined) return given;
  if (attribute.name === 'name') return newItemName(list, kind);
  if (attribute.default !== undefined) return attribute.default;
  switch (attribute.type.kind) {
    case 'int':
      return '0';
    case 'bool':
      return 'false';
    case 'enum':
      return attribute.type.values[0] ?? '';
    default:
      return '';
  }
}

// itemFragment
// A new item as XML: its tag and every required attribute, seeded; a value the
// caller gives for an optional one is written too. A required part (a target's
// display, which carries its required `setup`) is written inside it, indented
// by the document's own step.
//   step — the document's indentation step (indentStep)
function itemFragment(list: FormList, kind: VocabularyElement, values: Readonly<Record<string, string>>, step: string): string {
  const attributes = (element: VocabularyElement): string =>
    element.attributes
      .filter((attribute) => attribute.required || values[attribute.name] !== undefined)
      .map((attribute) => ` ${attribute.name}="${encodeAttributeValue(seedValue(list, kind, attribute, values), '"')}"`)
      .join('');
  const parts = vocabularyChildren(kind.id).filter(
    (child) => child.parent === kind.id && !child.repeats && child.canonical && child.attributes.some((a) => a.required),
  );
  if (parts.length === 0) return `<${kind.tag}${attributes(kind)} />`;
  return [`<${kind.tag}${attributes(kind)}>`, ...parts.map((part) => `${step}<${part.tag}${attributes(part)} />`), `</${kind.tag}>`].join('\n');
}

// addItem
// The text with a new item at the end of a list: after the last item where it
// is written (a target directly under <u8g2gl> stays beside its siblings),
// else at the end of the container, creating the container if need be.
function addItem(file: FormFile, text: string, key: string, kindId: string, values: Readonly<Record<string, string>>): string {
  const model = read(file, text);
  const list = findList(model, key);
  const kind = vocabularyElement(kindId);
  if (list === undefined || kind === undefined) throw new Error(`no list ${key} of ${kindId}`);
  const fragment = itemFragment(list, kind, values, indentStep(model.cst));
  const last = list.items.at(-1);
  if (last?.cst !== undefined && last.parentStart !== undefined) {
    const parent = elementAtStart(model.cst, last.parentStart);
    if (parent !== undefined) {
      const index = elementChildren(parent).findIndex((child) => child.start === last.cst?.start) + 1;
      return applyEdits(text, insertElement(model.cst, parent, index, fragment));
    }
  }
  const withContainer = ensureWritten(file, text, key);
  const after = read(file, withContainer);
  const container = findList(after, key)?.cst;
  if (container === undefined) throw new Error(`could not write ${key}`);
  return applyEdits(withContainer, insertElement(after.cst, container, elementChildren(container).length, fragment));
}

// dedent
// An element's text with its own line's indentation taken off every line
// after the first, so insertElement can indent it afresh where it goes.
function dedent(fragment: string, indent: string): string {
  return fragment
    .split(/(\r\n|\r|\n)/)
    .map((part, i) => (i > 0 && i % 2 === 0 && part.startsWith(indent) ? part.slice(indent.length) : part))
    .join('');
}

// lineIndent
// The leading spaces and tabs of the line an offset is on.
function lineIndent(text: string, offset: number): string {
  const start = Math.max(text.lastIndexOf('\n', offset - 1) + 1, 0);
  return /^[ \t]*/.exec(text.slice(start, offset))?.[0] ?? '';
}

// moveItem
// The text with an item swapped with its neighbour, both inside one element;
// undefined when the neighbour is inside another (a target in <targets> and
// one written directly under <u8g2gl>), which a move cannot cross.
function moveItem(file: FormFile, text: string, key: string, delta: -1 | 1): string | undefined {
  const model = read(file, text);
  const item = findNode(model, key);
  const list = findList(model, parentKeyOf(key));
  if (item?.cst === undefined || list === undefined || item.index === undefined) return undefined;
  const neighbour = list.items[item.index + delta];
  if (neighbour?.cst === undefined || neighbour.parentStart !== item.parentStart || item.parentStart === undefined) return undefined;
  const parent = elementAtStart(model.cst, item.parentStart);
  if (parent === undefined) return undefined;
  const siblings = elementChildren(parent);
  const target = siblings.findIndex((child) => child.start === neighbour.cst?.start);
  const fragment = dedent(text.slice(item.cst.start, item.cst.end), lineIndent(text, item.cst.start));
  const removed = applyEdits(text, removeElement(model.cst, item.cst));
  const { cst } = parseCst(removed, file);
  const parentAfter = elementAtStart(cst, item.parentStart);
  if (parentAfter === undefined) return undefined;
  return applyEdits(removed, insertElement(cst, parentAfter, target, fragment));
}

/**
 * @brief The edit for a form change, against the text as it is now.
 *
 * @param file   Which project file.
 * @param text   Its current text; it must be well-formed (a form exists).
 * @param change What the form asks for.
 * @return One edit, none when nothing changes, or a refusal saying why.
 */
export function formEdit(file: FormFile, text: string, change: FormChange): FormEditResult {
  switch (change.kind) {
    case 'set':
      return { edits: minimalEdit(text, setField(file, text, change.field, change.value)) };
    case 'add':
      return { edits: minimalEdit(text, addItem(file, text, change.list, change.itemKind, change.values ?? {})) };
    case 'remove': {
      const model = read(file, text);
      const item = findNode(model, change.item);
      if (item?.cst === undefined) return { edits: [] };
      // The vocabulary's minimum: the last target is never removed.
      const list = findList(model, parentKeyOf(change.item));
      const minimum = item.element.minimum ?? 0;
      if (list !== undefined && list.items.filter((other) => other.element.id === item.element.id).length <= minimum) {
        return { edits: [], refused: item.element.minimumReason ?? `At least ${minimum} ${item.element.label} is needed.` };
      }
      return { edits: minimalEdit(text, applyEdits(text, removeElement(model.cst, item.cst))) };
    }
    case 'move': {
      const moved = moveItem(file, text, change.item, change.delta);
      if (moved === undefined) return { edits: [], refused: 'It cannot move past an item written in another element.' };
      return { edits: minimalEdit(text, moved) };
    }
  }
}
