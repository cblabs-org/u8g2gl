/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/shape-resize.test.ts
 * Purpose: Resizing what is not placed by a box (ui_spec §8, EDITOR-DESIGN
 *          §3.5): a line's or triangle's box handles scale its points about
 *          the opposite edge, rounded; a circle's handles change its radius,
 *          an ellipse's its radii, with the centre moved so the opposite edge
 *          stays put, whole or quadrant; one vertex drags alone; an hline
 *          keeps resizing on the axis it has; sizes stay at least one pixel;
 *          an expression or a binding refuses its axis with the reason and
 *          writes nothing there; and each drag is one undo stop.
 * Description: `DragEdit` end to end over a stand-in Monaco model, with
 *              placements from the live pipeline where it draws the element.
 *              Where it does not yet give one (a circle, an ellipse, an hline
 *              have no hit rectangle), the placement is made by the same
 *              resolver, at screen level, and the box from `drawnExtent()`.
 */

import { expect, test } from '@playwright/test';
import { parseCst } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { drawnExtent, resolveScreens } from '@u8g2gl/core/resolver/index.js';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { DragEdit, type DragKind } from '../../src/editing/drag-edit';
import type { Handle } from '../../src/editing/resize-rules';
import { planHandleResize, resizeRefusalReasons, vertexPoints } from '../../src/editing/shape-resize-rules';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import type { Rect } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';

/** The project around the screen: a 128 × 64 display and one int subject. */
const PROJECT: readonly [string, string][] = [
  [
    'u8g2gl.xml',
    '<u8g2gl schema="0.6" name="shapes" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
  ],
  ['globals.xml', '<globals>\n  <subjects>\n    <int name="level" value="5" />\n  </subjects>\n</globals>\n'],
];

/** A screen of `elements`, where each is drawn, and a drag over it. */
interface Setup {
  readonly model: FakeModel;
  readonly placements: ReadonlyMap<string, Placement>;
  drag(kind: DragKind, name: string): DragEdit;
}

// setup
// A 128 × 64 screen holding `elements`, with each element's placement and box:
// the live pipeline's where it has them, else the resolver's own at screen
// level, boxed by its drawn extent.
function setup(elements: string): Setup {
  const text = `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`;
  const result = runTextPipeline({
    texts: new Map([...PROJECT, [SCREEN, text]]),
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  const placements = new Map(result.placements);
  const bounds = new Map<string, Rect>(result.bounds);
  const resolved = resolveScreens({ globals: result.model.globals, screens: result.model.screens, manifests: result.model.manifests });
  for (const element of resolved.screens[0]?.elements ?? []) {
    const name = String(element.node.attributes.name);
    const manifest = result.model.manifests.get(element.node.tag);
    if (placements.has(name) || manifest === undefined) continue;
    placements.set(name, { manifest, absolute: element, origin: { x: 0, y: 0 } });
    const extent = drawnExtent(element, manifest);
    const x = extent.horizontal ?? (element.geometry.x === undefined ? undefined : { min: element.geometry.x, max: element.geometry.x });
    const y = extent.vertical ?? (element.geometry.y === undefined ? undefined : { min: element.geometry.y, max: element.geometry.y });
    if (x !== undefined && y !== undefined) {
      bounds.set(name, { x: x.min.value, y: y.min.value, width: x.max.value - x.min.value + 1, height: y.max.value - y.min.value + 1 });
    }
  }
  const model = new FakeModel(text);
  const editor = new CanvasEditor((file) => (file === SCREEN ? model : undefined));
  return {
    model,
    placements,
    drag: (kind, name) => new DragEdit(editor, { file: SCREEN, names: [name], bounds, placements, display: result.display }, kind),
  };
}

// resize
// One whole resize gesture by `handle`, ended at (dx, dy) device pixels.
function resize(shape: Setup, name: string, handle: Handle, dx: number, dy: number): readonly string[] {
  const gesture = shape.drag({ kind: 'resize', name, handle }, name);
  const frame = gesture.to(dx, dy, 4, false);
  gesture.end();
  return frame.refusals;
}

const RIGHT = { horizontal: 'end', vertical: undefined } as const;
const LEFT = { horizontal: 'start', vertical: undefined } as const;
const BOTTOM = { horizontal: undefined, vertical: 'end' } as const;
const TOP_LEFT = { horizontal: 'start', vertical: 'start' } as const;
const BOTTOM_RIGHT = { horizontal: 'end', vertical: 'end' } as const;

const TRIANGLE = '    <u8g2gl_triangle name="t" x0="10" y0="10" x1="30" y1="10" x2="20" y2="30" />';

test('a triangle’s bottom-right handle scales every vertex about the top-left edges, as one undo stop', () => {
  const shape = setup(TRIANGLE);
  expect(resize(shape, 't', BOTTOM_RIGHT, 10, -5)).toEqual([]);
  // x: 10..30 becomes 10..40; y: 10..30 becomes 10..25.
  expect(shape.model.text).toContain('name="t" x0="10" y0="10" x1="40" y1="10" x2="25" y2="25"');
  expect(shape.model.stopCount).toBe(1);
  shape.model.undo();
  expect(shape.model.text).toContain(TRIANGLE.trim());
});

test('a triangle’s top-left handle scales about the bottom-right edges, rounding to whole pixels', () => {
  const shape = setup(TRIANGLE);
  resize(shape, 't', TOP_LEFT, 5, 0);
  // x: 10..30 becomes 15..30; the midpoint 20 lands on 22.5, rounded to 23. y is untouched.
  expect(shape.model.text).toContain('name="t" x0="15" y0="10" x1="30" y1="10" x2="23" y2="30"');
});

test('a line’s side handle scales its points along that axis alone', () => {
  const shape = setup('    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="60" />');
  resize(shape, 'l', RIGHT, 15, 0);
  expect(shape.model.text).toContain('name="l" x1="10" y1="50" x2="55" y2="60"');
});

test('a box of points never collapses below one pixel; the vertices may then coincide', () => {
  const shape = setup(TRIANGLE);
  resize(shape, 't', RIGHT, -100, 0);
  expect(shape.model.text).toContain('name="t" x0="10" y0="10" x1="10" y1="10" x2="10" y2="30"');
});

test('points that share one coordinate have no extent to scale on that axis, and say so', () => {
  const shape = setup('    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="50" />');
  expect(resize(shape, 'l', BOTTOM_RIGHT, 6, 4)).toEqual(['the points of <u8g2gl_line> all share one y, so it has no height to scale']);
  // The other axis still follows.
  expect(shape.model.text).toContain('name="l" x1="10" y1="50" x2="46" y2="50"');
});

test('a point written as an expression refuses its axis with the reason, writes nothing there, and the other axis follows', () => {
  const shape = setup('    <u8g2gl_triangle name="t" x0="10" y0="10" x1="20 + 10" y1="10" x2="20" y2="30" />');
  expect(resize(shape, 't', BOTTOM_RIGHT, 10, 10)).toEqual(['x1 is computed from `20 + 10`']);
  expect(shape.model.text).toContain('name="t" x0="10" y0="10" x1="20 + 10" y1="10" x2="20" y2="40"');
});

test('a whole circle’s side handle grows its radius by half the delta and moves its centre, so the opposite edge stays', () => {
  const shape = setup('    <u8g2gl_circle name="c" x="30" y="30" radius="5" />');
  resize(shape, 'c', RIGHT, 4, 0);
  // Box 25..35 becomes 25..39: the radius takes half of 4, and the centre moves with it.
  // The other axis grows from its end edge, as a side handle's does, so its top stays at 25.
  expect(shape.model.text).toContain('name="c" x="32" y="32" radius="7"');
});

test('a circle’s corner handle takes the larger radius its two axes ask for', () => {
  const shape = setup('    <u8g2gl_circle name="c" x="30" y="30" radius="5" />');
  resize(shape, 'c', BOTTOM_RIGHT, 4, 10);
  expect(shape.model.text).toContain('name="c" x="35" y="35" radius="10"');
});

test('a circle’s radius stays at least one pixel', () => {
  const shape = setup('    <u8g2gl_circle name="c" x="30" y="30" radius="5" />');
  resize(shape, 'c', RIGHT, -100, 0);
  // The left edge, at 25, stays put.
  expect(shape.model.text).toContain('name="c" x="26" y="26" radius="1"');
});

test('a quarter circle reaches one radius from its centre, so the centre is a corner of its box', () => {
  const shape = setup('    <u8g2gl_circle name="q" x="30" y="30" radius="5" segments="upper_right" />');
  // Box x 30..35, y 25..30. The left handle moves the centre, which is the box's left edge.
  resize(shape, 'q', LEFT, 2, 0);
  expect(shape.model.text).toContain('name="q" x="32" y="28" radius="3" segments="upper_right"');
});

test('an ellipse’s side handle changes its own radius only, and a corner both', () => {
  const side = setup('    <u8g2gl_ellipse name="e" x="60" y="30" rx="8" ry="4" />');
  resize(side, 'e', BOTTOM, 0, 4);
  expect(side.model.text).toContain('name="e" x="60" y="32" rx="8" ry="6"');
  const corner = setup('    <u8g2gl_ellipse name="e" x="60" y="30" rx="8" ry="4" />');
  resize(corner, 'e', BOTTOM_RIGHT, 2, -2);
  expect(corner.model.text).toContain('name="e" x="61" y="29" rx="9" ry="3"');
});

test('a bound centre, or a radius that is an expression, refuses with the reason and writes nothing there', () => {
  const bound = setup('    <u8g2gl_ellipse name="e" x="60" y="30" rx="8" ry="4" bind_y="level" />');
  expect(resize(bound, 'e', BOTTOM_RIGHT, 2, 4)).toEqual(['y is bound to `level`']);
  expect(bound.model.text).toContain('name="e" x="61" y="30" rx="9" ry="4" bind_y="level"');
  const computed = setup('    <u8g2gl_circle name="c" x="30" y="30" radius="2 + 3" />');
  expect(resize(computed, 'c', BOTTOM_RIGHT, 4, 4)).toEqual(['radius is computed from `2 + 3`']);
  expect(computed.model.text).toContain('name="c" x="30" y="30" radius="2 + 3"');
});

test('an hline keeps resizing on the axis it has, and refuses the one it has not', () => {
  const shape = setup('    <u8g2gl_hline name="h" x="5" y="5" width="20" />');
  expect(resize(shape, 'h', BOTTOM_RIGHT, 5, 3)).toEqual(['<u8g2gl_hline> has no height']);
  expect(shape.model.text).toContain('name="h" x="5" y="5" width="25"');
});

test('one vertex drags alone, as one undo stop', () => {
  const shape = setup(TRIANGLE);
  expect(vertexPoints(shape.placements.get('t'))).toEqual([
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 20, y: 30 },
  ]);
  const gesture = shape.drag({ kind: 'vertex', name: 't', index: 2 }, 't');
  gesture.to(1, 1, 4, false);
  gesture.to(3, -4, 4, false);
  gesture.end();
  expect(shape.model.text).toContain('name="t" x0="10" y0="10" x1="30" y1="10" x2="23" y2="26"');
  expect(shape.model.stopCount).toBe(1);
});

test('a vertex written as an expression refuses its axis with the reason', () => {
  const shape = setup('    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="50 + 10" />');
  const frame = shape.drag({ kind: 'vertex', name: 'l', index: 1 }, 'l').to(2, 2, 4, false);
  expect(frame.refusals).toEqual(['y2 is computed from `50 + 10`']);
  expect(shape.model.text).toContain('name="l" x1="10" y1="50" x2="42" y2="50 + 10"');
});

test('only a line or a triangle has vertex handles', () => {
  const shape = setup(`${TRIANGLE}\n    <u8g2gl_line name="l" x1="10" y1="50" x2="40" y2="60" />\n    <u8g2gl_box name="b" x="0" y="0" width="4" height="4" />\n    <u8g2gl_circle name="c" x="30" y="30" radius="5" />`);
  expect(vertexPoints(shape.placements.get('l'))).toEqual([
    { x: 10, y: 50 },
    { x: 40, y: 60 },
  ]);
  expect(vertexPoints(shape.placements.get('b'))).toEqual([]);
  expect(vertexPoints(shape.placements.get('c'))).toEqual([]);
  expect(vertexPoints(undefined)).toEqual([]);
});

test('the property panel’s reasons: every axis a handle could not resize, and none where all work', () => {
  const shape = setup(
    `    <u8g2gl_triangle name="t" x0="10" y0="10" x1="20 + 10" y1="10" x2="20" y2="30" />\n    <u8g2gl_box name="b" x="0" y="0" width="4" height="4" />\n    <u8g2gl_hline name="h" x="5" y="5" width="20" />`,
  );
  const cst = parseCst(shape.model.text, SCREEN).cst;
  expect(resizeRefusalReasons(cst, 't', shape.placements.get('t'))).toEqual(['x1 is computed from `20 + 10`']);
  expect(resizeRefusalReasons(cst, 'b', shape.placements.get('b'))).toEqual([]);
  expect(resizeRefusalReasons(cst, 'h', shape.placements.get('h'))).toEqual(['<u8g2gl_hline> has no height']);
  // A box is still planned as a box.
  expect(planHandleResize(cst, 'b', BOTTOM_RIGHT, shape.placements.get('b'))?.kind).toBe('box');
  expect(planHandleResize(cst, 't', BOTTOM_RIGHT, shape.placements.get('t'))?.kind).toBe('shape');
});
