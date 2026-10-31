/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/align.test.ts
 * Purpose: Every align and distribute command, on literal, anchored and
 *          refusing elements: literals rewritten, a far anchor rewritten
 *          inverted, an expression or a binding left alone and named with its
 *          reason; the diff only the attributes that move; availability needing
 *          two movable elements on the axis, three to distribute; and a
 *          command through the canvas editor one undo stop.
 * Description: A 128 × 64 screen run through the live pipeline, so the
 *              rectangles and placements are the canvas's.
 */

import { expect, test } from '@playwright/test';
import { applyEdits, parseCst } from '@u8g2gl/core/cst/index.js';
import { alignAvailability, alignEdits, type AlignCommand } from '../../src/editing/align';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';

/** Runs a screen of `elements`; returns its text and a command runner. */
function setup(elements: readonly string[]): {
  text: string;
  apply(command: AlignCommand, names: readonly string[]): { after: string; refusals: readonly string[] };
  available(names: readonly string[]): AlignCommand[];
  editor(model: FakeModel): (command: AlignCommand, names: readonly string[]) => void;
} {
  const text = `<screen name="home">\n  <view>\n${elements.join('\n')}\n  </view>\n</screen>\n`;
  const result = runTextPipeline({
    texts: new Map([
      ['u8g2gl.xml', '<u8g2gl schema="0.4" name="align" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n'],
      ['globals.xml', '<globals>\n  <consts>\n    <int name="margin" value="2" />\n  </consts>\n  <subjects>\n    <int name="level" value="5" />\n  </subjects>\n</globals>\n'],
      [SCREEN, text],
    ]),
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  const cst = parseCst(text, SCREEN).cst;
  return {
    text,
    apply: (command, names) => {
      const outcome = alignEdits(cst, names, result.bounds, result.placements, command);
      return { after: applyEdits(text, outcome.edits), refusals: outcome.refusals };
    },
    available: (names) => alignAvailability(cst, names, result.bounds, result.placements),
    editor: (model) => {
      const editor = new CanvasEditor(() => model);
      return (command, names) => editor.apply(SCREEN, (now) => alignEdits(parseCst(now, SCREEN).cst, names, result.bounds, result.placements, command).edits);
    },
  };
}

/** The changed lines between two texts of equal line count, as [before, after]. */
function changed(before: string, after: string): [string, string][] {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b.length).toBe(a.length);
  return a.flatMap((line, i): [string, string][] => (line === b[i] ? [] : [[line, b[i] ?? '']]));
}

const A = '    <u8g2gl_box name="a" x="10" y="5" width="10" height="4" />';
const B = '    <u8g2gl_box name="b" x="30" y="20" width="20" height="8" />';
const C = '    <u8g2gl_box name="c" x="80" y="40" width="6" height="6" />';
/** Anchored: right="38" on a 128-wide display puts its right edge at 90, so x = 70. */
const ANCHORED = '    <u8g2gl_box name="anch" right="38" bottom="30" width="20" height="4" />';
const COMPUTED = '    <u8g2gl_box name="calc" x="#margin + 40" y="#margin + 50" width="8" height="4" />';
const BOUND = '    <u8g2gl_box name="tied" x="60" y="10" bind_x="level" bind_y="level" width="8" height="4" />';

test('left, right and horizontal centre rewrite each literal x, and only those that move', () => {
  const s = setup([A, B, C]);
  expect(changed(s.text, s.apply('left', ['a', 'b', 'c']).after)).toEqual([
    [B, B.replace('x="30"', 'x="10"')],
    [C, C.replace('x="80"', 'x="10"')],
  ]);
  // The box is 10..86: right edges to 86.
  expect(changed(s.text, s.apply('right', ['a', 'b', 'c']).after)).toEqual([
    [A, A.replace('x="10"', 'x="76"')],
    [B, B.replace('x="30"', 'x="66"')],
  ]);
  // Centre 48: a 10 wide goes to 43, b 20 wide to 38, c 6 wide to 45.
  expect(changed(s.text, s.apply('hcentre', ['a', 'b', 'c']).after)).toEqual([
    [A, A.replace('x="10"', 'x="43"')],
    [B, B.replace('x="30"', 'x="38"')],
    [C, C.replace('x="80"', 'x="45"')],
  ]);
});

test('top, bottom and vertical centre rewrite each literal y', () => {
  const s = setup([A, B, C]);
  expect(changed(s.text, s.apply('top', ['a', 'b', 'c']).after)).toEqual([
    [B, B.replace('y="20"', 'y="5"')],
    [C, C.replace('y="40"', 'y="5"')],
  ]);
  expect(changed(s.text, s.apply('bottom', ['a', 'b', 'c']).after)).toEqual([
    [A, A.replace('y="5"', 'y="42"')],
    [B, B.replace('y="20"', 'y="38"')],
  ]);
  // Box 5..46, centre 25.5: a (4 high) to 24 (round 23.5 up), b (8) to 22 (round 21.5), c (6) to 23 (round 22.5).
  expect(changed(s.text, s.apply('vcentre', ['a', 'b', 'c']).after)).toEqual([
    [A, A.replace('y="5"', 'y="24"')],
    [B, B.replace('y="20"', 'y="22"')],
    [C, C.replace('y="40"', 'y="23"')],
  ]);
});

test('an anchored element is moved by rewriting its far anchor inverted', () => {
  const s = setup([A, ANCHORED]);
  // Left edges to 10: anch moves 60 left, so right grows by 60.
  expect(changed(s.text, s.apply('left', ['a', 'anch']).after)).toEqual([[ANCHORED, ANCHORED.replace('right="38"', 'right="98"')]]);
  // Bottom edges to 34 (anch's bottom): a moves 25 down; anch stays.
  expect(changed(s.text, s.apply('bottom', ['a', 'anch']).after)).toEqual([[A, A.replace('y="5"', 'y="30"')]]);
  expect(changed(s.text, s.apply('top', ['a', 'anch']).after)).toEqual([[ANCHORED, ANCHORED.replace('bottom="30"', 'bottom="55"')]]);
});

test('an element placed by an expression or a binding stays, and the command says which and why', () => {
  const s = setup([A, COMPUTED, BOUND]);
  const left = s.apply('left', ['a', 'calc', 'tied']);
  expect(left.after).toBe(s.text);
  expect(left.refusals).toEqual(['calc: x is computed from `#margin + 40`', 'tied: x is bound to `level`']);
  // a is the leftmost, so a left align moves only the two that refuse; a right align moves a.
  const right = s.apply('right', ['a', 'calc', 'tied']);
  expect(changed(s.text, right.after)).toEqual([[A, A.replace('x="10"', 'x="58"')]]);
  expect(right.refusals).toEqual(['calc: x is computed from `#margin + 40`']);
});

test('distribute keeps the outer two and makes the gaps between neighbours equal', () => {
  const D = '    <u8g2gl_box name="d" x="40" y="0" width="10" height="4" />';
  const s = setup([A, B, D, C]);
  // Horizontally: a 10..20, b 30..50, d 40..50, c 80..86. Span 76, widths 46, gap 10.
  expect(changed(s.text, s.apply('distribute-h', ['a', 'b', 'c', 'd']).after)).toEqual([
    [D, D.replace('x="40"', 'x="60"')],
  ]);
  // Vertically: d 0..4, a 5..9, b 20..28, c 40..46. Span 46, heights 22, gap 8.
  expect(changed(s.text, s.apply('distribute-v', ['a', 'b', 'c', 'd']).after)).toEqual([
    [A, A.replace('y="5"', 'y="12"')],
    [B, B.replace('y="20"', 'y="24"')],
  ]);
});

test('availability needs two movable elements on the axis, three to distribute', () => {
  const s = setup([A, B, C, COMPUTED, BOUND]);
  expect(s.available(['a'])).toEqual([]);
  expect(s.available(['a', 'b'])).toEqual(['left', 'hcentre', 'right', 'top', 'vcentre', 'bottom']);
  expect(s.available(['a', 'b', 'c'])).toEqual(['left', 'hcentre', 'right', 'top', 'vcentre', 'bottom', 'distribute-h', 'distribute-v']);
  // calc and tied move on no axis; with a they make one movable element.
  expect(s.available(['a', 'calc', 'tied'])).toEqual([]);
  expect(s.available(['a', 'b', 'tied'])).toEqual(['left', 'hcentre', 'right', 'top', 'vcentre', 'bottom']);
});

test('a command through the canvas editor is one undo stop', () => {
  const s = setup([A, B, C]);
  const model = new FakeModel(s.text);
  s.editor(model)('left', ['a', 'b', 'c']);
  expect(model.getValue()).toBe(s.apply('left', ['a', 'b', 'c']).after);
  model.undo();
  expect(model.getValue()).toBe(s.text);
});
