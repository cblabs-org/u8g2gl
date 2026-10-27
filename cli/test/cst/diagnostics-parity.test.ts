/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/diagnostics-parity.test.ts
 * Purpose: On malformed input the CST reports what today's tokeniser
 *          reports: the same diagnostic code at the same line and column, in
 *          the same order. The parser does not consume the CST yet; when it
 *          replaces the tokeniser, every location an author or a test relies
 *          on must survive that swap unmoved.
 * Description: Three corpora, each run through both `tokenizeXml` and
 *              `parseCst`: every tracked `.xml` file in the repository (which
 *              includes the malformed fixtures, and checks that well-formed
 *              files stay diagnostic-free in both); the inline malformed cases
 *              of parser/malformed.test.ts and parser/xml-tokeniser.test.ts,
 *              copied verbatim; and one case per recovery branch of the
 *              tokeniser, so every branch is compared at least once.
 */

import { describe, expect, it } from 'vitest';
import { parseCst } from '../../src/core/cst/index.js';
import { tokenizeXml } from '../../src/core/parser/xml-tokeniser.js';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';
import { readRepoFile, repoXmlFiles } from './cst-test-helpers.js';

// located
// Parity is defined over code, line and column; messages are prose and may
// be reworded independently.
function located(diagnostics: readonly Diagnostic[]): Array<Pick<Diagnostic, 'code' | 'line' | 'column'>> {
  return diagnostics.map(({ code, line, column }) => ({ code, line, column }));
}

function expectParity(text: string, file: string): void {
  const expected = located(tokenizeXml(text, file).diagnostics);
  const actual = located(parseCst(text, file).diagnostics);
  expect(actual).toEqual(expected);
}

/** Inline malformed inputs from parser/malformed.test.ts and parser/xml-tokeniser.test.ts. */
const EXISTING_INLINE_CASES: ReadonlyArray<readonly [string, string]> = [
  ['mismatched closing tags', `<screen name="mismatch">\n    <view>\n    </screen>\n</view>`],
  ['unclosed tags at EOF', `<globals>\n    <consts>\n        <int name="x" value="1" />`],
  ['unclosed tag', `<screen name="home">\n    <view>\n</screen>`],
  ['unclosed attribute quote', `<label text="unclosed />`],
  ['empty document', '   \n  <!-- comment only -->  \n'],
];

/** One input per diagnostic site in the tokeniser, including its recovery quirks. */
const BRANCH_CASES: ReadonlyArray<readonly [string, string]> = [
  ['empty input', ''],
  ['whitespace only', ' \r\n\t '],
  ['unclosed comment in the prolog', '<!-- never closed\n<a/>'],
  ['unclosed comment in content', '<a>\n  <!-- never closed'],
  ['unclosed PI in the prolog', '<?xml version="1.0"'],
  ['unclosed PI in content', '<a><?pi oops'],
  ['missing tag name', '<a>< >text</a>'],
  ['missing tag name at the root', '<>'],
  ['bare <', '<'],
  ['text before the root', 'hello <root/>'],
  ['unexpected character in attributes', '<a x="1" @ y="2"/>'],
  ['unexpected end inside a tag', '<a x="1"'],
  ['missing =', '<a b></a>'],
  ['missing = then a value', '<a b "c"></a>'],
  ['unquoted value', '<a b=c></a>'],
  ['unquoted value at end of input', '<a b='],
  ['unclosed quote, multi-line', '<a b="one\ntwo\n'],
  ['open tag never closed', '<a b="1"'],
  ['close tag missing >', '<a></a'],
  ['close tag missing > then text', '<a></a x>'],
  ['mismatched close', '<a><b></a></b>'],
  ['two roots', '<a/><b/>'],
  ['trailing text', '<a></a> trailing'],
  ['trailing comment and PI are fine', '<a/>\n<!-- c -->\n<?pi?>\n'],
  ['CRLF locations', '<a>\r\n  <b c=d/>\r\n</a>'],
  ['lone CR locations', '<a>\r  <b c=d/>\r</a>'],
  ['tabs before the error', '<a>\n\t\t<b c=d/>\n</a>'],
  ['astral characters before the error', '<a t="😀">😀 <b c=d/></a>'],
  ['deep unclosed nesting', '<a><b><c><d>'],
];

describe('CST diagnostics parity with tokenizeXml', () => {
  const files = repoXmlFiles();

  it.each(files)('repository file %s', (file) => {
    expectParity(readRepoFile(file), file);
  });

  it('includes the malformed fixture, and it is malformed', () => {
    const file = 'cli/test/parser/fixtures/malformed.xml';
    expect(files).toContain(file);
    expect(parseCst(readRepoFile(file), file).diagnostics.length).toBeGreaterThan(0);
  });

  it.each(EXISTING_INLINE_CASES)('existing test case: %s', (_name, text) => {
    expectParity(text, 'inline.xml');
  });

  it.each(BRANCH_CASES)('recovery branch: %s', (_name, text) => {
    expectParity(text, 'branch.xml');
  });
});
