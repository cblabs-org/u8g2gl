/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/entities.test.ts
 * Purpose: There is one entity rule, the CST's, and the parser's public
 *          `decodeXmlEntities` is it. Two copies existed while the old
 *          tokeniser lived; this test used to keep them from drifting, and now
 *          holds that the public name has not quietly become a second copy.
 * Description: The public name is the CST's function, checked on the inputs
 *              the two copies were once compared over, with their results.
 */

import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../../src/core/cst/index.js';
import { decodeXmlEntities } from '../../src/core/parser/index.js';

const CASES: ReadonlyArray<readonly [string, string]> = [
  ['plain', 'plain'],
  ['&lt;hello&gt; &amp; &quot;world&quot; &apos;!&apos;', `<hello> & "world" '!'`],
  ['&#65; &#x42; &#xe9; &#XE9; &#x1F600;', 'A B é &#XE9; 😀'],
  ['&nbsp; &unknown; & alone &amp', '&nbsp; &unknown; & alone &amp'],
  ['&&amp;amp;', '&&amp;'],
  ['&#; &#x; &#xZZ;', '&#; &#x; &#xZZ;'],
];

describe('decodeEntities', () => {
  it('is the parser’s public decodeXmlEntities', () => {
    expect(decodeXmlEntities).toBe(decodeEntities);
  });

  it.each(CASES)('decodes %j', (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });

  it('leaves a reference beyond U+10FFFF as written, where the old tokeniser threw', () => {
    expect(decodeEntities('a&#99999999;b')).toBe('a&#99999999;b');
  });
});
