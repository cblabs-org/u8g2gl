/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/font-facts.ts
 * Purpose: Says what a built-in U8G2 font's name promises — the box its glyphs
 *          are built in and which characters it carries — so a font picker can
 *          describe and filter 2039 fonts without loading any of them. The
 *          facts are decoded from U8G2's own naming scheme, never guessed: a
 *          suffix this table does not know is reported as unknown.
 * Description: U8G2's font build tool names every font
 *              `u8g2_font_<name>_<box><set>` (`gen_font()`, `build_font()` and
 *              `map_font()` in `extern/u8g2/tools/font/build/build.c`). The box
 *              is one of `t`, `h`, `m`, `8` (that file's `BM_T`, `BM_H`,
 *              `BM_M`, `BM_8`). The set is one of the five letters of its
 *              `MM_F`, `MM_R`, `MM_U`, `MM_N`, `MM_E` maps, or a font's own
 *              custom postfix (`map_custom_postfix`, the last column of its
 *              font table), usually `_<word>` and sometimes empty. The same
 *              scheme is the one U8G2's wiki documents beside its gallery,
 *              https://github.com/olikraus/u8g2/wiki/fntlistall, which the
 *              designer's picker links. Pure data and string matching: no
 *              Node imports, because the designer bundles it.
 *
 * Exports:
 * - FontBox, FontSet:        The decoded box and character set, each with a label
 * - FontFacts:               What fontFacts() returns
 * - FONT_BOXES:              The four glyph boxes, in U8G2's order
 * - FONT_SETS:               Every character set the table knows
 * - fontFacts():             Decode one built-in font's name
 */

/** How a font's glyphs are boxed: U8G2's build mode, the letter after the name. */
export interface FontBox {
  /** The letter in the name: `t`, `h`, `m` or `8`. */
  readonly code: 't' | 'h' | 'm' | '8';
  /** A short human label, such as "monospace". */
  readonly label: string;
  /** True when every glyph has the same advance width (`m` and `8`). */
  readonly monospace: boolean;
}

/** Which characters a font carries: U8G2's map mode, or a font's custom postfix. */
export interface FontSet {
  /**
   * The suffix that names it: a single letter (`f`, `r`, `u`, `n`, `e`) for
   * U8G2's five standard maps, the custom postfix without its underscore
   * (`cyrillic`, `all`) for a named custom map, or `''` for an unnamed one.
   */
  readonly code: string;
  /** A short human label, such as "reduced (ASCII 32–127)". */
  readonly label: string;
  /** True for U8G2's five standard maps, false for a font's own custom map. */
  readonly standard: boolean;
}

/** The facts a built-in font's name carries. */
export interface FontFacts {
  /** The glyph box, or undefined when the suffix is not one the table knows. */
  readonly box: FontBox | undefined;
  /** The character set, or undefined when the suffix is not one the table knows. */
  readonly set: FontSet | undefined;
}

/** The four glyph boxes, in `build_font()`'s order (`BM_T`, `BM_H`, `BM_M`, `BM_8`). */
export const FONT_BOXES: readonly FontBox[] = [
  { code: 't', label: 'transparent', monospace: false },
  { code: 'h', label: 'common height', monospace: false },
  { code: 'm', label: 'monospace', monospace: true },
  { code: '8', label: '8×8', monospace: true },
];

// The five standard maps, from the ranges `bdfconv()` passes for each map mode
// in build.c (`-m '32-255>32'` and so on). `n` is "32,42-58": the space,
// `*+,-./`, the digits and `:`, which is what a clock or a counter needs.
const STANDARD_SETS: readonly FontSet[] = [
  { code: 'f', label: 'full (32–255)', standard: true },
  { code: 'r', label: 'reduced (ASCII 32–127)', standard: true },
  { code: 'u', label: 'uppercase (32–95)', standard: true },
  { code: 'n', label: 'numbers (0–9, space and * + , - . / :)', standard: true },
  { code: 'e', label: 'extended (32–701, €, ℃, ℉)', standard: true },
];

// The custom postfixes whose meaning build.c's font table states, either as a
// script's map file (`japanese1.map`) or as ranges named for what they hold.
// Only names whose content is the same for every font that uses them are here:
// a bare number (`_1`, `_72_73`) means a different map file or Unicode block per
// font, so it is deliberately left out and decodes as unknown.
const CUSTOM_SETS: readonly FontSet[] = [
  { code: '', label: 'custom (this font’s own glyphs)', standard: false },
  { code: 'all', label: 'all glyphs in the source font', standard: false },
  { code: 'animals', label: 'animal icons', standard: false },
  { code: 'arabic', label: 'Arabic', standard: false },
  { code: 'bengali', label: 'Bengali', standard: false },
  { code: 'cards', label: 'playing cards', standard: false },
  { code: 'chinese1', label: 'Chinese (part 1)', standard: false },
  { code: 'chinese2', label: 'Chinese (part 2)', standard: false },
  { code: 'chinese3', label: 'Chinese (part 3)', standard: false },
  { code: 'cyrillic', label: 'Cyrillic', standard: false },
  { code: 'devanagari', label: 'Devanagari', standard: false },
  { code: 'domino', label: 'domino tiles', standard: false },
  { code: 'emoticons', label: 'emoticons', standard: false },
  { code: 'extended', label: 'extended Latin', standard: false },
  { code: 'gb2312', label: 'Chinese (GB 2312)', standard: false },
  { code: 'gb2312a', label: 'Chinese (GB 2312, part a)', standard: false },
  { code: 'gb2312b', label: 'Chinese (GB 2312, part b)', standard: false },
  { code: 'greek', label: 'Greek', standard: false },
  { code: 'hebrew', label: 'Hebrew', standard: false },
  { code: 'japanese1', label: 'Japanese (part 1)', standard: false },
  { code: 'japanese2', label: 'Japanese (part 2)', standard: false },
  { code: 'japanese3', label: 'Japanese (part 3)', standard: false },
  { code: 'korean1', label: 'Korean (part 1)', standard: false },
  { code: 'korean2', label: 'Korean (part 2)', standard: false },
  { code: 'latin', label: 'Latin', standard: false },
  { code: 'malayalam', label: 'Malayalam', standard: false },
  { code: 'polish', label: 'Polish', standard: false },
  { code: 'symbol', label: 'symbols', standard: false },
  { code: 'symbols', label: 'symbols', standard: false },
  { code: 'tibetan', label: 'Tibetan', standard: false },
  { code: 'urdu', label: 'Urdu', standard: false },
  { code: 'vietnamese1', label: 'Vietnamese (part 1)', standard: false },
  { code: 'vietnamese2', label: 'Vietnamese (part 2)', standard: false },
  { code: 'weather', label: 'weather icons', standard: false },
];

/** Every character set the table knows: the five standard maps, then the custom postfixes. */
export const FONT_SETS: readonly FontSet[] = [...STANDARD_SETS, ...CUSTOM_SETS];

const BOX_BY_CODE = new Map(FONT_BOXES.map((box) => [box.code as string, box]));
const STANDARD_BY_CODE = new Map(STANDARD_SETS.map((set) => [set.code, set]));
const CUSTOM_BY_CODE = new Map(CUSTOM_SETS.map((set) => [set.code, set]));

/** The prefix every U8G2 (not U8X8) font symbol carries (`gen_font()`'s `fms`). */
const U8G2_FONT_PREFIX = 'u8g2_font_';

// A standard suffix: the box letter and the map letter as one last token.
const STANDARD_SUFFIX = /_([thm8])([frune])$/;
// A custom suffix: the box letter as a token of its own, then the postfix.
const CUSTOM_SUFFIX = /_([thm8])(?:_([A-Za-z0-9]+))?$/;

/**
 * @brief Decode a built-in font's box and character set from its name.
 *
 * Reads only the last token or two of the name, as U8G2's build tool writes
 * them. A standard suffix (`_tr`, `_mf`) decodes both facts. A custom suffix
 * (`_t_cyrillic`, `_t`) decodes the box, and the set when its postfix is one
 * this table knows. Anything else — a bare-number postfix whose meaning differs
 * per font, or a name that is not a U8G2 font — gives undefined for both,
 * because a box read from a suffix whose shape is not understood would be a
 * guess.
 *
 * @param name  A font symbol such as `u8g2_font_helvR08_tr`.
 * @return The decoded facts. Never throws.
 */
export function fontFacts(name: string): FontFacts {
  // --- Step 1: Only U8G2 font symbols follow this scheme ---
  if (!name.startsWith(U8G2_FONT_PREFIX)) return { box: undefined, set: undefined };
  const tail = name.slice(U8G2_FONT_PREFIX.length);

  // --- Step 2: A standard suffix carries both facts in one token ---
  const standard = STANDARD_SUFFIX.exec(tail);
  if (standard) {
    return { box: BOX_BY_CODE.get(standard[1] ?? ''), set: STANDARD_BY_CODE.get(standard[2] ?? '') };
  }

  // --- Step 3: A custom suffix counts only when its postfix is known ---
  // Matched from the end, so a font name with its own short tokens
  // (`b10_b_t_japanese1`) still yields the box nearest the postfix.
  const custom = CUSTOM_SUFFIX.exec(tail);
  const set = custom ? CUSTOM_BY_CODE.get(custom[2] ?? '') : undefined;
  if (!custom || !set) return { box: undefined, set: undefined };
  return { box: BOX_BY_CODE.get(custom[1] ?? ''), set };
}
