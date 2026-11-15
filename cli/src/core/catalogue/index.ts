/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/index.ts
 * Purpose: Public entry point for the isomorphic U8G2 display catalogue query API (§5.2).
 * Description: Re-exports Levenshtein distance matching, the four catalogue query
 *              modes (identify, source, compare, enumerate), the board-side
 *              constructor snippet a record's wiring implies, the facts a
 *              built-in font's name carries, and which built-in fonts are large.
 *
 * Exports:
 * - editDistance, findClosest from ./edit-distance.js
 * - identifyDisplay, sourceDisplay, compareDisplays, enumerateDisplays from ./query.js
 * - All query parameter and result interfaces
 * - PIN_PLACEHOLDER, pinMacro, constructorSnippet from ./snippet.js
 * - fontFacts, FONT_BOXES, FONT_SETS and their types from ./font-facts.js
 * - LARGE_FONTS_MACRO, LARGE_FONTS, isLargeFont from ./large-fonts.js
 */

export * from './edit-distance.js';
export * from './query.js';
export * from './snippet.js';
export * from './font-facts.js';
export * from './large-fonts.js';
