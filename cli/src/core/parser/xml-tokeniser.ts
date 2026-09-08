/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/xml-tokeniser.ts
 * Purpose: Hand-rolled, zero-dependency, browser-compatible XML scanner and tree builder.
 *          Tracks 1-based source coordinate positions (line, column) for every element
 *          tag and attribute value to empower §15 diagnostics.
 * Description: Tokenises the restricted U8G2GL XML subset (elements, attributes, text,
 *              comments, and optional processing declarations). Emits structured
 *              diagnostics with code U8G2GL_MALFORMED_XML on syntax violations without
 *              throwing exceptions.
 *
 * Exports:
 * - tokenizeXml: Tokenise raw XML text into a RawXmlDocument with source locations
 * - decodeXmlEntities: Replace standard XML predefined entity references
 */

import type { SourceLocation } from '../schema/source-location.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { RawXmlAttribute, RawXmlDocument, RawXmlElement } from './raw-xml.js';

/**
 * Decodes predefined XML entities (&lt;, &gt;, &amp;, &quot;, &apos;) and numeric character entities.
 */
export function decodeXmlEntities(str: string): string {
  return str.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        if (typeof entity === 'string' && entity.startsWith('#x')) {
          const code = parseInt(entity.slice(2), 16);
          return Number.isNaN(code) ? match : String.fromCodePoint(code);
        } else if (typeof entity === 'string' && entity.startsWith('#')) {
          const code = parseInt(entity.slice(1), 10);
          return Number.isNaN(code) ? match : String.fromCodePoint(code);
        }
        return match;
    }
  });
}

/**
 * Internal recursive-descent scanner tracking line and column source coordinates.
 */
class XmlScanner {
  private index = 0;
  private line = 1;
  private column = 1;
  private readonly length: number;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly xml: string,
    private readonly filename: string,
  ) {
    this.length = xml.length;
  }

  /**
   * Captures the current 1-based source coordinate.
   */
  private getLoc(): SourceLocation {
    return {
      file: this.filename,
      line: this.line,
      column: this.column,
    };
  }

  /**
   * Look ahead at character with optional offset from current index.
   */
  private peek(offset = 0): string {
    const idx = this.index + offset;
    return idx < this.length ? (this.xml[idx] ?? '') : '';
  }

  /**
   * Consumes one character, maintaining line and column counters.
   * Handles LF, CR, and CRLF newline formats.
   */
  private advance(): string {
    if (this.index >= this.length) {
      return '';
    }
    const ch = this.xml[this.index] ?? '';
    if (ch === '\r') {
      this.index++;
      if (this.index < this.length && this.xml[this.index] === '\n') {
        this.index++;
      }
      this.line++;
      this.column = 1;
      return '\n';
    } else if (ch === '\n') {
      this.index++;
      this.line++;
      this.column = 1;
      return '\n';
    } else {
      this.index++;
      this.column++;
      return ch;
    }
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  private skipWhitespace(): void {
    while (this.index < this.length && this.isWhitespace(this.peek())) {
      this.advance();
    }
  }

  private isNameStartChar(ch: string): boolean {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch === ':' ||
      ch === '$' ||
      ch === '#'
    );
  }

  private isNameChar(ch: string): boolean {
    return (
      this.isNameStartChar(ch) ||
      (ch >= '0' && ch <= '9') ||
      ch === '-' ||
      ch === '.'
    );
  }

  private scanName(): string {
    let name = '';
    while (this.index < this.length && this.isNameChar(this.peek())) {
      name += this.advance();
    }
    return name;
  }

  /**
   * Parses an XML comment: <!-- ... -->
   */
  private parseComment(): string {
    const commentLoc = this.getLoc();
    this.advance(); // <
    this.advance(); // !
    this.advance(); // -
    this.advance(); // -

    let text = '';
    let closed = false;
    while (this.index < this.length) {
      if (this.peek() === '-' && this.peek(1) === '-' && this.peek(2) === '>') {
        this.advance(); // -
        this.advance(); // -
        this.advance(); // >
        closed = true;
        break;
      }
      text += this.advance();
    }

    if (!closed) {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: commentLoc.line,
        column: commentLoc.column,
        message: 'Unclosed XML comment',
      });
    }

    return text;
  }

  /**
   * Skips an XML processing instruction or declaration: <?xml ... ?>
   */
  private skipProcessingInstruction(): void {
    const piLoc = this.getLoc();
    this.advance(); // <
    this.advance(); // ?

    let closed = false;
    while (this.index < this.length) {
      if (this.peek() === '?' && this.peek(1) === '>') {
        this.advance(); // ?
        this.advance(); // >
        closed = true;
        break;
      }
      this.advance();
    }

    if (!closed) {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: piLoc.line,
        column: piLoc.column,
        message: 'Unclosed XML processing instruction',
      });
    }
  }

  /**
   * Parses an element opening tag, attributes, children, and closing tag.
   */
  private parseElement(): RawXmlElement | undefined {
    const tagLoc = this.getLoc();
    this.advance(); // consume '<'

    this.skipWhitespace();
    const tagName = this.scanName();
    if (!tagName) {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: tagLoc.line,
        column: tagLoc.column,
        message: 'Expected element tag name after "<"',
      });
      // Skip until '>' to recover
      while (this.index < this.length && this.peek() !== '>') {
        this.advance();
      }
      if (this.peek() === '>') {
        this.advance();
      }
      return undefined;
    }

    // Parse attribute list
    const attributes: RawXmlAttribute[] = [];
    while (this.index < this.length) {
      this.skipWhitespace();
      const nextChar = this.peek();
      if (nextChar === '>' || (nextChar === '/' && this.peek(1) === '>')) {
        break;
      }

      const attrNameLoc = this.getLoc();
      const attrName = this.scanName();
      if (!attrName) {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: this.filename,
          line: attrNameLoc.line,
          column: attrNameLoc.column,
          message: `Unexpected character '${this.peek()}' while parsing attributes in <${tagName}>`,
          offendingText: this.peek(),
        });
        this.advance();
        continue;
      }

      this.skipWhitespace();
      if (this.peek() !== '=') {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: this.filename,
          line: attrNameLoc.line,
          column: attrNameLoc.column,
          message: `Expected '=' after attribute name '${attrName}' in <${tagName}>`,
          offendingText: attrName,
        });
        continue;
      }
      this.advance(); // consume '='

      this.skipWhitespace();
      const quote = this.peek();
      if (quote !== '"' && quote !== "'") {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: this.filename,
          line: this.getLoc().line,
          column: this.getLoc().column,
          message: `Attribute value for '${attrName}' in <${tagName}> must be enclosed in quotes`,
          offendingText: this.peek(),
        });
        // Skip until next whitespace or tag end
        while (
          this.index < this.length &&
          !this.isWhitespace(this.peek()) &&
          this.peek() !== '>' &&
          this.peek() !== '/'
        ) {
          this.advance();
        }
        continue;
      }
      this.advance(); // consume opening quote

      // Source location points to the first character of the attribute value
      const valLoc = this.getLoc();
      let rawVal = '';
      let closedQuote = false;
      while (this.index < this.length) {
        if (this.peek() === quote) {
          this.advance(); // consume closing quote
          closedQuote = true;
          break;
        }
        rawVal += this.advance();
      }

      if (!closedQuote) {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: this.filename,
          line: valLoc.line,
          column: valLoc.column,
          message: `Unclosed quote for attribute '${attrName}' in <${tagName}>`,
          offendingText: attrName,
        });
      }

      attributes.push({
        name: attrName,
        value: decodeXmlEntities(rawVal),
        loc: valLoc,
        nameLoc: attrNameLoc,
      });
    }

    this.skipWhitespace();

    // Check for self-closing element
    if (this.peek() === '/' && this.peek(1) === '>') {
      const endLoc = this.getLoc();
      this.advance(); // /
      this.advance(); // >
      return {
        name: tagName,
        attributes,
        children: [],
        comments: [],
        loc: tagLoc,
        endLoc,
      };
    }

    if (this.peek() === '>') {
      this.advance(); // consume '>'
    } else {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: tagLoc.line,
        column: tagLoc.column,
        message: `Expected '>' or '/>' to close opening tag <${tagName}>`,
        offendingText: tagName,
      });
    }

    // Parse inner children, text, and comments
    const children: RawXmlElement[] = [];
    const comments: string[] = [];
    let textContent = '';

    while (this.index < this.length) {
      if (this.peek() === '<') {
        if (
          this.peek(1) === '!' &&
          this.peek(2) === '-' &&
          this.peek(3) === '-'
        ) {
          const comment = this.parseComment();
          comments.push(comment);
          continue;
        }
        if (this.peek(1) === '?') {
          this.skipProcessingInstruction();
          continue;
        }
        if (this.peek(1) === '/') {
          // Closing tag encountered
          const closeTagLoc = this.getLoc();
          this.advance(); // <
          this.advance(); // /
          this.skipWhitespace();
          const closeName = this.scanName();
          this.skipWhitespace();

          if (this.peek() === '>') {
            this.advance(); // >
          } else {
            this.diagnostics.push({
              code: DIAGNOSTIC_CODES.MALFORMED_XML,
              severity: 'error',
              file: this.filename,
              line: closeTagLoc.line,
              column: closeTagLoc.column,
              message: `Expected '>' after closing tag name '</${closeName}>'`,
              offendingText: closeName,
            });
          }

          if (closeName !== tagName) {
            this.diagnostics.push({
              code: DIAGNOSTIC_CODES.MALFORMED_XML,
              severity: 'error',
              file: this.filename,
              line: closeTagLoc.line,
              column: closeTagLoc.column,
              message: `Mismatched closing tag: expected '</${tagName}>', found '</${closeName}>'`,
              offendingText: closeName,
            });
          }

          return {
            name: tagName,
            attributes,
            children,
            textContent: textContent.trim() ? textContent.trim() : undefined,
            comments,
            loc: tagLoc,
            endLoc: closeTagLoc,
          };
        }

        // Child element
        const child = this.parseElement();
        if (child) {
          children.push(child);
        }
      } else {
        // Collect text content
        let text = '';
        while (this.index < this.length && this.peek() !== '<') {
          text += this.advance();
        }
        textContent += decodeXmlEntities(text);
      }
    }

    // Reached EOF without matching closing tag
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: this.filename,
      line: tagLoc.line,
      column: tagLoc.column,
      message: `unclosed tag '${tagName}'`,
      offendingText: tagName,
    });

    return {
      name: tagName,
      attributes,
      children,
      textContent: textContent.trim() ? textContent.trim() : undefined,
      comments,
      loc: tagLoc,
    };
  }

  /**
   * Scans the complete XML text and returns the parsed root element with any diagnostics.
   */
  public scanDocument(): RawXmlDocument {
    this.skipWhitespace();

    // Skip leading comments and processing instructions
    while (this.index < this.length) {
      if (
        this.peek() === '<' &&
        this.peek(1) === '!' &&
        this.peek(2) === '-' &&
        this.peek(3) === '-'
      ) {
        this.parseComment();
        this.skipWhitespace();
        continue;
      }
      if (this.peek() === '<' && this.peek(1) === '?') {
        this.skipProcessingInstruction();
        this.skipWhitespace();
        continue;
      }
      break;
    }

    if (this.index >= this.length) {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: 1,
        column: 1,
        message: 'XML document is empty or contains no root element',
      });
      return { diagnostics: this.diagnostics };
    }

    const root = this.parseElement();

    // Check for trailing content after root
    while (this.index < this.length) {
      this.skipWhitespace();
      if (this.index >= this.length) {
        break;
      }
      if (
        this.peek() === '<' &&
        this.peek(1) === '!' &&
        this.peek(2) === '-' &&
        this.peek(3) === '-'
      ) {
        this.parseComment();
        continue;
      }
      if (this.peek() === '<' && this.peek(1) === '?') {
        this.skipProcessingInstruction();
        continue;
      }
      const extraLoc = this.getLoc();
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: this.filename,
        line: extraLoc.line,
        column: extraLoc.column,
        message: 'Multiple root elements or unexpected trailing content',
      });
      break;
    }

    return {
      root: root ?? undefined,
      diagnostics: this.diagnostics,
    };
  }
}

/**
 * Tokenises raw XML text into an AST of RawXmlElements with exact source locations.
 * Never throws — returns collected diagnostics.
 */
export function tokenizeXml(xml: string, filename: string): RawXmlDocument {
  const scanner = new XmlScanner(xml, filename);
  return scanner.scanDocument();
}
