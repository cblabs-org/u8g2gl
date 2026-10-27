/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/edits.ts
 * Purpose: Turns an editing intent — "set this value", "add this child" — into
 *          the smallest text edit that achieves it [UD-3]. The designer never
 *          regenerates a document: it edits the author's own text, so their
 *          comments, layout and quoting survive, and the diff they review is
 *          the change they made and nothing else.
 * Description: Pure functions over a parsed CST. Each returns `TextEdit[]` with
 *              offsets into the text that CST was parsed from and never a new
 *              document; `applyEdits` lands them. Layout is read from the
 *              document rather than imposed: a new attribute follows the
 *              element's own attribute layout, a new element copies its nearest
 *              sibling's indentation, and line endings follow the file's.
 *              Every function touches only its target's lines.
 *
 * Exports:
 *   Attributes:
 *   - replaceAttributeValue():  Rewrite one value in place, keeping its quote
 *   - insertAttribute():        Add an attribute after the last, matching layout
 *   - removeAttribute():        Remove an attribute, and its line if it had one
 *
 *   Elements:
 *   - insertElement():          Insert an XML fragment as a parent's child
 *   - removeElement():          Remove an element's own text, never a neighbour's
 *   - renameElementTag():       Rename the open and close tags together
 */

import type { CstAttribute, CstDocument, CstElement, CstQuote, TextEdit } from './cst-types.js';
import { decodeEntities, encodeAttributeValue } from './entities.js';

/** Indentation step used when the document has no nesting to learn one from. */
const DEFAULT_INDENT_STEP = '  ';

// ---------------------------------------------------------------------------
// Line geometry. Every layout decision below is phrased in terms of the line
// a node sits on, so these are the shared vocabulary.
// ---------------------------------------------------------------------------

function isHorizontalSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t';
}

function isBlank(text: string): boolean {
  return /^[ \t]*$/.test(text);
}

// lineStartAt
// Offset of the first character of the line containing `offset`. A BOM is
// not part of line 1's content, so line 1 starts after it.
function lineStartAt(cst: CstDocument, offset: number): number {
  const start = cst.lines.lineStart(cst.lines.locate(offset).line);
  return cst.bom && start === 0 ? 1 : start;
}

// lineEndAt
// Offset of the line break ending the line containing `offset`, or the end of
// the text on the last line. The break itself is not included.
function lineEndAt(cst: CstDocument, offset: number): number {
  const { line } = cst.lines.locate(offset);
  if (line >= cst.lines.lineCount) {
    return cst.text.length;
  }
  const next = cst.lines.lineStart(line + 1);
  return cst.text[next - 2] === '\r' && cst.text[next - 1] === '\n' ? next - 2 : next - 1;
}

// nextLineStartAt
// Offset just past the line break ending `offset`'s line, or undefined on the
// last line, which has no break to remove.
function nextLineStartAt(cst: CstDocument, offset: number): number | undefined {
  const { line } = cst.lines.locate(offset);
  return line >= cst.lines.lineCount ? undefined : cst.lines.lineStart(line + 1);
}

// indentAt
// The leading spaces and tabs of the line containing `offset`.
function indentAt(cst: CstDocument, offset: number): string {
  const start = lineStartAt(cst, offset);
  let end = start;
  while (isHorizontalSpace(cst.text[end])) {
    end++;
  }
  return cst.text.slice(start, end);
}

// startsLine / endsLine
// Whether only spaces and tabs separate `offset` from its line's start / end.
function startsLine(cst: CstDocument, offset: number): boolean {
  return isBlank(cst.text.slice(lineStartAt(cst, offset), offset));
}

function endsLine(cst: CstDocument, offset: number): boolean {
  return isBlank(cst.text.slice(offset, lineEndAt(cst, offset)));
}

// lineBreak
// The document's line ending, taken from its first line break so a CRLF file
// stays CRLF. LF when the text has none.
function lineBreak(cst: CstDocument): string {
  const match = /\r\n|\r|\n/.exec(cst.text);
  return match ? match[0] : '\n';
}

// indentStep
// The document's own indentation step: the first place, in document order,
// where an element's line is indented beyond its parent element's line by a
// whitespace suffix. Two spaces when nothing is nested on separate lines.
function indentStep(cst: CstDocument): string {
  const search = (parent: CstElement): string | undefined => {
    const parentIndent = indentAt(cst, parent.start);
    for (const child of parent.children) {
      if (child.kind !== 'element') {
        continue;
      }
      if (startsLine(cst, child.start)) {
        const childIndent = indentAt(cst, child.start);
        if (childIndent.length > parentIndent.length && childIndent.startsWith(parentIndent)) {
          return childIndent.slice(parentIndent.length);
        }
      }
      const found = search(child);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return (cst.root && search(cst.root)) ?? DEFAULT_INDENT_STEP;
}

// reindent
// Prepares a caller's fragment for insertion at `indent`: its line breaks
// become the document's, and every line after the first gains `indent`
// (blank lines stay empty, so no trailing whitespace is introduced). The first
// line's indentation is the caller's to place.
function reindent(fragment: string, indent: string, eol: string): string {
  return fragment
    .split(/\r\n|\r|\n/)
    .map((line, i) => (i === 0 || line.length === 0 ? line : indent + line))
    .join(eol);
}

function elementChildren(element: CstElement): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element');
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

/**
 * Replace an attribute's value. The edit covers the value inside the quotes
 * and nothing else, so it is always a one-line change. The new value is
 * encoded for the attribute's existing quote character (`&amp;`, `&lt;`, that
 * quote, and line breaks as character references), so `a & c` written into
 * `"a &amp; b"` becomes `"a &amp; c"`.
 *
 * @param attr      An attribute of a CST; its ranges locate the edit.
 * @param newValue  The **decoded** value wanted.
 * @return No edits when the value already decodes to `newValue`, so an
 *         author's own spelling (`&#65;` for `A`) is never rewritten for
 *         nothing; otherwise one edit.
 */
export function replaceAttributeValue(attr: CstAttribute, newValue: string): TextEdit[] {
  if (decodeEntities(attr.rawValue) === newValue) {
    return [];
  }
  return [{ ...attr.valueRange, text: encodeAttributeValue(newValue, attr.quote) }];
}

/**
 * Add an attribute after the element's last one, following the element's
 * own layout:
 * - no attributes: one space after the tag name;
 * - last attribute shares its line with the previous attribute (or with the
 *   tag name, if it is the only one): one space after it, on that line;
 * - otherwise, one attribute per line: a new line after the last attribute,
 *   with that attribute's indentation and the document's line ending.
 *
 * The value is encoded for its quote, which is the last attribute's quote
 * character so the element stays consistent, or `"` when it has none.
 *
 * @param cst      The tree `element` belongs to.
 * @param element  The element to extend. Must not be an `invalid` recovery.
 * @param name     Attribute name. Not validated: the caller supplies a name.
 * @param value    The **decoded** value.
 * @throws RangeError if the element already has an attribute called `name`;
 *         use `replaceAttributeValue` for that, since a duplicate attribute
 *         is never what an editing intent means.
 */
export function insertAttribute(
  cst: CstDocument,
  element: CstElement,
  name: string,
  value: string,
): TextEdit[] {
  if (element.attributes.some((attr) => attr.name === name)) {
    throw new RangeError(`<${element.name}> already has an attribute '${name}'`);
  }

  // --- Step 1: Choose the quote and encode the value for it ---
  const last = element.attributes.at(-1);
  const quote: CstQuote = last?.quote ?? '"';
  const written = `${name}=${quote}${encodeAttributeValue(value, quote)}${quote}`;

  // --- Step 2: No attributes — one space after the tag name ---
  if (!last) {
    return [{ start: element.nameRange.end, end: element.nameRange.end, text: ` ${written}` }];
  }

  // --- Step 3: Same line as its predecessor, or one per line ---
  const previous = element.attributes.at(-2);
  const anchor = previous ? previous.start : element.nameRange.start;
  const sharesLine = cst.lines.locate(anchor).line === cst.lines.locate(last.start).line;
  // Inline for a second reason too: if something other than whitespace
  // precedes the last attribute on its line, it has no indentation of its own
  // to copy, so a new line would have nothing correct to align to.
  if (sharesLine || !startsLine(cst, last.start)) {
    return [{ start: last.end, end: last.end, text: ` ${written}` }];
  }
  return [
    {
      start: last.end,
      end: last.end,
      text: `${lineBreak(cst)}${indentAt(cst, last.start)}${written}`,
    },
  ];
}

/**
 * Remove an attribute. When it was alone on its line, the whole line goes,
 * line break included; otherwise the attribute and all the whitespace before
 * it go — line breaks included, so an attribute that starts its line but
 * shares it with a following `/>` pulls that `/>` up onto the previous line.
 *
 * @param cst   The tree `attr` belongs to.
 * @param attr  The attribute to remove.
 */
export function removeAttribute(cst: CstDocument, attr: CstAttribute): TextEdit[] {
  // --- Step 1: Alone on its line — remove the line ---
  const nextLine = nextLineStartAt(cst, attr.end);
  if (startsLine(cst, attr.start) && endsLine(cst, attr.end) && nextLine !== undefined) {
    return [{ start: lineStartAt(cst, attr.start), end: nextLine, text: '' }];
  }

  // --- Step 2: Otherwise the attribute and its leading whitespace ---
  // The walk takes CR and LF as well as spaces and tabs (so a CRLF pair goes
  // whole). That is deliberate: the whitespace between the previous token and
  // this attribute belongs to it, and leaving a dangling line break behind
  // would strand the rest of the tag on a line of its own.
  let start = attr.start;
  while (start > 0 && /[ \t\r\n]/.test(cst.text[start - 1] ?? '')) {
    start--;
  }
  return [{ start, end: attr.end, text: '' }];
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/**
 * Insert `xmlFragment` as the `index`-th element child of `parent`.
 *
 * Indentation is copied from the nearest sibling element — the one the
 * fragment goes before, or else the one it goes after. A parent with no
 * element children gives its own line's indentation plus one step, the step
 * learnt from the document (two spaces if it has no nesting to learn from).
 * A self-closing parent is expanded to an open and close tag. Siblings laid
 * out on one line (`<a/><b/>`) get the fragment on that line, as written.
 *
 * A multi-line fragment has every line after its first indented to match, and
 * its line breaks converted to the document's.
 *
 * @param cst          The tree `parent` belongs to.
 * @param parent       The element to insert into. It must be closed or self-
 *                     closing; an element left unclosed by malformed input has
 *                     no place for a child to go.
 * @param index        Position among `parent`'s **element** children, from 0
 *                     (first) to their count (last). Text, comments and
 *                     whitespace are not counted.
 * @param xmlFragment  The element(s) to insert, as XML text, unindented.
 * @throws RangeError for an out-of-range index or an unclosed parent.
 */
export function insertElement(
  cst: CstDocument,
  parent: CstElement,
  index: number,
  xmlFragment: string,
): TextEdit[] {
  const siblings = elementChildren(parent);
  if (!Number.isInteger(index) || index < 0 || index > siblings.length) {
    throw new RangeError(`index ${index} is outside 0..${siblings.length} for <${parent.name}>`);
  }
  if (!parent.selfClosing && !parent.closeTag) {
    throw new RangeError(`<${parent.name}> is not closed, so it has nowhere to insert a child`);
  }
  const eol = lineBreak(cst);

  // --- Step 1: Before the sibling at `index`, copying its indentation ---
  const before = siblings[index];
  if (before) {
    if (!startsLine(cst, before.start)) {
      return [{ start: before.start, end: before.start, text: xmlFragment }];
    }
    const indent = indentAt(cst, before.start);
    const at = lineStartAt(cst, before.start);
    return [{ start: at, end: at, text: `${indent}${reindent(xmlFragment, indent, eol)}${eol}` }];
  }

  // --- Step 2: After the last sibling, copying its indentation ---
  const after = siblings.at(-1);
  if (after) {
    if (!startsLine(cst, after.start)) {
      return [{ start: after.end, end: after.end, text: xmlFragment }];
    }
    const indent = indentAt(cst, after.start);
    const nextLine = nextLineStartAt(cst, after.end);
    if (endsLine(cst, after.end) && nextLine !== undefined) {
      return [{ start: nextLine, end: nextLine, text: `${indent}${reindent(xmlFragment, indent, eol)}${eol}` }];
    }
    return [{ start: after.end, end: after.end, text: `${eol}${indent}${reindent(xmlFragment, indent, eol)}` }];
  }

  // --- Step 3: No element children — parent's indentation plus one step ---
  const parentIndent = indentAt(cst, parent.start);
  const childIndent = parentIndent + indentStep(cst);
  const child = `${childIndent}${reindent(xmlFragment, childIndent, eol)}`;

  if (parent.selfClosing) {
    // Expand `<p .../>` to `<p ...>` + child + `</p>`, dropping any space before `/>`.
    let start = parent.openTag.end - 2;
    while (isHorizontalSpace(cst.text[start - 1])) {
      start--;
    }
    return [
      {
        start,
        end: parent.openTag.end,
        text: `>${eol}${child}${eol}${parentIndent}</${parent.name}>`,
      },
    ];
  }

  // Non-null: the guard at the top refuses a parent that is neither
  // self-closing nor closed, and the self-closing case has returned above.
  const close = parent.closeTag!;
  // The second clause rules out a close tag on the open tag's own line, as in
  // `<view>  </view>`: that close tag "starts" nothing but the gap after the
  // open tag, so inserting at its line start would land before `<view>`.
  if (startsLine(cst, close.start) && lineStartAt(cst, close.start) > parent.openTag.end) {
    const at = lineStartAt(cst, close.start);
    return [{ start: at, end: at, text: `${child}${eol}` }];
  }
  return [{ start: close.start, end: close.start, text: `${eol}${child}${eol}${parentIndent}` }];
}

/**
 * Remove an element: its own lines when it occupies whole lines, line breaks
 * included; otherwise just its text and the spaces separating it from what
 * precedes it on the line. Never an adjacent comment, text or element, which
 * are not the element's.
 *
 * @param cst      The tree `element` belongs to.
 * @param element  The element to remove. Removing the root leaves a document
 *                 with no root, which the parser then reports.
 */
export function removeElement(cst: CstDocument, element: CstElement): TextEdit[] {
  // --- Step 1: Whole lines — remove them, line break included ---
  if (startsLine(cst, element.start) && endsLine(cst, element.end)) {
    const nextLine = nextLineStartAt(cst, element.end);
    const start = lineStartAt(cst, element.start);
    if (nextLine !== undefined) {
      return [{ start, end: nextLine, text: '' }];
    }
    // The last line has no break of its own; take the one before it instead,
    // so no empty last line is left behind. `start - 1` is the final
    // character of that previous break (the LF of a CRLF), and lineEndAt maps
    // it back to where the break begins. Line 1 has no previous break, so the
    // edit runs from the line start: the element was the whole line. The test
    // is the line number, not `start > 0`, because after a BOM line 1 starts
    // at offset 1, and the BOM must survive the removal.
    if (cst.lines.locate(start).line === 1) {
      return [{ start, end: cst.text.length, text: '' }];
    }
    const previousBreak = lineEndAt(cst, start - 1);
    return [{ start: previousBreak, end: cst.text.length, text: '' }];
  }

  // --- Step 2: Shares a line — the element and the spaces before it ---
  let start = element.start;
  if (!startsLine(cst, element.start)) {
    while (isHorizontalSpace(cst.text[start - 1])) {
      start--;
    }
  }
  return [{ start, end: element.end, text: '' }];
}

/**
 * Rename an element: the open tag's name and, when there is one, the close
 * tag's. Nothing else on either line changes.
 *
 * @param element  The element to rename.
 * @param newName  The new tag name. Not validated: the caller supplies a name.
 */
export function renameElementTag(element: CstElement, newName: string): TextEdit[] {
  const edits: TextEdit[] = [{ ...element.nameRange, text: newName }];
  if (element.closeTag) {
    edits.push({ ...element.closeTag.nameRange, text: newName });
  }
  return edits;
}
