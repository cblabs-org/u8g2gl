/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/images/index.ts
 * Purpose: Public entry for image handling: the one image model (`XbmImage`),
 *          the `<xbm>` parser, and the PNG decoder and `<convert>` conversion.
 *          Also the bundle root the browser-parity test builds.
 * Description: Re-exports; no logic.
 *
 * Exports:
 * - parseXbm, XbmImage, XbmParseError (xbm.ts)
 * - decodePng, DecodedPng, PngDecodeError (png-decode.ts)
 * - convertDeclProblems, CONVERT_MODES, ConvertDeclProblem (convert-decl.ts)
 * - convertPng, rgbaToXbm, DEFAULT_THRESHOLD, ConvertMode, ConvertOptions,
 *   ConvertFailure (png-to-xbm.ts)
 */

export { parseXbm } from './xbm.js';
export type { XbmImage, XbmParseError } from './xbm.js';
export { decodePng } from './png-decode.js';
export type { DecodedPng, PngDecodeError } from './png-decode.js';
export { convertPng, rgbaToXbm, DEFAULT_THRESHOLD } from './png-to-xbm.js';
export type { ConvertFailure, ConvertMode, ConvertOptions } from './png-to-xbm.js';
export { convertDeclProblems, CONVERT_MODES } from './convert-decl.js';
export type { ConvertDeclProblem, ConvertDeclShape } from './convert-decl.js';
