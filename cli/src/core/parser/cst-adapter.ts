/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/cst-adapter.ts
 * Purpose: Gives the parser and the designer one XML reader. The designer
 *          edits through the concrete syntax tree (core/cst/), and the parsers
 *          here read the simpler RawXmlDocument; this module derives the second
 *          from the first, so a range the designer holds and a location a
 *          diagnostic reports come from the same scan of the same text.
 * Description: `parseCst`, then one walk that keeps what the parsers consume —
 *              elements, attributes, text, comments — and drops the trivia the
 *              CST keeps for losslessness. Every location is derived from a CST
 *              offset through the document's LineIndex, and the offsets
 *              themselves are kept beside it as ranges.
 *
 *              The walk builds the raw tree with these rules, on which consumers
 *              and tests depend:
 *              - values, text and comments have CR and CRLF folded to LF before
 *                entity decoding, so a `&#13;` reference still yields a CR;
 *              - an element's text is the decoded character data of its
 *                content, concatenated across child elements and comments, then
 *                trimmed, and absent when that leaves nothing;
 *              - comments are collected per element; those outside the root and
 *                processing instructions anywhere are dropped;
 *              - a `<` with no tag name, which the CST keeps as an invalid
 *                node, yields no element.
 *              CDATA content joins the element's text undecoded.
 *
 * Exports:
 * - tokenizeXml():        Parse XML text into a RawXmlDocument; never throws
 * - decodeXmlEntities():  Replace predefined and numeric entity references
 * - rootElementName():    The tag of a document's root element
 */

import { decodeEntities, parseCst, type CstAttribute, type CstElement, type LineIndex } from '../cst/index.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { RawXmlAttribute, RawXmlDocument, RawXmlElement } from './raw-xml.js';

/**
 * Decode the five predefined XML entities and decimal or hexadecimal character
 * references; an unrecognised reference, or one beyond U+10FFFF, is left as
 * written. The rule the parser applies to every attribute value and text.
 */
export const decodeXmlEntities: (str: string) => string = decodeEntities;

/** What every location in one conversion shares. */
interface AdapterContext {
  readonly file: string;
  readonly lines: LineIndex;
}

// locate
// The 1-based location of a source offset, in the context's file.
function locate(ctx: AdapterContext, offset: number): SourceLocation {
  const { line, column } = ctx.lines.locate(offset);
  return { file: ctx.file, line, column };
}

// foldNewlines
// CR LF and a lone CR become LF. Checked first because almost no text has a
// CR, and the conversion is on every parse's path.
function foldNewlines(raw: string): string {
  return raw.includes('\r') ? raw.replace(/\r\n?/g, '\n') : raw;
}

// decodeFolded
// Entity-decode after folding newlines; `decoded` is the CST's own decoding of
// the unfolded text, which is the answer whenever there was nothing to fold.
function decodeFolded(raw: string, decoded: string): string {
  return raw.includes('\r') ? decodeEntities(foldNewlines(raw)) : decoded;
}

// toRawAttribute
// One CST attribute as the parsers read it: the value newline-folded and
// decoded, the locations derived from its ranges, the ranges kept.
function toRawAttribute(ctx: AdapterContext, attr: CstAttribute): RawXmlAttribute {
  return {
    name: attr.name,
    value: decodeFolded(attr.rawValue, attr.value),
    loc: locate(ctx, attr.valueRange.start),
    nameLoc: locate(ctx, attr.nameRange.start),
    nameRange: attr.nameRange,
    valueRange: attr.valueRange,
  };
}

// toRawElement
// One CST element and its subtree as the parsers read it.
function toRawElement(ctx: AdapterContext, element: CstElement): RawXmlElement {
  // --- Step 1: The open tag ---
  const attributes = element.attributes.map((attr) => toRawAttribute(ctx, attr));
  const loc = locate(ctx, element.start);
  const range = { start: element.start, end: element.end };
  if (element.selfClosing) {
    // endLoc is the `/` of `/>`, the last two characters of the open tag.
    const endLoc = locate(ctx, element.openTag.end - 2);
    return { name: element.name, attributes, children: [], comments: [], loc, endLoc, range };
  }

  // --- Step 2: Content: child elements, comments, and the text around them ---
  const children: RawXmlElement[] = [];
  const comments: string[] = [];
  let text = '';
  for (const node of element.children) {
    switch (node.kind) {
      case 'element':
        children.push(toRawElement(ctx, node));
        break;
      case 'text':
        text += decodeFolded(node.raw, node.value);
        break;
      case 'whitespace':
        text += foldNewlines(node.raw);
        break;
      case 'cdata':
        text += foldNewlines(node.value);
        break;
      case 'comment':
        comments.push(foldNewlines(node.value));
        break;
      default:
        // Processing instructions and recovery bytes carry nothing the parsers read.
        break;
    }
  }

  // --- Step 3: The close tag, absent when the element ran to end of input ---
  const trimmed = text.trim();
  return {
    name: element.name,
    attributes,
    children,
    ...(trimmed ? { textContent: trimmed } : {}),
    comments,
    loc,
    ...(element.closeTag ? { endLoc: locate(ctx, element.closeTag.start) } : {}),
    range,
  };
}

/**
 * The tag name of the document's root element, as the parser reads it, or
 * undefined when there is none. For choosing which parser a file goes to:
 * unlike a search for the first `<name`, it skips a BOM, the XML declaration,
 * and comments — including a comment that itself contains a tag.
 *
 * @param xml       The file's contents, exactly as read.
 * @param filename  Name the (discarded) diagnostics would be reported against.
 */
export function rootElementName(xml: string, filename: string): string | undefined {
  return parseCst(xml, filename).cst.root?.name;
}

/**
 * Parse XML text into the raw element tree the U8G2GL parsers consume.
 *
 * The tree is built from the CST (`parseCst`); nothing here scans the text.
 * The function keeps its historical name, from when it was a tokeniser,
 * because it is public API.
 *
 * Never throws. Malformed input yields `U8G2GL_MALFORMED_XML` diagnostics and
 * whatever tree could be recovered; `root` is absent when no element could be.
 * A leading BOM is skipped and occupies no column.
 *
 * @param xml       The file's contents, exactly as read.
 * @param filename  Name every location and diagnostic is reported against.
 */
export function tokenizeXml(xml: string, filename: string): RawXmlDocument {
  const { cst, diagnostics } = parseCst(xml, filename);
  const ctx: AdapterContext = { file: filename, lines: cst.lines };
  return {
    ...(cst.root ? { root: toRawElement(ctx, cst.root) } : {}),
    diagnostics,
  };
}
