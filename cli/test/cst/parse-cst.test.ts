/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/parse-cst.test.ts
 * Purpose: The tree's shape: that each node kind is produced where it should
 *          be and carries the fields the edit functions rely on. The corpus
 *          tests prove the tree is lossless; these prove it is the right tree.
 * Description: Small hand-written documents with exact expectations on node
 *              kinds, ranges, names, quote characters and line/column lookup,
 *              plus losslessness on malformed input.
 */

import { describe, expect, it } from 'vitest';
import { LineIndex, parseCst, printCst } from '../../src/core/cst/index.js';
import { allElements } from './cst-test-helpers.js';

describe('parseCst — tree shape', () => {
  it('records element names, tags, self-closing form and children', () => {
    const text = '<view a="1"><box/><box></box></view>';
    const { cst, diagnostics } = parseCst(text, 't.xml');
    expect(diagnostics).toEqual([]);
    const view = cst.root!;
    expect(view.name).toBe('view');
    expect(view.openTag).toEqual({ start: 0, end: 12 });
    expect(view.closeTag).toMatchObject({ start: 29, end: 36, name: 'view' });
    expect(view.selfClosing).toBe(false);
    const [first, second] = view.children;
    expect(first?.kind === 'element' && first.selfClosing).toBe(true);
    expect(first?.kind === 'element' && first.closeTag).toBeUndefined();
    expect(second?.kind === 'element' && second.selfClosing).toBe(false);
    expect(second?.kind === 'element' && second.children).toEqual([]);
  });

  it('gives an attribute name, value and whole-attribute ranges', () => {
    const text = '<box  width = "24" />';
    const { cst } = parseCst(text, 't.xml');
    const [attr] = cst.root!.attributes;
    expect(attr).toMatchObject({
      kind: 'attribute',
      name: 'width',
      start: 6,
      end: 18,
      nameRange: { start: 6, end: 11 },
      valueRange: { start: 15, end: 17 },
      quote: '"',
      rawValue: '24',
      value: '24',
    });
  });

  it('splits processing instructions from the XML declaration', () => {
    const text = '<?xml version="1.0"?><?xml-stylesheet href="a"?><r><?pi x?></r>';
    const { cst } = parseCst(text, 't.xml');
    expect(cst.children[0]).toMatchObject({ kind: 'xml-declaration', body: ' version="1.0"' });
    expect(cst.children[1]).toMatchObject({ kind: 'processing-instruction', target: 'xml-stylesheet' });
    expect(cst.root!.children[0]).toMatchObject({ kind: 'processing-instruction', target: 'pi', body: ' x' });
  });

  it('separates whitespace trivia from text and decodes text', () => {
    const text = '<r>\n  <a/>\n  x &amp; y\n</r>';
    const { cst } = parseCst(text, 't.xml');
    const kinds = cst.root!.children.map((c) => c.kind);
    expect(kinds).toEqual(['whitespace', 'element', 'text']);
    const textNode = cst.root!.children[2];
    expect(textNode?.kind === 'text' && textNode.value).toBe('\n  x & y\n');
  });

  it('tiles every parent with no gap', () => {
    const text = '<?xml version="1.0"?>\n<!-- c -->\n<r a="1">\n  <b c=\'2\'/> t <![CDATA[x]]>\n</r>\n';
    const { cst } = parseCst(text, 't.xml');
    let cursor = 0;
    for (const child of cst.children) {
      expect(child.start).toBe(cursor);
      cursor = child.end;
    }
    expect(cursor).toBe(text.length);
    for (const element of allElements(cst)) {
      let inner = element.openTag.end;
      for (const child of element.children) {
        expect(child.start).toBe(inner);
        inner = child.end;
      }
      expect(inner).toBe(element.closeTag?.start ?? element.end);
    }
  });

  it('stays lossless on malformed input', () => {
    const cases = [
      '',
      '   ',
      '<',
      '<>',
      '< >text',
      'hello <root/>',
      '<a b></a>',
      '<a b=c></a>',
      '<a b="unclosed',
      '<a><b></a>',
      '<a></b',
      '<a/><b/>',
      '<a><!-- unclosed',
      '<a><![CDATA[ unclosed',
      '<?xml unclosed',
      '<a x="1" @ y="2"/>',
      '<a></a> trailing',
    ];
    for (const text of cases) {
      const { cst } = parseCst(text, 'bad.xml');
      expect(printCst(cst), JSON.stringify(text)).toBe(text);
    }
  });
});

describe('LineIndex', () => {
  it('counts LF, CRLF and lone CR as one line break each', () => {
    const index = new LineIndex('a\nb\r\nc\rd');
    expect(index.lineCount).toBe(4);
    expect(index.locate(0)).toEqual({ line: 1, column: 1 });
    expect(index.locate(2)).toEqual({ line: 2, column: 1 });
    expect(index.locate(5)).toEqual({ line: 3, column: 1 });
    expect(index.locate(7)).toEqual({ line: 4, column: 1 });
    expect(index.lineStart(3)).toBe(5);
  });

  it('counts a tab as one column and skips a BOM on line 1 only', () => {
    expect(new LineIndex('\t\tx').locate(2)).toEqual({ line: 1, column: 3 });
    const bom = new LineIndex('\uFEFFab\ncd');
    expect(bom.locate(1)).toEqual({ line: 1, column: 1 });
    expect(bom.locate(2)).toEqual({ line: 1, column: 2 });
    expect(bom.locate(5)).toEqual({ line: 2, column: 2 });
  });
});
