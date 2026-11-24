/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/realise/collection-storage.ts
 * Purpose: Who owns a collection's rows, and how many bytes they cost
 *          ([Q-19], §9.2, §18). A collection widget used to carry storage for
 *          its manifest's defaults whatever its XML declared — 2,304 bytes for
 *          a service list declaring one row — and §18 could not report it. Now
 *          a `<data>` block's row has a fixed byte layout derived from its
 *          `<field>`s alone, the generator allocates `capacity × row bytes` per
 *          instance from that instance's own props, and hands the buffer to the
 *          widget through `u8g2gl_rows`. This module is the **one** place the
 *          layout is computed: the firmware emitter spells it as a `constexpr`
 *          descriptor, the scene carries it to the editor host, and §18 reports
 *          its bytes, so no two of them can disagree about a byte.
 *
 *          It sits in `realise/` beside [D-21]'s other capacities, because it
 *          is one of them: a static size counted from the document, never
 *          guessed. Because the layout follows from the manifest, the generator
 *          knows it exactly, and §13.7's rule — no assumption about a class's
 *          `sizeof` — still holds: this is the buffer's size, not the widget's.
 *
 * Description: The row encoding (§9.2):
 *              - `string`: `max_len + 1` bytes, NUL-terminated, `max_len`
 *                resolved per instance from the prop it names;
 *              - `int`: an `int32_t`, four bytes;
 *              - `bool`: one byte;
 *              - `enum`: one byte, the value's index in `values`.
 *              Each field is repeated `repeat` times (1 when absent), its
 *              repeats contiguous; fields follow in declaration order, each
 *              aligned to its natural size (four for an `int`, one otherwise);
 *              the row is padded to {@link ROW_ALIGNMENT} bytes, so every row
 *              of a buffer starts aligned.
 *
 *              `collectionStorage()` sizes every `<data>` of every object in
 *              the document. A count that cannot be resolved for an instance —
 *              a string with no `max_len`, a `<data>` with no `capacity`, a
 *              prop left unset with no default — has no size, so its block is
 *              omitted and a `U8G2GL_UNSIZED_DATA` diagnostic says why, naming
 *              the widget, the `<data>` and the field. Pass 9 reports those at
 *              the refusal policy; `generate` therefore never emits a build
 *              with an omitted block.
 *
 * Exports:
 * - ROW_ALIGNMENT:          The padding every row is rounded up to
 * - RowFieldType:           A field's type, one of the four a row carries
 * - RowField, RowLayout:    One field placed in a row; the row's whole layout
 * - fieldBytes():           One repeat of a field, in bytes
 * - rowLayout():            Lay a row out from its fields
 * - CollectionStorage:      One instance's one `<data>`, sized
 * - CollectionStorageInput, CollectionStorageResult
 * - collectionStorage():    Size every collection of a document
 * - storageDerivation():    How a block's bytes follow, as §18 prints it
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { dataCountOf, type PropDef, type WidgetData, type WidgetDataField } from '../schema/widget-manifest.js';
import type { WidgetNode } from '../schema/widget-node.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import type { ResolvedElement, ResolvedScreen } from '../resolver/index.js';
import type { RealisedElement, RealisedScreen } from './model.js';

/** Every row is padded to this many bytes, so each row of a buffer starts aligned. */
export const ROW_ALIGNMENT = 4;

/** The four types a row's field may carry (§6.5's `DATA_FIELD_TYPES`). */
export type RowFieldType = 'int' | 'bool' | 'string' | 'enum';

/** One field placed in a row. */
export interface RowField {
  readonly name: string;
  readonly type: RowFieldType;
  /** Where its first repeat starts, in bytes from the row's start. */
  readonly offset: number;
  /** One repeat's bytes: four for an int, one for a bool or enum, `max_len + 1` for a string. */
  readonly size: number;
  /** How many times it repeats; 1 when the manifest writes no `repeat`. */
  readonly repeat: number;
  /** A string's usable characters; absent for every other type. */
  readonly maxLen?: number;
}

/** A row's whole layout. */
export interface RowLayout {
  /** The fields, in declaration order: the access method's parameter order. */
  readonly fields: readonly RowField[];
  /** The row's bytes, padding included: a multiple of {@link ROW_ALIGNMENT}. */
  readonly rowBytes: number;
}

/** A field before it is placed: its type and its counts for one instance. */
interface FieldShape {
  readonly name: string;
  readonly type: RowFieldType;
  readonly repeat: number;
  readonly maxLen?: number;
}

// alignUp
// The least multiple of `alignment` at or above `value`.
function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * @brief One repeat of a field, in bytes (§9.2's encoding).
 *
 * @param type   The field's type.
 * @param maxLen A string's usable characters; ignored for any other type.
 * @return 4 for an `int`, 1 for a `bool` or `enum`, `maxLen + 1` for a `string`.
 */
export function fieldBytes(type: RowFieldType, maxLen: number | undefined): number {
  switch (type) {
    case 'int':
      return 4;
    case 'bool':
    case 'enum':
      return 1;
    case 'string':
      return (maxLen ?? 0) + 1;
  }
}

/**
 * @brief Lays a row out: fields in order, each at its natural alignment, the
 *        row padded to {@link ROW_ALIGNMENT}.
 *
 * @param fields Each field's type and, for this instance, its counts.
 * @return The layout. A row with no fields is zero bytes.
 */
export function rowLayout(fields: readonly FieldShape[]): RowLayout {
  const placed: RowField[] = [];
  let offset = 0;
  for (const field of fields) {
    // An int32_t is aligned to four, so a typed read of it never straddles;
    // a byte-wide field needs no alignment at all.
    const alignment = field.type === 'int' ? 4 : 1;
    offset = alignUp(offset, alignment);
    const size = fieldBytes(field.type, field.maxLen);
    placed.push({
      name: field.name,
      type: field.type,
      offset,
      size,
      repeat: field.repeat,
      ...(field.type === 'string' ? { maxLen: field.maxLen ?? 0 } : {}),
    });
    offset += size * field.repeat;
  }
  return { fields: placed, rowBytes: alignUp(offset, ROW_ALIGNMENT) };
}

/** One instance's one `<data>`, sized. */
export interface CollectionStorage {
  /** The screen it is on, as written. */
  readonly screen: string;
  /** The object it belongs to. */
  readonly element: RealisedElement;
  /** The `<data>` block, from the object's manifest. */
  readonly data: WidgetData;
  /** Its declaration index in the manifest: what `attach_rows()` is keyed by. */
  readonly index: number;
  /** Rows, from this instance's own props. */
  readonly capacity: number;
  readonly layout: RowLayout;
  /** `capacity × layout.rowBytes`: the buffer the generator allocates. */
  readonly bytes: number;
}

/** Everything {@link collectionStorage} reads. */
export interface CollectionStorageInput {
  /** The realised screens, in load order. */
  readonly realised: readonly RealisedScreen[];
  /** The same screens resolved, in the same order: each instance's int props. */
  readonly resolved: readonly ResolvedScreen[];
  readonly manifests: ManifestRegistry;
}

/** Every collection sized, and what could not be. */
export interface CollectionStorageResult {
  /** In document order: screens, then objects, then each `<data>` in declaration order. */
  readonly collections: readonly CollectionStorage[];
  /** One `U8G2GL_UNSIZED_DATA` per block that could not be sized. */
  readonly diagnostics: readonly Diagnostic[];
}

/** A count resolved for one instance, or why it cannot be. */
type CountOutcome = { readonly value: number } | { readonly problem: string };

// resolvedByNode
// Every resolved element keyed by the expanded node it was resolved from: the
// join key between realisation and resolution, which are two views of one
// expanded tree.
//   elements — one screen's resolved elements
function resolvedByNode(elements: readonly ResolvedElement[]): Map<WidgetNode, ResolvedElement> {
  const byNode = new Map<WidgetNode, ResolvedElement>();
  const visit = (nodes: readonly ResolvedElement[]): void => {
    for (const node of nodes) {
      byNode.set(node.node, node);
      visit(node.children);
    }
  };
  visit(elements);
  return byNode;
}

// countFor
// A `capacity`, `repeat` or `max_len` for one instance: a literal is itself; a
// prop is what the instance resolved it to, else the prop's default.
//   text     — the attribute as the manifest writes it
//   props    — the widget's own props
//   resolved — the instance, resolved
function countFor(text: string, props: readonly PropDef[], resolved: ResolvedElement | undefined): CountOutcome {
  const count = dataCountOf(text, props);
  if (count === undefined) {
    // Pass 1's U8G2GL_INVALID_DATA_DECLARATION: no build gets this far with one.
    return { problem: `'${text}' is neither a non-negative integer nor an int prop` };
  }
  if (count.kind === 'literal') {
    return { value: count.value };
  }
  const name = count.prop.name;
  const written = resolved?.properties.find((property) => property.attribute === name);
  if (written !== undefined) {
    const value = written.value?.value;
    return value !== undefined && Number.isInteger(value) && value >= 0
      ? { value }
      : { problem: `'${name}' is not a non-negative integer here` };
  }
  return count.value !== undefined
    ? { value: count.value }
    : { problem: `'${name}' is not set here, and the prop declares no default` };
}

// unsized
// The diagnostic for a block that cannot be sized.
//   loc     — where the fault is written
//   message — what is wrong
//   text    — the offending text
function unsized(loc: SourceLocation | undefined, message: string, text: string): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.UNSIZED_DATA,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText: text,
  };
}

// sizeBlock
// One `<data>` of one instance, sized, or the diagnostic saying why it cannot be.
//   element  — the object
//   resolved — the same object, resolved
//   data     — the block
//   props    — the widget's own props
function sizeBlock(
  element: RealisedElement,
  resolved: ResolvedElement | undefined,
  data: WidgetData,
  props: readonly PropDef[],
): { readonly capacity: number; readonly layout: RowLayout } | Diagnostic {
  const tag = element.element.node.tag;
  const what = `<${tag}> '${element.identifier}' <data name="${data.name}">`;
  const instanceLoc = element.element.source.attributeLocs?.name ?? element.element.source.loc;

  // --- Step 1: The capacity, which a buffer cannot be sized without ---
  if (data.capacity === undefined) {
    return unsized(
      data.attributeLocs?.['name']?.value ?? data.loc,
      `<${tag}> <data name="${data.name}"> declares no capacity, so its rows cannot be stored: the ` +
        'generator allocates capacity × row bytes per instance (§9.2). Give it a capacity.',
      data.name,
    );
  }
  const capacity = countFor(data.capacity, props, resolved);
  if ('problem' in capacity) {
    return unsized(instanceLoc, `${what}: its capacity cannot be sized: ${capacity.problem} (§9.2).`, element.identifier);
  }

  // --- Step 2: Each field's counts for this instance ---
  const shapes: FieldShape[] = [];
  for (const field of data.fields) {
    const shape = fieldShape(field, element, resolved, props, what, instanceLoc, tag, data);
    if ('code' in shape) return shape;
    shapes.push(shape);
  }
  return { capacity: capacity.value, layout: rowLayout(shapes) };
}

// fieldShape
// One field's type and counts for an instance, or why they cannot be had.
//   field, element, resolved, props — as sizeBlock's
//   what, instanceLoc, tag, data    — for the message and its location
function fieldShape(
  field: WidgetDataField,
  element: RealisedElement,
  resolved: ResolvedElement | undefined,
  props: readonly PropDef[],
  what: string,
  instanceLoc: SourceLocation | undefined,
  tag: string,
  data: WidgetData,
): FieldShape | Diagnostic {
  const type = field.type as RowFieldType;
  const repeat = field.repeat === undefined ? { value: 1 } : countFor(field.repeat, props, resolved);
  if ('problem' in repeat) {
    return unsized(instanceLoc, `${what} <field name="${field.name}">: its repeat cannot be sized: ${repeat.problem} (§9.2).`, element.identifier);
  }
  if (type !== 'string') {
    return { name: field.name, type, repeat: repeat.value };
  }
  // A string is stored in place, NUL-terminated, so without max_len there is
  // no size to give it. The fault is the manifest's, so it is reported there,
  // once, whichever instance found it.
  if (field.maxLen === undefined) {
    return unsized(
      field.attributeLocs?.['name']?.value ?? field.loc,
      `<${tag}> <data name="${data.name}"> <field name="${field.name}"> is a string with no max_len, so ` +
        'its rows cannot be stored: each string is stored in place as max_len + 1 bytes (§9.2). Give it a max_len.',
      field.name,
    );
  }
  const maxLen = countFor(field.maxLen, props, resolved);
  if ('problem' in maxLen) {
    return unsized(instanceLoc, `${what} <field name="${field.name}">: its max_len cannot be sized: ${maxLen.problem} (§9.2).`, element.identifier);
  }
  return { name: field.name, type, repeat: repeat.value, maxLen: maxLen.value };
}

/**
 * @brief Sizes every `<data>` of every object in a document (§9.2, [Q-19]).
 *
 * @param input The realised screens, their resolution and the manifests.
 * @return Every block that could be sized, in document order, and a
 *         `U8G2GL_UNSIZED_DATA` per block that could not. Never throws for
 *         user input.
 */
export function collectionStorage(input: CollectionStorageInput): CollectionStorageResult {
  const collections: CollectionStorage[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [index, screen] of input.realised.entries()) {
    const byNode = resolvedByNode(input.resolved[index]?.elements ?? []);
    for (const element of screen.objects) {
      const manifest = input.manifests.get(element.element.node.tag);
      const blocks = manifest?.api.data ?? [];
      if (manifest === undefined || blocks.length === 0) continue;
      const resolved = byNode.get(element.element.node);
      for (const [dataIndex, data] of blocks.entries()) {
        const sized = sizeBlock(element, resolved, data, manifest.declared.api.props);
        if ('code' in sized) {
          diagnostics.push(sized);
          continue;
        }
        collections.push({
          screen: screen.screen.name,
          element,
          data,
          index: dataIndex,
          capacity: sized.capacity,
          layout: sized.layout,
          bytes: sized.capacity * sized.layout.rowBytes,
        });
      }
    }
  }
  return { collections, diagnostics };
}

/**
 * @brief How a block's bytes follow from its layout, as §18 prints it and the
 *        generated storage comment states it.
 *
 * `10 rows × 152 bytes (cells: 6 × string, 25 bytes each, at 0; padded to 4)`.
 *
 * @param storage A sized block.
 */
export function storageDerivation(storage: CollectionStorage): string {
  const fields = storage.layout.fields.map((field) => {
    const repeated = field.repeat === 1 ? field.type : `${field.repeat} × ${field.type}`;
    const each = field.repeat === 1 ? `${field.size} byte${field.size === 1 ? '' : 's'}` : `${field.size} bytes each`;
    const detail = field.type === 'string' ? `${each}, max_len ${field.maxLen ?? 0} + 1` : each;
    return `${field.name}: ${repeated}, ${detail}, at ${field.offset}`;
  });
  const rows = `${storage.capacity} row${storage.capacity === 1 ? '' : 's'}`;
  return `${rows} × ${storage.layout.rowBytes} bytes (${fields.join('; ')}; padded to ${ROW_ALIGNMENT})`;
}
