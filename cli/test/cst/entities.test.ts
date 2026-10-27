/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/entities.test.ts
 * Purpose: Keeps the CST's copy of the entity rules identical to the
 *          tokeniser's until E-1b deletes the tokeniser. The copy exists so
 *          cst/ does not depend on a module about to be removed; this test is
 *          what stops the two copies drifting in the meantime.
 * Description: Both decoders over the same inputs, plus the one documented
 *              difference: a reference beyond U+10FFFF.
 */

import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../../src/core/cst/index.js';
import { decodeXmlEntities } from '../../src/core/parser/xml-tokeniser.js';

const INPUTS = [
  'plain',
  '&lt;hello&gt; &amp; &quot;world&quot; &apos;!&apos;',
  '&#65; &#x42; &#xe9; &#XE9; &#x1F600;',
  '&nbsp; &unknown; & alone &amp',
  '&&amp;amp;',
  '&#; &#x; &#xZZ;',
];

describe('decodeEntities', () => {
  it.each(INPUTS)('matches the tokeniser on %j', (input) => {
    expect(decodeEntities(input)).toBe(decodeXmlEntities(input));
  });

  it('leaves a reference beyond U+10FFFF as written, where the tokeniser throws', () => {
    expect(decodeEntities('a&#99999999;b')).toBe('a&#99999999;b');
    expect(() => decodeXmlEntities('a&#99999999;b')).toThrow(RangeError);
  });
});
