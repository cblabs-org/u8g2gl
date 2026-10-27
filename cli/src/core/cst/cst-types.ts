/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/cst-types.ts
 * Purpose: The shape of the concrete syntax tree [UD-3] rests on. The designer
 *          edits XML by turning an intent ("set x to 12") into a text edit, and
 *          that is only safe if the tree it reasons over accounts for every byte
 *          of the file and knows where each part is. This file defines that
 *          tree; parse-cst.ts builds it and print-cst.ts proves it is lossless.
 * Description: Plain readonly data. Every node carries `[start, end)` UTF-16
 *              offsets into the source text, and the nodes of one parent tile
 *              its content with no gap and no overlap, which is what lets the
 *              printer rebuild the input from the tree alone. Line and column
 *              are not stored; they are derived from offsets by the document's
 *              LineIndex, so an edit can never leave a stale coordinate behind.
 *
 * Exports:
 *   Ranges:
 *   - CstRange:                   `[start, end)` offsets into the source
 *   - TextEdit:                   One replacement of a range by new text
 *
 *   Nodes:
 *   - CstDocument:                The whole file: optional BOM, prolog, root, epilog
 *   - CstElement:                 An element with its tags, attributes and children
 *   - CstAttribute:               One `name="value"` pair, raw and decoded
 *   - CstText:                    Character data containing non-whitespace
 *   - CstWhitespace:              Whitespace-only character data (trivia)
 *   - CstComment:                 `<!-- ... -->`
 *   - CstCdata:                   `<![CDATA[ ... ]]>`
 *   - CstXmlDeclaration:          `<?xml ... ?>`
 *   - CstProcessingInstruction:   Any other `<? ... ?>`
 *   - CstInvalid:                 Bytes the scanner could not give a structure to
 *
 *   Unions:
 *   - CstContent:                 What may appear in a document or element body
 *   - CstNode:                    Any node
 *   - CstQuote:                   The two attribute quote characters
 */

import type { LineIndex } from './line-index.js';

/** A half-open span `[start, end)` of UTF-16 offsets into the source text. */
export interface CstRange {
  /** Offset of the first code unit in the span. */
  readonly start: number;
  /** Offset one past the last code unit in the span. */
  readonly end: number;
}

/**
 * One text replacement: the source span `[start, end)` becomes `text`.
 * Offsets always refer to the text the edit was computed against, never to a
 * partially edited intermediate, so a list of edits can be applied in any
 * order that respects that (`applyEdits` applies them from the end).
 */
export interface TextEdit extends CstRange {
  /** Replacement text. Empty for a deletion; `start === end` for an insertion. */
  readonly text: string;
}

/** The quote character an attribute value was written with. */
export type CstQuote = '"' | "'";

/**
 * An attribute as written. The node spans from the first character of the
 * name to just past the closing quote (or to end of input if the quote never
 * closes, which is also reported as a diagnostic).
 */
export interface CstAttribute extends CstRange {
  readonly kind: 'attribute';
  /** The attribute name exactly as written. */
  readonly name: string;
  /** Span of the name. `text.slice(nameRange.start, nameRange.end) === name`. */
  readonly nameRange: CstRange;
  /**
   * Span of the value **inside** the quotes.
   * `text.slice(valueRange.start, valueRange.end) === rawValue`.
   */
  readonly valueRange: CstRange;
  /** The quote character used, so an edit can keep the author's style. */
  readonly quote: CstQuote;
  /** The value as written, entity references undecoded. */
  readonly rawValue: string;
  /** The value with entity references decoded (the tokeniser's rules). */
  readonly value: string;
}

/**
 * An element. `openTag` covers `<name ... >` or `<name ... />` including the
 * attributes and the whitespace between them; `children` tile the bytes
 * between the tags; `closeTag` covers `</name>`.
 */
export interface CstElement extends CstRange {
  readonly kind: 'element';
  /** Tag name as written in the open tag. */
  readonly name: string;
  /** Span of the name in the open tag. */
  readonly nameRange: CstRange;
  /** Span of the whole open tag, `<` through `>` or `/>`. */
  readonly openTag: CstRange;
  /** Attributes in source order. Malformed ones the scanner skipped are absent. */
  readonly attributes: readonly CstAttribute[];
  /** True for `<name ... />`. Such an element has no children and no close tag. */
  readonly selfClosing: boolean;
  /** Content between the tags, in source order. Empty when self-closing. */
  readonly children: readonly CstContent[];
  /**
   * The close tag, or undefined when the element is self-closing or never
   * closed before end of input. Its name may differ from the open tag's when
   * the input is malformed; that mismatch is reported as a diagnostic.
   */
  readonly closeTag?: CstRange & {
    /** Name as written in the close tag. */
    readonly name: string;
    /** Span of that name. */
    readonly nameRange: CstRange;
  };
}

/** Character data containing at least one non-whitespace character. */
export interface CstText extends CstRange {
  readonly kind: 'text';
  /** The text as written, entities undecoded. */
  readonly raw: string;
  /** The text with entity references decoded. */
  readonly value: string;
}

/**
 * Whitespace-only character data: indentation, line breaks, the space between
 * elements. Kept as nodes so the tree is lossless and so an edit can read the
 * document's indentation from it.
 */
export interface CstWhitespace extends CstRange {
  readonly kind: 'whitespace';
  /** The whitespace exactly as written. */
  readonly raw: string;
}

/** `<!-- ... -->`. */
export interface CstComment extends CstRange {
  readonly kind: 'comment';
  /** The text between `<!--` and `-->` (to end of input if unclosed). */
  readonly value: string;
  /** False when the comment ran to end of input without `-->`. */
  readonly closed: boolean;
}

/** `<![CDATA[ ... ]]>`, recognised inside element content only. */
export interface CstCdata extends CstRange {
  readonly kind: 'cdata';
  /** The text between `<![CDATA[` and `]]>`, never entity-decoded. */
  readonly value: string;
  /** False when the section ran to end of input without `]]>`. */
  readonly closed: boolean;
}

/** `<?xml ... ?>`: a processing instruction whose target is exactly `xml`. */
export interface CstXmlDeclaration extends CstRange {
  readonly kind: 'xml-declaration';
  /** The text between `<?xml` and `?>`. */
  readonly body: string;
  /** False when it ran to end of input without `?>`. */
  readonly closed: boolean;
}

/** Any `<? ... ?>` other than the XML declaration. */
export interface CstProcessingInstruction extends CstRange {
  readonly kind: 'processing-instruction';
  /** The PI target: the name immediately after `<?`, possibly empty. */
  readonly target: string;
  /** The text after the target, up to `?>`. */
  readonly body: string;
  /** False when it ran to end of input without `?>`. */
  readonly closed: boolean;
}

/**
 * Bytes the scanner consumed while recovering from an error — a `<` with no
 * tag name, or trailing content after the root. Always accompanied by a
 * diagnostic. It exists so the tree stays lossless on malformed input.
 */
export interface CstInvalid extends CstRange {
  readonly kind: 'invalid';
  /** The bytes as written. */
  readonly raw: string;
}

/** Anything that may appear in a document's or an element's content. */
export type CstContent =
  | CstElement
  | CstText
  | CstWhitespace
  | CstComment
  | CstCdata
  | CstXmlDeclaration
  | CstProcessingInstruction
  | CstInvalid;

/**
 * The parsed file. `children` tile the text after the BOM; `root` is the
 * first element among them, or undefined when there is none.
 */
export interface CstDocument extends CstRange {
  readonly kind: 'document';
  /** The file name diagnostics are reported against. */
  readonly file: string;
  /** The exact source text the tree was parsed from. */
  readonly text: string;
  /** True when the text begins with U+FEFF; it then occupies offset 0. */
  readonly bom: boolean;
  /** Top-level content in source order: prolog, root, epilog. */
  readonly children: readonly CstContent[];
  /** The root element, or undefined when the document has none. */
  readonly root?: CstElement;
  /** Offset → line/column lookup for this text. */
  readonly lines: LineIndex;
}

/** Any node of the tree. */
export type CstNode = CstDocument | CstAttribute | CstContent;
