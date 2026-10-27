/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/parse-cst.ts
 * Purpose: Builds the lossless concrete syntax tree [UD-3] needs: the designer
 *          turns an editing intent into a minimal text edit, and it can only do
 *          that over a tree that accounts for every byte and knows exactly
 *          where each attribute value sits. It is also the parser's only XML
 *          reader: parser/cst-adapter.ts derives the parsers' raw tree from it.
 * Description: A single-pass scanner whose control flow — including every
 *              error-recovery path — deliberately mirrors the hand-rolled
 *              scanner the parser used before it, so that on any input it
 *              reports the same diagnostic codes at the same lines and columns
 *              that authors and tests already relied on. That scanner's output
 *              is recorded in cli/test/cst/tokeniser-diagnostics.json and the
 *              parity test holds this one to it. Where it differs, it accepts
 *              well-formed XML the old scanner rejected, never the reverse:
 *              - a leading BOM is recorded and skipped (the old scanner treated
 *                it as the first tag's `<`);
 *              - `<![CDATA[ ... ]]>` in element content is a CDATA node (the
 *                old scanner reported a missing tag name).
 *              Recovery paths produce `invalid` nodes for the bytes they skip,
 *              so the tree stays lossless even on malformed input.
 *
 * Exports:
 * - CstParseResult:  The tree plus its well-formedness diagnostics
 * - parseCst():      Parse XML text into a CST; never throws
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type {
  CstAttribute,
  CstCdata,
  CstComment,
  CstContent,
  CstDocument,
  CstElement,
  CstInvalid,
  CstProcessingInstruction,
  CstText,
  CstWhitespace,
  CstXmlDeclaration,
} from './cst-types.js';
import { decodeEntities } from './entities.js';
import { BOM, LineIndex } from './line-index.js';

/** The result of `parseCst`: a tree, always, and any diagnostics. */
export interface CstParseResult {
  /** The tree. Present even for malformed input, and still lossless. */
  readonly cst: CstDocument;
  /**
   * Well-formedness diagnostics in the order they were found, every one
   * `U8G2GL_MALFORMED_XML`.
   */
  readonly diagnostics: readonly Diagnostic[];
}

const CDATA_OPEN = '<![CDATA[';

/**
 * Scanner state for one parse. Private to this module: the class is a
 * convenient home for the cursor, not an API.
 */
class CstScanner {
  private index = 0;
  private readonly length: number;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly text: string,
    private readonly file: string,
    private readonly lines: LineIndex,
  ) {
    this.length = text.length;
  }

  // report
  // Records one MALFORMED_XML diagnostic located at `offset`.
  private report(offset: number, message: string, offendingText?: string): void {
    const { line, column } = this.lines.locate(offset);
    this.pushDiagnostic(line, column, message, offendingText);
  }

  private pushDiagnostic(
    line: number,
    column: number,
    message: string,
    offendingText?: string,
  ): void {
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: this.file,
      line,
      column,
      message,
      ...(offendingText === undefined ? {} : { offendingText }),
    });
  }

  private peek(offset = 0): string {
    return this.text[this.index + offset] ?? '';
  }

  private at(literal: string): boolean {
    return this.text.startsWith(literal, this.index);
  }

  private atEnd(): boolean {
    return this.index >= this.length;
  }

  private static isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  // The original scanner's name alphabet, including its `$` and `#` extensions,
  // so every name it accepted is still a name and the recovery paths line up.
  private static isNameStartChar(ch: string): boolean {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch === ':' ||
      ch === '$' ||
      ch === '#'
    );
  }

  private static isNameChar(ch: string): boolean {
    return (
      CstScanner.isNameStartChar(ch) || (ch >= '0' && ch <= '9') || ch === '-' || ch === '.'
    );
  }

  private skipWhitespace(): void {
    while (this.index < this.length && CstScanner.isWhitespace(this.peek())) {
      this.index++;
    }
  }

  // As in the original scanner, a name is any run of name characters; the start-char
  // rule is not enforced separately, so `<1a>` scans the name `1a`.
  private scanName(): string {
    const start = this.index;
    while (this.index < this.length && CstScanner.isNameChar(this.peek())) {
      this.index++;
    }
    return this.text.slice(start, this.index);
  }

  // whitespaceNode
  // Consumes whitespace at the cursor as a trivia node, or returns undefined
  // if there is none. Used where the original scanner skipped whitespace between
  // nodes, so those bytes still belong to the tree.
  private whitespaceNode(): CstWhitespace | undefined {
    const start = this.index;
    this.skipWhitespace();
    if (this.index === start) {
      return undefined;
    }
    return { kind: 'whitespace', start, end: this.index, raw: this.text.slice(start, this.index) };
  }

  // comment
  // `<!-- ... -->`, cursor on `<`. Unclosed runs to end of input.
  private comment(): CstComment {
    const start = this.index;
    const close = this.text.indexOf('-->', start + 4);
    if (close < 0) {
      this.index = this.length;
      this.report(start, 'Unclosed XML comment');
      return { kind: 'comment', start, end: this.length, value: this.text.slice(start + 4), closed: false };
    }
    this.index = close + 3;
    return { kind: 'comment', start, end: this.index, value: this.text.slice(start + 4, close), closed: true };
  }

  // processingInstruction
  // `<? ... ?>`, cursor on `<`. The target `xml` makes it the declaration;
  // the original scanner skipped both alike, so the split is the CST's own.
  private processingInstruction(): CstXmlDeclaration | CstProcessingInstruction {
    const start = this.index;
    const close = this.text.indexOf('?>', start + 2);
    const closed = close >= 0;
    const bodyEnd = closed ? close : this.length;
    this.index = closed ? close + 2 : this.length;
    if (!closed) {
      this.report(start, 'Unclosed XML processing instruction');
    }

    // The target runs from after `<?` to the first whitespace or `?`.
    let targetEnd = start + 2;
    while (
      targetEnd < bodyEnd &&
      !CstScanner.isWhitespace(this.text[targetEnd] ?? '') &&
      this.text[targetEnd] !== '?'
    ) {
      targetEnd++;
    }
    const target = this.text.slice(start + 2, targetEnd);
    const body = this.text.slice(targetEnd, bodyEnd);
    if (target === 'xml') {
      return { kind: 'xml-declaration', start, end: this.index, body, closed };
    }
    return { kind: 'processing-instruction', start, end: this.index, target, body, closed };
  }

  // cdata
  // `<![CDATA[ ... ]]>`, cursor on `<`. Unclosed runs to end of input.
  private cdata(): CstCdata {
    const start = this.index;
    const valueStart = start + CDATA_OPEN.length;
    const close = this.text.indexOf(']]>', valueStart);
    if (close < 0) {
      this.index = this.length;
      this.report(start, 'Unclosed CDATA section');
      return { kind: 'cdata', start, end: this.length, value: this.text.slice(valueStart), closed: false };
    }
    this.index = close + 3;
    return { kind: 'cdata', start, end: this.index, value: this.text.slice(valueStart, close), closed: true };
  }

  // charData
  // Character data up to the next `<` or end of input: whitespace trivia if
  // it is all whitespace, otherwise a text node.
  private charData(): CstText | CstWhitespace {
    const start = this.index;
    const next = this.text.indexOf('<', start);
    this.index = next < 0 ? this.length : next;
    const raw = this.text.slice(start, this.index);
    for (let i = 0; i < raw.length; i++) {
      if (!CstScanner.isWhitespace(raw[i] ?? '')) {
        return { kind: 'text', start, end: this.index, raw, value: decodeEntities(raw) };
      }
    }
    return { kind: 'whitespace', start, end: this.index, raw };
  }

  // attribute
  // One attribute, cursor on a name character. Returns undefined, with a
  // diagnostic, when the original scanner dropped it: no `=`, or an unquoted
  // value. Each branch reports at that scanner's offset and advances exactly
  // as far as it did.
  private attribute(tagName: string): CstAttribute | undefined {
    // --- Step 1: Name, then `=` ---
    const nameStart = this.index;
    const name = this.scanName();
    const nameEnd = this.index;
    this.skipWhitespace();
    if (this.peek() !== '=') {
      this.report(nameStart, `Expected '=' after attribute name '${name}' in <${tagName}>`, name);
      return undefined;
    }
    this.index++;

    // --- Step 2: Opening quote; an unquoted value is skipped to a boundary ---
    this.skipWhitespace();
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      this.report(
        this.index,
        `Attribute value for '${name}' in <${tagName}> must be enclosed in quotes`,
        quote,
      );
      while (
        this.index < this.length &&
        !CstScanner.isWhitespace(this.peek()) &&
        this.peek() !== '>' &&
        this.peek() !== '/'
      ) {
        this.index++;
      }
      return undefined;
    }
    this.index++;

    // --- Step 3: Value up to the matching quote, or end of input ---
    const valueStart = this.index;
    const close = this.text.indexOf(quote, valueStart);
    const valueEnd = close < 0 ? this.length : close;
    this.index = close < 0 ? this.length : close + 1;
    if (close < 0) {
      this.report(valueStart, `Unclosed quote for attribute '${name}' in <${tagName}>`, name);
    }
    const rawValue = this.text.slice(valueStart, valueEnd);
    return {
      kind: 'attribute',
      start: nameStart,
      end: this.index,
      name,
      nameRange: { start: nameStart, end: nameEnd },
      valueRange: { start: valueStart, end: valueEnd },
      quote,
      rawValue,
      value: decodeEntities(rawValue),
    };
  }

  // element
  // An element from its open tag through its close tag, cursor on `<` — or,
  // at the document root, on whatever character the original scanner treated as
  // one. A `<` with no name becomes an invalid node, as that scanner skipped it.
  element(): CstElement | CstInvalid {
    // --- Step 1: `<` and the tag name ---
    const start = this.index;
    this.index++;
    this.skipWhitespace();
    const nameStart = this.index;
    const name = this.scanName();
    const nameRange = { start: nameStart, end: this.index };
    if (!name) {
      this.report(start, 'Expected element tag name after "<"');
      while (this.index < this.length && this.peek() !== '>') {
        this.index++;
      }
      if (this.peek() === '>') {
        this.index++;
      }
      return { kind: 'invalid', start, end: this.index, raw: this.text.slice(start, this.index) };
    }

    // --- Step 2: Attributes, until `>` or `/>` ---
    const attributes: CstAttribute[] = [];
    while (this.index < this.length) {
      this.skipWhitespace();
      if (this.peek() === '>' || this.at('/>')) {
        break;
      }
      if (!CstScanner.isNameChar(this.peek())) {
        // At end of input peek() is '' and the original scanner reported it the
        // same way, then could not advance — so neither may the cursor here.
        this.report(
          this.index,
          `Unexpected character '${this.peek()}' while parsing attributes in <${name}>`,
          this.peek(),
        );
        this.index = Math.min(this.index + 1, this.length);
        continue;
      }
      const attribute = this.attribute(name);
      if (attribute) {
        attributes.push(attribute);
      }
    }
    this.skipWhitespace();

    // --- Step 3: Self-closing, or the end of the open tag ---
    if (this.at('/>')) {
      this.index += 2;
      const openTag = { start, end: this.index };
      return { kind: 'element', start, end: this.index, name, nameRange, openTag, attributes, selfClosing: true, children: [] };
    }
    if (this.peek() === '>') {
      this.index++;
    } else {
      this.report(start, `Expected '>' or '/>' to close opening tag <${name}>`, name);
    }
    const openTag = { start, end: this.index };

    // --- Step 4: Content, until the close tag or end of input ---
    const children: CstContent[] = [];
    while (this.index < this.length) {
      if (this.peek() !== '<') {
        children.push(this.charData());
      } else if (this.at('<!--')) {
        children.push(this.comment());
      } else if (this.at('<?')) {
        children.push(this.processingInstruction());
      } else if (this.at('</')) {
        // --- Step 5: The close tag ends the element whatever it names ---
        const closeStart = this.index;
        this.index += 2;
        this.skipWhitespace();
        const closeNameStart = this.index;
        const closeName = this.scanName();
        const closeNameRange = { start: closeNameStart, end: this.index };
        this.skipWhitespace();
        if (this.peek() === '>') {
          this.index++;
        } else {
          this.report(closeStart, `Expected '>' after closing tag name '</${closeName}>'`, closeName);
        }
        if (closeName !== name) {
          this.report(
            closeStart,
            `Mismatched closing tag: expected '</${name}>', found '</${closeName}>'`,
            closeName,
          );
        }
        const closeTag = { start: closeStart, end: this.index, name: closeName, nameRange: closeNameRange };
        return { kind: 'element', start, end: this.index, name, nameRange, openTag, attributes, selfClosing: false, children, closeTag };
      } else if (this.at(CDATA_OPEN)) {
        children.push(this.cdata());
      } else {
        children.push(this.element());
      }
    }

    this.report(start, `unclosed tag '${name}'`, name);
    return { kind: 'element', start, end: this.length, name, nameRange, openTag, attributes, selfClosing: false, children };
  }

  // misc
  // Whitespace, comments and PIs at the cursor, as the original scanner skipped them
  // before and after the root. Returns when anything else is next.
  private misc(out: CstContent[]): void {
    for (;;) {
      const ws = this.whitespaceNode();
      if (ws) {
        out.push(ws);
      }
      if (this.at('<!--')) {
        out.push(this.comment());
      } else if (this.at('<?')) {
        out.push(this.processingInstruction());
      } else {
        return;
      }
    }
  }

  // document
  // Prolog, root, epilog — the original scanner's document walk, step for step.
  document(): CstParseResult {
    // --- Step 1: BOM, then the prolog ---
    const bom = this.text.startsWith(BOM);
    if (bom) {
      this.index = 1;
    }
    const children: CstContent[] = [];
    this.misc(children);

    // --- Step 2: The root, or the original empty-document diagnostic ---
    let root: CstElement | undefined;
    if (this.atEnd()) {
      // Reported at 1:1 literally, not at an offset, as the original scanner did.
      this.pushDiagnostic(1, 1, 'XML document is empty or contains no root element');
    } else {
      const node = this.element();
      children.push(node);
      root = node.kind === 'element' ? node : undefined;

      // --- Step 3: Epilog; anything but trivia is one diagnostic and the rest is invalid ---
      this.misc(children);
      if (!this.atEnd()) {
        this.report(this.index, 'Multiple root elements or unexpected trailing content');
        children.push({ kind: 'invalid', start: this.index, end: this.length, raw: this.text.slice(this.index) });
        this.index = this.length;
      }
    }

    const cst: CstDocument = {
      kind: 'document',
      start: 0,
      end: this.length,
      file: this.file,
      text: this.text,
      bom,
      children,
      ...(root ? { root } : {}),
      lines: this.lines,
    };
    return { cst, diagnostics: this.diagnostics };
  }
}

/**
 * Parse XML text into a lossless CST.
 *
 * Never throws: malformed input yields a tree whose recovery regions are
 * `invalid` nodes, plus diagnostics with the same codes, lines and columns
 * the parser has always reported for the same text. `printCst(parseCst(t).cst) === t`
 * for every input.
 *
 * @param text  The file's contents, exactly as read. Do not strip a BOM or
 *              normalise line endings first; both are preserved.
 * @param file  Name diagnostics are reported against.
 */
export function parseCst(text: string, file: string): CstParseResult {
  return new CstScanner(text, file, new LineIndex(text)).document();
}
