/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/assets/index.ts
 * Purpose: Barrel export for the project asset compile step:
 *          the one asynchronous function both hosts call before `generate()`.
 * Description: Re-exports compileProjectAssets() and its types.
 *
 * Exports:
 * - compileProjectAssets(), CompileProjectAssetsInput, CompileProjectAssetsResult
 */

export { compileProjectAssets } from './compile-project-assets.js';
export type { CompileProjectAssetsInput, CompileProjectAssetsResult } from './compile-project-assets.js';
