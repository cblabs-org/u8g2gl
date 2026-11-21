/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-glyph-ranges.ts
 * Purpose: Pass 10, the glyph-range warning (§14.1): a `<bdf>` compiled with a
 *          `range` holds only the glyphs it names, and U8G2 draws nothing for
 *          a character its font lacks — silently, on the device. Static text
 *          that uses such a character is therefore a defect design time can
 *          see, and this pass reports it before the board does.
 * Description: Reads the project's static text by font (`static-text.ts`, the
 *              same reading the designer's range presets derive from) and, for
 *              each piece whose font is a `<bdf>` with a parsable `range`,
 *              names the characters outside it. A warning, not an error: the
 *              author may mean it, and it changes no generated output. Built-in
 *              fonts are left alone, since their glyph sets are fixed by U8G2
 *              and are not guessed here; an unranged `<bdf>` holds every glyph
 *              of its file; a `range` that does not parse is Pass 1's
 *              (`U8G2GL_MALFORMED_BDF_RANGE`).
 *
 * Exports:
 * - validateGlyphRanges(): One warning per piece of text with a glyph its font's range leaves out
 */

import { parseBdfRange, type BdfRangeItem } from '../fonts/bdf-range.js';
import { staticTexts } from '../fonts/static-text.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { ValidateInput } from './validate.js';

/** The most missing characters a message lists before it says how many more. */
const LISTED = 8;

// describe
// A codepoint as the message shows it: the character and its U+ code.
function describe(codepoint: number): string {
  const hex = codepoint.toString(16).toUpperCase().padStart(4, '0');
  return codepoint >= 0x21 && codepoint !== 0x7f ? `'${String.fromCodePoint(codepoint)}' (U+${hex})` : `U+${hex}`;
}

// inRange
// Whether a codepoint is one of a parsed range's items.
function inRange(codepoint: number, items: readonly BdfRangeItem[]): boolean {
  return items.some((item) => codepoint >= item.lo && codepoint <= item.hi);
}

/**
 * @brief Pass 10: static text using a glyph outside its `<bdf>` font's `range`.
 *
 * @param input The project, globals, screens and manifests.
 * @return One `U8G2GL_GLYPH_OUTSIDE_RANGE` warning per piece of text with such
 *         a glyph, at the attribute it is written in.
 */
export function validateGlyphRanges(input: ValidateInput): Diagnostic[] {
  // --- Step 1: Each ranged <bdf>, its range parsed once ---
  const ranges = new Map<string, { readonly range: string; readonly items: readonly BdfRangeItem[] }>();
  for (const font of input.globals.fonts ?? []) {
    if (font.kind !== 'bdf' || font.range === undefined) continue;
    const parsed = parseBdfRange(font.range);
    if (parsed.ok) ranges.set(font.name, { range: font.range, items: parsed.items });
  }
  if (ranges.size === 0) return [];

  // --- Step 2: Each piece of static text in one, against its range ---
  const diagnostics: Diagnostic[] = [];
  for (const text of staticTexts(input.screens, input.globals, input.manifests)) {
    const ranged = text.font === undefined ? undefined : ranges.get(text.font);
    if (ranged === undefined) continue;
    const missing = [...new Set([...text.text].map((char) => char.codePointAt(0) ?? 0))].filter((code) => !inRange(code, ranged.items));
    if (missing.length === 0) continue;
    const loc = text.loc ?? text.element.loc;
    const name = typeof text.element.attributes.name === 'string' ? text.element.attributes.name : `<${text.element.tag}>`;
    const listed = missing.slice(0, LISTED).map(describe).join(', ');
    const more = missing.length > LISTED ? ` and ${missing.length - LISTED} more` : '';
    diagnostics.push({
      code: DIAGNOSTIC_CODES.GLYPH_OUTSIDE_RANGE,
      severity: 'warning',
      file: loc?.file ?? text.screen.loc?.file ?? '',
      line: loc?.line ?? 1,
      column: loc?.column ?? 1,
      message:
        `${name}.${text.attribute} uses ${listed}${more}, which font '${text.font}' leaves out of its range ` +
        `'${ranged.range}', so U8G2 draws nothing there. Widen the range, or use a font that has ` +
        `${missing.length === 1 ? 'it' : 'them'}.`,
      offendingText: text.text,
    });
  }
  return diagnostics;
}
