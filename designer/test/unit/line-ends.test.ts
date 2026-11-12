/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/line-ends.test.ts
 * Purpose: Line-shaped elements get end handles instead of a box's eight
 *          (ui_spec §8). Which elements those are must follow from what each
 *          element is, a flat box must not decide it, and dragging an end of
 *          an hline or vline must move that end alone along its axis: held
 *          opposite end, at least one pixel long, literal-only, one undo stop.
 * Description: The live pipeline's own placements and boxes for a small
 *              screen, and `DragEdit` end drags over a stand-in Monaco model.
 *              Also the selection overlay's box handles, and the property
 *              panel's reasons, for a single line, for other shapes, and for
 *              several elements.
 */

import { expect, test } from '@playwright/test';
import { parseCst } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { DragEdit } from '../../src/editing/drag-edit';
import { endPoints, handleRefusalReasons, isLineShaped, lineShape, planLineEnd } from '../../src/editing/line-ends';
import { selectionOverlay } from '../../src/pipeline/edit-loop';
import { runTextPipeline, type Rect } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';

/** The project around the screen: a 128 × 64 display and one int subject. */
const PROJECT: readonly [string, string][] = [
  [
    'u8g2gl.xml',
    '<u8g2gl schema="0.6" name="lines" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
  ],
  ['globals.xml', '<globals>\n  <subjects>\n    <int name="level" value="5" />\n  </subjects>\n</globals>\n'],
];

/** A screen of elements, as the pipeline drew it, and an end drag over it. */
interface Setup {
  readonly model: FakeModel;
  readonly placements: ReadonlyMap<string, Placement>;
  readonly bounds: ReadonlyMap<string, Rect>;
  /** One whole end drag of `name`, ended at (dx, dy) device pixels; its refusals. */
  dragEnd(name: string, end: 'start' | 'end', dx: number, dy: number): readonly string[];
}

// setup
// A 128 × 64 screen holding `elements`, with each element's placement and box
// as the live pipeline gives them.
function setup(elements: string): Setup {
  const text = `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`;
  const result = runTextPipeline({
    texts: new Map([...PROJECT, [SCREEN, text]]),
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  const { placements, bounds } = result;
  const model = new FakeModel(text);
  const editor = new CanvasEditor((file) => (file === SCREEN ? model : undefined));
  return {
    model,
    placements,
    bounds,
    dragEnd: (name, end, dx, dy) => {
      const gesture = new DragEdit(editor, { file: SCREEN, names: [name], bounds, placements, display: result.display }, { kind: 'end', name, end });
      // Two pointer positions, the last one the drag's end, as a pointer gives them.
      gesture.to(dx / 2, dy / 2, 4, false);
      const frame = gesture.to(dx, dy, 4, true);
      gesture.end();
      return frame.refusals;
    },
  };
}

const HLINE = '    <u8g2gl_hline name="h" x="5" y="5" width="20" />';
const VLINE = '    <u8g2gl_vline name="v" x="90" y="10" height="30" />';

test('line-shaped is what the element is: two points or a one-axis span; a flat box, a triangle, a pixel or a radius are not', () => {
  const shape = setup(
    [
      '    <u8g2gl_line name="diagonal" x1="10" y1="40" x2="40" y2="60" />',
      '    <u8g2gl_line name="flat" x1="10" y1="50" x2="40" y2="50" />',
      HLINE,
      VLINE,
      '    <u8g2gl_triangle name="tri" x0="50" y0="10" x1="70" y1="10" x2="60" y2="30" />',
      // A box one pixel tall is still a box: its shape does not make it a line.
      '    <u8g2gl_box name="thin" x="0" y="62" width="40" height="1" />',
      '    <u8g2gl_pixel name="dot" x="100" y="50" />',
      '    <u8g2gl_circle name="ring" x="110" y="20" radius="5" />',
      '    <u8g2gl_progress_bar name="bar" x="60" y="40" width="20" height="6" />',
    ].join('\n'),
  );
  const shaped = [...shape.placements.keys()].filter((name) => isLineShaped(shape.placements.get(name)));
  expect(shaped.sort()).toEqual(['diagonal', 'flat', 'h', 'v']);
  expect(lineShape(shape.placements.get('diagonal'))).toEqual({ kind: 'points' });
  expect(lineShape(shape.placements.get('h'))).toEqual({ kind: 'span', axis: 'horizontal' });
  expect(lineShape(shape.placements.get('v'))).toEqual({ kind: 'span', axis: 'vertical' });
  expect(lineShape(undefined)).toBeUndefined();
});

test('the round handles: a span’s first and last pixel, a line’s or triangle’s vertices, and none for a box', () => {
  const shape = setup(
    [HLINE, VLINE, '    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="50" />', '    <u8g2gl_box name="b" x="60" y="40" width="4" height="4" />'].join('\n'),
  );
  expect(endPoints(shape.placements.get('h'))).toEqual([
    { x: 5, y: 5 },
    { x: 24, y: 5 },
  ]);
  expect(endPoints(shape.placements.get('v'))).toEqual([
    { x: 90, y: 10 },
    { x: 90, y: 39 },
  ]);
  expect(endPoints(shape.placements.get('l'))).toEqual([
    { x: 10, y: 50 },
    { x: 40, y: 50 },
  ]);
  expect(endPoints(shape.placements.get('b'))).toEqual([]);
});

test('an hline’s left end moves x and takes the difference from width, so the right end stays put, as one undo stop', () => {
  const shape = setup(HLINE);
  // The right end is x + width - 1 = 24 before and after.
  expect(shape.dragEnd('h', 'start', -3, 7)).toEqual([]);
  expect(shape.model.text).toContain('name="h" x="2" y="5" width="23"');
  expect(shape.model.stopCount).toBe(1);
  shape.model.undo();
  expect(shape.model.text).toContain(HLINE.trim());
  shape.dragEnd('h', 'start', 6, 0);
  expect(shape.model.text).toContain('name="h" x="11" y="5" width="14"');
});

test('an hline’s right end changes width alone, and the pointer’s other axis moves nothing', () => {
  const shape = setup(HLINE);
  expect(shape.dragEnd('h', 'end', 4, 9)).toEqual([]);
  expect(shape.model.text).toContain('name="h" x="5" y="5" width="24"');
});

test('a vline’s top end moves y and height, and its bottom end height alone', () => {
  const top = setup(VLINE);
  top.dragEnd('v', 'start', 5, -4);
  expect(top.model.text).toContain('name="v" x="90" y="6" height="34"');
  const bottom = setup(VLINE);
  expect(bottom.dragEnd('v', 'end', -3, 6)).toEqual([]);
  expect(bottom.model.text).toContain('name="v" x="90" y="10" height="36"');
});

test('an end is clamped: the line stays at least one pixel long, and an end never passes the other', () => {
  const left = setup(HLINE);
  left.dragEnd('h', 'start', 100, 0);
  expect(left.model.text).toContain('name="h" x="24" y="5" width="1"');
  const right = setup(HLINE);
  right.dragEnd('h', 'end', -100, 0);
  expect(right.model.text).toContain('name="h" x="5" y="5" width="1"');
  const bottom = setup(VLINE);
  bottom.dragEnd('v', 'end', 0, -100);
  expect(bottom.model.text).toContain('name="v" x="90" y="10" height="1"');
});

test('an end written as an expression or bound refuses with its reason, and nothing is written', () => {
  const computed = setup('    <u8g2gl_hline name="h" x="5" y="5" width="10 + 10" />');
  expect(computed.dragEnd('h', 'end', 4, 0)).toEqual(['width is computed from `10 + 10`']);
  expect(computed.model.text).toContain('name="h" x="5" y="5" width="10 + 10"');
  const left = setup('    <u8g2gl_hline name="h" x="2 + 3" y="5" width="20" />');
  expect(left.dragEnd('h', 'start', -2, 0)).toEqual(['x is computed from `2 + 3`']);
  expect(left.model.text).toContain('name="h" x="2 + 3" y="5" width="20"');
  const bound = setup('    <u8g2gl_vline name="v" x="90" y="10" height="30" bind_height="level" />');
  expect(bound.dragEnd('v', 'end', 0, 5)).toEqual(['height is bound to `level`']);
  expect(bound.model.text).toContain('name="v" x="90" y="10" height="30" bind_height="level"');
});

test('only a span has end plans; a line’s ends are its vertices', () => {
  const shape = setup([HLINE, '    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="50" />'].join('\n'));
  const cst = parseCst(shape.model.text, SCREEN).cst;
  expect(planLineEnd(cst, 'h', 'end', shape.placements.get('h'))).toMatchObject({ name: 'h', vertical: { kind: 'move', terms: [] } });
  expect(planLineEnd(cst, 'l', 'end', shape.placements.get('l'))).toBeUndefined();
});

test('a single selected line has no box handles; another shape, or a line among several, keeps them', () => {
  const shape = setup(
    [
      HLINE,
      VLINE,
      '    <u8g2gl_line name="flat" x1="10" y1="50" x2="40" y2="50" />',
      '    <u8g2gl_line name="diagonal" x1="10" y1="20" x2="30" y2="40" />',
      '    <u8g2gl_triangle name="tri" x0="50" y0="10" x1="70" y1="10" x2="60" y2="30" />',
      '    <u8g2gl_box name="b" x="60" y="40" width="4" height="4" />',
    ].join('\n'),
  );
  const handles = (names: readonly string[]): (boolean | undefined)[] => selectionOverlay(names, shape.bounds, shape.placements).map((rect) => rect.handles);
  for (const line of ['h', 'v', 'flat', 'diagonal']) expect(handles([line])).toEqual([false]);
  expect(handles(['tri'])).toEqual([true]);
  expect(handles(['b'])).toEqual([true]);
  expect(handles(['h', 'b'])).toEqual([true, true]);
  // A name that is not drawn is not shown, and does not make a lone line "several".
  expect(handles(['h', 'missing'])).toEqual([false]);
  expect(selectionOverlay(['h'], shape.bounds, shape.placements)).toEqual([{ x: 5, y: 5, width: 20, height: 1, kind: 'selection', handles: false }]);
});

test('the property panel asks a line only about its ends: no axis it has no handle on, and a real refusal still shows', () => {
  const shape = setup(
    [
      HLINE,
      VLINE,
      '    <u8g2gl_line name="flat" x1="10" y1="50" x2="40" y2="50" />',
      '    <u8g2gl_line name="computed" x1="10" y1="20" x2="20 + 10" y2="20" />',
      '    <u8g2gl_hline name="bound" x="5" y="60" width="20" bind_width="level" />',
      '    <u8g2gl_triangle name="tri" x0="50" y0="10" x1="70" y1="10" x2="60" y2="30" />',
    ].join('\n'),
  );
  const cst = parseCst(shape.model.text, SCREEN).cst;
  const reasons = (name: string): string[] => handleRefusalReasons(cst, name, shape.placements.get(name));
  expect(reasons('h')).toEqual([]);
  expect(reasons('v')).toEqual([]);
  expect(reasons('flat')).toEqual([]);
  expect(reasons('computed')).toEqual(['x2 is computed from `20 + 10`']);
  expect(reasons('bound')).toEqual(['width is bound to `level`']);
  // Any other element is asked about its box's handles, as before.
  expect(reasons('tri')).toEqual([]);
});
