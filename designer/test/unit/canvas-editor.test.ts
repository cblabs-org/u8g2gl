/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/canvas-editor.test.ts
 * Purpose: The canvas's edit path groups undo stops as EDITOR-DESIGN §3.6
 *          says: a gesture of many frames is one stop; nudges on one selection
 *          within 750 ms share one, and any gap, other selection or other edit
 *          starts another; undo restores the text exactly. And each frame's
 *          edit is computed from the text as it is then.
 * Description: A stand-in for Monaco's model with Monaco's undo semantics
 *              (`support/fake-model.ts`). The end-to-end suite checks the same against the real
 *              Monaco model. The clock and the group timer are the test's.
 */

import { expect, test } from '@playwright/test';
import { parseCst } from '@u8g2gl/core/cst/index.js';
import { CanvasEditor, NUDGE_GROUP_MS } from '../../src/editing/canvas-editor';
import { FakeModel } from './support/fake-model';
import { moveEdits, planMove } from '../../src/editing/placement-rules';

const FILE = 'screens/screen_home.xml';

const SCREEN = [
  '<screen name="home">',
  '  <view>',
  '    <u8g2gl_box name="a" x="10" y="20" width="8" height="8" />',
  '    <u8g2gl_box name="b" x="40" y="20" width="8" height="8" />',
  '  </view>',
  '</screen>',
  '',
].join('\n');

/** An editor over one fake model, with a clock and timers the test advances. */
function setup(): { model: FakeModel; editor: CanvasEditor; advance(ms: number): void } {
  const model = new FakeModel(SCREEN);
  let now = 0;
  const timers: { at: number; callback: () => void; live: boolean }[] = [];
  const editor = new CanvasEditor((file) => (file === FILE ? model : undefined), {
    now: () => now,
    setTimer: (callback, ms) => {
      const timer = { at: now + ms, callback, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  });
  return {
    model,
    editor,
    advance: (ms) => {
      now += ms;
      for (const timer of timers) {
        if (timer.live && timer.at <= now) {
          timer.live = false;
          timer.callback();
        }
      }
    },
  };
}

/** The edits moving `names` by (dx, dy) from their start values, against `text`. */
function moving(names: readonly string[], dx: number, dy: number, start = SCREEN): (text: string) => ReturnType<typeof moveEdits> {
  const plans = names.map((name) => planMove(parseCst(start, FILE).cst, name, undefined)!);
  return (text) => moveEdits(parseCst(text, FILE).cst, plans, dx, dy);
}

test('a gesture of many frames is one undo stop, and one undo restores the text exactly', () => {
  const { model, editor } = setup();
  const gesture = editor.begin(FILE)!;
  for (let frame = 1; frame <= 120; frame++) gesture.update(moving(['a'], frame % 37, -(frame % 5)));
  gesture.update(moving(['a'], 30, -4));
  gesture.end();
  expect(model.text).toContain('name="a" x="40" y="16"');
  expect(model.stopCount).toBe(1);
  model.undo();
  expect(model.text).toBe(SCREEN);
});

test('each frame writes the gesture’s whole delta into the current text, so a frame that changes nothing edits nothing', () => {
  const { model, editor } = setup();
  const gesture = editor.begin(FILE)!;
  expect(gesture.update(moving(['a', 'b'], 5, 0))).toBe(true);
  expect(gesture.update(moving(['a', 'b'], 5, 0))).toBe(false);
  expect(model.edits).toBe(1);
  // Back to where it began: the text is the original again, inside the same stop.
  gesture.update(moving(['a', 'b'], 0, 0));
  gesture.end();
  expect(model.text).toBe(SCREEN);
  // After end(), the gesture writes nothing.
  expect(gesture.update(moving(['a'], 9, 9))).toBe(false);
});

test('a gesture never joins the stop of what was typed before it, nor what is typed after', () => {
  const { model, editor } = setup();
  model.type(0, '<!-- typed -->\n');
  const typed = model.text;
  const gesture = editor.begin(FILE)!;
  gesture.update(moving(['b'], 3, 3, typed));
  gesture.end();
  model.type(0, '<!-- more -->\n');
  expect(model.stopCount).toBe(3);
  model.undo();
  model.undo();
  expect(model.text).toBe(typed);
});

test('nudges on one selection within 750 ms share one undo stop; one undo takes them all back', () => {
  const { model, editor, advance } = setup();
  for (let i = 0; i < 5; i++) {
    editor.nudge(FILE, 'a', (text) => moving(['a'], 1, 0, text)(text));
    advance(NUDGE_GROUP_MS - 1);
  }
  expect(model.text).toContain('name="a" x="15"');
  expect(model.stopCount).toBe(1);
  model.undo();
  expect(model.text).toBe(SCREEN);
});

test('a nudge after the window, on another selection, or after another edit starts a new stop', () => {
  const { model, editor, advance } = setup();
  const nudge = (key: string, names: readonly string[]): void => {
    editor.nudge(FILE, key, (text) => moving(names, 0, 1, text)(text));
  };
  nudge('a', ['a']);
  advance(NUDGE_GROUP_MS + 1); // the window passed
  nudge('a', ['a']);
  nudge('b', ['b']); // another selection
  expect(model.stopCount).toBe(3);
  // Another edit, in a stop of its own, between two nudges of b in the window.
  model.pushStackElement();
  model.type(0, ' ');
  nudge('b', ['b']);
  expect(model.stopCount).toBe(5);
  model.undo();
  expect(model.text.startsWith(' ')).toBe(true);
  expect(model.text).toContain('name="b" x="40" y="21"');
});

test('closing the group — the canvas lost the keyboard — keeps what is typed next out of the nudge’s stop', () => {
  const { model, editor } = setup();
  editor.nudge(FILE, 'a', (text) => moving(['a'], 1, 0, text)(text));
  editor.closeGroup();
  const nudged = model.text;
  model.type(0, '<!-- typed -->\n');
  expect(model.stopCount).toBe(2);
  model.undo();
  expect(model.text).toBe(nudged);
  model.undo();
  expect(model.text).toBe(SCREEN);
});

test('the window passing closes the group by itself', () => {
  const { model, editor, advance } = setup();
  editor.nudge(FILE, 'a', (text) => moving(['a'], 1, 0, text)(text));
  advance(NUDGE_GROUP_MS + 1);
  model.type(0, ' ');
  expect(model.stopCount).toBe(2);
});

test('a document that is not one writes nothing', () => {
  const { model, editor } = setup();
  expect(editor.begin('nope.xml')).toBeUndefined();
  expect(editor.nudge('nope.xml', 'a', () => [{ start: 0, end: 0, text: 'x' }])).toBe(false);
  expect(model.text).toBe(SCREEN);
});
