/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/grid-rules.ts
 * Purpose: The value rules of the Sample data view's typed grids (ruling 7),
 *          kept out of the components so a unit test can hold them: what a new
 *          row holds, what a typed number becomes, how a string is counted
 *          against its `max_len`, and how a repeated field's cells are read and
 *          written. The grid and the generated sets share the defaults, so a
 *          row added by hand and a generated one start alike.
 * Description: A number typed into an int cell is held to the field's `min`
 *              and `max` rather than refused, as a spin box would, so a grid
 *              edit can never write a value the set's checks reject. A string
 *              is counted in characters, as `max_len` counts them; the grid
 *              shows the count and marks a string over it, but keeps what was
 *              typed, because cutting an author's text silently is worse than
 *              a visible warning. A repeated field is an array, shown as
 *              `repeat` cells; writing cell `i` pads the array to reach it.
 *
 * Exports:
 * - defaultCell():     A field's value in a new row
 * - newRow():          A row of defaults for a `<data>` block
 * - heldInteger():     A typed number held to a field's bounds
 * - numberProblem():   Why a typed number is outside an int field's bounds, if it is
 * - characterCount():  A string's length in characters
 * - stringCount():     A string cell's count against its max_len
 * - repeatedCells():   A repeated field's cells, as many as it repeats
 * - withRepeatedCell(): A repeated field's array with one cell written
 * - capacityLabel():   "8 / 12", or "8" when unbounded
 */

import type { SampleCell, SampleRow } from './sample-set';
import type { SampleBlock, SampleField } from './sample-shape';

/**
 * @brief A field's value in a new row: an int's `min`, or 0 held to its
 *        bounds when it declares none; an enum's first value; false; an empty
 *        string; and an empty array for a repeated field (every cell blank).
 */
export function defaultCell(field: SampleField): SampleCell {
  if (field.repeated) return [];
  switch (field.type) {
    case 'int':
      return field.min ?? heldInteger(field, 0) ?? 0;
    case 'bool':
      return false;
    case 'enum':
      return field.values[0] ?? '';
    default:
      return '';
  }
}

/** @brief A row of every field's default, in declaration order. */
export function newRow(block: SampleBlock): SampleRow {
  return Object.fromEntries(block.fields.map((field) => [field.name, defaultCell(field)]));
}

/**
 * @brief A typed number held to a field's bounds: rounded to an integer,
 *        then clamped to `min` and `max`.
 *
 * @param field The int field.
 * @param value The number typed; NaN or infinite gives undefined, which keeps
 *              the cell as it was.
 */
export function heldInteger(field: SampleField, value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  let held = Math.round(value);
  if (field.min !== undefined && held < field.min) held = field.min;
  if (field.max !== undefined && held > field.max) held = field.max;
  return held;
}

/**
 * @brief Why a typed number cannot be written to an int field, or undefined
 *        when it can.
 *
 * A number outside the field's `min`..`max` is refused rather than clamped:
 * clamping would write a value the author did not type, and leave the typed
 * one showing as if it had been taken. An empty text and a non-number are not
 * this rule's: the cell keeps its value for those, as before.
 *
 * @param field The int field.
 * @param text  The text typed.
 * @return A sentence the cell shows beside itself, or undefined.
 */
export function numberProblem(field: SampleField, text: string): string | undefined {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  const below = field.min !== undefined && rounded < field.min;
  const above = field.max !== undefined && rounded > field.max;
  if (!below && !above) return undefined;
  const where =
    field.min !== undefined && field.max !== undefined
      ? `outside ${field.min}–${field.max}`
      : below
        ? `below the minimum of ${field.min ?? ''}`
        : `above the maximum of ${field.max ?? ''}`;
  return `${text.trim()} is ${where}, so it is not written`;
}

/** @brief A string's length in characters (code points), as `max_len` counts them. */
export function characterCount(text: string): number {
  return [...text].length;
}

/**
 * @brief A string cell's count against its `max_len`: what the grid shows
 *        beside it (`12 / 24`), and whether it is over.
 */
export function stringCount(field: SampleField, text: string): { readonly label: string; readonly over: boolean } {
  const length = characterCount(text);
  if (field.maxLen === undefined) return { label: String(length), over: false };
  return { label: `${length} / ${field.maxLen}`, over: length > field.maxLen };
}

/**
 * @brief A repeated field's cells as the grid shows them: `repeat` strings,
 *        a missing or non-string item blank, any beyond `repeat` kept (so the
 *        grid shows, and the set's checks report, an array that is too long).
 *
 * @param field The repeated field.
 * @param value The row's value for it, as written.
 */
export function repeatedCells(field: SampleField, value: unknown): string[] {
  const items = Array.isArray(value) ? value : [];
  const count = Math.max(field.repeat ?? items.length, items.length);
  return Array.from({ length: count }, (_, i) => (typeof items[i] === 'string' ? (items[i] as string) : ''));
}

/**
 * @brief A repeated field's array with cell `index` written, padded with
 *        empty strings to reach it. Trailing empty cells are dropped, so a
 *        cleared last cell leaves the array as it was before it was typed.
 */
export function withRepeatedCell(value: unknown, index: number, text: string): string[] {
  const cells = (Array.isArray(value) ? value : []).map((item) => (typeof item === 'string' ? item : ''));
  while (cells.length <= index) cells.push('');
  cells[index] = text;
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/** @brief A collection's row count against its capacity: `8 / 12`, or `8` when unbounded. */
export function capacityLabel(rows: number, capacity: number | undefined): string {
  return capacity === undefined ? String(rows) : `${rows} / ${capacity}`;
}
