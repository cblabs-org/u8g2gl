/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/element-tree.test.ts
 * Purpose: The Explorer's element tree is the screen's named elements nested
 *          as written, in document order, with unnamed wrappers adding no row;
 *          text that does not parse keeps the last good tree; an unchanged
 *          tree is the same object, so the Explorer does not re-render; and
 *          the Explorer's expanded screens are remembered, or quietly not when
 *          storage fails.
 * Description: Literal documents through `elementTree()` and `nextTrees()`, and
 *              `ExplorerExpansion` over an in-memory or a throwing storage.
 */

import { expect, test } from '@playwright/test';
import { descendantNames, elementTree, nextTrees, type ElementNode } from '../../src/documents/element-tree';
import { EXPANSION_KEY, ExplorerExpansion } from '../../src/ui/explorer-expansion';

const SCREEN = [
  '<screen name="home">',
  '  <view>',
  '    <u8g2gl_container name="panel" x="0" y="0" width="40" height="20">',
  '      <u8g2gl_label name="title" x="2" y="2" width="10" height="8" text="a">',
  '        <bind_flag_if_eq subject="s" ref_value="0" flag="hidden" />',
  '      </u8g2gl_label>',
  '      <u8g2gl_box name="frame" x="0" y="0" width="40" height="20" />',
  '    </u8g2gl_container>',
  '    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />',
  '  </view>',
  '</screen>',
  '',
].join('\n');

// shape
// A tree as nested `name:tag` strings, so a failure reads at a glance.
function shape(nodes: readonly ElementNode[]): unknown[] {
  return nodes.map((node) => (node.children.length === 0 ? node.name : { [node.name]: shape(node.children) }));
}

test('nests named elements as written, in document order, without the root, <view> or a binding as rows', () => {
  const tree = elementTree(SCREEN);
  expect(tree === undefined ? undefined : shape(tree)).toEqual([{ panel: ['title', 'frame'] }, 'rule']);
  expect(tree?.[0]).toMatchObject({ name: 'panel', tag: 'u8g2gl_container' });
  expect(tree?.[1]).toMatchObject({ name: 'rule', tag: 'u8g2gl_line' });
});

test('a document with no named element has an empty tree; one that does not tokenise has none', () => {
  expect(elementTree('<screen name="s">\n  <view />\n</screen>\n')).toEqual([]);
  expect(elementTree(SCREEN.replace('<u8g2gl_line', '<u8g2gl_li ne='))).toBeUndefined();
});

test('text that does not parse keeps the last good tree; a removed screen is dropped', () => {
  const first = nextTrees(new Map(), new Map([['screens/a.xml', SCREEN], ['screens/b.xml', SCREEN]]));
  const broken = nextTrees(first, new Map([['screens/a.xml', SCREEN.replace('<u8g2gl_line', '<u8g2gl_li ne=')]]));
  expect(broken.get('screens/a.xml')).toBe(first.get('screens/a.xml'));
  expect(broken.has('screens/b.xml')).toBe(false);
  // A screen that never parsed has no tree yet.
  expect(nextTrees(new Map(), new Map([['screens/c.xml', '<screen']])).has('screens/c.xml')).toBe(false);
});

test('an edit that moves no row returns the same map; one that adds, renames or reorders a row does not', () => {
  const texts = new Map([['screens/a.xml', SCREEN]]);
  const first = nextTrees(new Map(), texts);
  expect(nextTrees(first, new Map([['screens/a.xml', SCREEN.replace('x1="0"', 'x1="7"')]]))).toBe(first);
  // The same string is not tokenised again, and changes nothing.
  expect(nextTrees(first, texts, texts)).toBe(first);
  expect(nextTrees(first, new Map([['screens/a.xml', SCREEN.replace('name="rule"', 'name="rule_2"')]]))).not.toBe(first);
  const reordered = SCREEN.replace(
    '    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />\n',
    '',
  ).replace('  <view>\n', '  <view>\n    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />\n');
  const moved = nextTrees(first, new Map([['screens/a.xml', reordered]])).get('screens/a.xml');
  expect(moved?.map((node) => node.name)).toEqual(['rule', 'panel']);
});

test('descendants are every row nested under the named ones, at any depth', () => {
  const tree = elementTree(SCREEN) ?? [];
  expect([...descendantNames(tree, new Set(['panel']))]).toEqual(['title', 'frame']);
  expect([...descendantNames(tree, new Set(['rule', 'gone']))]).toEqual([]);
});

/** An in-memory storage, as `localStorage` behaves. */
function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

test('expanded screens are remembered per project; the canvas screen expands only when never set', () => {
  const storage = memoryStorage();
  const expansion = new ExplorerExpansion('departures', storage);
  expect([...expansion.expanded.get()]).toEqual([]);
  expansion.shown('screens/a.xml');
  expect([...expansion.expanded.get()]).toEqual(['screens/a.xml']);
  expansion.setExpanded('screens/a.xml', false);
  expansion.shown('screens/a.xml');
  expect([...expansion.expanded.get()]).toEqual([]);
  expansion.setExpanded('screens/b.xml', true);
  expect(storage.data.get(`${EXPANSION_KEY}departures`)).toBe('{"screens/a.xml":false,"screens/b.xml":true}');
  expect([...new ExplorerExpansion('departures', storage).expanded.get()]).toEqual(['screens/b.xml']);
  expect([...new ExplorerExpansion('other', storage).expanded.get()]).toEqual([]);
});

test('storage that throws or holds rubbish leaves everything collapsed and still working', () => {
  const throwing = {
    getItem: (): string | null => {
      throw new Error('denied');
    },
    setItem: (): void => {
      throw new Error('denied');
    },
  };
  const expansion = new ExplorerExpansion('p', throwing);
  expansion.setExpanded('screens/a.xml', true);
  expect([...expansion.expanded.get()]).toEqual(['screens/a.xml']);
  expect([...new ExplorerExpansion('p', null).expanded.get()]).toEqual([]);
  const rubbish = memoryStorage();
  rubbish.setItem(`${EXPANSION_KEY}p`, '[1,2');
  expect([...new ExplorerExpansion('p', rubbish).expanded.get()]).toEqual([]);
});
