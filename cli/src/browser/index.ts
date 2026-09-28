/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/browser/index.ts
 * Purpose: Browser-specific integration layer for U8G2GL designer and tools.
 * Description: Re-exports the font compiler, the image decoder and converter,
 *              and the project asset compile step, which are isomorphic but whose
 *              primary browser-side caller is the designer, so all are reachable from
 *              here without importing all of ../core/index.js. Otherwise a stub
 *              barrel for browser-only functionality such as File System Access
 *              API integration and Web Worker bridges, not yet implemented.
 *
 * Exports:
 * - compileBdf(), CompileBdfInput, CompiledFont, FontCompileFailure, CompileBdfResult,
 *   parseBdfRange(), BdfRangeItem, BdfRangeResult, MAX_BDF_CODEPOINT — from ../core/fonts/index.js
 * - parseXbm(), decodePng(), convertPng(), rgbaToXbm(), XbmImage and friends —
 *   from ../core/images/index.js
 * - compileProjectAssets(), CompileProjectAssetsInput, CompileProjectAssetsResult —
 *   from ../core/assets/index.js
 */

export * from '../core/fonts/index.js';
export * from '../core/images/index.js';
export * from '../core/assets/index.js';
