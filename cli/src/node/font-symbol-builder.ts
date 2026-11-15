/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/font-symbol-builder.ts
 * Purpose: Derives the set of fonts U8G2 bundles from U8G2's own source, so a
 *          `<builtin>` font name (§14.1) can be checked against it — the way
 *          [D-14] derives the display catalogue, never a hand-kept list. A
 *          `<builtin>` name is aliased verbatim (`ui_font_<name> = <name>`), so
 *          until PR-04 WO11b a typo surfaced only as an error in the user's
 *          firmware build (WO9 finding 5).
 * Description: A bundled font is a symbol generated code must both **compile**
 *              against and **link** to, so it is read from both places U8G2
 *              states it, and the two are required to agree:
 *              - `u8g2.h` declares each one, as
 *                `extern const uint8_t u8g2_font_<name>[] U8G2_FONT_SECTION(...)`;
 *              - `u8g2_fonts.c` defines each one, as
 *                `const uint8_t u8g2_font_<name>[<size>] U8G2_FONT_SECTION(...) =`
 *                (or `U8X8_FONT_SECTION`, which 2.36.18 uses for some).
 *              A disagreement means the tree is not a U8G2 release the builder
 *              understands, and it throws rather than writing a set that would
 *              accept a name the linker then rejects. Names are sorted by UTF-16
 *              code unit, so an unchanged U8G2 commit rebuilds byte-identically.
 *              The legacy `u8g_font_*` macros `u8g2.h` also defines are aliases,
 *              not symbols U8G2 bundles, and are not included.
 *
 *              The same file also says which fonts are **large**: U8G2 wraps the
 *              definition of every font over 32 KB in
 *              `#ifdef U8G2_USE_LARGE_FONTS` … `#endif`, a macro `u8g2.h` defines
 *              only on some platforms, while their declarations stay ungated. A
 *              project naming one therefore compiles everywhere and fails only at
 *              link time where the macro is missing. The generator guards each
 *              use with an `#error` (§14.1), so the set is read from those blocks
 *              here rather than listed by hand.
 *
 * Exports:
 * - parseFontSymbols(clibDir):       Every font U8G2 declares and defines, sorted
 * - findLargeFonts(source, fonts):   The fonts defined under U8G2_USE_LARGE_FONTS
 *                                    in a `u8g2_fonts.c` text, sorted
 * - parseLargeFonts(clibDir, fonts): The same, read from a U8G2 tree
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareCodeUnits } from '../core/order.js';

/**
 * A font's declaration in `u8g2.h`, and its definition in `u8g2_fonts.c`. The
 * section macro is `U8G2_FONT_SECTION` or, for some fonts in 2.36.18,
 * `U8X8_FONT_SECTION`; which one does not change what the symbol is.
 */
const DECLARATION = /^extern const uint8_t (u8g2_font_[A-Za-z0-9_]+)\[\] U8(?:G2|X8)_FONT_SECTION\(/gm;
const DEFINITION = /^const uint8_t (u8g2_font_[A-Za-z0-9_]+)\[\d+\] U8(?:G2|X8)_FONT_SECTION\(/gm;

/** One font definition, as a single line (the non-global form of DEFINITION). */
const DEFINITION_LINE = /^const uint8_t (u8g2_font_[A-Za-z0-9_]+)\[\d+\] U8(?:G2|X8)_FONT_SECTION\(/;

/** The macro U8G2 gates its large fonts on (`u8g2.h`). */
const LARGE_FONTS_MACRO = 'U8G2_USE_LARGE_FONTS';

/** A preprocessor directive: its keyword and the rest of the line. */
const DIRECTIVE = /^[ \t]*#[ \t]*([A-Za-z]+)(.*)$/;

/** The directives that open, continue or close a conditional block. */
const CONDITIONALS: ReadonlySet<string> = new Set(['if', 'ifdef', 'ifndef', 'elif', 'elifdef', 'elifndef', 'else', 'endif']);

// matchesOf
// Every first capture of a global pattern, in order.
function matchesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

/**
 * @brief Every font U8G2 bundles: declared in `u8g2.h` and defined in
 *        `u8g2_fonts.c`.
 *
 * @param clibDir The directory holding U8G2's C sources — `csrc` in the git
 *                repository, `src/clib` in the Arduino release
 *                (`resolveU8g2Layout().clibDir`).
 * @return The font symbols, unique and sorted.
 * @throws Error if either file declares none, names one twice, or the two
 *         disagree — a build-script precondition, not a user diagnostic.
 */
export function parseFontSymbols(clibDir: string): string[] {
  // --- Step 1: Read both statements of the set ---
  const declared = matchesOf(readFileSync(join(clibDir, 'u8g2.h'), 'utf8'), DECLARATION);
  const defined = matchesOf(readFileSync(join(clibDir, 'u8g2_fonts.c'), 'latin1'), DEFINITION);
  if (declared.length === 0 || defined.length === 0) {
    throw new Error(
      `Found ${declared.length} font declarations in u8g2.h and ${defined.length} definitions in ` +
        `u8g2_fonts.c under ${clibDir}; refusing to write an empty font list.`,
    );
  }

  // --- Step 2: Each is unique, and the two agree exactly ---
  const declaredSet = new Set(declared);
  const definedSet = new Set(defined);
  if (declaredSet.size !== declared.length || definedSet.size !== defined.length) {
    throw new Error(`A U8G2 font is declared or defined twice under ${clibDir}.`);
  }
  const undefinedFonts = declared.filter((name) => !definedSet.has(name));
  const undeclaredFonts = defined.filter((name) => !declaredSet.has(name));
  if (undefinedFonts.length > 0 || undeclaredFonts.length > 0) {
    throw new Error(
      `u8g2.h and u8g2_fonts.c disagree under ${clibDir}: declared but not defined ` +
        `[${undefinedFonts.slice(0, 5).join(', ')}], defined but not declared ` +
        `[${undeclaredFonts.slice(0, 5).join(', ')}].`,
    );
  }

  // --- Step 3: A deterministic order ---
  // core/order.ts's compareCodeUnits, never locale: §13.9 (see that module).
  return [...declaredSet].sort(compareCodeUnits);
}

/**
 * @brief The fonts a `u8g2_fonts.c` text defines inside an
 *        `#ifdef U8G2_USE_LARGE_FONTS` … `#endif` block.
 *
 * Reads the blocks as U8G2 writes them: each opens with exactly
 * `#ifdef U8G2_USE_LARGE_FONTS`, holds one or more font definitions, and closes
 * with `#endif`. Anything else the builder does not understand is refused
 * rather than guessed at, because a misread block would put a font on the
 * wrong side of the generated `#error`.
 *
 * @param source The text of `u8g2_fonts.c`, read as Latin-1.
 * @param fonts  Every font U8G2 bundles (`parseFontSymbols()`).
 * @return The large fonts, unique and sorted.
 * @throws Error on any other conditional directive, a nested or unterminated
 *         block, an `#endif` with no block open, a block that defines no font,
 *         or a large font missing from `fonts` — a build-script precondition,
 *         not a user diagnostic.
 */
export function findLargeFonts(source: string, fonts: readonly string[]): string[] {
  const large: string[] = [];
  // The line the open block started on (1-based), or 0 outside a block.
  let openedAt = 0;
  let definedInBlock = 0;
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    // --- Step 1: Inside a block, collect each font it defines ---
    // Only a line starting `const uint8_t` can be a definition; the far more
    // numerous string-literal lines are skipped without running a pattern.
    if (line.startsWith('const uint8_t ')) {
      const name = DEFINITION_LINE.exec(line)?.[1];
      if (name !== undefined && openedAt > 0) {
        large.push(name);
        definedInBlock += 1;
      }
      continue;
    }
    if (!line.includes('#')) continue;

    // --- Step 2: Track the blocks, refusing any shape U8G2 does not write ---
    const directive = DIRECTIVE.exec(line);
    const keyword = directive?.[1];
    if (keyword === undefined || !CONDITIONALS.has(keyword)) continue;
    const argument = (directive?.[2] ?? '').trim();
    if (keyword === 'ifdef' && argument === LARGE_FONTS_MACRO) {
      if (openedAt > 0) {
        throw new Error(`u8g2_fonts.c line ${lineNumber}: a ${LARGE_FONTS_MACRO} block nested in the one opened at line ${openedAt}.`);
      }
      openedAt = lineNumber;
      definedInBlock = 0;
    } else if (keyword === 'endif' && openedAt > 0) {
      if (definedInBlock === 0) {
        throw new Error(`u8g2_fonts.c line ${openedAt}: a ${LARGE_FONTS_MACRO} block that defines no font.`);
      }
      openedAt = 0;
    } else {
      throw new Error(
        `u8g2_fonts.c line ${lineNumber}: unexpected #${keyword}${argument === '' ? '' : ` ${argument}`}; ` +
          `only #ifdef ${LARGE_FONTS_MACRO} … #endif blocks are understood.`,
      );
    }
  }

  // --- Step 3: Every block closed, every large font one U8G2 bundles ---
  if (openedAt > 0) {
    throw new Error(`u8g2_fonts.c line ${openedAt}: a ${LARGE_FONTS_MACRO} block with no #endif.`);
  }
  const known = new Set(fonts);
  const unknown = large.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(`Large fonts missing from the font list: [${unknown.slice(0, 5).join(', ')}].`);
  }
  const unique = new Set(large);
  if (unique.size !== large.length) {
    throw new Error('A large font is defined twice in u8g2_fonts.c.');
  }
  return [...unique].sort(compareCodeUnits);
}

/**
 * @brief The fonts U8G2 compiles only where `U8G2_USE_LARGE_FONTS` is defined.
 *
 * @param clibDir As for parseFontSymbols().
 * @param fonts   Every font U8G2 bundles (`parseFontSymbols(clibDir)`).
 * @return The large fonts, unique and sorted.
 * @throws Error as findLargeFonts() does.
 */
export function parseLargeFonts(clibDir: string, fonts: readonly string[]): string[] {
  return findLargeFonts(readFileSync(join(clibDir, 'u8g2_fonts.c'), 'latin1'), fonts);
}
