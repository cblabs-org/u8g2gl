/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/design-hidden.test.ts
 * Purpose: The designer's own hiding: the effective set is the hidden rows and
 *          everything nested under them; the sets are remembered per project
 *          and file, or quietly not when storage fails; names a file no longer
 *          has are dropped, but not while its text is unparsed; and a hidden
 *          selection is outlined dashed with nothing to grab.
 * Description: `DesignHiddenModel` over an in-memory or a throwing storage,
 *              trees from `elementTree()`, and `selectionOverlay()`.
 */

import { expect, test } from '@playwright/test';
import { DESIGN_HIDDEN_KEY, DesignHiddenModel, effectiveHidden } from '../../src/canvas/design-hidden';
import { elementTree } from '../../src/documents/element-tree';
import { selectionOverlay } from '../../src/pipeline/edit-loop';

const SCREEN = [
  '<screen name="home">',
  '  <view>',
  '    <u8g2gl_obj name="panel" x="0" y="0" width="40" height="20">',
  '      <u8g2gl_obj name="inner" x="2" y="2" width="20" height="10">',
  '        <u8g2gl_box name="dot" x="1" y="1" width="2" height="2" />',
  '      </u8g2gl_obj>',
  '    </u8g2gl_obj>',
  '    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />',
  '  </view>',
  '</screen>',
  '',
].join('\n');
const TREE = elementTree(SCREEN) ?? [];
const FILE = 'screens/screen_home.xml';

/** An in-memory storage, as `localStorage` behaves. */
function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

test('the effective set is the hidden rows and every row nested under them, at any depth', () => {
  expect([...effectiveHidden(TREE, new Set(['panel']))].sort()).toEqual(['dot', 'inner', 'panel']);
  expect([...effectiveHidden(TREE, new Set(['inner', 'rule']))].sort()).toEqual(['dot', 'inner', 'rule']);
  // A name the tree does not have hides nothing.
  expect([...effectiveHidden(TREE, new Set(['gone']))]).toEqual([]);
});

test('hiding is per file, remembered per project, and showing all clears one file', () => {
  const storage = memoryStorage();
  const model = new DesignHiddenModel();
  model.load('departures', storage);
  model.setHidden(FILE, 'rule', true);
  model.setHidden(FILE, 'panel', true);
  model.setHidden('screens/screen_other.xml', 'x', true);
  expect([...model.namesIn(FILE)]).toEqual(['rule', 'panel']);
  expect(JSON.parse(storage.data.get(`${DESIGN_HIDDEN_KEY}departures`) ?? '{}')).toEqual({
    [FILE]: ['rule', 'panel'],
    'screens/screen_other.xml': ['x'],
  });

  // --- Remembered: a new page reads it back; another project does not ---
  const again = new DesignHiddenModel();
  again.load('departures', storage);
  expect([...again.namesIn(FILE)]).toEqual(['rule', 'panel']);
  const other = new DesignHiddenModel();
  other.load('elsewhere', storage);
  expect(other.hidden.get().size).toBe(0);

  // --- Show one again; show all of one file ---
  again.setHidden(FILE, 'rule', false);
  expect([...again.namesIn(FILE)]).toEqual(['panel']);
  again.showAll(FILE);
  expect(again.namesIn(FILE).size).toBe(0);
  expect([...again.namesIn('screens/screen_other.xml')]).toEqual(['x']);
});

test('names a file no longer has are dropped; a file with no tree keeps its names', () => {
  const model = new DesignHiddenModel();
  model.load('p', memoryStorage());
  model.setHidden(FILE, 'rule', true);
  model.setHidden(FILE, 'renamed_away', true);
  model.setHidden('screens/screen_unparsed.xml', 'kept', true);
  const before = model.hidden.get();
  model.prune(new Map([[FILE, TREE]]));
  expect([...model.namesIn(FILE)]).toEqual(['rule']);
  expect([...model.namesIn('screens/screen_unparsed.xml')]).toEqual(['kept']);
  // Nothing to drop: the same value, so nothing re-renders.
  const pruned = model.hidden.get();
  expect(pruned).not.toBe(before);
  model.prune(new Map([[FILE, TREE]]));
  expect(model.hidden.get()).toBe(pruned);
});

test('storage that is missing, throws or holds rubbish remembers nothing, and hiding still works', () => {
  const throwing = {
    getItem: (): string | null => {
      throw new Error('denied');
    },
    setItem: (): void => {
      throw new Error('denied');
    },
  };
  for (const storage of [throwing, null]) {
    const model = new DesignHiddenModel();
    model.load('p', storage);
    model.setHidden(FILE, 'rule', true);
    expect([...model.namesIn(FILE)]).toEqual(['rule']);
  }
  const rubbish = memoryStorage();
  rubbish.setItem(`${DESIGN_HIDDEN_KEY}p`, '{"screens/a.xml": "not a list", "screens/b.xml": [1, "ok"]');
  const model = new DesignHiddenModel();
  model.load('p', rubbish);
  expect(model.hidden.get().size).toBe(0);
  rubbish.setItem(`${DESIGN_HIDDEN_KEY}p`, '{"screens/a.xml": "not a list", "screens/b.xml": [1, "ok"]}');
  model.load('p', rubbish);
  expect([...model.hidden.get()].map(([file, names]) => [file, [...names]])).toEqual([['screens/b.xml', ['ok']]]);
});

test('a selected element hidden in the designer is outlined dashed, without handles', () => {
  const bounds = new Map([
    ['panel', { x: 0, y: 0, width: 40, height: 20 }],
    ['rule', { x: 0, y: 30, width: 11, height: 1 }],
  ]);
  expect(selectionOverlay(['panel', 'rule'], bounds, new Map(), new Set(['panel']))).toEqual([
    { x: 0, y: 0, width: 40, height: 20, kind: 'selection', handles: false, dashed: true },
    { x: 0, y: 30, width: 11, height: 1, kind: 'selection', handles: true },
  ]);
});
