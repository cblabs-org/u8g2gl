/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/xml-tokeniser.test.ts
 * Purpose: Tests `tokenizeXml` and `decodeXmlEntities`, the parser's public reader
 *          of the raw element tree, which is built from the CST.
 * Description: Asserts accurate line and column source coordinate extraction, entity
 *              decoding, self-closing tag handling, comment preservation, and malformed
 *              syntax diagnostics.
 */

import { describe, expect, it } from 'vitest';
import {
  tokenizeXml,
  decodeXmlEntities,
} from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';

describe('tokenizeXml', () => {
  it('decodes standard and numeric XML entities', () => {
    expect(decodeXmlEntities('&lt;hello&gt; &amp; &quot;world&quot; &apos;!&apos;')).toBe(
      '<hello> & "world" \'!\'',
    );
    expect(decodeXmlEntities('&#65; &#x42;')).toBe('A B');
  });

  it('tracks accurate 1-based source locations for elements and attributes', () => {
    const xml = `<!-- Comment -->
<screen name="home">
    <u8g2gl_label text="Hello" x="10" />
</screen>`;

    const doc = tokenizeXml(xml, 'screen.xml');
    expect(doc.diagnostics).toHaveLength(0);
    expect(doc.root).toBeDefined();

    const root = doc.root!;
    expect(root.name).toBe('screen');
    expect(root.loc.line).toBe(2);
    expect(root.loc.column).toBe(1);

    const nameAttr = root.attributes.find((a) => a.name === 'name');
    expect(nameAttr).toBeDefined();
    expect(nameAttr?.value).toBe('home');
    expect(nameAttr?.loc.line).toBe(2);
    expect(nameAttr?.loc.column).toBe(15); // column of 'h' in "home"

    expect(root.children).toHaveLength(1);
    const label = root.children[0]!;
    expect(label.name).toBe('u8g2gl_label');
    expect(label.loc.line).toBe(3);
    expect(label.loc.column).toBe(5);

    const textAttr = label.attributes.find((a) => a.name === 'text');
    expect(textAttr?.value).toBe('Hello');
    expect(textAttr?.loc.line).toBe(3);
    expect(textAttr?.loc.column).toBe(25); // column of 'H' in "Hello"

    const xAttr = label.attributes.find((a) => a.name === 'x');
    expect(xAttr?.value).toBe('10');
    expect(xAttr?.loc.line).toBe(3);
    expect(xAttr?.loc.column).toBe(35); // column of '1' in "10"
  });

  it('handles self-closing elements and nested structures', () => {
    const xml = `<view><item a="1" /><item b="2" /></view>`;
    const doc = tokenizeXml(xml, 'test.xml');
    expect(doc.diagnostics).toHaveLength(0);
    expect(doc.root?.children).toHaveLength(2);
    expect(doc.root?.children[0]?.attributes[0]?.value).toBe('1');
    expect(doc.root?.children[1]?.attributes[0]?.value).toBe('2');
  });

  it('detects unclosed tags and reports U8G2GL_MALFORMED_XML', () => {
    const xml = `<screen name="home">\n    <view>\n</screen>`;
    const doc = tokenizeXml(xml, 'unclosed.xml');
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    const diag = doc.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MALFORMED_XML,
    );
    expect(diag).toBeDefined();
    expect(diag?.file).toBe('unclosed.xml');
  });

  it('detects unclosed attribute quote', () => {
    const xml = `<label text="unclosed />`;
    const doc = tokenizeXml(xml, 'quote.xml');
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(doc.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.MALFORMED_XML);
  });

  it('detects empty documents', () => {
    const doc = tokenizeXml('   \n  <!-- comment only -->  \n', 'empty.xml');
    expect(doc.diagnostics.length).toBe(1);
    expect(doc.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.MALFORMED_XML);
  });
});
