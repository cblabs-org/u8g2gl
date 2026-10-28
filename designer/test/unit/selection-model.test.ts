/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/selection-model.test.ts
 * Purpose: The selection is names, kept current across edits (EDITOR-DESIGN
 *          §3.7): it survives an edit elsewhere and one that moves the
 *          element's text, follows a rename, drops a deleted element, waits
 *          through text that does not parse, and the caret selects only when
 *          it moves on purpose or leaves its element.
 * Description: A literal document edited through `TextChange`s, exactly as
 *              Monaco's content events report them; the model reads the text
 *              through the same provider the workspace gives it.
 */

import { expect, test } from '@playwright/test';
import { mapOffset, SelectionModel, type TextChange } from '../../src/selection/selection-model';

const FILE = 'screens/screen_home.xml';

const SCREEN = [
  '<screen name="home">',
  '  <view>',
  '    <u8g2gl_box name="outer" x="0" y="0" width="40" height="20">',
  '      <u8g2gl_label name="inner" x="2" y="2" width="10" height="8" text="a" />',
  '    </u8g2gl_box>',
  '    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />',
  '  </view>',
  '</screen>',
  '',
].join('\n');

/** A document held as text, edited the way Monaco reports edits. */
class Document {
  text: string;
  constructor(text: string, private readonly model: () => SelectionModel) {
    this.text = text;
  }
  /** Replaces `[start, end)`, telling the model, and returns the change. */
  edit(start: number, end: number, insert: string): TextChange {
    const change = { start, end, text: insert };
    this.text = this.text.slice(0, start) + insert + this.text.slice(end);
    this.model().textChanged(FILE, [change]);
    return change;
  }
  /** Replaces the first occurrence of `find`. */
  replace(find: string, insert: string): void {
    const at = this.text.indexOf(find);
    if (at < 0) throw new Error(`'${find}' not in the text`);
    this.edit(at, at + find.length, insert);
  }
}

function setUp(text = SCREEN): { model: SelectionModel; doc: Document } {
  let model: SelectionModel | undefined;
  const doc = new Document(text, () => model!);
  model = new SelectionModel((file) => (file === FILE ? doc.text : undefined));
  return { model, doc };
}

test('an offset maps through a change: before it unmoved, after it shifted, inside it gone', () => {
  const changes = [{ start: 10, end: 12, text: 'abcd' }];
  expect(mapOffset(5, changes)).toBe(5);
  expect(mapOffset(10, changes)).toBe(10);
  expect(mapOffset(11, changes)).toBeUndefined();
  expect(mapOffset(12, changes)).toBe(14);
  // An insertion exactly at the offset pushes it right, as text typed before '<' does.
  expect(mapOffset(10, [{ start: 10, end: 10, text: 'xy' }])).toBe(12);
  // Several changes in one event, all in the coordinates before it.
  expect(mapOffset(20, [{ start: 0, end: 1, text: '' }, { start: 15, end: 15, text: 'zzz' }])).toBe(22);
});

test('the selection survives an edit to another element', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['inner'], 'canvas');
  doc.replace('x2="10"', 'x2="12"');
  model.reconcile();
  expect(model.current.get()).toEqual({ file: FILE, names: ['inner'], origin: 'canvas' });
});

test('the selection survives an edit that moves the element’s text, and its span moves with it', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['rule'], 'canvas');
  const before = model.spans()[0]!.start;
  doc.replace('<u8g2gl_box name="outer"', '<u8g2gl_box name="added" x="1" y="1" width="1" height="1" />\n    <u8g2gl_box name="outer"');
  model.reconcile();
  expect(model.current.get().names).toEqual(['rule']);
  const after = model.spans()[0]!;
  expect(after.start).toBeGreaterThan(before);
  expect(doc.text.slice(after.start).startsWith('<u8g2gl_line name="rule"')).toBe(true);
});

test('a rename keeps the selection, under the new name', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['inner', 'rule'], 'canvas');
  doc.replace('name="inner"', 'name="caption"');
  model.reconcile();
  expect(model.current.get().names).toEqual(['caption', 'rule']);
});

test('a rename typed a key at a time is followed through every intermediate name', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['rule'], 'text');
  const at = doc.text.indexOf('name="rule"') + 'name="rule'.length;
  doc.edit(at, at, '_');
  model.reconcile();
  expect(model.current.get().names).toEqual(['rule_']);
  doc.edit(at + 1, at + 1, '2');
  model.reconcile();
  expect(model.current.get().names).toEqual(['rule_2']);
});

test('a rename that takes a name another element already has is not followed', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['inner'], 'canvas');
  doc.replace('name="inner"', 'name="rule"');
  model.reconcile();
  expect(model.current.get().names).toEqual([]);
});

test('a deleted element drops out of the selection; the rest stays', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['inner', 'rule'], 'canvas');
  doc.replace('    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />\n', '');
  model.reconcile();
  expect(model.current.get().names).toEqual(['inner']);
  doc.replace('      <u8g2gl_label name="inner" x="2" y="2" width="10" height="8" text="a" />\n', '');
  model.reconcile();
  expect(model.current.get()).toEqual({ file: undefined, names: [], origin: 'text' });
});

test('text that does not parse keeps the selection, and the changes are followed once it does', () => {
  const { model, doc } = setUp();
  model.select(FILE, ['inner'], 'canvas');
  doc.replace('name="inner"', 'name="inn');
  model.reconcile();
  expect(model.current.get().names).toEqual(['inner']);
  doc.replace('name="inn', 'name="inside"');
  model.reconcile();
  expect(model.current.get().names).toEqual(['inside']);
});

test('the caret selects its element, and typing inside it does not change the selection', () => {
  const { model } = setUp();
  model.caretMoved(FILE, 'inner', true);
  expect(model.current.get()).toEqual({ file: FILE, names: ['inner'], origin: 'text' });
  // The canvas selects another element; typing in `inner` keeps the canvas's choice.
  model.select(FILE, ['rule'], 'canvas');
  model.caretMoved(FILE, 'inner', false);
  expect(model.current.get().names).toEqual(['rule']);
  // Typing that carries the caret out of the element selects where it went.
  model.caretMoved(FILE, 'outer', false);
  expect(model.current.get().names).toEqual(['outer']);
  // A deliberate move selects even within the same element.
  model.select(FILE, ['rule'], 'canvas');
  model.caretMoved(FILE, 'outer', true);
  expect(model.current.get().names).toEqual(['outer']);
  // A caret in no element selects nothing.
  model.caretMoved(FILE, undefined, true);
  expect(model.current.get().names).toEqual([]);
});

test('a selection change notifies once; the same names again, from either side, do not', () => {
  const { model } = setUp();
  let notified = 0;
  model.current.subscribe(() => (notified += 1));
  model.select(FILE, ['inner'], 'text');
  model.select(FILE, ['inner'], 'canvas');
  model.select(FILE, ['inner', 'inner'], 'canvas');
  expect(notified).toBe(1);
  model.clear();
  model.clear();
  expect(notified).toBe(2);
});
