/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/entities.ts
 * Purpose: The CST's entity rules: how an attribute's or text's raw source
 *          becomes the value a consumer reads. They must be the same rules the
 *          generator sees today, or a value would change meaning when E-1b
 *          moves the parser onto the CST.
 * Description: A deliberate copy of `decodeXmlEntities` from
 *              parser/xml-tokeniser.ts, not an import of it. E-1b deletes the
 *              tokeniser once nothing imports it; an import from cst/ would
 *              be exactly the thing that kept it alive. Until then the two must
 *              stay identical, and cli/test/cst/entities.test.ts checks that
 *              — apart from the one out-of-range case noted in the body.
 *
 *              The encoder is the CST's own: it writes the fewest references
 *              that make a value safe inside a given quote character, so an
 *              edit changes no more of the author's text than it must.
 *
 * Exports:
 * - decodeEntities():        Replace predefined and numeric entity references
 * - encodeAttributeValue():  Escape a value for writing between a given quote
 */

import type { CstQuote } from './cst-types.js';

/**
 * Decode the five predefined XML entities and decimal/hex character
 * references. An unrecognised reference such as `&nbsp;` is left as written,
 * which is the tokeniser's behaviour.
 */
export function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, entity: string) => {
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
      default: {
        const code = entity.startsWith('#x')
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        // One deliberate difference from the tokeniser: a reference beyond
        // U+10FFFF is left as written. String.fromCodePoint throws a
        // RangeError there, and the tokeniser lets it escape, so `&#9999999;`
        // crashes today's parser instead of producing a diagnostic.
        return Number.isNaN(code) || code > 0x10ffff ? match : String.fromCodePoint(code);
      }
    }
  });
}

/**
 * Escape `value` so it can be written between `quote` characters and decode
 * back to exactly `value`. Escapes `&`, `<`, the given quote (and only that
 * one, so `'it"s'` stays readable), and line breaks.
 *
 * Line breaks are written as character references because a literal one would
 * split the attribute across lines: a single-value edit must stay a single-
 * line change, and the reference decodes back to the same character.
 */
export function encodeAttributeValue(value: string, quote: CstQuote): string {
  return value.replace(/[&<"'\n\r]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '"':
        return quote === '"' ? '&quot;' : ch;
      case "'":
        return quote === "'" ? '&apos;' : ch;
      case '\n':
        return '&#10;';
      default:
        return '&#13;';
    }
  });
}
