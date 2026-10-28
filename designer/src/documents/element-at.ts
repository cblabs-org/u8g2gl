/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/documents/element-at.ts
 * Purpose: Answers "which element is the caret in?" for selection from XML to
 *          canvas (ui_spec §4.3): the innermost named element whose text
 *          contains the caret. Selection is by `name` ([U-1] makes it stable),
 *          so it survives edits that move the element's text, and the same
 *          lookup finds an element again after a reload.
 * Description: Uses the CLI's own XML tokeniser, so the editor and the
 *              generator agree on where an element starts. An element spans
 *              from its `<` to the `>` that ends its closing tag (or its `/>`).
 *              The document's root (`<screen>`, `<widget>`) is not an element
 *              on the canvas and is never the answer. Text that does not
 *              tokenise has no answer; the caller keeps its previous one, so a
 *              half-typed attribute does not drop the selection.
 *
 * Exports:
 * - ElementSpan:      A named element's offsets
 * - namedElements():  Every named element below the root, with its span
 * - innermostAt():    The innermost of some spans containing an offset
 * - elementAt():      The innermost one containing an offset
 */

import { tokenizeXml, type RawXmlElement } from '@u8g2gl/core/parser/index.js';

/** A named element and the text it spans. */
export interface ElementSpan {
  readonly name: string;
  readonly tag: string;
  /** Offset of its `<`. */
  readonly start: number;
  /** Offset just past the `>` that ends it. */
  readonly end: number;
  /** Nesting depth below the root (1 for a top-level element). */
  readonly depth: number;
}

/**
 * @brief Every named element below the document root, in document order.
 *
 * @return The spans, or undefined if the text has a syntax error.
 */
export function namedElements(text: string): ElementSpan[] | undefined {
  const document = tokenizeXml(text, '');
  if (document.root === undefined || document.diagnostics.some((d) => d.severity === 'error')) {
    return undefined;
  }
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const offsetOf = (line: number, column: number): number => (lineStarts[line - 1] ?? text.length) + column - 1;
  const spans: ElementSpan[] = [];
  const visit = (element: RawXmlElement, depth: number): void => {
    const name = element.attributes.find((a) => a.name === 'name')?.value;
    if (depth > 0 && name !== undefined && name !== '') {
      const start = offsetOf(element.loc.line, element.loc.column);
      const close = element.endLoc === undefined ? start : offsetOf(element.endLoc.line, element.endLoc.column);
      const gt = text.indexOf('>', close);
      spans.push({ name, tag: element.name, start, end: gt < 0 ? text.length : gt + 1, depth });
    }
    for (const child of element.children) visit(child, depth + 1);
  };
  visit(document.root, 0);
  return spans;
}

/**
 * @brief The innermost named element containing `offset`.
 *
 * @param text   The document.
 * @param offset A caret offset (0-based, between characters).
 * @return Its span; undefined if the caret is in no named element, and
 *         `'unparsed'` if the text does not tokenise.
 */
export function elementAt(text: string, offset: number): ElementSpan | undefined | 'unparsed' {
  const spans = namedElements(text);
  return spans === undefined ? 'unparsed' : innermostAt(spans, offset);
}

/**
 * @brief The innermost of `spans` containing `offset`, for a caller asking
 *        about several offsets in one text, which tokenises it once.
 *
 * @param spans  `namedElements()` of the text.
 * @param offset An offset (0-based, between characters).
 * @return The span; undefined if no named element contains the offset.
 */
export function innermostAt(spans: readonly ElementSpan[], offset: number): ElementSpan | undefined {
  let best: ElementSpan | undefined;
  for (const span of spans) {
    if (span.start <= offset && offset <= span.end && (best === undefined || span.depth >= best.depth)) {
      best = span;
    }
  }
  return best;
}
