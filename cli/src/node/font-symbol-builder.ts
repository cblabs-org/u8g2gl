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
 * Exports:
 * - parseFontSymbols(clibDir): Every font U8G2 declares and defines, sorted
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
