/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/sample-set.ts
 * Purpose: The sample-set file format, `samples/<set>.json`, and its checks
 *          against the project (ui_spec §11). A set is data, never compiled:
 *          `generate` ignores `samples/`, and nothing in a set reaches the
 *          firmware. It gives the designer's canvas, and a test run, values
 *          for the subjects and rows for the collection widgets, so one
 *          layout can be seen with the data it will really show.
 * Description: The format:
 *
 *                  { "u8g2gl_samples": 1,
 *                    "values": { "<subject>": <value>, … },
 *                    "rows": { "<screen file>": { "<element>": [ { "<field>": <value>, … }, … ] } } }
 *
 *              `values` is keyed by subject name; `rows` by the screen's
 *              project-relative file, then the element's name; each row is an
 *              object keyed by the manifest's `<field>` names, a repeated field
 *              an array. A subject the set leaves out keeps its initial value.
 *
 *              `checkSampleSet()` reads the text with positions and reports
 *              each problem with the set's file, the value's line and column,
 *              and its JSON path. A set that does not parse, or has an unknown
 *              version, is an error and applies nothing. Everything else is a
 *              warning, and only the value or row at fault is left out: the
 *              rest of the set still applies, and what applies has been
 *              checked as the bridge checks it, so the bridge's all-or-nothing
 *              `applyCollectionData` is never handed a row it would refuse.
 *
 * Exports:
 * - SAMPLE_SET_VERSION:     The format version this designer writes and reads
 * - SAMPLES_DIRECTORY:      Where sets live in a project
 * - SAMPLE_CODES:           The stable codes of a set's problems
 * - SampleScalar, SampleCell, SampleRow, SampleSetDocument: The format's values
 * - AppliedSampleSet:       What of a set checks clean, ready for the bridge
 * - SampleSetCheck:         A check's problems and what applies
 *
 *     Paths:
 *     - isSampleSetPath():  Whether a project path is a set
 *     - sampleSetName():    A set's name from its path
 *     - sampleSetPath():    A set's path from its name
 *     - validSetName():     Whether a name can be a set's file name
 *
 *     Checking:
 *     - checkSampleSet():   A set's text against the project
 *     - subjectValueProblem(): Why a value cannot be a subject's, if it cannot
 *     - fieldValueProblem(): Why a value cannot be a field's, if it cannot
 *     - jsonPath():         A JSON path as a problem names it
 *
 *     Writing:
 *     - emptySampleSet():   A set with nothing in it
 *     - readSampleSetDocument(): A set's text as a plain document, leniently
 *     - serialiseSampleSet(): A document as the file's text
 *
 *     Applying:
 *     - NO_SAMPLES:         The applied set of no set
 *     - sampleValuesJson(): The initial values with a set's over them
 *     - collectionDataJson(): A screen's rows, as `applyCollectionData` takes them
 */

import type { Diagnostic, Severity } from '@u8g2gl/core/schema/diagnostic.js';
import { lineColumnAt, plainValue, readLocatedJson, type LocatedMember, type LocatedValue } from './located-json';
import type { SampleCollection, SampleField, SampleShape, SampleSubject } from './sample-shape';

/** The format version: the `u8g2gl_samples` member's value. */
export const SAMPLE_SET_VERSION = 1;

/** The project directory sets live in, one file each. */
export const SAMPLES_DIRECTORY = 'samples';

/**
 * The stable codes of a set's problems. A consumer may branch on them; the
 * prose may change.
 */
export const SAMPLE_CODES = {
  /** The text is not JSON. */
  JSON: 'U8G2GL_SAMPLE_JSON',
  /** `u8g2gl_samples` is missing or not a version this designer reads. */
  VERSION: 'U8G2GL_SAMPLE_VERSION',
  /** A member the format does not have, or one of the wrong JSON shape. */
  SHAPE: 'U8G2GL_SAMPLE_SHAPE',
  /** A subject `globals.xml` does not declare. */
  UNKNOWN_SUBJECT: 'U8G2GL_SAMPLE_UNKNOWN_SUBJECT',
  /** A screen file the project does not read. */
  UNKNOWN_SCREEN: 'U8G2GL_SAMPLE_UNKNOWN_SCREEN',
  /** An element the screen does not have. */
  UNKNOWN_ELEMENT: 'U8G2GL_SAMPLE_UNKNOWN_ELEMENT',
  /** An element whose manifest declares no `<data>` (or more than one). */
  NO_DATA: 'U8G2GL_SAMPLE_NO_DATA',
  /** A field the element's `<data>` does not declare. */
  UNKNOWN_FIELD: 'U8G2GL_SAMPLE_UNKNOWN_FIELD',
  /** A value of the wrong type, out of bounds, too long, or not among its values. */
  VALUE: 'U8G2GL_SAMPLE_VALUE',
  /** More rows than the instance's capacity. */
  CAPACITY: 'U8G2GL_SAMPLE_CAPACITY',
} as const;

/** A subject's value, or a single field's. */
export type SampleScalar = string | number | boolean;
/** A field's value in a row: a scalar, or a repeated field's array of strings. */
export type SampleCell = SampleScalar | readonly string[];
/** One row, keyed by field name. */
export type SampleRow = Readonly<Record<string, SampleCell>>;

/**
 * A set as a plain document: what the file holds, kept as written so the view
 * can show, and an edit preserve, even a value that does not check. Writers
 * replace a member and serialise the whole.
 */
export interface SampleSetDocument {
  u8g2gl_samples: unknown;
  values: Record<string, unknown>;
  rows: Record<string, Record<string, unknown>>;
  /** Any other member, kept so an edit does not drop it. */
  [other: string]: unknown;
}

/** What of a set checks clean: the values, and each screen file's rows as the bridge takes them. */
export interface AppliedSampleSet {
  /** Subject values, by name. */
  readonly values: Readonly<Record<string, SampleScalar>>;
  /** By screen file, then element, then data name: the rows. */
  readonly rows: ReadonlyMap<string, Readonly<Record<string, Readonly<Record<string, readonly SampleRow[]>>>>>;
}

/** One check: every problem, and what still applies. */
export interface SampleSetCheck {
  readonly problems: readonly Diagnostic[];
  readonly applied: AppliedSampleSet;
}

/** The applied set when no set is active, or a set applies nothing. */
export const NO_SAMPLES: AppliedSampleSet = { values: {}, rows: new Map() };

/** `samples/<name>.json`, one level deep. */
const SET_PATH = /^samples\/([^/]+)\.json$/;

/** A set name: what may be its file's name, portable across file systems. */
const SET_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;

/** The largest and least value an int subject holds (`int32_t`). */
const INT32 = { min: -2147483648, max: 2147483647 } as const;

/** @brief Whether a project path is a sample set: `samples/<name>.json`. */
export function isSampleSetPath(path: string): boolean {
  return SET_PATH.test(path);
}

/** @brief A set's name from its path: `samples/typical.json` is `typical`. */
export function sampleSetName(path: string): string {
  return SET_PATH.exec(path)?.[1] ?? path;
}

/** @brief A set's path from its name. */
export function sampleSetPath(name: string): string {
  return `${SAMPLES_DIRECTORY}/${name}.json`;
}

/**
 * @brief Whether a name can be a set's: letters, digits, space, `_`, `.` and
 *        `-`, starting with a letter or digit, so its file name is portable.
 */
export function validSetName(name: string): boolean {
  return SET_NAME.test(name) && !name.endsWith('.') && name.length <= 64;
}

/** @brief A set with nothing in it. */
export function emptySampleSet(): SampleSetDocument {
  return { u8g2gl_samples: SAMPLE_SET_VERSION, values: {}, rows: {} };
}

/**
 * @brief A set's text as a plain document, for an edit to change and write back.
 *
 * Lenient: whatever parses is kept, and a `values` or `rows` that is missing
 * or not an object starts empty. Text that does not parse gives undefined,
 * since an edit must not silently replace what the author wrote.
 *
 * @param text The file's text.
 */
export function readSampleSetDocument(text: string): SampleSetDocument | undefined {
  const read = readLocatedJson(text);
  if (!read.ok) return undefined;
  const plain = plainValue(read.value);
  if (!isRecord(plain)) return undefined;
  const values = isRecord(plain.values) ? plain.values : {};
  const rows: Record<string, Record<string, unknown>> = {};
  if (isRecord(plain.rows)) {
    for (const [file, elements] of Object.entries(plain.rows)) rows[file] = isRecord(elements) ? elements : {};
  }
  return { ...plain, u8g2gl_samples: plain.u8g2gl_samples ?? SAMPLE_SET_VERSION, values, rows };
}

/**
 * @brief A document as the file's text: two-space JSON, the version first,
 *        then `values` and `rows`, and a final newline.
 *
 * Deterministic: member order is the document's, which keeps the author's,
 * so an edit to one value changes one line of the diff.
 */
export function serialiseSampleSet(document: SampleSetDocument): string {
  const { u8g2gl_samples: version, values, rows, ...rest } = document;
  return `${JSON.stringify({ u8g2gl_samples: version, values, rows, ...rest }, null, 2)}\n`;
}

/**
 * @brief Checks a set's text against the project.
 *
 * @param file  The set's project path, which every problem names.
 * @param text  Its text.
 * @param shape The project's subjects and collection instances.
 * @return The problems, sorted by position, and what checks clean.
 */
export function checkSampleSet(file: string, text: string, shape: SampleShape): SampleSetCheck {
  const problems: Diagnostic[] = [];
  const report = (severity: Severity, code: string, offset: number, path: readonly (string | number)[], what: string): void => {
    const { line, column } = lineColumnAt(text, offset);
    problems.push({ code, severity, file, line, column, message: path.length === 0 ? what : `${jsonPath(path)}: ${what}` });
  };

  // --- Step 1: JSON, an object, and a version this designer reads ---
  const read = readLocatedJson(text);
  if (!read.ok) {
    report('error', SAMPLE_CODES.JSON, read.offset, [], `not valid JSON: ${read.message}`);
    return { problems, applied: NO_SAMPLES };
  }
  if (read.value.kind !== 'object') {
    report('error', SAMPLE_CODES.SHAPE, read.value.offset, [], 'a sample set must be a JSON object');
    return { problems, applied: NO_SAMPLES };
  }
  const root = read.value;
  const version = member(root, 'u8g2gl_samples');
  if (version === undefined || version.value.kind !== 'number' || version.value.value !== SAMPLE_SET_VERSION) {
    report(
      'error',
      SAMPLE_CODES.VERSION,
      version?.value.offset ?? root.offset,
      ['u8g2gl_samples'],
      version === undefined
        ? `missing: a sample set starts "u8g2gl_samples": ${SAMPLE_SET_VERSION}`
        : `this designer reads version ${SAMPLE_SET_VERSION} of the sample-set format, not ${JSON.stringify(plainValue(version.value))}`,
    );
    return { problems, applied: NO_SAMPLES };
  }
  for (const other of root.members) {
    if (other.key !== 'u8g2gl_samples' && other.key !== 'values' && other.key !== 'rows') {
      report('warning', SAMPLE_CODES.SHAPE, other.keyOffset, [other.key], 'not part of the sample-set format; expected "values" or "rows"');
    }
  }

  // --- Step 2: The subject values ---
  const values: Record<string, SampleScalar> = {};
  const valuesMember = member(root, 'values');
  if (valuesMember !== undefined) {
    if (valuesMember.value.kind !== 'object') {
      report('warning', SAMPLE_CODES.SHAPE, valuesMember.value.offset, ['values'], 'must be an object of subject values');
    } else {
      for (const entry of valuesMember.value.members) {
        const subject = shape.subjects.find((s) => s.name === entry.key);
        if (subject === undefined) {
          report('warning', SAMPLE_CODES.UNKNOWN_SUBJECT, entry.keyOffset, ['values', entry.key], 'globals.xml declares no subject of that name');
          continue;
        }
        const value = plainValue(entry.value);
        const problem = subjectValueProblem(subject, value);
        if (problem !== undefined) {
          report('warning', SAMPLE_CODES.VALUE, entry.value.offset, ['values', entry.key], problem);
          continue;
        }
        values[entry.key] = value as SampleScalar;
      }
    }
  }

  // --- Step 3: The rows, screen by screen and element by element ---
  const rows = new Map<string, Record<string, Record<string, SampleRow[]>>>();
  const rowsMember = member(root, 'rows');
  if (rowsMember !== undefined) {
    if (rowsMember.value.kind !== 'object') {
      report('warning', SAMPLE_CODES.SHAPE, rowsMember.value.offset, ['rows'], 'must be an object keyed by screen file');
    } else {
      for (const screen of rowsMember.value.members) {
        const path = ['rows', screen.key];
        if (!shape.screenFiles.has(screen.key)) {
          report('warning', SAMPLE_CODES.UNKNOWN_SCREEN, screen.keyOffset, path, 'the project has no screen in that file');
          continue;
        }
        if (screen.value.kind !== 'object') {
          report('warning', SAMPLE_CODES.SHAPE, screen.value.offset, path, 'must be an object keyed by element name');
          continue;
        }
        const byElement: Record<string, Record<string, SampleRow[]>> = {};
        for (const element of screen.value.members) {
          const accepted = checkCollection(screen.key, element, shape, path, report);
          if (accepted !== undefined) byElement[element.key] = accepted;
        }
        if (Object.keys(byElement).length > 0) rows.set(screen.key, byElement);
      }
    }
  }

  problems.sort((a, b) => a.line - b.line || a.column - b.column);
  return { problems, applied: { values, rows } };
}

/**
 * @brief Why a value cannot be a subject's, or undefined when it can.
 *
 * int: an integer in `int32_t`; time: a non-negative integer; bool: true or
 * false; string: a string no longer than the subject's `max_len`, counted in
 * characters.
 */
export function subjectValueProblem(subject: SampleSubject, value: unknown): string | undefined {
  switch (subject.type) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) return `must be an integer: ${subject.name} is an int subject`;
      if (value < INT32.min || value > INT32.max) return `${value} does not fit an int subject`;
      return undefined;
    case 'time':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return `must be a whole number of seconds: ${subject.name} is a time subject`;
      return undefined;
    case 'bool':
      return typeof value === 'boolean' ? undefined : `must be true or false: ${subject.name} is a bool subject`;
    case 'string': {
      if (typeof value !== 'string') return `must be a string: ${subject.name} is a string subject`;
      const length = characters(value);
      return subject.maxLen !== undefined && length > subject.maxLen
        ? `${length} characters, over the subject's max_len of ${subject.maxLen}`
        : undefined;
    }
  }
}

/**
 * @brief Why a value cannot be a field's, or undefined when it can.
 *
 * A repeated field is an array of strings no longer than its `repeat`, each no
 * longer than `max_len`; an int field an integer within `min`..`max`; a bool
 * true or false; an enum one of its values; a string no longer than its
 * `max_len`, counted in characters. A message names the offending item of a
 * repeated field with `[i]` first, so a caller can extend the path.
 *
 * @return The reason, and for a repeated field the index of the item at fault.
 */
export function fieldValueProblem(field: SampleField, value: unknown): { readonly index?: number; readonly reason: string } | undefined {
  if (field.repeated) {
    if (!Array.isArray(value)) return { reason: 'must be an array of strings: the field repeats' };
    if (field.repeat !== undefined && value.length > field.repeat) {
      return { index: field.repeat, reason: `${value.length} values, more than its repeat of ${field.repeat}` };
    }
    for (let i = 0; i < value.length; i++) {
      const reason = scalarFieldProblem(field, value[i]);
      if (reason !== undefined) return { index: i, reason };
    }
    return undefined;
  }
  const reason = scalarFieldProblem(field, value);
  return reason === undefined ? undefined : { reason };
}

/**
 * @brief A JSON path as a problem names it:
 *        `rows["screens/screen_departures.xml"].services[3].cells[1]`.
 *
 * A key that is an identifier is written `.key`, anything else `["key"]`; an
 * index `[i]`.
 */
export function jsonPath(path: readonly (string | number)[]): string {
  return path
    .map((segment, i) => {
      if (typeof segment === 'number') return `[${segment}]`;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) return i === 0 ? segment : `.${segment}`;
      return `[${JSON.stringify(segment)}]`;
    })
    .join('');
}

/**
 * @brief The subjects' values for `applySampleData`: the initial values, with
 *        the set's over them. A subject the set leaves out keeps its initial
 *        value.
 *
 * @param initialJson The initial values' JSON, as the live pipeline makes it.
 * @param applied     What of the active set checks clean.
 */
export function sampleValuesJson(initialJson: string, applied: AppliedSampleSet): string {
  if (Object.keys(applied.values).length === 0) return initialJson;
  return JSON.stringify({ ...(JSON.parse(initialJson) as Record<string, unknown>), ...applied.values });
}

/**
 * @brief One screen's rows as `applyCollectionData` takes them,
 *        `{ "<element>": { "<data>": [rows] } }`; undefined when the set has
 *        none for that screen, so a screen without rows is drawn as today.
 *
 * @param applied What of the active set checks clean.
 * @param file    The screen's file.
 */
export function collectionDataJson(applied: AppliedSampleSet, file: string | undefined): string | undefined {
  const rows = file === undefined ? undefined : applied.rows.get(file);
  return rows === undefined ? undefined : JSON.stringify(rows);
}

// checkCollection
// One element's rows: the element must be a collection instance with one
// `<data>`, its rows an array no longer than the capacity, each row an object
// of declared fields with checked values. Returns the rows that check clean,
// keyed by the data name, or undefined when none can apply.
//   file    — the screen file
//   element — the member under the file, keyed by element name
//   shape   — the project's
//   parent  — the path to the file's member
//   report  — where problems go
function checkCollection(
  file: string,
  element: LocatedMember,
  shape: SampleShape,
  parent: readonly (string | number)[],
  report: (severity: Severity, code: string, offset: number, path: readonly (string | number)[], what: string) => void,
): Record<string, SampleRow[]> | undefined {
  // --- Step 1: A collection instance with exactly one <data> ---
  const path = [...parent, element.key];
  const collection: SampleCollection | undefined = shape.collections.find((c) => c.file === file && c.element === element.key);
  if (collection === undefined) {
    const known = shape.elements.get(file)?.get(element.key);
    if (known === undefined) {
      report('warning', SAMPLE_CODES.UNKNOWN_ELEMENT, element.keyOffset, path, 'the screen has no element of that name');
    } else {
      report('warning', SAMPLE_CODES.NO_DATA, element.keyOffset, path, `<${known}> declares no <data>, so it takes no rows`);
    }
    return undefined;
  }
  const block = collection.blocks[0];
  if (block === undefined || collection.blocks.length > 1) {
    report('warning', SAMPLE_CODES.NO_DATA, element.keyOffset, path, `<${collection.tag}> declares ${collection.blocks.length} <data> blocks; a sample set fills only an element with one`);
    return undefined;
  }
  if (element.value.kind !== 'array') {
    report('warning', SAMPLE_CODES.SHAPE, element.value.offset, path, 'must be an array of rows');
    return undefined;
  }

  // --- Step 2: Each row, up to the capacity ---
  const accepted: SampleRow[] = [];
  element.value.items.forEach((row, index) => {
    const at = [...path, index];
    if (block.capacity !== undefined && index >= block.capacity) {
      if (index === block.capacity) {
        report('warning', SAMPLE_CODES.CAPACITY, row.offset, at, `${element.value.kind === 'array' ? element.value.items.length : 0} rows, over ${collection.element}'s capacity of ${block.capacity}; the rows beyond it are left out`);
      }
      return;
    }
    if (row.kind !== 'object') {
      report('warning', SAMPLE_CODES.SHAPE, row.offset, at, 'a row must be an object keyed by field name');
      return;
    }
    let clean = true;
    for (const cell of row.members) {
      if (!block.fields.some((f) => f.name === cell.key)) {
        report('warning', SAMPLE_CODES.UNKNOWN_FIELD, cell.keyOffset, [...at, cell.key], `<${collection.tag}> ${block.name} has no field of that name`);
        clean = false;
      }
    }
    for (const field of block.fields) {
      const cell = member(row, field.name);
      if (cell === undefined) {
        // A repeated field left out is every cell blank, as the bridge takes it.
        if (field.repeated) continue;
        report('warning', SAMPLE_CODES.VALUE, row.offset, [...at, field.name], 'missing');
        clean = false;
        continue;
      }
      const problem = fieldValueProblem(field, plainValue(cell.value));
      if (problem !== undefined) {
        const item = problem.index !== undefined && cell.value.kind === 'array' ? cell.value.items[problem.index] : undefined;
        report('warning', SAMPLE_CODES.VALUE, item?.offset ?? cell.value.offset, problem.index === undefined ? [...at, field.name] : [...at, field.name, problem.index], problem.reason);
        clean = false;
      }
    }
    if (clean) accepted.push(plainValue(row) as SampleRow);
  });
  return accepted.length === 0 && element.value.items.length > 0 ? undefined : { [block.name]: accepted };
}

// scalarFieldProblem
// Why one value cannot be a single field's (or one item of a repeated one).
function scalarFieldProblem(field: SampleField, value: unknown): string | undefined {
  switch (field.type) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'must be an integer';
      if (field.min !== undefined && value < field.min) return `${value} is below the field's min of ${field.min}`;
      if (field.max !== undefined && value > field.max) return `${value} is above the field's max of ${field.max}`;
      return undefined;
    case 'bool':
      return typeof value === 'boolean' ? undefined : 'must be true or false';
    case 'enum':
      if (typeof value !== 'string') return `must be one of ${field.values.join(', ')}`;
      return field.values.includes(value) ? undefined : `'${value}' is not one of ${field.values.join(', ')}`;
    default: {
      if (typeof value !== 'string') return 'must be a string';
      const length = characters(value);
      return field.maxLen !== undefined && length > field.maxLen ? `${length} characters, over the field's max_len of ${field.maxLen}` : undefined;
    }
  }
}

// member
// An object's member by key.
function member(object: Extract<LocatedValue, { kind: 'object' }>, key: string): LocatedMember | undefined {
  return object.members.find((m) => m.key === key);
}

// characters
// A string's length in characters (code points), as max_len counts them.
function characters(text: string): number {
  return [...text].length;
}

// isRecord
// Whether a parsed value is a plain JSON object.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
