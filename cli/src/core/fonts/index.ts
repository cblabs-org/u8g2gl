/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/index.ts
 * Purpose: Barrel export for the font compiler — the public API, and the
 *          `<bdf range>` grammar the validator also uses.
 * Description: Re-exports compileBdf() and its types, and the range parser/translator.
 *              Deliberately does not re-export bdfconv-instance.ts or bdfconv-output.ts —
 *              those are internal to compileBdf() and nothing outside this directory
 *              should depend on their shape.
 *
 * Exports:
 * - compileBdf(), CompileBdfInput, CompiledFont, FontCompileFailure, CompileBdfResult
 * - parseBdfRange(), BdfRangeItem, BdfRangeResult, MAX_BDF_CODEPOINT
 */

export { compileBdf } from './compile-bdf.js';
export type { CompileBdfInput, CompiledFont, FontCompileFailure, CompileBdfResult } from './compile-bdf.js';
export { parseBdfRange, MAX_BDF_CODEPOINT } from './bdf-range.js';
export type { BdfRangeItem, BdfRangeResult } from './bdf-range.js';
