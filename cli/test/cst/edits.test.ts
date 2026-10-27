/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/edits.test.ts
 * Purpose: The minimal-edit functions: each turns one intent
 *          into a change a reviewer would recognise as exactly that intent —
 *          its target's lines and nothing else, the author's quotes and
 *          indentation kept, comments untouched.
 * Description: Every function runs on five layouts — a compact one-line
 *              document, one attribute per line, the same with CRLF, tab
 *              indentation, and a real departures screen
 *              (`screen_departures.xml`) — and
 *              every case asserts, through `expectEdit`, that the result
 *              re-parses with no diagnostics and that its line diff stays
 *              inside the target's lines. Exact-output cases pin the layout
 *              rules themselves.
 */

import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  insertAttribute,
  insertElement,
  parseCst,
  removeAttribute,
  removeElement,
  renameElementTag,
  replaceAttributeValue,
  type CstDocument,
  type CstElement,
  type CstRange,
  type TextEdit,
} from '../../src/core/cst/index.js';
import { allElements, readRepoFile } from './cst-test-helpers.js';
import { lineDiff } from './line-diff.js';

// ---------------------------------------------------------------------------
// Fixtures: five layouts of the same small screen, each naming its box and
// label so one test body runs on all of them.
// ---------------------------------------------------------------------------

interface Layout {
  readonly title: string;
  readonly text: string;
  readonly box: string;
  readonly label: string;
}

const PER_LINE = [
  '<screen name="a">',
  '    <view>',
  '        <u8g2gl_box',
  '            name="b"',
  '            x="1"',
  '            y="2" />',
  '        <!-- keep me -->',
  '        <u8g2gl_label',
  '            name="l"',
  "            text='a &amp; b'",
  '            />',
  '    </view>',
  '</screen>',
  '',
].join('\n');

const LAYOUTS: readonly Layout[] = [
  {
    title: 'compact one-line',
    text: '<screen name="a"><view><u8g2gl_box name="b" x="1" y="2" /><u8g2gl_label name="l" text="a &amp; b" /></view></screen>\n',
    box: 'b',
    label: 'l',
  },
  { title: 'one attribute per line', text: PER_LINE, box: 'b', label: 'l' },
  { title: 'CRLF', text: PER_LINE.replace(/\n/g, '\r\n'), box: 'b', label: 'l' },
  {
    title: 'tab indentation',
    text: '<screen name="a">\n\t<view>\n\t\t<u8g2gl_box name="b" x="1" y="2" />\n\t\t<!-- keep me -->\n\t\t<u8g2gl_label name="l" text="a &amp; b" />\n\t</view>\n</screen>\n',
    box: 'b',
    label: 'l',
  },
  {
    title: 'departures screen',
    text: readRepoFile(
      '.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/screens/screen_departures.xml',
    ),
    box: 'plat_box',
    label: 'plat_label',
  },
];

function parse(text: string): CstDocument {
  const { cst, diagnostics } = parseCst(text, 'edit.xml');
  expect(diagnostics).toEqual([]);
  return cst;
}

// named / tagged
// Find an element by its `name` attribute, or by tag.
function named(cst: CstDocument, name: string): CstElement {
  const found = allElements(cst).find((e) => e.attributes.some((a) => a.name === 'name' && a.value === name));
  if (!found) throw new Error(`no element named ${name}`);
  return found;
}

function tagged(cst: CstDocument, tag: string): CstElement {
  const found = allElements(cst).find((e) => e.name === tag);
  if (!found) throw new Error(`no <${tag}>`);
  return found;
}

function attr(element: CstElement, name: string) {
  const found = element.attributes.find((a) => a.name === name);
  if (!found) throw new Error(`no ${name} on <${element.name}>`);
  return found;
}

// expectEdit
// Applies `edits` and checks the two properties every edit must have: the
// result is well-formed, and its line diff lies within `target`'s lines.
// A pure insertion has no changed line of its own, so it must instead land
// on a line boundary inside or immediately after the target.
//   oneLine — additionally require exactly one line changed on each side
function expectEdit(
  cst: CstDocument,
  edits: readonly TextEdit[],
  target: CstRange,
  options: { readonly oneLine?: boolean } = {},
): { after: string; reparsed: CstDocument } {
  const after = applyEdits(cst.text, edits);
  const reparsed = parse(after);
  const change = lineDiff(cst.text, after);
  expect(change).toBeDefined();
  const first = cst.lines.locate(target.start).line;
  const last = cst.lines.locate(Math.max(target.end - 1, target.start)).line;
  if (change!.beforeLast < change!.beforeFirst) {
    expect(change!.beforeFirst).toBeGreaterThanOrEqual(first);
    expect(change!.beforeFirst).toBeLessThanOrEqual(last + 1);
  } else {
    expect(change!.beforeFirst).toBeGreaterThanOrEqual(first);
    expect(change!.beforeLast).toBeLessThanOrEqual(last);
  }
  if (options.oneLine) {
    expect(change!.beforeLast - change!.beforeFirst).toBe(0);
    expect(change!.afterLast - change!.afterFirst).toBe(0);
  }
  return { after, reparsed };
}

// ---------------------------------------------------------------------------

describe('replaceAttributeValue', () => {
  it.each(LAYOUTS)('$title: rewrites one value on one line', ({ text, box }) => {
    const cst = parse(text);
    const x = attr(named(cst, box), 'x');
    const { reparsed } = expectEdit(cst, replaceAttributeValue(x, '12'), x, { oneLine: true });
    expect(attr(named(reparsed, box), 'x').value).toBe('12');
  });

  it.each(LAYOUTS)('$title: escapes the quote character and keeps the quote style', ({ text, label }) => {
    const cst = parse(text);
    const textAttr = attr(named(cst, label), 'text');
    const { reparsed } = expectEdit(cst, replaceAttributeValue(textAttr, `say "hi" & 'bye' <b>`), textAttr, {
      oneLine: true,
    });
    const rewritten = attr(named(reparsed, label), 'text');
    expect(rewritten.quote).toBe(textAttr.quote);
    expect(rewritten.value).toBe(`say "hi" & 'bye' <b>`);
  });

  it('replacing `a &amp; b` with `a & c` writes `a &amp; c`', () => {
    const cst = parse('<u8g2gl_label text="a &amp; b" />');
    const edits = replaceAttributeValue(attr(cst.root!, 'text'), 'a & c');
    expect(applyEdits(cst.text, edits)).toBe('<u8g2gl_label text="a &amp; c" />');
  });

  it('single- and double-quoted values keep their quotes and escape only their own quote', () => {
    const cst = parse(`<x a='1' b="2" />`);
    const [a, b] = cst.root!.attributes;
    expect(applyEdits(cst.text, replaceAttributeValue(a!, `it's "x"`))).toBe(`<x a='it&apos;s "x"' b="2" />`);
    expect(applyEdits(cst.text, replaceAttributeValue(b!, `it's "x"`))).toBe(`<x a='1' b="it's &quot;x&quot;" />`);
  });

  it('writes a line break as a reference, so the edit stays on one line', () => {
    const cst = parse('<x a="1" />');
    const a = attr(cst.root!, 'a');
    const { after, reparsed } = expectEdit(cst, replaceAttributeValue(a, 'one\ntwo'), a, { oneLine: true });
    expect(after).toBe('<x a="one&#10;two" />');
    expect(attr(reparsed.root!, 'a').value).toBe('one\ntwo');
  });

  it("returns no edit when the value already decodes to the target, keeping the author's spelling", () => {
    const cst = parse('<x a="&#65;" />');
    expect(replaceAttributeValue(attr(cst.root!, 'a'), 'A')).toEqual([]);
  });
});

describe('insertAttribute', () => {
  it.each(LAYOUTS)('$title: adds an attribute after the last one', ({ text, box }) => {
    const cst = parse(text);
    const element = named(cst, box);
    const { reparsed } = expectEdit(cst, insertAttribute(cst, element, 'hidden', 'a&b'), element);
    const added = named(reparsed, box).attributes.at(-1)!;
    expect(added).toMatchObject({ name: 'hidden', value: 'a&b', rawValue: 'a&amp;b' });
  });

  it.each(LAYOUTS)('$title: an element with no attributes gets one space after its name', ({ text }) => {
    const cst = parse(text);
    const view = tagged(cst, 'view');
    const { after, reparsed } = expectEdit(cst, insertAttribute(cst, view, 'name', 'v'), view.openTag, {
      oneLine: true,
    });
    expect(after).toContain('<view name="v">');
    expect(attr(tagged(reparsed, 'view'), 'name').value).toBe('v');
  });

  it('same line when the attributes share a line', () => {
    const cst = parse('<x a="1" b="2" />');
    expect(applyEdits(cst.text, insertAttribute(cst, cst.root!, 'c', '3'))).toBe('<x a="1" b="2" c="3" />');
  });

  it("one per line, with the attributes' indentation and the file's line ending", () => {
    const cst = parse('<x\r\n\t\ta="1"\r\n\t\tb=\'2\'/>');
    expect(applyEdits(cst.text, insertAttribute(cst, cst.root!, 'c', '3'))).toBe(
      "<x\r\n\t\ta=\"1\"\r\n\t\tb='2'\r\n\t\tc='3'/>",
    );
  });

  it('one per line when the only attribute is on its own line', () => {
    const cst = parse('<x\n    a="1"\n    />');
    expect(applyEdits(cst.text, insertAttribute(cst, cst.root!, 'c', '3'))).toBe('<x\n    a="1"\n    c="3"\n    />');
  });

  it('refuses a duplicate name', () => {
    const cst = parse('<x a="1" />');
    expect(() => insertAttribute(cst, cst.root!, 'a', '2')).toThrow(RangeError);
  });
});

describe('removeAttribute', () => {
  it.each(LAYOUTS)('$title: removes an attribute and only its line or its text', ({ text, box }) => {
    const cst = parse(text);
    const element = named(cst, box);
    const x = attr(element, 'x');
    const { reparsed } = expectEdit(cst, removeAttribute(cst, x), element);
    expect(named(reparsed, box).attributes.map((a) => a.name)).not.toContain('x');
  });

  it('removes the whole line when the attribute was alone on it', () => {
    const cst = parse(PER_LINE);
    const x = attr(named(cst, 'b'), 'x');
    const after = applyEdits(cst.text, removeAttribute(cst, x));
    expect(after).toBe(PER_LINE.replace('            x="1"\n', ''));
  });

  it('removes the attribute and its leading whitespace when it shares a line', () => {
    const cst = parse('<x a="1"  b="2" c="3" />');
    const b = attr(cst.root!, 'b');
    expect(applyEdits(cst.text, removeAttribute(cst, b))).toBe('<x a="1" c="3" />');
  });

  it('keeps CRLF intact when removing a line', () => {
    const text = PER_LINE.replace(/\n/g, '\r\n');
    const cst = parse(text);
    const after = applyEdits(cst.text, removeAttribute(cst, attr(named(cst, 'b'), 'x')));
    expect(after).toBe(text.replace('            x="1"\r\n', ''));
  });
});

describe('insertElement', () => {
  const FRAGMENT = '<u8g2gl_line name="n" x1="0" y1="0" x2="1" y2="1" />';

  it.each(LAYOUTS)('$title: inserts between siblings with the sibling indentation', ({ text }) => {
    const cst = parse(text);
    const view = tagged(cst, 'view');
    const { reparsed } = expectEdit(cst, insertElement(cst, view, 1, FRAGMENT), view);
    const siblings = tagged(reparsed, 'view').children.filter((c): c is CstElement => c.kind === 'element');
    const line = named(reparsed, 'n');
    expect(siblings[1]).toEqual(line);
    // It goes before the sibling that was at index 1 and copies that sibling's indentation.
    const sibling = siblings[2]!;
    expect(sibling.start).toBeGreaterThanOrEqual(line.end);
    const lineOf = (offset: number) => reparsed.lines.locate(offset).line;
    if (lineOf(line.start) !== lineOf(sibling.start)) {
      expect(reparsed.lines.locate(line.start).column).toBe(reparsed.lines.locate(sibling.start).column);
    }
  });

  it.each(LAYOUTS)('$title: appends after the last sibling', ({ text }) => {
    const cst = parse(text);
    const view = tagged(cst, 'view');
    const count = view.children.filter((c) => c.kind === 'element').length;
    const { reparsed } = expectEdit(cst, insertElement(cst, view, count, FRAGMENT), view);
    const newView = tagged(reparsed, 'view');
    expect(newView.children.filter((c) => c.kind === 'element').at(-1)?.name).toBe('u8g2gl_line');
  });

  it('inserts first, before the first sibling, on its own line', () => {
    const cst = parse('<view>\n    <a />\n</view>\n');
    expect(applyEdits(cst.text, insertElement(cst, cst.root!, 0, '<b />'))).toBe(
      '<view>\n    <b />\n    <a />\n</view>\n',
    );
  });

  it('keeps compact siblings compact', () => {
    const cst = parse('<view><a /><b /></view>');
    expect(applyEdits(cst.text, insertElement(cst, cst.root!, 1, '<c />'))).toBe('<view><a /><c /><b /></view>');
  });

  it("expands a self-closing parent, using the document's indentation step", () => {
    const text = '<screen name="a">\n\t<view />\n\t<other>\n\t\t<x />\n\t</other>\n</screen>\n';
    const cst = parse(text);
    const view = tagged(cst, 'view');
    const { after } = expectEdit(cst, insertElement(cst, view, 0, '<c />'), view);
    expect(after).toBe('<screen name="a">\n\t<view>\n\t\t<c />\n\t</view>\n\t<other>\n\t\t<x />\n\t</other>\n</screen>\n');
  });

  it('defaults the step to two spaces when the document has no nesting', () => {
    const cst = parse('<view/>');
    expect(applyEdits(cst.text, insertElement(cst, cst.root!, 0, '<c />'))).toBe('<view>\n  <c />\n</view>');
  });

  it('fills an empty parent whose close tag is on its own line', () => {
    const cst = parse('<screen>\n    <view>\n    </view>\n</screen>\n');
    const view = tagged(cst, 'view');
    const { after } = expectEdit(cst, insertElement(cst, view, 0, '<c />'), view);
    expect(after).toBe('<screen>\n    <view>\n        <c />\n    </view>\n</screen>\n');
  });

  it('fills an empty parent whose tags share a line', () => {
    const cst = parse('<screen>\n    <view></view>\n</screen>\n');
    const view = tagged(cst, 'view');
    const { after } = expectEdit(cst, insertElement(cst, view, 0, '<c />'), view);
    expect(after).toBe('<screen>\n    <view>\n        <c />\n    </view>\n</screen>\n');
  });

  it("indents a multi-line fragment and converts its line breaks to the file's", () => {
    const cst = parse('<view>\r\n  <a />\r\n</view>\r\n');
    const edits = insertElement(cst, cst.root!, 1, '<g>\n  <c />\n</g>');
    expect(applyEdits(cst.text, edits)).toBe('<view>\r\n  <a />\r\n  <g>\r\n    <c />\r\n  </g>\r\n</view>\r\n');
  });

  it('refuses an out-of-range index', () => {
    const cst = parse('<view><a /></view>');
    expect(() => insertElement(cst, cst.root!, 2, '<c />')).toThrow(RangeError);
    expect(() => insertElement(cst, cst.root!, -1, '<c />')).toThrow(RangeError);
  });
});

describe('removeElement', () => {
  it.each(LAYOUTS)('$title: removes the element and never the adjacent comment', ({ text, box }) => {
    const cst = parse(text);
    const element = named(cst, box);
    const { after, reparsed } = expectEdit(cst, removeElement(cst, element), element);
    expect(allElements(reparsed).some((e) => e.attributes.some((a) => a.value === box))).toBe(false);
    if (text.includes('<!-- keep me -->')) {
      expect(after).toContain('<!-- keep me -->');
    }
  });

  it('removes its own lines, line breaks included', () => {
    const cst = parse(PER_LINE);
    const after = applyEdits(cst.text, removeElement(cst, named(cst, 'b')));
    expect(after).toBe(PER_LINE.replace('        <u8g2gl_box\n            name="b"\n            x="1"\n            y="2" />\n', ''));
  });

  it('removes only its text from a compact line', () => {
    const cst = parse('<view><a /> <b /><!-- c --></view>');
    const b = cst.root!.children.find((c) => c.kind === 'element' && c.name === 'b') as CstElement;
    expect(applyEdits(cst.text, removeElement(cst, b))).toBe('<view><a /><!-- c --></view>');
  });

  it('keeps a comment on the line above and the line below', () => {
    const cst = parse('<view>\r\n  <!-- above -->\r\n  <a />\r\n  <!-- below -->\r\n</view>');
    const a = tagged(cst, 'a');
    expect(applyEdits(cst.text, removeElement(cst, a))).toBe('<view>\r\n  <!-- above -->\r\n  <!-- below -->\r\n</view>');
  });
});

describe('renameElementTag', () => {
  it.each(LAYOUTS)('$title: renames the open and close tags', ({ text, box }) => {
    const cst = parse(text);
    const view = tagged(cst, 'view');
    const { reparsed } = expectEdit(cst, renameElementTag(view, 'u8g2gl_view'), view);
    expect(allElements(reparsed).some((e) => e.name === 'view')).toBe(false);
    expect(tagged(reparsed, 'u8g2gl_view').closeTag?.name).toBe('u8g2gl_view');
    // A self-closing element has only its open tag, so one line changes.
    const element = named(cst, box);
    expectEdit(cst, renameElementTag(element, 'u8g2gl_frame'), element.nameRange, { oneLine: true });
  });

  it('changes nothing but the two names', () => {
    const cst = parse('<view a="1">\n  <x />\n</view >');
    expect(applyEdits(cst.text, renameElementTag(cst.root!, 'pane'))).toBe('<pane a="1">\n  <x />\n</pane >');
  });
});

describe('applyEdits', () => {
  it('applies non-overlapping edits from the end, against the original offsets', () => {
    expect(
      applyEdits('abcdef', [
        { start: 0, end: 1, text: 'A' },
        { start: 4, end: 6, text: '' },
        { start: 2, end: 2, text: '+' },
      ]),
    ).toBe('Ab+cd');
  });

  it('lands two insertions at one offset in array order', () => {
    expect(applyEdits('ab', [{ start: 1, end: 1, text: '1' }, { start: 1, end: 1, text: '2' }])).toBe('a12b');
  });

  it('refuses overlapping or out-of-range edits', () => {
    expect(() => applyEdits('abc', [{ start: 0, end: 2, text: '' }, { start: 1, end: 3, text: '' }])).toThrow(RangeError);
    expect(() => applyEdits('abc', [{ start: 2, end: 5, text: '' }])).toThrow(RangeError);
  });
});
