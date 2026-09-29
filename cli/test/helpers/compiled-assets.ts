/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/compiled-assets.ts
 * Purpose: Lets a synchronous test hand `generate()` the result the asset step
 *          would have produced for a few `<xbm>` images, without awaiting the
 *          real step — an XBM parse is synchronous, so there is nothing to wait
 *          for, and a test that only wants an image to exist should not become
 *          asynchronous to say so.
 * Description: Builds a `CompileProjectAssetsResult` holding the given XBM
 *              texts, parsed by the same `parseXbm()` the real step calls.
 *
 * Exports:
 * - xbmCompiledAssets(images): A compiled-assets result with those images
 */

import type { CompileProjectAssetsResult } from '../../src/core/assets/index.js';
import { parseXbm, type XbmImage } from '../../src/core/images/index.js';

/**
 * @brief The asset step's result for a project whose only assets are XBM texts.
 *
 * @param images XBM file text by declared image name.
 * @return No fonts, those images, no diagnostics, nothing failed. Throws if a
 *         text is not valid XBM — a test defect, not a project one.
 */
export function xbmCompiledAssets(images: Readonly<Record<string, string>>): CompileProjectAssetsResult {
  const parsed = new Map<string, XbmImage>();
  for (const [name, text] of Object.entries(images)) {
    const image = parseXbm(text);
    if ('reason' in image) {
      throw new Error(`test XBM '${name}' is not valid: ${image.reason}`);
    }
    parsed.set(name, image);
  }
  return { fonts: new Map(), images: parsed, diagnostics: [], failedFonts: new Set(), failedImages: new Set() };
}
