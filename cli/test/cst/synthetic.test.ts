/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/synthetic.test.ts
 * Purpose: Round-trips the inputs the repository corpus lacks. The corpus
 *          has no CRLF file and only one with entities, so losslessness on
 *          those is unproven by the corpus test alone — and they are exactly
 *          the files a Windows user or a hand-edited document will bring.
 * Description: One named case per input shape. Each asserts the round-trip,
 *              that a well-formed case parses with no diagnostics, and a
 *              property of the tree that proves the case was parsed as
 *              intended rather than swallowed into one text node.
 */

import { describe, expect, it } from 'vitest';
import { parseCst, printCst, type CstDocument } from '../../src/core/cst/index.js';
import { allElements } from './cst-test-helpers.js';

// roundTrip
// Parses `text`, asserts it prints back byte for byte with no diagnostics,
// and returns the tree for the case's own assertions.
function roundTrip(text: string): CstDocument {
  const { cst, diagnostics } = parseCst(text, 'synthetic.xml');
  expect(diagnostics).toEqual([]);
  expect(printCst(cst)).toBe(text);
  return cst;
}

describe('CST round-trip on a synthetic corpus', () => {
  it('CRLF line endings', () => {
    const text = '<screen name="a">\r\n  <view>\r\n    <u8g2gl_box x="1" />\r\n  </view>\r\n</screen>\r\n';
    const cst = roundTrip(text);
    const box = allElements(cst).find((e) => e.name === 'u8g2gl_box');
    expect(cst.lines.locate(box!.start)).toEqual({ line: 3, column: 5 });
  });

  it('mixed line endings (LF, CRLF and a lone CR)', () => {
    const text = '<screen name="a">\n  <view>\r\n    <u8g2gl_box x="1" />\r  </view>\n</screen>';
    const cst = roundTrip(text);
    const view = allElements(cst).find((e) => e.name === 'view');
    expect(cst.lines.locate(view!.closeTag!.start)).toEqual({ line: 4, column: 3 });
  });

  it('a byte-order mark', () => {
    const text = '\uFEFF<?xml version="1.0"?>\n<screen name="a"/>\n';
    const cst = roundTrip(text);
    expect(cst.bom).toBe(true);
    expect(cst.root?.name).toBe('screen');
    // The BOM occupies no column: the declaration starts at 1:1.
    expect(cst.lines.locate(1)).toEqual({ line: 1, column: 1 });
  });

  it('tab indentation', () => {
    const text = '<screen name="a">\n\t<view>\n\t\t<u8g2gl_box x="1" />\n\t</view>\n</screen>\n';
    const cst = roundTrip(text);
    const box = allElements(cst).find((e) => e.name === 'u8g2gl_box');
    // A tab is one column, like every other UTF-16 code unit (line-index.ts).
    expect(cst.lines.locate(box!.start)).toEqual({ line: 3, column: 3 });
  });

  it('single and double quotes', () => {
    const text = `<screen name='a' title="b" mixed='say "hi"' other="it's" />`;
    const cst = roundTrip(text);
    const attrs = cst.root!.attributes;
    expect(attrs.map((a) => a.quote)).toEqual(["'", '"', "'", '"']);
    expect(attrs[2]?.value).toBe('say "hi"');
    expect(attrs[3]?.value).toBe("it's");
  });

  it('&amp; and &#x…; references in values', () => {
    const text = '<screen name="a &amp; b" text="caf&#xE9; &#65;&lt;&gt;&quot;&apos;" />';
    const cst = roundTrip(text);
    const [name, label] = cst.root!.attributes;
    expect(name?.rawValue).toBe('a &amp; b');
    expect(name?.value).toBe('a & b');
    expect(label?.value).toBe('café A<>"\'');
  });

  it('a comment before the root', () => {
    const text = '<!-- header -->\n<screen name="a" />\n';
    const cst = roundTrip(text);
    expect(cst.children.map((c) => c.kind)).toEqual(['comment', 'whitespace', 'element', 'whitespace']);
  });

  it("a comment between attributes' lines", () => {
    // Comments are not legal inside a tag, so "between the attributes' lines"
    // means between elements whose attributes are one per line.
    const text = [
      '<view>',
      '    <u8g2gl_box',
      '        x="1"',
      '        y="2" />',
      '    <!-- between -->',
      '    <u8g2gl_box',
      '        x="3"',
      '        y="4" />',
      '</view>',
      '',
    ].join('\n');
    const cst = roundTrip(text);
    expect(cst.root!.children.filter((c) => c.kind === 'comment')).toHaveLength(1);
  });

  it('a comment inside text', () => {
    const text = '<label>before <!-- note --> after</label>';
    const cst = roundTrip(text);
    expect(cst.root!.children.map((c) => c.kind)).toEqual(['text', 'comment', 'text']);
  });

  it('a CDATA section', () => {
    const text = '<label><![CDATA[a < b && c]]></label>';
    const cst = roundTrip(text);
    const [cdata] = cst.root!.children;
    expect(cdata?.kind).toBe('cdata');
    expect(cdata?.kind === 'cdata' && cdata.value).toBe('a < b && c');
  });

  it('with an XML declaration', () => {
    const text = '<?xml version="1.0" encoding="UTF-8"?>\n<screen name="a" />';
    const cst = roundTrip(text);
    expect(cst.children[0]?.kind).toBe('xml-declaration');
  });

  it('without an XML declaration', () => {
    const text = '<screen name="a" />';
    const cst = roundTrip(text);
    expect(cst.children.map((c) => c.kind)).toEqual(['element']);
  });

  it('with a trailing newline', () => {
    const text = '<screen name="a" />\n';
    const cst = roundTrip(text);
    expect(cst.children.at(-1)?.kind).toBe('whitespace');
  });

  it('without a trailing newline', () => {
    const text = '<screen name="a">\n</screen>';
    const cst = roundTrip(text);
    expect(cst.children.at(-1)?.kind).toBe('element');
  });
});
