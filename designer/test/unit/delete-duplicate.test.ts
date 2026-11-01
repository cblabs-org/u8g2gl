/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/delete-duplicate.test.ts
 * Purpose: Delete removes exactly the selected elements' lines — their
 *          indentation and line break with them, never a neighbour's text or
 *          comment — or, sharing a line, the element and the spaces before it;
 *          an element inside a selected one goes with it; and the whole
 *          command is one undo stop. An Alt-drag duplicate inserts verbatim
 *          copies after their originals, renamed, moved under the placement
 *          rules (a refusing axis stays), as one undo stop for the gesture.
 * Description: Delete is tested on text with the CST's `applyEdits`; the
 *              duplicate drives `DragEdit` over a stand-in Monaco model with
 *              Monaco's undo semantics, on a screen run through the live
 *              pipeline for its placements.
 */

import { expect, test } from '@playwright/test';
import { applyEdits, parseCst } from '@u8g2gl/core/cst/index.js';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { DragEdit } from '../../src/editing/drag-edit';
import { deleteEdits, duplicateEdits } from '../../src/editing/structure-edits';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';

/** A screen holding `elements`. */
const screen = (elements: string): string => `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`;

/** The text after deleting `names`. */
function deleted(text: string, names: readonly string[]): string {
  return applyEdits(text, deleteEdits(parseCst(text, SCREEN).cst, names));
}

const A = '    <u8g2gl_box name="a" x="0" y="0" width="4" height="4" />';
const B = '    <u8g2gl_box name="b" x="10" y="0" width="4" height="4" />';
const C = '    <u8g2gl_box name="c" x="20" y="0" width="4" height="4" />';

test('delete removes the element’s whole line, indentation and line break, and nothing else', () => {
  const text = screen([A, '    <!-- keep me -->', B, C].join('\n'));
  expect(deleted(text, ['b'])).toBe(screen([A, '    <!-- keep me -->', C].join('\n')));
});

test('delete of several, adjacent or not, is one set of disjoint edits; unknown names are ignored', () => {
  const text = screen([A, B, C].join('\n'));
  expect(deleted(text, ['a', 'b'])).toBe(screen(C));
  expect(deleted(text, ['c', 'a', 'gone'])).toBe(screen(B));
  expect(deleteEdits(parseCst(text, SCREEN).cst, ['gone'])).toEqual([]);
});

test('delete of a multi-line element takes all its lines; a selected child inside it is not removed twice', () => {
  const group = ['    <u8g2gl_obj name="g" x="0" y="0" width="30" height="20">', '      <u8g2gl_box name="inner" x="1" y="1" width="2" height="2" />', '    </u8g2gl_obj>'].join('\n');
  const text = screen([group, C].join('\n'));
  const edits = deleteEdits(parseCst(text, SCREEN).cst, ['inner', 'g']);
  expect(edits.length).toBe(1);
  expect(applyEdits(text, edits)).toBe(screen(C));
});

test('delete of an element sharing its line removes it and the spaces before it only', () => {
  const text = screen('    <u8g2gl_box name="a" x="0" y="0" width="4" height="4" />  <u8g2gl_box name="b" x="9" y="0" width="4" height="4" />');
  expect(deleted(text, ['b'])).toBe(screen(A));
});

test('delete through the canvas editor is one undo stop', () => {
  const text = screen([A, B, C].join('\n'));
  const model = new FakeModel(text);
  const editor = new CanvasEditor(() => model);
  editor.apply(SCREEN, (now) => deleteEdits(parseCst(now, SCREEN).cst, ['a', 'c']));
  expect(model.getValue()).toBe(screen(B));
  model.undo();
  expect(model.getValue()).toBe(text);
});

test('a duplicate is the source verbatim after its original, renamed — its named children too — and re-indented', () => {
  const group = [
    '    <u8g2gl_obj name="g" x="0" y="0" width="30" height="20"> <!-- note -->',
    '      <u8g2gl_box name="inner" x="1" y="1" width="2" height="2" />',
    '    </u8g2gl_obj>',
  ].join('\n');
  const text = screen([group, C].join('\n'));
  const taken = new Set(['g', 'inner', 'c', 'obj_1']);
  const { edits, copies } = duplicateEdits(parseCst(text, SCREEN).cst, ['g'], taken);
  expect([...copies]).toEqual([['g', 'obj_2']]);
  expect(applyEdits(text, edits)).toBe(
    screen(
      [
        group,
        '    <u8g2gl_obj name="obj_2" x="0" y="0" width="30" height="20"> <!-- note -->',
        '      <u8g2gl_box name="box_1" x="1" y="1" width="2" height="2" />',
        '    </u8g2gl_obj>',
        C,
      ].join('\n'),
    ),
  );
  expect(taken.has('obj_2') && taken.has('box_1')).toBe(true);
});

/** A screen run through the pipeline, and an Alt-drag of `names` over a stand-in model. */
function altDrag(elements: string, names: readonly string[]): { model: FakeModel; drag: DragEdit; text: string } {
  const text = screen(elements);
  const texts = new Map([
    ['u8g2gl.xml', '<u8g2gl schema="0.5" name="dup" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n'],
    ['globals.xml', '<globals>\n  <subjects>\n    <int name="level" value="5" />\n  </subjects>\n</globals>\n'],
    [SCREEN, text],
  ]);
  const result = runTextPipeline({
    texts,
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  const model = new FakeModel(text);
  const editor = new CanvasEditor(() => model);
  const taken = new Set(['a', 'b', 'c', 'tied', 'home', 'level']);
  const drag = new DragEdit(editor, { file: SCREEN, names, bounds: result.bounds, placements: result.placements, display: result.display }, { kind: 'duplicate', taken: () => taken });
  return { model, drag, text };
}

test('an Alt-drag inserts copies after their originals and moves only the copies, as one undo stop', () => {
  const { model, drag, text } = altDrag([A, B, C].join('\n'), ['a', 'c']);
  // Far from any guide: 40.4, 30.2 rounds to 40, 30.
  drag.to(17.2, 30.2, 1, false);
  drag.to(40.4, 30.2, 1, false);
  drag.end();
  expect(drag.copies()).toEqual(['box_1', 'box_2']);
  expect(model.getValue()).toBe(
    screen(
      [
        A,
        '    <u8g2gl_box name="box_1" x="40" y="30" width="4" height="4" />',
        B,
        C,
        '    <u8g2gl_box name="box_2" x="60" y="30" width="4" height="4" />',
      ].join('\n'),
    ),
  );
  model.undo();
  expect(model.getValue()).toBe(text);
});

test('an Alt-drag copy refuses an axis its original cannot move on, as a move does, and says why', () => {
  const tied = '    <u8g2gl_box name="tied" x="10" y="0" bind_y="level" width="4" height="4" />';
  const { model, drag } = altDrag(tied, ['tied']);
  const frame = drag.to(30.2, 20.2, 1, false);
  drag.end();
  expect(frame.refusals).toEqual(['y is bound to `level`']);
  expect(model.getValue()).toBe(screen([tied, '    <u8g2gl_box name="box_1" x="40" y="0" bind_y="level" width="4" height="4" />'].join('\n')));
});
