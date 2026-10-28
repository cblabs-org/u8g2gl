/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/resize-and-snap.test.ts
 * Purpose: Resizing and snapping (E-2b rulings 4 and 5, ui_spec §8): a handle
 *          rewrites the attributes that place its edge — width, or x and
 *          width, or a far anchor — and refuses an axis they do not place by
 *          literals; Shift keeps the ratio; a resize never collapses its
 *          element. A drag snaps to sibling and display edges and centres
 *          within 3 **screen** pixels at every zoom, values are integers before
 *          the edit, and a whole drag is one undo stop.
 * Description: `snapAxis` on literal geometry; `DragEdit` end to end over a
 *              stand-in Monaco model (`support/fake-model.ts`), with
 *              placements from the live pipeline (no fonts).
 */

import { expect, test } from '@playwright/test';
import { parseCst } from '@u8g2gl/core/cst/index.js';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { DragEdit, type DragKind } from '../../src/editing/drag-edit';
import { planResize } from '../../src/editing/resize-rules';
import { guidesFor, SNAP_THRESHOLD, snapAxis } from '../../src/editing/snapping';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';

/** A 128 × 64 screen holding `elements`, its placements, and a drag over it. */
function setup(elements: string): { model: FakeModel; drag(kind: DragKind, names: readonly string[]): DragEdit } {
  const text = `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`;
  const result = runTextPipeline({
    texts: new Map([
      [
        'u8g2gl.xml',
        '<u8g2gl schema="0.4" name="resize" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
      ],
      ['globals.xml', '<globals>\n  <subjects>\n    <int name="level" value="5" />\n  </subjects>\n</globals>\n'],
      [SCREEN, text],
    ]),
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  const model = new FakeModel(text);
  const editor = new CanvasEditor((file) => (file === SCREEN ? model : undefined));
  return {
    model,
    drag: (kind, names) =>
      new DragEdit(editor, { file: SCREEN, names, bounds: result.bounds, placements: result.placements, display: result.display }, kind),
  };
}

const RIGHT = { horizontal: 'end', vertical: undefined } as const;
const LEFT = { horizontal: 'start', vertical: undefined } as const;
const BOTTOM_RIGHT = { horizontal: 'end', vertical: 'end' } as const;

test('the right handle grows width; the left moves x and takes the difference from width', () => {
  const { model, drag } = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  const right = drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']);
  right.to(5.2, 3, 4, false);
  right.end();
  expect(model.text).toContain('name="b" x="10" y="10" width="25" height="10"');
  const left = drag({ kind: 'resize', name: 'b', handle: LEFT }, ['b']);
  left.to(-4, 0, 4, false);
  left.end();
  // Planned from the text at the drag's first write: width 25 then.
  expect(model.text).toContain('name="b" x="6" y="10" width="29" height="10"');
});

test('a right-anchored element resizes from its end edge by its anchor and its width together', () => {
  const { model, drag } = setup('    <u8g2gl_box name="b" right="10" y="10" width="20" height="10" />');
  const gesture = drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']);
  gesture.to(4, 0, 4, false);
  expect(model.text).toContain('name="b" right="6" y="10" width="24" height="10"');
  // Its start edge: the width alone, since the anchor holds the other edge.
  gesture.end();
  const left = drag({ kind: 'resize', name: 'b', handle: LEFT }, ['b']);
  left.to(2, 0, 4, false);
  expect(model.text).toContain('name="b" right="6" y="10" width="22" height="10"');
});

test('an element stretched between its anchors resizes each edge by its own attribute', () => {
  const { model, drag } = setup('    <u8g2gl_box name="b" x="10" right="10" y="10" height="10" />');
  drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']).to(-3, 0, 4, false);
  expect(model.text).toContain('name="b" x="10" right="13" y="10" height="10"');
});

test('a size placed by an expression, or bound, refuses its axis with the reason', () => {
  const text = (attrs: string): string => `<screen name="home"><view><u8g2gl_box name="b" ${attrs} /></view></screen>`;
  const plan = (attrs: string) => planResize(parseCst(text(attrs), SCREEN).cst, 'b', BOTTOM_RIGHT, undefined);
  expect(plan('x="0" y="0" width="4 * 5" height="10"')?.horizontal).toEqual({ kind: 'refused', reason: 'width is computed from `4 * 5`' });
  expect(plan('x="0" y="0" width="20" height="10" bind_height="level"')?.vertical).toEqual({ kind: 'refused', reason: 'height is bound to `level`' });
  expect(plan('x="0" y="0" width="20" height="10"')?.vertical).toEqual({ kind: 'move', terms: [{ attribute: 'height', from: 10, sign: 1, inserted: false }] });
  const refused = setup('    <u8g2gl_box name="b" x="0" y="0" width="4 * 5" height="10" />');
  const frame = refused.drag({ kind: 'resize', name: 'b', handle: BOTTOM_RIGHT }, ['b']).to(3, 2, 4, false);
  expect(frame.refusals).toEqual(['width is computed from `4 * 5`']);
  expect(refused.model.text).toContain('width="4 * 5" height="12"');
});

test('a resize never collapses its element: the size stops at one pixel', () => {
  const { model, drag } = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']).to(-50, 0, 4, false);
  expect(model.text).toContain('x="10" y="10" width="1"');
  const other = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  other.drag({ kind: 'resize', name: 'b', handle: LEFT }, ['b']).to(50, 0, 4, false);
  expect(other.model.text).toContain('x="29" y="10" width="1"');
});

test('Shift keeps the ratio: the axis that changed more leads, and a side handle grows the other axis too', () => {
  const corner = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  corner.drag({ kind: 'resize', name: 'b', handle: BOTTOM_RIGHT }, ['b']).to(20, 1, 4, true);
  expect(corner.model.text).toContain('width="40" height="20"');
  const side = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  side.drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']).to(10, 0, 4, true);
  expect(side.model.text).toContain('width="30" height="15"');
  // Without Shift the same side drag leaves the height alone.
  const plain = setup('    <u8g2gl_box name="b" x="10" y="10" width="20" height="10" />');
  plain.drag({ kind: 'resize', name: 'b', handle: RIGHT }, ['b']).to(10, 0, 4, false);
  expect(plain.model.text).toContain('width="30" height="10"');
});

test('within 3 screen pixels an edge snaps to a guide, at every zoom; past it the delta is just rounded', () => {
  // A left edge at 10 dragged toward a guide at 20.
  for (const zoom of [1, 2, 4, 8]) {
    const inside = 10 - (SNAP_THRESHOLD - 0.25) / zoom; // 2.75 screen px short of it
    const outside = 10 - (SNAP_THRESHOLD + 0.25) / zoom; // 3.25 screen px short
    expect(snapAxis([10], inside, [20], zoom), `${zoom}× inside`).toEqual({ delta: 10, lines: [20] });
    const missed = snapAxis([10], outside, [20], zoom);
    expect(missed.delta, `${zoom}× outside`).toBe(Math.round(outside));
    expect(missed.lines.length === 0 || missed.delta === 10).toBe(true);
  }
  // A guide through a half pixel is never snapped to: the text cannot hold it.
  expect(snapAxis([10], 9.6, [19.5], 1)).toEqual({ delta: 10, lines: [] });
  // Every delta is an integer.
  expect(Number.isInteger(snapAxis([3], 0.37, [], 1).delta)).toBe(true);
});

test('the guides are the other elements’ and the display’s edges and centres, never the dragged ones’', () => {
  const guides = guidesFor(
    new Map([
      ['a', { x: 0, y: 0, width: 10, height: 4 }],
      ['b', { x: 50, y: 20, width: 6, height: 6 }],
    ]),
    ['a'],
    { width: 128, height: 64 },
  );
  expect(guides.vertical).toEqual([0, 64, 128, 50, 53, 56]);
  expect(guides.horizontal).toEqual([0, 32, 64, 20, 23, 26]);
});

test('a move snaps the selection’s box to a sibling’s edge and to the display’s centre, as one undo stop', () => {
  const { model, drag } = setup(
    '    <u8g2gl_box name="a" x="10" y="10" width="20" height="10" />\n    <u8g2gl_box name="b" x="60" y="40" width="10" height="10" />',
  );
  const before = model.text;
  const gesture = drag({ kind: 'move' }, ['a']);
  // At 1×, a's right edge (30) dragged to 2 px short of b's left edge (60).
  const first = gesture.to(28, 0, 1, false);
  expect(first.guides).toEqual(expect.arrayContaining([{ axis: 'vertical', at: 60 }]));
  expect(model.text).toContain('name="a" x="40" y="10"');
  // Then its centre (y 15) to within a pixel of the display's (32).
  const second = gesture.to(28, 16.2, 1, false);
  expect(second.guides).toEqual(expect.arrayContaining([{ axis: 'horizontal', at: 32 }]));
  expect(model.text).toContain('name="a" x="40" y="27"');
  gesture.end();
  expect(model.stopCount).toBe(1);
  model.undo();
  expect(model.text).toBe(before);
});
