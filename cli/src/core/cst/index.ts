/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/index.ts
 * Purpose: The CST module's one entry point, so consumers (E-1b's parser, the
 *          designer) import from `core/cst/` rather than from its files. It is
 *          deliberately not re-exported from core/index.ts yet: the public
 *          surface is settled when the first consumer lands, not before.
 * Description: Re-exports only.
 *
 * Exports:
 * - parseCst(), CstParseResult:  Parse text into a lossless tree
 * - printCst():                  Reproduce the text from a tree
 * - LineIndex, LineColumn:       Offset → line/column lookup
 * - decodeEntities():            The CST's entity decoding rules
 * - Cst* node types, TextEdit:   The tree's shape (see cst-types.ts)
 */

export { parseCst, type CstParseResult } from './parse-cst.js';
export { printCst } from './print-cst.js';
export { LineIndex, type LineColumn } from './line-index.js';
export { decodeEntities } from './entities.js';
export type {
  CstAttribute,
  CstCdata,
  CstComment,
  CstContent,
  CstDocument,
  CstElement,
  CstInvalid,
  CstNode,
  CstProcessingInstruction,
  CstQuote,
  CstRange,
  CstText,
  CstWhitespace,
  CstXmlDeclaration,
  TextEdit,
} from './cst-types.js';
