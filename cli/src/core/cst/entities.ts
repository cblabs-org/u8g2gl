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
 * Exports:
 * - decodeEntities(): Replace predefined and numeric entity references
 */

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
