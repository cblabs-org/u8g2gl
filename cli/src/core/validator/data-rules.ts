/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/data-rules.ts
 * Purpose: Pass 1's rules for a widget manifest's `<data>` blocks (schema 0.7,
 *          design_spec §6.5, §9.2). A `<data>` declares the rows a collection
 *          widget takes through its own ingestion API, so the editor can fill
 *          it by name and the designer can show its rows as a typed grid. Both
 *          trust the declaration: the editor build checks the access method's
 *          signature, but a count that names no prop or an enum with no values
 *          would only surface as a confusing grid. So every rule is checked
 *          here, at the attribute at fault. Kept apart from validate-schema.ts
 *          because it is one self-contained vocabulary, and that file is long.
 * Description: One function, run per declared manifest by validate-schema.ts's
 *              section 9. A project manifest on a schema before 0.7 is told to
 *              declare 0.7, once per `<data>`, and nothing more is judged: the
 *              block is not yet part of its vocabulary. Otherwise the block
 *              must belong to a manifest with a class of its own, name a C++
 *              identifier as its access method, and resolve every count; each
 *              field must have a type a row can carry and only the bounds that
 *              type takes. Names are unique per widget and per `<data>`.
 *
 * Exports:
 * - DATA_SINCE:             The first schema version with `<data>`
 * - BEFORE_DATA:            The accepted versions that predate it
 * - checkDataDeclarations(): Every `<data>` rule, for one manifest
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { CPP_KEYWORDS } from '../schema/cpp-keywords.js';
import { ROOT_CLASS_MANIFEST, isDrawingElement } from '../manifest/manifest-registry.js';
import {
  DATA_FIELD_TYPES,
  dataCountOf,
  type PropType,
  type WidgetData,
  type WidgetDataField,
  type WidgetManifest,
} from '../schema/widget-manifest.js';

/** The first schema version whose `<api>` may carry `<data>`. */
export const DATA_SINCE = '0.7';

/**
 * The accepted schema versions that predate `<data>`, kept with DATA_SINCE on
 * the same rule as validate-schema.ts's BEFORE_PALETTE_METADATA: every accepted
 * version below it belongs here.
 */
export const BEFORE_DATA: ReadonlySet<string> = new Set(['0.4', '0.5', '0.6']);

/** Every `PropType`, so a field type outside them is unknown rather than merely refused. */
const PROP_TYPES: readonly PropType[] = ['int', 'bool', 'string', 'enum', 'font', 'image', 'subject', 'style', 'color'];

/** A C++ identifier, as an access method must be. */
const CPP_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An integer literal, as `min` and `max` must be. */
const INTEGER = /^-?\d+$/;

// error
// A located error diagnostic, as validate-schema.ts builds them.
//   code    — the stable code
//   message — the prose
//   loc     — where; an absent location reports at line 1 of no file
//   text    — the offending text
function error(code: string, message: string, loc: SourceLocation | undefined, text: string): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(text !== '' ? { offendingText: text } : {}),
  };
}

// valueLoc, nameLoc
// Where an attribute's value or name was written on a `<data>` or `<field>`,
// falling back to the element.
function valueLoc(decl: WidgetData | WidgetDataField, attr: string): SourceLocation | undefined {
  return decl.attributeLocs?.[attr]?.value ?? decl.loc;
}
function nameLoc(decl: WidgetData | WidgetDataField, attr: string): SourceLocation | undefined {
  return decl.attributeLocs?.[attr]?.name ?? decl.loc;
}

// hasOwnClass
// Whether a manifest declares an element with a C++ class of its own, which
// is what a `<data>`'s access method must be called on. A drawing element
// ([D-18]) has free functions only, and a composite is a plain `u8g2gl_obj`
// container (§13.12); neither has a method to call.
function hasOwnClass(manifest: WidgetManifest): boolean {
  if (manifest.view !== undefined || isDrawingElement(manifest)) return false;
  return manifest.extends !== undefined || manifest.name === ROOT_CLASS_MANIFEST;
}

// countProblem
// What is wrong with a `capacity`, `repeat` or `max_len`, or undefined. It must
// be a non-negative int literal or the name of an int `<prop>` the widget
// itself declares, so the count an instance sets is the one the RAM budget
// already reports.
//   text     — the attribute as written
//   manifest — the widget, whose own props a name may refer to
function countProblem(text: string, manifest: WidgetManifest): string | undefined {
  if (dataCountOf(text, manifest.api.props) !== undefined) return undefined;
  const named = manifest.api.props.find((prop) => prop.name === text.trim());
  if (named !== undefined) {
    return `names prop '${named.name}', which is type="${named.type}", not int`;
  }
  const ints = manifest.api.props.filter((prop) => prop.type === 'int').map((prop) => `'${prop.name}'`);
  return (
    `is neither a non-negative integer nor an int prop of '${manifest.name}'` +
    (ints.length > 0 ? ` (its int props: ${ints.join(', ')})` : '')
  );
}

// checkField
// One `<field>`'s rules: a type a row can carry, then only the bounds that type
// takes, each well formed.
//   field    — the field
//   where    — "widget 'w' <data name='d'>", for the message
//   manifest — its widget, for counts
//   out      — collector
function checkField(field: WidgetDataField, where: string, manifest: WidgetManifest, out: Diagnostic[]): void {
  const what = `${where} <field name="${field.name}">`;

  // --- Step 1: The type ---
  if ((field.type as string) === '') {
    return; // the parser already reported the missing attribute
  }
  if (!PROP_TYPES.includes(field.type)) {
    out.push({
      ...error(
        DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
        `Invalid type '${field.type}' on ${what}. Expected one of: ${DATA_FIELD_TYPES.join(', ')}.`,
        valueLoc(field, 'type'),
        field.type,
      ),
      suggestions: [...DATA_FIELD_TYPES],
    });
    return;
  }
  if (!DATA_FIELD_TYPES.includes(field.type)) {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
        `${what} is type="${field.type}", which a row of data cannot carry: a field is one of ` +
          `${DATA_FIELD_TYPES.join(', ')} (§6.5).`,
        valueLoc(field, 'type'),
        field.type,
      ),
    );
    return;
  }

  // --- Step 2: Bounds belong to the type that has them ---
  const misplaced = (attr: string, owner: string): void => {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
        `'${attr}' on ${what} applies only to ${owner} fields; this one is type="${field.type}".`,
        nameLoc(field, attr),
        attr,
      ),
    );
  };
  if (field.min !== undefined && field.type !== 'int') misplaced('min', 'int');
  if (field.max !== undefined && field.type !== 'int') misplaced('max', 'int');
  if (field.values !== undefined && field.type !== 'enum') misplaced('values', 'enum');
  if (field.maxLen !== undefined && field.type !== 'string') misplaced('max_len', 'string');

  // --- Step 3: An int's bounds are integers, the least first ---
  if (field.type === 'int') {
    for (const attr of ['min', 'max'] as const) {
      const text = field[attr];
      if (text !== undefined && !INTEGER.test(text.trim())) {
        out.push(
          error(
            DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
            `'${attr}' on ${what} must be an integer, not '${text}'.`,
            valueLoc(field, attr),
            text,
          ),
        );
      }
    }
    const min = field.min !== undefined && INTEGER.test(field.min.trim()) ? Number(field.min) : undefined;
    const max = field.max !== undefined && INTEGER.test(field.max.trim()) ? Number(field.max) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `${what} has min="${min}" above max="${max}"; no value could satisfy both.`,
          valueLoc(field, 'min'),
          String(field.min),
        ),
      );
    }
  }

  // --- Step 4: An enum lists its values ---
  if (field.type === 'enum') {
    const values = (field.values ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (values.length === 0) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `${what} is an enum with no values; list them, e.g. values="standard,first".`,
          field.values === undefined ? field.loc : valueLoc(field, 'values'),
          field.name,
        ),
      );
    }
  }

  // --- Step 5: Counts resolve ---
  for (const [attr, text] of [
    ['max_len', field.maxLen],
    ['repeat', field.repeat],
  ] as const) {
    if (text === undefined) continue;
    const problem = countProblem(text, manifest);
    if (problem !== undefined) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `'${attr}="${text}"' on ${what} ${problem}.`,
          valueLoc(field, attr),
          text,
        ),
      );
    }
  }
}

/**
 * @brief Checks every `<data>` block one manifest declares (Pass 1, section 9).
 *
 * @param manifest    A declared manifest, plain or composite.
 * @param olderSchema The project's schema when it predates `<data>` and this is
 *                    a project manifest; undefined otherwise. Given, each
 *                    `<data>` gets one `U8G2GL_NEWER_SCHEMA_REQUIRED` and
 *                    nothing else is judged.
 * @return The diagnostics, in declaration order.
 */
export function checkDataDeclarations(manifest: WidgetManifest, olderSchema: string | undefined): Diagnostic[] {
  const out: Diagnostic[] = [];
  const blocks = manifest.api.data ?? [];

  // --- Step 1: A project on an older schema is told only to declare 0.7 ---
  if (olderSchema !== undefined) {
    for (const data of blocks) {
      out.push(
        error(
          DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED,
          `Widget '${manifest.name}' declares <data name="${data.name}">, which schema '${olderSchema}' ` +
            `does not have: <data> arrived in '${DATA_SINCE}'. Declare schema="${DATA_SINCE}" in ` +
            `u8g2gl.xml, or remove the <data> (§15.4).`,
          data.loc,
          'data',
        ),
      );
    }
    return out;
  }

  const seenData = new Set<string>();
  for (const data of blocks) {
    const where = `widget '${manifest.name}' <data name="${data.name}">`;

    // --- Step 2: Only a class has a method to call ---
    if (!hasOwnClass(manifest)) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `<data name="${data.name}"> on '${manifest.name}', which has no C++ class of its own: a <data> ` +
            `names a method on the widget's class, and a ` +
            `${manifest.view !== undefined ? 'composite is a plain u8g2gl_obj container (§13.12)' : 'drawing element has only free functions ([D-18])'}.`,
          data.loc,
          'data',
        ),
      );
      continue;
    }

    // --- Step 3: The block's own attributes ---
    if (data.name !== '') {
      if (seenData.has(data.name)) {
        out.push(
          error(
            DIAGNOSTIC_CODES.DUPLICATE_NAME,
            `Widget '${manifest.name}' declares <data name="${data.name}"> twice; data names are unique per widget.`,
            valueLoc(data, 'name'),
            data.name,
          ),
        );
      }
      seenData.add(data.name);
    }
    if (data.access === '') {
      out.push(
        error(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `Missing required attribute 'access' on ${where}: the method called once per row, e.g. access="add_row".`,
          data.loc,
          'access',
        ),
      );
    } else if (!CPP_IDENTIFIER.test(data.access) || CPP_KEYWORDS.has(data.access)) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `access="${data.access}" on ${where} is not a C++ identifier; it names the method called once per row.`,
          valueLoc(data, 'access'),
          data.access,
        ),
      );
    }
    if (data.capacity !== undefined) {
      const problem = countProblem(data.capacity, manifest);
      if (problem !== undefined) {
        out.push(
          error(
            DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
            `capacity="${data.capacity}" on ${where} ${problem}.`,
            valueLoc(data, 'capacity'),
            data.capacity,
          ),
        );
      }
    }

    // --- Step 4: Each field ---
    const seenFields = new Set<string>();
    for (const field of data.fields) {
      if (field.name !== '') {
        if (seenFields.has(field.name)) {
          out.push(
            error(
              DIAGNOSTIC_CODES.DUPLICATE_NAME,
              `${where} declares <field name="${field.name}"> twice; field names are unique per <data>.`,
              valueLoc(field, 'name'),
              field.name,
            ),
          );
        }
        seenFields.add(field.name);
      }
      checkField(field, where, manifest, out);
    }
  }
  return out;
}
