/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/raw-adapter.test.ts
 * Purpose: `tokenizeXml` is what every parser in core/parser/ reads XML
 *          through, and it is public API. It builds its RawXmlDocument from
 *          the CST, and the consumers downstream depend on that tree's exact
 *          shape — so the tree it returns and the diagnostics it reports must
 *          match the recorded tokeniser on every input it was recorded on.
 * Description: Compares against the two goldens recorded from the tokeniser
 *              (tokeniser-golden.ts): the full tree for every tracked `.xml`
 *              file and inline case, and every diagnostic including its
 *              message. A repository file edited since the recording fails as a
 *              stale entry, by hash, before its tree is compared. Then the three
 *              inputs the recorded tokeniser rejected and the CST accepts, each
 *              checked against its recorded failure; and the offset ranges of
 *              every element and attribute, checked against the text.
 */

import { describe, expect, it } from 'vitest';
import { LineIndex } from '../../src/core/cst/index.js';
import { decodeXmlEntities, tokenizeXml } from '../../src/core/parser/index.js';
import type { RawXmlElement } from '../../src/core/parser/index.js';
import { readRepoFile, repoXmlFiles } from './cst-test-helpers.js';
import {
  freezeDiagnostics,
  freezeTree,
  loadDiagnosticsGolden,
  loadTreesGolden,
  sha256,
} from './tokeniser-golden.js';

const trees = loadTreesGolden();
const diagnostics = loadDiagnosticsGolden();

describe('tokenizeXml matches the recorded tokeniser', () => {
  it.each(trees.repositoryFiles)('tree of repository file $file', ({ file, sha256: recorded, root }) => {
    const text = readRepoFile(file);
    expect(sha256(text), `${file} changed since the tokeniser was recorded`).toBe(recorded);
    expect(freezeTree(tokenizeXml(text, file), file)).toEqual(root);
  });

  it.each(trees.inlineCases)('tree of inline case: $name', ({ file, text, root }) => {
    expect(freezeTree(tokenizeXml(text, file), file)).toEqual(root);
  });

  it.each(diagnostics.repositoryFiles)('diagnostics of repository file $file', ({ file, diagnostics: recorded }) => {
    expect(freezeDiagnostics(tokenizeXml(readRepoFile(file), file).diagnostics)).toEqual(recorded);
  });

  it.each(diagnostics.inlineCases)('diagnostics of $group case: $name', ({ file, text, diagnostics: recorded }) => {
    expect(freezeDiagnostics(tokenizeXml(text, file).diagnostics)).toEqual(recorded);
  });
});

// difference
// The recorded entry for one intentional difference, by name.
function difference(name: string): (typeof diagnostics.intentionalDifferences)[number] {
  const entry = diagnostics.intentionalDifferences.find((d) => d.name === name);
  if (!entry) {
    throw new Error(`no recorded difference '${name}'`);
  }
  return entry;
}

describe('inputs the recorded tokeniser rejected parse cleanly', () => {
  it('a leading BOM is skipped and occupies no column', () => {
    // Recorded: two diagnostics.
    const { file, text, diagnostics: before } = difference('leading BOM');
    expect(before?.map((d) => d.message)).toEqual([
      'Expected element tag name after "<"',
      'Multiple root elements or unexpected trailing content',
    ]);
    const doc = tokenizeXml(text, file);
    expect(doc.diagnostics).toEqual([]);
    expect(freezeTree(doc, file)).toEqual({
      name: 'screen',
      loc: '1:1',
      endLoc: '3:1',
      attributes: [['name', 'bom', '1:15', '1:9']],
      comments: [],
      children: [{ name: 'view', loc: '2:5', endLoc: '2:10', attributes: [], comments: [], children: [] }],
    });
  });

  it('CDATA in content joins the text undecoded', () => {
    // Recorded: a missing tag name.
    const { file, text, diagnostics: before } = difference('CDATA in element content');
    expect(before?.map((d) => [d.line, d.column, d.message])).toEqual([
      [1, 11, 'Expected element tag name after "<"'],
    ]);
    const doc = tokenizeXml(text, file);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.root?.textContent).toBe('before x < y && z after');
  });

  it('a character reference beyond U+10FFFF is left as written', () => {
    // Recorded: a thrown RangeError.
    const { file, text, threw } = difference('character reference beyond U+10FFFF');
    expect(threw).toMatch(/^RangeError/);
    const doc = tokenizeXml(text, file);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.root?.attributes[0]?.value).toBe('x&#99999999;y');
  });
});

// eachElement
// Every element of a raw tree, depth first.
function eachElement(root: RawXmlElement | undefined, visit: (element: RawXmlElement) => void): void {
  if (root) {
    visit(root);
    root.children.forEach((child) => eachElement(child, visit));
  }
}

describe('raw tree ranges', () => {
  it('locate a small document exactly', () => {
    const text = '<a x="1&amp;2">\n  <b/>\n</a>';
    const root = tokenizeXml(text, 'r.xml').root;
    expect(root?.range).toEqual({ start: 0, end: text.length });
    const attr = root?.attributes[0];
    expect(attr?.nameRange).toEqual({ start: 3, end: 4 });
    expect(attr?.valueRange).toEqual({ start: 6, end: 13 });
    expect(attr?.value).toBe('1&2');
    expect(root?.children[0]?.range).toEqual({ start: 18, end: 22 });
  });

  it('run to end of input on an element never closed', () => {
    const text = '<a><b>';
    const root = tokenizeXml(text, 'r.xml').root;
    expect(root?.range).toEqual({ start: 0, end: 6 });
    expect(root?.children[0]?.range).toEqual({ start: 3, end: 6 });
  });

  it.each(repoXmlFiles())('agree with the text and with every loc in %s', (file) => {
    const text = readRepoFile(file);
    const lines = new LineIndex(text);
    const at = (offset: number): { line: number; column: number } => lines.locate(offset);
    eachElement(tokenizeXml(text, file).root, (element) => {
      expect(text.startsWith(element.name, element.range.start + 1)).toBe(true);
      expect(at(element.range.start)).toEqual({ line: element.loc.line, column: element.loc.column });
      for (const attr of element.attributes) {
        expect(text.slice(attr.nameRange.start, attr.nameRange.end)).toBe(attr.name);
        const raw = text.slice(attr.valueRange.start, attr.valueRange.end);
        expect(decodeXmlEntities(raw.replace(/\r\n?/g, '\n'))).toBe(attr.value);
        expect(at(attr.nameRange.start)).toEqual({ line: attr.nameLoc.line, column: attr.nameLoc.column });
        expect(at(attr.valueRange.start)).toEqual({ line: attr.loc.line, column: attr.loc.column });
      }
    });
  });
});
