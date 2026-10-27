/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/index.ts
 * Purpose: The CST module's one entry point, so consumers (the parser, the
 *          designer) import from `core/cst/` rather than from its files. It is
 *          deliberately not re-exported from core/index.ts yet: the public
 *          surface is settled when the first consumer lands, not before.
 * Description: Re-exports only.
 *
 * Exports:
 * - parseCst(), CstParseResult:  Parse text into a lossless tree
 * - printCst():                  Reproduce the text from a tree
 * - LineIndex, LineColumn, BOM:  Offset → line/column lookup
 * - decodeEntities(), encodeAttributeValue():  The CST's entity rules
 * - replaceAttributeValue(), insertAttribute(), removeAttribute(),
 *   insertElement(), removeElement(), renameElementTag():
 *                                Editing intents as minimal TextEdits
 * - applyEdits():                Land TextEdits on a string
 * - Cst* node types, TextEdit:   The tree's shape (see cst-types.ts)
 */

export { parseCst, type CstParseResult } from './parse-cst.js';
export { printCst } from './print-cst.js';
export { BOM, LineIndex, type LineColumn } from './line-index.js';
export { decodeEntities, encodeAttributeValue } from './entities.js';
export {
  insertAttribute,
  insertElement,
  removeAttribute,
  removeElement,
  renameElementTag,
  replaceAttributeValue,
} from './edits.js';
export { applyEdits } from './apply-edits.js';
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
