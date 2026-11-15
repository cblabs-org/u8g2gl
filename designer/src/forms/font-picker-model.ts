/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/font-picker-model.ts
 * Purpose: What the font picker offers (ui_spec §6.4): every built-in U8G2
 *          font with the facts its name and data carry — height, character
 *          set, glyph box — and a search and filters over them, so an author
 *          can find "a 10-pixel monospace font with digits" among 2039 names
 *          without knowing U8G2's naming scheme. Fonts the project already
 *          declares are marked.
 * Description: Pure functions over the font list (`u8g2-fonts.json`), the
 *              height table (`u8g2-font-heights.json`) and core's
 *              `fontFacts()`, so the search and filters are unit-tested
 *              without a browser. The search matches as the display picker's
 *              does (display-picker-model.ts, `searchSetups`): every word of
 *              the query inside the name, shortest names first.
 *
 * Exports:
 * - U8G2_FONT_LIST_WIKI:  U8G2's gallery of every font, which the picker links
 * - FontRow:              One font as the picker lists it
 * - FontFilter:           The picker's filters
 * - NO_FILTER:            Filters that keep every font
 * - fontRows():           Every built-in font, with its facts
 * - filterFonts():        The rows a query and filters keep, best first
 * - setOptions():         The character sets the filter offers, with counts
 * - heightRange():        The lowest and highest height in a list of rows
 * - factsLine():          A row's facts as one line of text
 * - declaredBuiltins():   The `<builtin>` names a form declares
 */

import { FONT_SETS, fontFacts, type FontBox, type FontSet } from '@u8g2gl/core/catalogue/index.js';
import type { FormModel, FormNode } from './form-model';

/** U8G2's gallery of every font, rendered: linked for the full picture. */
export const U8G2_FONT_LIST_WIKI = 'https://github.com/olikraus/u8g2/wiki/fntlistall';

/** One font as the picker lists it. */
export interface FontRow {
  readonly name: string;
  /** Pixel height of the glyph box, or undefined when the table has none. */
  readonly height: number | undefined;
  readonly box: FontBox | undefined;
  readonly set: FontSet | undefined;
  /** True when the project's globals already declare it. */
  readonly declared: boolean;
}

/** The picker's filters. A bound or choice left undefined filters nothing. */
export interface FontFilter {
  readonly minHeight?: number;
  readonly maxHeight?: number;
  /** A character set's code (`r`, `cyrillic`), or `'unknown'` for undecoded ones. */
  readonly set?: string;
  /** `'monospace'` for boxes `m` and `8`, `'proportional'` for `t` and `h`, or one box's code. */
  readonly box?: 'monospace' | 'proportional' | FontBox['code'];
}

/** Filters that keep every font. */
export const NO_FILTER: FontFilter = {};

/**
 * @brief Every built-in font, in the list's order, with its facts.
 *
 * @param fonts     The font names (`u8g2-fonts.json`).
 * @param heights   Each font's height (`u8g2-font-heights.json`).
 * @param declared  The `<builtin>` names the project declares.
 */
export function fontRows(fonts: readonly string[], heights: Readonly<Record<string, number>>, declared: ReadonlySet<string>): FontRow[] {
  return fonts.map((name) => {
    const facts = fontFacts(name);
    return { name, height: heights[name], box: facts.box, set: facts.set, declared: declared.has(name) };
  });
}

// keeps
// Whether a row passes every filter that is set.
function keeps(row: FontRow, filter: FontFilter): boolean {
  if (filter.minHeight !== undefined && (row.height === undefined || row.height < filter.minHeight)) return false;
  if (filter.maxHeight !== undefined && (row.height === undefined || row.height > filter.maxHeight)) return false;
  if (filter.set !== undefined && (row.set?.code ?? 'unknown') !== filter.set) return false;
  if (filter.box === 'monospace' && row.box?.monospace !== true) return false;
  if (filter.box === 'proportional' && row.box?.monospace !== false) return false;
  if (filter.box !== undefined && filter.box !== 'monospace' && filter.box !== 'proportional' && row.box?.code !== filter.box) return false;
  return true;
}

/**
 * @brief The rows a query and filters keep.
 *
 * With a query, every word of it (split on spaces and underscores, any case)
 * must appear in the name, and the shortest names come first, as the display
 * search ranks setups. With no query the rows keep the list's order.
 *
 * @param rows    From fontRows().
 * @param query   What the author typed.
 * @param filter  The filters set.
 * @param limit   How many rows to return at most.
 * @return The kept rows, and how many there were before the limit.
 */
export function filterFonts(rows: readonly FontRow[], query: string, filter: FontFilter, limit = 60): { readonly rows: readonly FontRow[]; readonly total: number } {
  const words = query
    .toLowerCase()
    .split(/[\s_]+/)
    .filter((word) => word !== '');
  let kept = rows.filter((row) => keeps(row, filter) && words.every((word) => row.name.toLowerCase().includes(word)));
  if (words.length > 0) kept = [...kept].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'en'));
  return { rows: kept.slice(0, limit), total: kept.length };
}

/**
 * @brief The character sets the set filter offers: each one some row carries,
 *        in the table's order, then "unknown" if any row is undecoded.
 */
export function setOptions(rows: readonly FontRow[]): readonly { readonly code: string; readonly label: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.set?.code ?? 'unknown', (counts.get(row.set?.code ?? 'unknown') ?? 0) + 1);
  // 'symbol' and 'symbols' share a label but stay two options, because they
  // are two postfixes in U8G2; a shared label is told apart by its postfix.
  const sharedLabel = (set: FontSet): boolean => FONT_SETS.some((other) => other !== set && other.label === set.label);
  const known = FONT_SETS.filter((set) => counts.has(set.code)).map((set) => ({
    code: set.code,
    label: sharedLabel(set) ? `${set.label} (_${set.code})` : set.label,
    count: counts.get(set.code) ?? 0,
  }));
  const unknown = counts.get('unknown');
  return unknown === undefined ? known : [...known, { code: 'unknown', label: 'unknown', count: unknown }];
}

/** @brief The lowest and highest height among rows that have one. */
export function heightRange(rows: readonly FontRow[]): { readonly min: number; readonly max: number } {
  const heights = rows.map((row) => row.height).filter((height): height is number => height !== undefined);
  return heights.length === 0 ? { min: 0, max: 0 } : { min: Math.min(...heights), max: Math.max(...heights) };
}

/** @brief A row's facts as one line: `10 px · reduced (ASCII 32–127) · transparent`, unknowns said as such. */
export function factsLine(row: Pick<FontRow, 'height' | 'set' | 'box'>): string {
  return [
    row.height === undefined ? 'height unknown' : `${row.height} px`,
    row.set === undefined ? 'character set unknown' : row.set.label,
    row.box === undefined ? 'glyph box unknown' : row.box.label,
  ].join(' · ');
}

/**
 * @brief The `<builtin>` names a form declares, wherever in it they are.
 *
 * Read from the form, not the last run, so the picker's marks follow the text
 * as it is typed.
 *
 * @param model  The form, or undefined before the first read.
 */
export function declaredBuiltins(model: FormModel | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: FormNode): void => {
    if (node.element.id === 'font-builtin') {
      const name = node.fields.find((field) => field.attribute.name === 'name')?.value;
      if (name !== undefined && name !== '') names.add(name);
    }
    node.parts.forEach(visit);
    node.lists.forEach((list) => list.items.forEach(visit));
  };
  for (const section of model?.sections ?? []) {
    if (section.node !== undefined) visit(section.node);
    section.list?.items.forEach(visit);
  }
  return names;
}
