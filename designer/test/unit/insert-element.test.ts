/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/insert-element.test.ts
 * Purpose: What a drop from the Palette writes: one new line in the screen —
 *          a minimal diff — with a generated name, the drop point relative to
 *          its container, a size where the manifest declares one, and the
 *          required props at their defaults or simplest values; endpoints and
 *          radii seeded from the drop point; the container the innermost one
 *          with element children, never a leaf; and a refusal, with the
 *          validator's reason, when the insert would not validate. Applied
 *          through the canvas's edit path, it is one undo stop.
 * Description: In-memory projects run through the live pipeline, so the
 *              placements, rectangles and diagnostics the planner reads are
 *              the ones the canvas would have.
 */

import { expect, test } from '@playwright/test';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { CanvasEditor } from '../../src/editing/canvas-editor';
import { INSERT_SIZE, planInsert, type InsertPlan } from '../../src/editing/insert-element';
import { runTextPipeline, type TextPipelineResult } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { FakeModel } from './support/fake-model';

const SCREEN = 'screens/screen_home.xml';
const PROJECT = '<u8g2gl schema="0.5" name="insert" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n';
const GLOBALS = '<globals>\n  <fonts>\n    <builtin name="u8g2_font_6x10_mr" />\n  </fonts>\n</globals>\n';
const NO_ASSETS = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };

/** The texts of a project whose screen holds `elements`. */
function project(elements: string, globals = GLOBALS): Map<string, string> {
  return new Map([
    ['u8g2gl.xml', PROJECT],
    ['globals.xml', globals],
    [SCREEN, `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`],
  ]);
}

/** Plans dropping `tag` at (x, y) on that project. */
function drop(texts: Map<string, string>, tag: string, x: number, y: number): { plan: InsertPlan; base: TextPipelineResult } {
  const base = runTextPipeline({ texts, cache: new ProjectModelCache(), assets: NO_ASSETS, activeFile: SCREEN });
  return { plan: planInsert({ tag, file: SCREEN, x, y, texts, base, assets: NO_ASSETS }), base };
}

/** The text after an insert plan, which must be an insert. */
function after(texts: Map<string, string>, plan: InsertPlan): string {
  if (plan.kind !== 'insert') throw new Error(`refused: ${plan.reason}`);
  return applyEdits(texts.get(SCREEN) ?? '', plan.edits);
}

/** The lines `after` has that `before` does not, when every other line is unchanged. */
function addedLines(before: string, afterText: string): string[] {
  const a = before.split('\n');
  const b = afterText.split('\n');
  const added = b.filter((line) => !a.includes(line));
  expect(b.length - a.length).toBe(added.length);
  expect(b.filter((line) => a.includes(line))).toEqual(a);
  return added;
}

const BOX = '    <u8g2gl_box name="box_1" x="0" y="0" width="10" height="10" filled="true" />';

test('a label dropped on the screen is one new line: name, drop point, the default size and the first global font', () => {
  const texts = project(BOX);
  const { plan } = drop(texts, 'u8g2gl_label', 30, 20);
  expect(plan.kind).toBe('insert');
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, plan))).toEqual([
    `    <u8g2gl_label name="label_1" x="30" y="20" width="${INSERT_SIZE.width}" height="${INSERT_SIZE.height}" font="u8g2_font_6x10_mr" />`,
  ]);
});

test('a drawing element gets its manifest defaults only where required; a second insert of a tag takes the next free name', () => {
  const texts = project(BOX);
  const { plan } = drop(texts, 'u8g2gl_box', 40, 8);
  // box_1 is taken; the box's width and height have no default, so they get the insert size.
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, plan))).toEqual(['    <u8g2gl_box name="box_2" x="40" y="8" width="16" height="8" />']);
});

test('endpoints and radii are seeded from the drop point, spanning the insert size', () => {
  const texts = project(BOX);
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, drop(texts, 'u8g2gl_line', 50, 30).plan))).toEqual([
    '    <u8g2gl_line name="line_1" x1="50" y1="30" x2="65" y2="37" />',
  ]);
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, drop(texts, 'u8g2gl_triangle', 50, 30).plan))).toEqual([
    '    <u8g2gl_triangle name="triangle_1" x0="50" y0="30" x1="65" y1="37" x2="50" y2="37" />',
  ]);
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, drop(texts, 'u8g2gl_circle', 50, 30).plan))).toEqual([
    '    <u8g2gl_circle name="circle_1" x="50" y="30" radius="4" />',
  ]);
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, drop(texts, 'u8g2gl_ellipse', 50, 30).plan))).toEqual([
    '    <u8g2gl_ellipse name="ellipse_1" x="50" y="30" rx="8" ry="4" />',
  ]);
});

test('every insert the planner offers validates: the project after it has no new error', () => {
  for (const tag of ['u8g2gl_label', 'u8g2gl_box', 'u8g2gl_line', 'u8g2gl_pixel', 'u8g2gl_progress_bar', 'u8g2gl_clock', 'u8g2gl_obj']) {
    const texts = project(BOX);
    const { plan } = drop(texts, tag, 60, 30);
    const next = new Map(texts).set(SCREEN, after(texts, plan));
    const result = runTextPipeline({ texts: next, cache: new ProjectModelCache(), assets: NO_ASSETS, activeFile: SCREEN });
    expect(result.diagnostics.filter((d) => d.severity === 'error'), tag).toEqual([]);
  }
});

test('a drop on an element with element children goes into it, relative to its corner; a drop on a leaf goes to the screen', () => {
  const group = [
    '    <u8g2gl_obj name="group" x="40" y="20" width="60" height="30">',
    '      <u8g2gl_box name="inner" x="2" y="2" width="4" height="4" filled="true" />',
    '    </u8g2gl_obj>',
    BOX,
  ].join('\n');
  const texts = project(group);
  // Inside the group: after its last child, at the drop point less the group's corner.
  expect(addedLines(texts.get(SCREEN) ?? '', after(texts, drop(texts, 'u8g2gl_box', 50, 30).plan))).toEqual([
    '      <u8g2gl_box name="box_2" x="10" y="10" width="16" height="8" />',
  ]);
  const into = after(texts, drop(texts, 'u8g2gl_box', 50, 30).plan).split('\n');
  expect(into.indexOf('      <u8g2gl_box name="box_2" x="10" y="10" width="16" height="8" />')).toBe(into.indexOf('    </u8g2gl_obj>') - 1);
  // On the leaf box_1, which has no children: the screen, as its last child.
  const onLeaf = after(texts, drop(texts, 'u8g2gl_box', 3, 3).plan).split('\n');
  expect(onLeaf.indexOf('    <u8g2gl_box name="box_2" x="3" y="3" width="16" height="8" />')).toBe(onLeaf.indexOf('  </view>') - 1);
});

test('an insert that would not validate is refused with the validator’s reason, and writes nothing', () => {
  // No image declared: an xbm's required src has nothing to name.
  const { plan } = drop(project(BOX), 'u8g2gl_xbm', 30, 20);
  expect(plan).toEqual({ kind: 'refused', reason: "Missing required attribute 'src' on <u8g2gl_xbm>." });
  // An unknown tag is refused before anything else.
  expect(drop(project(BOX), 'u8g2gl_nothing', 30, 20).plan.kind).toBe('refused');
});

test('a refusal is judged on errors the insert adds, not ones the project already had', () => {
  // The project already has an error elsewhere (an xbm with no src); a label still inserts.
  const broken = `${BOX}\n    <u8g2gl_xbm name="art" x="0" y="20" width="8" height="8" />`;
  expect(drop(project(broken), 'u8g2gl_label', 30, 20).plan.kind).toBe('insert');
});

test('applied through the canvas editor, an insert is one undo stop: one undo restores the text exactly', () => {
  const texts = project(BOX);
  const { plan } = drop(texts, 'u8g2gl_label', 30, 20);
  const model = new FakeModel(texts.get(SCREEN) ?? '');
  const editor = new CanvasEditor(() => model);
  if (plan.kind !== 'insert') throw new Error('refused');
  expect(editor.apply(SCREEN, (text) => (text === plan.text ? plan.edits : []))).toBe(true);
  expect(model.getValue()).toBe(after(texts, plan));
  model.undo();
  expect(model.getValue()).toBe(texts.get(SCREEN));
});
