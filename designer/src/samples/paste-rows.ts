/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/paste-rows.ts
 * Purpose: Pasting rows into a collection's grid (ruling 7): the route from a
 *          real departures feed into the designer. A feed is usually JSON or a
 *          spreadsheet's CSV, with its own column order and extra columns, so
 *          fields are mapped by name, never by position, and every value that
 *          cannot be a field's is reported by row and field while the rows
 *          that are fine still land.
 * Description: `pasteRows()` takes JSON (an array of row objects, as a set
 *              holds them) when the text starts with `[`, and CSV with a header
 *              row otherwise (RFC 4180: quoted fields, `""` for a quote, commas
 *              and line breaks inside quotes, CRLF or LF). A header matches a
 *              field by name, exactly, else ignoring case. A repeated field
 *              takes its cells from columns named `cells[0]`, `cells.0`, or the
 *              bare name repeated, left to right.
 *
 *              Each value is converted for its field: an int from an integer
 *              (refused, not clamped, outside `min`/`max`: a feed's value out
 *              of range is a fact the author must see); a bool from true/false,
 *              yes/no or 1/0; an enum only from one of its values; a string as
 *              written, refused over `max_len`. A field a row does not give
 *              takes its default (`grid-rules.ts`), as a grid's new row does,
 *              and a column no field has is ignored; both are noted once. A
 *              row with any refused value is left out, and rows beyond the
 *              capacity left are refused.
 *
 * Exports:
 * - PasteRejection:   One refused value or row
 * - PasteResult:      The rows that land, what was refused, and notes
 * - pasteRows():      Map pasted text onto a `<data>` block
 * - parseCsv():       CSV text as rows of fields
 */

import { characterCount, defaultCell } from './grid-rules';
import type { SampleCell, SampleRow } from './sample-set';
import type { SampleBlock, SampleField } from './sample-shape';

/** One refused value (a field of a row) or row (no field: over capacity, not an object). */
export interface PasteRejection {
  /** The pasted row, 1-based: the CSV's data rows after the header, or the JSON array's items. */
  readonly row: number;
  /** The field, with `[i]` for a repeated field's cell; undefined for the whole row. */
  readonly field: string | undefined;
  readonly reason: string;
}

/** What a paste did. */
export interface PasteResult {
  /** The rows that land, in pasted order. */
  readonly rows: readonly SampleRow[];
  /** Every refused value and row. */
  readonly rejected: readonly PasteRejection[];
  /** Mapping notes: columns ignored, fields defaulted. */
  readonly notes: readonly string[];
  /** Set when nothing could be read at all (bad JSON, no header). */
  readonly failure?: string;
}

/**
 * @brief Maps pasted JSON or CSV onto a `<data>` block's fields.
 *
 * @param text      What was pasted.
 * @param block     The collection's `<data>`, its bounds resolved for the instance.
 * @param room      How many more rows the instance takes; undefined is unbounded.
 */
export function pasteRows(text: string, block: SampleBlock, room: number | undefined): PasteResult {
  // --- Step 1: The pasted rows, as records of raw values by column ---
  const read = readRecords(text);
  if ('failure' in read) return { rows: [], rejected: [], notes: [], failure: read.failure };

  // --- Step 2: Which column feeds which field ---
  const notes: string[] = [];
  const columns = read.columns;
  const mapping = new Map<string, { readonly field: SampleField; readonly index: number | undefined }>();
  const repeatNext = new Map<string, number>();
  for (const column of columns) {
    const target = mapColumn(column, block, read.source, repeatNext);
    if (target === undefined) notes.push(`column '${column}' matches no field of ${block.name}, so it was ignored`);
    else mapping.set(column, target);
  }
  for (const field of block.fields) {
    if (![...mapping.values()].some((m) => m.field === field)) notes.push(`no column gives ${field.name}, so every row takes its default`);
  }

  // --- Step 3: Each row, converted field by field; a row with a refused value is left out ---
  const rows: SampleRow[] = [];
  const rejected: PasteRejection[] = [];
  read.records.forEach((record, i) => {
    const number = i + 1;
    if (record === undefined) {
      rejected.push({ row: number, field: undefined, reason: 'not an object keyed by field name' });
      return;
    }
    const row: Record<string, SampleCell> = Object.fromEntries(block.fields.map((f) => [f.name, defaultCell(f)]));
    let clean = true;
    for (const [column, raw] of record) {
      const target = mapping.get(column);
      if (target === undefined) continue;
      const { field, index } = target;
      if (field.repeated && index === undefined) {
        // A JSON row's whole array.
        const cells = Array.isArray(raw) ? raw : [raw];
        if (field.repeat !== undefined && cells.length > field.repeat) {
          rejected.push({ row: number, field: field.name, reason: `${cells.length} values, more than its repeat of ${field.repeat}` });
          clean = false;
          continue;
        }
        const converted: string[] = [];
        cells.forEach((cell, c) => {
          const value = convert(field, cell);
          if ('reason' in value) {
            rejected.push({ row: number, field: `${field.name}[${c}]`, reason: value.reason });
            clean = false;
          } else {
            converted.push(String(value.value));
          }
        });
        row[field.name] = converted;
      } else if (field.repeated && index !== undefined) {
        if (field.repeat !== undefined && index >= field.repeat) {
          rejected.push({ row: number, field: `${field.name}[${index}]`, reason: `beyond its repeat of ${field.repeat}` });
          clean = false;
          continue;
        }
        const value = convert(field, raw);
        if ('reason' in value) {
          rejected.push({ row: number, field: `${field.name}[${index}]`, reason: value.reason });
          clean = false;
          continue;
        }
        const cells = [...((row[field.name] as readonly string[] | undefined) ?? [])];
        while (cells.length <= index) cells.push('');
        cells[index] = String(value.value);
        row[field.name] = cells;
      } else {
        const value = convert(field, raw);
        if ('reason' in value) {
          rejected.push({ row: number, field: field.name, reason: value.reason });
          clean = false;
          continue;
        }
        row[field.name] = value.value;
      }
    }
    if (!clean) return;
    // Trailing blank cells of a repeated field add nothing.
    for (const field of block.fields) {
      const cells = row[field.name];
      if (field.repeated && Array.isArray(cells)) {
        const trimmed = [...(cells as string[])];
        while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop();
        row[field.name] = trimmed;
      }
    }
    if (room !== undefined && rows.length >= room) {
      rejected.push({ row: number, field: undefined, reason: `over the capacity: only ${room} more row${room === 1 ? '' : 's'} fit` });
      return;
    }
    rows.push(row);
  });
  return { rows, rejected, notes };
}

/**
 * @brief CSV text as rows of fields (RFC 4180).
 *
 * Quoted fields may hold commas, `""` for a quote, and line breaks; rows end
 * at LF or CRLF; a final line break adds no row, and a blank line is skipped.
 *
 * @return The rows, or undefined when a quote is never closed.
 */
export function parseCsv(text: string): string[][] | undefined {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      started = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      if (started || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      started = false;
    } else {
      field += c;
      started = true;
    }
  }
  if (quoted) return undefined;
  if (started || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// readRecords
// The pasted text as columns and records: each record the row's raw values by
// column, or undefined for a JSON item that is not an object.
//   text — what was pasted
function readRecords(
  text: string,
):
  | { readonly source: 'json' | 'csv'; readonly columns: readonly string[]; readonly records: readonly (ReadonlyMap<string, unknown> | undefined)[] }
  | { readonly failure: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { failure: 'nothing was pasted' };
  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return { failure: `the JSON does not parse: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!Array.isArray(parsed)) return { failure: 'JSON must be an array of row objects' };
    const columns: string[] = [];
    const records = parsed.map((item): ReadonlyMap<string, unknown> | undefined => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined;
      for (const key of Object.keys(item)) if (!columns.includes(key)) columns.push(key);
      return new Map(Object.entries(item as Record<string, unknown>));
    });
    return { source: 'json', columns, records };
  }
  const table = parseCsv(text);
  if (table === undefined) return { failure: 'the CSV has a quote that is never closed' };
  const [header, ...body] = table;
  if (header === undefined || header.every((h) => h.trim() === '')) return { failure: 'CSV needs a header row naming the fields' };
  // A repeated bare name keeps each column apart: `cells`, `cells`, … become
  // distinct keys, mapped in order to cells[0], cells[1], ….
  const seen = new Map<string, number>();
  const columns = header.map((name) => {
    const key = name.trim();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}\u0000${count}`;
  });
  const records = body.map((cells) => new Map(columns.map((column, i): [string, unknown] => [column, cells[i] ?? ''])));
  return { source: 'csv', columns, records };
}

// mapColumn
// The field (and for a repeated field, the cell) a column feeds, or undefined.
// `name[i]` and `name.i` name a repeated field's cell. A bare repeated name is
// the whole array in a JSON row, and in a CSV header the next cell, left to
// right, however many times it is repeated.
//   column     — the column's key (`name`, or `name\0n` for a repeat in a CSV header)
//   block      — the fields
//   source     — what was pasted
//   repeatNext — the next cell index per repeated field, for bare CSV names
function mapColumn(
  column: string,
  block: SampleBlock,
  source: 'json' | 'csv',
  repeatNext: Map<string, number>,
): { readonly field: SampleField; readonly index: number | undefined } | undefined {
  const [base = '', copy] = column.split('\u0000');
  const indexed = /^(.*?)(?:\[(\d+)\]|\.(\d+))$/.exec(base);
  const name = indexed?.[1] ?? base;
  const field = block.fields.find((f) => f.name === name) ?? block.fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (field === undefined) return undefined;
  if (!field.repeated) return copy === undefined && indexed === null ? { field, index: undefined } : undefined;
  if (indexed !== null) return { field, index: Number(indexed[2] ?? indexed[3]) };
  if (source === 'json') return { field, index: undefined };
  const next = repeatNext.get(field.name) ?? 0;
  repeatNext.set(field.name, next + 1);
  return { field, index: next };
}

// convert
// One raw value (a JSON value, or a CSV string) as a field's.
//   field — the field
//   raw   — the value
function convert(field: SampleField, raw: unknown): { readonly value: string | number | boolean } | { readonly reason: string } {
  switch (field.type) {
    case 'int': {
      const number = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*-?\d+\s*$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isInteger(number)) return { reason: `'${String(raw)}' is not an integer` };
      if (field.min !== undefined && number < field.min) return { reason: `${number} is below the min of ${field.min}` };
      if (field.max !== undefined && number > field.max) return { reason: `${number} is above the max of ${field.max}` };
      return { value: number };
    }
    case 'bool': {
      if (typeof raw === 'boolean') return { value: raw };
      const word = typeof raw === 'string' ? raw.trim().toLowerCase() : typeof raw === 'number' ? String(raw) : '';
      if (['true', 'yes', '1'].includes(word)) return { value: true };
      if (['false', 'no', '0'].includes(word)) return { value: false };
      return { reason: `'${String(raw)}' is not true or false` };
    }
    case 'enum': {
      const word = typeof raw === 'string' ? raw.trim() : String(raw);
      return field.values.includes(word) ? { value: word } : { reason: `'${word}' is not one of ${field.values.join(', ')}` };
    }
    default: {
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return { reason: 'not a string' };
      const text = String(raw);
      const length = characterCount(text);
      if (field.maxLen !== undefined && length > field.maxLen) return { reason: `${length} characters, over the max_len of ${field.maxLen}` };
      return { value: text };
    }
  }
}
