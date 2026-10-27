/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/print-cst.ts
 * Purpose: Turns a CST back into text, and in doing so proves the tree is
 *          lossless. The designer's edits are only trustworthy if parse-then-
 *          print is the identity on every file, so this is the function the
 *          round-trip tests ([UD-3]) exercise.
 * Description: Prints each node from its own range only — an element as its
 *              open tag, then its children, then its close tag; a document as
 *              its BOM then its children. It never copies the gap between two
 *              nodes, so a byte the parser failed to place in the tree is
 *              missing from the output and the round-trip test fails, rather
 *              than being silently patched over.
 *
 * Exports:
 * - printCst(): Reproduce the source text from a CST
 */

import type { CstContent, CstDocument, CstElement } from './cst-types.js';
import { BOM } from './line-index.js';

/**
 * Reproduce the text a CST was parsed from.
 * `printCst(parseCst(t).cst) === t` for every string `t`, malformed or not.
 */
export function printCst(cst: CstDocument): string {
  const out: string[] = cst.bom ? [BOM] : [];
  for (const child of cst.children) {
    printContent(cst.text, child, out);
  }
  return out.join('');
}

// printContent
// Appends one content node's text to `out`.
//   text — the document's source; every node's bytes are a slice of it
function printContent(text: string, node: CstContent, out: string[]): void {
  if (node.kind === 'element') {
    printElement(text, node, out);
  } else {
    out.push(text.slice(node.start, node.end));
  }
}

// printElement
// Open tag, children, close tag — the three parts an element owns. Bytes
// between them belong to a child or to nothing, and nothing is a parser bug.
function printElement(text: string, element: CstElement, out: string[]): void {
  out.push(text.slice(element.openTag.start, element.openTag.end));
  for (const child of element.children) {
    printContent(text, child, out);
  }
  if (element.closeTag) {
    out.push(text.slice(element.closeTag.start, element.closeTag.end));
  }
}
