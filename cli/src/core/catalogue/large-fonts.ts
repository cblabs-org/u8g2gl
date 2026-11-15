/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/large-fonts.ts
 * Purpose: Says which built-in U8G2 fonts are **large**: over 32 KB, and so
 *          compiled by U8G2 only where `U8G2_USE_LARGE_FONTS` is defined
 *          (`u8g2.h`). Their declarations are not gated, so a project naming
 *          one compiles everywhere and fails only at link time on a platform
 *          without the macro. The generator guards each use with an `#error`
 *          and the font picker marks them (§14.1); both read this module, so
 *          the two cannot disagree about which fonts are large.
 * Description: The set is data, never a hand-kept list ([D-14]):
 *              `src/node/font-symbol-builder.ts` reads it from the
 *              `#ifdef U8G2_USE_LARGE_FONTS` blocks of U8G2's `u8g2_fonts.c`,
 *              and the catalogue build writes it to
 *              `src/data/u8g2-large-fonts.json`. No Node imports, because the
 *              designer bundles it.
 *
 * Exports:
 * - LARGE_FONTS_MACRO:  The macro U8G2 gates its large fonts on
 * - LARGE_FONTS:        The large fonts, sorted
 * - isLargeFont():      Whether one built-in font is large
 */

import largeFontData from '../../data/u8g2-large-fonts.json' with { type: 'json' };

/** The macro U8G2 compiles its large fonts under (`u8g2.h`). */
export const LARGE_FONTS_MACRO = 'U8G2_USE_LARGE_FONTS';

/** Every large font U8G2 bundles, sorted by UTF-16 code unit. */
export const LARGE_FONTS: readonly string[] = largeFontData;

const LARGE_FONT_SET: ReadonlySet<string> = new Set(LARGE_FONTS);

/**
 * @brief Whether a built-in font is one U8G2 compiles only under
 *        `U8G2_USE_LARGE_FONTS`.
 *
 * @param name The font's U8G2 symbol, such as `u8g2_font_unifont_t_gb2312`.
 * @return True exactly for the names in `LARGE_FONTS`; false for any other
 *         string, including a name U8G2 does not bundle.
 */
export function isLargeFont(name: string): boolean {
  return LARGE_FONT_SET.has(name);
}
