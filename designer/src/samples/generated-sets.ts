/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/generated-sets.ts
 * Purpose: Sample sets made from the project's declarations (ruling 8), so an
 *          author need not type the cases a layout must survive. Capacities,
 *          repeats and `max_len`s are declared, so the emptiest and the fullest
 *          data a screen can be given are known; these make them, as ordinary
 *          set documents the author can edit afterwards.
 * Description: Three kinds, and the four conventional sets built from them:
 *              - **empty:** every collection with no rows, every subject at
 *                its emptiest (empty strings, numbers at a valid value);
 *              - **one:** a single row per collection, each string its field's
 *                name, so the row can be seen;
 *              - **full, longest:** every collection at capacity, every
 *                repeated field at its repeat, every string at its `max_len`,
 *                made of the printable ASCII glyph with the largest advance in
 *                the font that draws it, which the real renderer measures
 *                (`measureText`, the bridge's).
 *              A number takes `min`, else 0 within its bounds; an enum its
 *              first value; a bool false.
 *
 *              The conventional sets (Q3a, ui_spec §11): **typical** (the
 *              initial values written out, and one row per collection),
 *              **empty**, **longest-plausible** (a copy of typical, for the
 *              author to lengthen) and **worst-case** (*full, longest*). They
 *              are named for files a shell needs no quoting for.
 *
 *              A width that cannot be measured — no editor Wasm yet, a font
 *              not loaded, an element whose font comes from a style — falls
 *              back to `W`, the widest glyph of most Latin fonts, and the
 *              result says so.
 *
 * Exports:
 * - GeneratedKind:         empty, one or full
 * - TextMeasure:           A string's width in a font, or undefined
 * - CONVENTIONAL_SETS:     The four conventional sets' names, in order
 * - FALLBACK_GLYPH:        The glyph used when no width can be measured
 * - widestGlyph():         A font's printable ASCII glyph with the largest advance
 * - generateSampleSet():   One generated set
 * - conventionalSets():    The four conventional sets
 */

import { defaultCell } from './grid-rules';
import { SAMPLE_SET_VERSION, type SampleCell, type SampleRow, type SampleScalar, type SampleSetDocument } from './sample-set';
import type { SampleBlock, SampleField, SampleShape, SampleSubject } from './sample-shape';

/** Which generated set. */
export type GeneratedKind = 'empty' | 'one' | 'full';

/** A string's width in pixels in a font, as the renderer measures it; undefined when it cannot. */
export type TextMeasure = (font: string, text: string) => number | undefined;

/** The conventional sets, in the order they are offered. */
export const CONVENTIONAL_SETS = ['typical', 'empty', 'longest-plausible', 'worst-case'] as const;

/** The glyph a string is made of when no font's widths can be measured. */
export const FALLBACK_GLYPH = 'W';

/** The runtime's string capacity for a subject that declares no `max_len` (`U8G2GL_MAX_STRING_LEN`). */
const DEFAULT_STRING_LEN = 32;

/** How many rows *full* gives a collection that declares no capacity. */
const UNBOUNDED_ROWS = 1;

/**
 * @brief A font's printable ASCII glyph (`!` to `~`) with the largest advance.
 *
 * An advance is measured as `width("cc") − width("c")`, because U8G2 counts a
 * string's last glyph by its ink rather than its advance. A tie goes to the
 * wider glyph alone, then to `W` if it is among them (in a monospaced font
 * every glyph ties, and a row of `W`s reads as the worst case it is), then to
 * the lower code, so the choice is deterministic.
 * Space is left out: it has an advance but draws nothing, so a string of
 * spaces would show no worst case at all.
 *
 * @return The glyph, or undefined when the font cannot be measured.
 */
export function widestGlyph(font: string, measure: TextMeasure): string | undefined {
  const measured: { glyph: string; advance: number; width: number }[] = [];
  for (let code = 0x21; code <= 0x7e; code++) {
    const glyph = String.fromCharCode(code);
    const one = measure(font, glyph);
    const two = measure(font, glyph + glyph);
    if (one === undefined || two === undefined) return undefined;
    measured.push({ glyph, advance: two - one, width: one });
  }
  const advance = Math.max(...measured.map((m) => m.advance));
  const widest = measured.filter((m) => m.advance === advance);
  const width = Math.max(...widest.map((m) => m.width));
  const best = widest.filter((m) => m.width === width);
  return (best.find((m) => m.glyph === FALLBACK_GLYPH) ?? best[0])?.glyph;
}

/**
 * @brief One generated set's document.
 *
 * @param kind    empty, one or full.
 * @param shape   The project's subjects and collection instances.
 * @param measure The renderer's text width, for *full*'s widest glyph.
 * @return The document, and the fonts whose widths could not be measured.
 */
export function generateSampleSet(kind: GeneratedKind, shape: SampleShape, measure: TextMeasure): { readonly document: SampleSetDocument; readonly unmeasured: readonly string[] } {
  // --- Step 1: The widest glyph per font, measured once each ---
  const unmeasured: string[] = [];
  const glyphs = new Map<string, string>();
  const glyphFor = (fonts: readonly (string | undefined)[]): string => {
    let chosen: string | undefined;
    for (const font of fonts) {
      if (font === undefined) continue;
      if (!glyphs.has(font)) {
        const glyph = widestGlyph(font, measure);
        if (glyph === undefined) {
          if (!unmeasured.includes(font)) unmeasured.push(font);
        } else {
          glyphs.set(font, glyph);
        }
      }
      const found = glyphs.get(font);
      // Several fonts draw it: the glyph that is widest in its own font, the
      // first font's when they agree.
      if (found !== undefined && chosen === undefined) chosen = found;
    }
    return chosen ?? FALLBACK_GLYPH;
  };

  // --- Step 2: The subjects ---
  const values: Record<string, SampleScalar> = {};
  if (kind !== 'one') {
    for (const subject of shape.subjects) values[subject.name] = subjectValue(subject, kind, () => glyphFor(subject.fonts));
  }

  // --- Step 3: The collections, by screen file and element ---
  const rows: Record<string, Record<string, SampleRow[]>> = {};
  for (const collection of shape.collections) {
    const block = collection.blocks[0];
    if (block === undefined || collection.blocks.length > 1) continue;
    const count = kind === 'empty' ? 0 : kind === 'one' ? 1 : (block.capacity ?? UNBOUNDED_ROWS);
    const glyph = kind === 'full' ? glyphFor([collection.font]) : FALLBACK_GLYPH;
    const byElement = rows[collection.file] ?? {};
    byElement[collection.element] = Array.from({ length: count }, () => generatedRow(block, kind, glyph));
    rows[collection.file] = byElement;
  }
  return { document: { u8g2gl_samples: SAMPLE_SET_VERSION, values, rows }, unmeasured };
}

/**
 * @brief The four conventional sets, by name in offer order.
 *
 * @param shape   The project's subjects and collections.
 * @param measure The renderer's text width.
 */
export function conventionalSets(shape: SampleShape, measure: TextMeasure): { readonly sets: ReadonlyMap<string, SampleSetDocument>; readonly unmeasured: readonly string[] } {
  // typical: the initial values written out, so a set can be edited from
  // them, and one row per collection so the widgets show something.
  const one = generateSampleSet('one', shape, measure).document;
  const values: Record<string, SampleScalar> = {};
  for (const subject of shape.subjects) {
    const initial = initialValue(subject);
    if (initial !== undefined) values[subject.name] = initial;
  }
  const typical: SampleSetDocument = { ...one, values };
  const empty = generateSampleSet('empty', shape, measure).document;
  const full = generateSampleSet('full', shape, measure);
  return {
    sets: new Map<string, SampleSetDocument>([
      ['typical', typical],
      ['empty', empty],
      ['longest-plausible', structuredClone(typical)],
      ['worst-case', full.document],
    ]),
    unmeasured: full.unmeasured,
  };
}

// subjectValue
// A subject's value in an empty or full set: a string empty, or at its
// max_len of the widest glyph; a number at 0; a bool false.
//   subject — the subject
//   kind    — empty or full
//   glyph   — the widest glyph of the fonts drawing it, asked for only when needed
function subjectValue(subject: SampleSubject, kind: GeneratedKind, glyph: () => string): SampleScalar {
  switch (subject.type) {
    case 'string':
      return kind === 'full' ? glyph().repeat(subject.maxLen ?? DEFAULT_STRING_LEN) : '';
    case 'bool':
      return false;
    default:
      return 0;
  }
}

// generatedRow
// One row of a generated set: each field's default, its strings the field's
// name (one) or its max_len of the widest glyph (full), a repeated field at
// its repeat in full.
//   block — the collection's <data>
//   kind  — which set
//   glyph — full's widest glyph for the collection's font
function generatedRow(block: SampleBlock, kind: GeneratedKind, glyph: string): SampleRow {
  const row: Record<string, SampleCell> = {};
  for (const field of block.fields) {
    if (field.type !== 'string') {
      row[field.name] = defaultCell(field);
      continue;
    }
    const text = kind === 'full' ? glyph.repeat(field.maxLen ?? DEFAULT_STRING_LEN) : nameText(field);
    row[field.name] = field.repeated ? Array.from({ length: kind === 'full' ? (field.repeat ?? 1) : Math.min(field.repeat ?? 1, 1) }, () => text) : text;
  }
  return row;
}

// nameText
// A field's name, cut to its max_len: a string the author can recognise.
function nameText(field: SampleField): string {
  return field.maxLen === undefined ? field.name : [...field.name].slice(0, field.maxLen).join('');
}

// initialValue
// A subject's initial value as a set's JSON value; undefined when none is declared.
function initialValue(subject: SampleSubject): SampleScalar | undefined {
  if (subject.initial === undefined) return undefined;
  if (subject.type === 'bool') return subject.initial === 'true';
  if (subject.type === 'string') return subject.initial;
  const number = Number(subject.initial);
  return Number.isInteger(number) ? number : undefined;
}
