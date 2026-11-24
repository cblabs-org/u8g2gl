/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/sample-shape.ts
 * Purpose: What a sample set can hold, read from the project: its subjects,
 *          and every collection instance on every screen with the typed
 *          fields its manifest's `<data>` declares (schema 0.7, design_spec
 *          §6.5). The set's checks, the Sample data view's grids and the
 *          generated sets all need this one description, and each reading the
 *          manifests for itself would let them disagree about a bound.
 * Description: `sampleShapeOf()` walks each screen's elements in document
 *              order. An element whose manifest declares `<data>` is a
 *              collection instance. Every count the manifest writes as a prop
 *              name (`capacity="max_rows"`, `repeat="max_cols"`,
 *              `max_len="max_cell_chars"`) is resolved for that instance: the
 *              value it writes, or a const it names, else the prop's default.
 *              A count that resolves to nothing is left undefined, meaning
 *              "unbounded" to every reader, as the bridge treats it.
 *
 *              A sample set addresses an instance's rows by element name
 *              alone, so it addresses the instance's only `<data>`. An
 *              instance whose manifest declares several is still listed, with
 *              every block, so a check can say so rather than guess.
 *
 * Exports:
 * - SampleSubject:     A subject a set may give a value
 * - SampleField:       One `<field>`, its bounds resolved for an instance
 * - SampleBlock:       One `<data>` block of an instance
 * - SampleCollection:  One collection instance on one screen
 * - SampleShape:       Everything a set may hold
 * - sampleShapeOf():   Read it from a project model
 * - enumValues():      An enum field's values as a list
 */

import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import type { Globals, SubjectType } from '@u8g2gl/core/schema/globals.js';
import { dataCountOf, type PropType, type WidgetData, type WidgetDataField } from '@u8g2gl/core/schema/widget-manifest.js';
import type { WidgetNode, WidgetNodeChild } from '@u8g2gl/core/schema/widget-node.js';

/** A subject a set may give a value, as `globals.xml` declares it. */
export interface SampleSubject {
  readonly name: string;
  readonly type: SubjectType;
  /** The initial value as written, compiled into the firmware; undefined when none is declared. */
  readonly initial: string | undefined;
  /** A string subject's capacity in characters, when declared. */
  readonly maxLen: number | undefined;
  /** The fonts of the elements that draw it (`bind_text`), in document order, each once. */
  readonly fonts: readonly string[];
}

/** One field of a row, as the instance sizes it. */
export interface SampleField {
  readonly name: string;
  /** One of `DATA_FIELD_TYPES`: `int`, `bool`, `string` or `enum`. */
  readonly type: PropType;
  /** An int field's bounds, when the manifest writes them. */
  readonly min: number | undefined;
  readonly max: number | undefined;
  /** An enum field's values, in the manifest's order; empty for any other type. */
  readonly values: readonly string[];
  /** A string field's capacity in characters, for this instance; undefined when unbounded. */
  readonly maxLen: number | undefined;
  /**
   * A repeated field's count for this instance; undefined when the field is
   * not repeated. A repeated field is an array in a row.
   */
  readonly repeat: number | undefined;
  /** Whether the field repeats (`repeat=` is written), whatever its count resolves to. */
  readonly repeated: boolean;
  /** The manifest's help text. */
  readonly help: string | undefined;
}

/** One `<data>` block of one instance. */
export interface SampleBlock {
  /** The data name, e.g. `rows`: the key the bridge's `applyCollectionData` takes. */
  readonly name: string;
  /** How many rows this instance takes; undefined when unbounded. */
  readonly capacity: number | undefined;
  readonly fields: readonly SampleField[];
  readonly help: string | undefined;
}

/** One collection instance: an element on a screen whose manifest declares `<data>`. */
export interface SampleCollection {
  /** The screen's file, project-relative: the key `rows` uses. */
  readonly file: string;
  /** The screen's name. */
  readonly screen: string;
  /** The element's name: the key under the file. */
  readonly element: string;
  /** Its tag (its class). */
  readonly tag: string;
  /** Its manifest's label, for the view; the tag when it has none. */
  readonly label: string;
  /** Every `<data>` it declares; a set can address only the first, and only when it is alone. */
  readonly blocks: readonly SampleBlock[];
  /** The font its rows are drawn in: its first `font` prop, as written or defaulted. */
  readonly font: string | undefined;
}

/** Everything a sample set may hold for one project. */
export interface SampleShape {
  /** The subjects, in declaration order. */
  readonly subjects: readonly SampleSubject[];
  /** The collection instances, screen by screen in the model's order, each in document order. */
  readonly collections: readonly SampleCollection[];
  /** Every screen file the project reads, so a set naming another can be told so. */
  readonly screenFiles: ReadonlySet<string>;
  /** Every named element of each screen file, with its tag: so a set can be told an element takes no rows. */
  readonly elements: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/**
 * @brief The shape of the sample sets a project takes.
 *
 * @param model The project model the live pipeline built.
 */
export function sampleShapeOf(model: ProjectModel): SampleShape {
  const drawnIn = new Map<string, string[]>();
  const collections: SampleCollection[] = [];
  const screenFiles = new Set<string>();
  const elements = new Map<string, Map<string, string>>();
  for (const screen of model.screens) {
    const file = screen.loc?.file;
    if (file === undefined) continue;
    screenFiles.add(file);
    const named = new Map<string, string>();
    elements.set(file, named);
    const visit = (children: readonly WidgetNodeChild[]): void => {
      for (const child of children) {
        if (!isElement(child)) continue;
        if (child.attributes.name !== '') named.set(child.attributes.name, child.tag);
        const manifest = model.manifests.get(child.tag);
        // The font a bound text is drawn in, for the widest text a subject can hold.
        const bound = child.attributes.bind_text;
        const font = fontOf(child, manifest?.api.props ?? []);
        if (typeof bound === 'string' && font !== undefined) {
          const fonts = drawnIn.get(bound) ?? [];
          if (!fonts.includes(font)) fonts.push(font);
          drawnIn.set(bound, fonts);
        }
        const data = manifest?.api.data ?? [];
        if (data.length > 0 && child.attributes.name !== '') {
          collections.push({
            file,
            screen: screen.name,
            element: child.attributes.name,
            tag: child.tag,
            label: manifest?.api.label ?? child.tag,
            blocks: data.map((block) => blockFor(block, child, manifest?.api.props ?? [], model.globals)),
            font,
          });
        }
        visit(child.children);
      }
    };
    visit(screen.view.children);
  }
  const subjects = (model.globals.subjects ?? []).map(
    (s): SampleSubject => ({ name: s.name, type: s.type, initial: s.default, maxLen: s.maxLen, fonts: drawnIn.get(s.name) ?? [] }),
  );
  return { subjects, collections, screenFiles, elements };
}

/**
 * @brief An enum field's or prop's comma-separated `values`, as a list.
 *
 * @param values As written; undefined is none.
 */
export function enumValues(values: string | undefined): string[] {
  return (values ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

// isElement
// Whether a child is an element (a WidgetNode) rather than a binding, an
// event, a style or a static child, all of which carry a `kind`.
function isElement(child: WidgetNodeChild): child is WidgetNode {
  return !('kind' in child);
}

// fontOf
// An element's font: the value of its manifest's first `font` prop, as
// written, else that prop's default. A font set only through a style is not
// followed: the generated sets then fall back to a wide glyph.
//   element — the element
//   props   — its manifest's props
function fontOf(element: WidgetNode, props: Parameters<typeof dataCountOf>[1]): string | undefined {
  const prop = props.find((candidate) => candidate.type === 'font');
  if (prop === undefined) return undefined;
  const written = element.attributes[prop.name];
  return typeof written === 'string' && written !== '' ? written : prop.default;
}

// blockFor
// One `<data>` block with every count resolved for this instance.
//   block    — the manifest's declaration
//   instance — the element in the screen
//   props    — the manifest's props, which a count may name
//   globals  — for a prop the instance sets through a const
function blockFor(block: WidgetData, instance: WidgetNode, props: Parameters<typeof dataCountOf>[1], globals: Globals): SampleBlock {
  const count = (text: string | undefined): number | undefined => (text === undefined ? undefined : resolveCount(text, instance, props, globals));
  return {
    name: block.name,
    capacity: count(block.capacity),
    help: block.help,
    fields: block.fields.map((field: WidgetDataField): SampleField => ({
      name: field.name,
      type: field.type,
      min: integerOf(field.min),
      max: integerOf(field.max),
      values: field.type === 'enum' ? enumValues(field.values) : [],
      maxLen: count(field.maxLen),
      repeat: count(field.repeat),
      repeated: field.repeat !== undefined,
      help: field.help,
    })),
  };
}

// resolveCount
// A `capacity`, `repeat` or `max_len` for one instance: a literal is itself;
// a prop name takes the instance's own value for it (an integer, or an int
// const it names), else the prop's default. Undefined when none of those is a
// number, which every reader treats as unbounded.
//   text     — the count as the manifest writes it
//   instance — the element
//   props    — its manifest's props
//   globals  — its consts
function resolveCount(text: string, instance: WidgetNode, props: Parameters<typeof dataCountOf>[1], globals: Globals): number | undefined {
  const count = dataCountOf(text, props);
  if (count === undefined) return undefined;
  if (count.kind === 'literal') return count.value;
  const written = instance.attributes[count.prop.name];
  if (typeof written === 'string') {
    const literal = integerOf(written);
    if (literal !== undefined) return literal;
    // A const is referenced as `#name` (§10).
    const name = written.trim().replace(/^#/, '');
    const constant = (globals.consts ?? []).find((c) => c.name === name && c.type === 'int');
    const value = integerOf(constant?.value);
    if (value !== undefined) return value;
  }
  return count.value;
}

// integerOf
// An integer literal's value, or undefined for anything else.
function integerOf(text: string | undefined): number | undefined {
  return text !== undefined && /^\s*-?\d+\s*$/.test(text) ? Number(text) : undefined;
}
