/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/placement-rules.test.ts
 * Purpose: What a move writes (EDITOR-DESIGN §3.5): a
 *          literal is rewritten, a far anchor rewritten inverted, a stretched
 *          element's two edges together, a line's endpoints together; an
 *          expression, a binding or centring refuses that axis only, with the
 *          reason; a missing start is inserted and taken out again at zero;
 *          and every edit is minimal — a nudge is a one-line diff of one value,
 *          a drag touches only the attributes it names.
 * Description: Each screen is run through the live pipeline (no fonts), so the
 *              placements the rules read are the ones the canvas would; the
 *              edits are applied with the CST's `applyEdits` and the texts
 *              diffed line by line.
 */

import { expect, test } from '@playwright/test';
import { applyEdits, parseCst } from '@u8g2gl/core/cst/index.js';
import { moveEdits, planMove, refusals, type MovePlan } from '../../src/editing/placement-rules';
import { runTextPipeline, type TextPipelineResult } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const SCREEN = 'screens/screen_home.xml';

/** A 128 × 64 project whose screen holds `elements`, with a constant and a subject to refer to. */
function run(elements: string): { text: string; result: TextPipelineResult } {
  const text = `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`;
  const texts = new Map([
    [
      'u8g2gl.xml',
      '<u8g2gl schema="0.5" name="moves" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
    ],
    ['globals.xml', '<globals>\n  <consts>\n    <int name="margin" value="2" />\n  </consts>\n  <subjects>\n    <int name="knob_x" value="5" />\n  </subjects>\n</globals>\n'],
    [SCREEN, text],
  ]);
  const result = runTextPipeline({
    texts,
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
  return { text, result };
}

/** The plan for `name` and the text after moving it by (dx, dy). */
function move(elements: string, name: string, dx: number, dy: number): { before: string; after: string; plan: MovePlan } {
  const { text, result } = run(elements);
  const cst = parseCst(text, SCREEN).cst;
  const plan = planMove(cst, name, result.placements.get(name));
  if (plan === undefined) throw new Error(`no ${name}`);
  return { before: text, after: applyEdits(text, moveEdits(cst, [plan], dx, dy)), plan };
}

/** The lines that differ between two texts of the same line count, as [before, after]. */
function changedLines(before: string, after: string): [string, string][] {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b.length).toBe(a.length);
  return a.flatMap((line, i): [string, string][] => (line === b[i] ? [] : [[line, b[i] ?? '']]));
}

test('an integer literal is rewritten on each axis', () => {
  const { before, after } = move('    <u8g2gl_box name="b" x="10" y="20" width="8" height="8" />', 'b', 5, -3);
  expect(changedLines(before, after)).toEqual([
    ['    <u8g2gl_box name="b" x="10" y="20" width="8" height="8" />', '    <u8g2gl_box name="b" x="15" y="17" width="8" height="8" />'],
  ]);
});

test('a far anchor is rewritten inverted: dragging right lowers right, dragging down lowers bottom', () => {
  const { after, plan } = move('    <u8g2gl_box name="b" right="10" bottom="4" width="8" height="8" />', 'b', 3, 1);
  expect(plan.horizontal).toEqual({ kind: 'move', terms: [{ attribute: 'right', from: 10, sign: -1, inserted: false }] });
  expect(after).toContain('<u8g2gl_box name="b" right="7" bottom="3" width="8" height="8" />');
});

test('an element stretched between its edges moves both together', () => {
  const { after } = move('    <u8g2gl_box name="b" x="4" right="4" y="0" height="8" />', 'b', -2, 0);
  expect(after).toContain('<u8g2gl_box name="b" x="2" right="6" y="0" height="8" />');
});

test('a line moves by its endpoints, each rewritten on its own axis', () => {
  const { before, after } = move('    <u8g2gl_line name="rule" x1="0" y1="30" x2="100" y2="30" />', 'rule', 4, 2);
  expect(changedLines(before, after)).toEqual([
    ['    <u8g2gl_line name="rule" x1="0" y1="30" x2="100" y2="30" />', '    <u8g2gl_line name="rule" x1="4" y1="32" x2="104" y2="32" />'],
  ]);
});

test('an expression refuses its axis, with the reason, and the element still moves on the other', () => {
  const { after, plan } = move('    <u8g2gl_box name="b" x="#margin + 4" y="20" width="8" height="8" />', 'b', 5, 3);
  expect(plan.horizontal).toEqual({ kind: 'refused', reason: 'x is computed from `#margin + 4`' });
  expect(after).toContain('<u8g2gl_box name="b" x="#margin + 4" y="23" width="8" height="8" />');
  expect(refusals([plan], 5, 3)).toEqual(['x is computed from `#margin + 4`']);
  // No horizontal delta: nothing to explain.
  expect(refusals([plan], 0, 3)).toEqual([]);
});

test('an expression in either endpoint refuses a line’s axis; it is never rewritten into a literal', () => {
  const { after, plan } = move('    <u8g2gl_line name="rule" x1="0" y1="30" x2="#margin + 100" y2="30" />', 'rule', 4, 1);
  expect(plan.horizontal).toEqual({ kind: 'refused', reason: 'x2 is computed from `#margin + 100`' });
  expect(after).toContain('x1="0" y1="31" x2="#margin + 100" y2="31"');
});

test('a bound position refuses its axis: sample data moves it, not the mouse', () => {
  const { after, plan } = move('    <u8g2gl_box name="b" x="0" bind_x="knob_x" y="20" width="8" height="8" />', 'b', 5, 1);
  expect(plan.horizontal).toEqual({ kind: 'refused', reason: 'x is bound to `knob_x`' });
  expect(after).toContain('x="0" bind_x="knob_x" y="21"');
});

test('a centred axis refuses: its position is derived from the container', () => {
  const { after, plan } = move('    <u8g2gl_box name="b" hcenter="true" y="20" width="8" height="8" />', 'b', 5, 1);
  expect(plan.horizontal).toEqual({ kind: 'refused', reason: 'x is centred by `hcenter="true"`' });
  expect(after).toContain('<u8g2gl_box name="b" hcenter="true" y="21" width="8" height="8" />');
});

test('a start that is not written and has no drawn position refuses: the canvas does not guess one', () => {
  // The resolver leaves an axis with nothing to place it unresolved (and says so).
  const { before, after, plan } = move('    <u8g2gl_box name="b" y="20" width="8" height="8" />', 'b', 3, 1);
  expect(plan.horizontal).toEqual({ kind: 'refused', reason: '<u8g2gl_box> has no x the canvas can set' });
  expect(after).toBe(before.replace('y="20"', 'y="21"'));
});

test('a start that is not written but is drawn is inserted at its drawn position, and taken out again at zero', () => {
  // A placement whose x the pipeline settled without the attribute: the drawn
  // position, inside a container whose corner is at 30.
  const { text, result } = run('    <u8g2gl_box name="b" x="40" y="20" width="8" height="8" />');
  const real = result.placements.get('b')!;
  const placement = { ...real, origin: { x: 30, y: 0 } };
  const before = text.replace(' x="40"', '');
  const cst = parseCst(before, SCREEN).cst;
  const plan = planMove(cst, 'b', placement)!;
  expect(plan.horizontal).toEqual({ kind: 'move', terms: [{ attribute: 'x', from: 10, sign: 1, inserted: true }] });
  const after = applyEdits(before, moveEdits(cst, [plan], 3, 2));
  expect(after).toContain('<u8g2gl_box name="b" y="22" width="8" height="8" x="13" />');
  expect(applyEdits(after, moveEdits(parseCst(after, SCREEN).cst, [plan], 0, 0))).toBe(before);
});

test('a move edits the current text: an element that has moved in it since is found by name', () => {
  const { text, result } = run('    <u8g2gl_box name="a" x="1" y="1" width="4" height="4" />\n    <u8g2gl_box name="b" x="10" y="20" width="8" height="8" />');
  const plans = ['a', 'b'].map((name) => planMove(parseCst(text, SCREEN).cst, name, result.placements.get(name))!);
  // Someone typed a comment above both since the plan was made.
  const edited = text.replace('  <view>\n', '  <view>\n    <!-- moved down a line -->\n');
  const after = applyEdits(edited, moveEdits(parseCst(edited, SCREEN).cst, plans, 1, 1));
  expect(after).toContain('<!-- moved down a line -->');
  expect(after).toContain('name="a" x="2" y="2"');
  expect(after).toContain('name="b" x="11" y="21"');
  // A name that is gone plans nothing and writes nothing.
  expect(planMove(parseCst(text, SCREEN).cst, 'gone', undefined)).toBeUndefined();
});

test('minimal diffs: a nudge changes one attribute value on one line and nothing else', () => {
  const elements = [
    '    <!-- the header -->',
    "    <u8g2gl_box name='b'",
    "                x='10'  y='20'",
    "                width='8' height='8' />",
    '    <u8g2gl_box name="c" x="1" y="1" width="2" height="2" />',
  ].join('\n');
  const { before, after } = move(elements, 'b', 1, 0);
  // One line, and on it only the value's characters, with the author's quotes and spacing.
  expect(changedLines(before, after)).toEqual([["                x='10'  y='20'", "                x='11'  y='20'"]]);
});

test('minimal diffs: a drag touches only the attributes that place the element', () => {
  const elements = '    <u8g2gl_box name="b" x="10" y="20" width="8" height="8" filled="false" />';
  const { before, after } = move(elements, 'b', -7, 12);
  const [[, line] = ['', '']] = changedLines(before, after);
  expect(line).toBe('    <u8g2gl_box name="b" x="3" y="32" width="8" height="8" filled="false" />');
  // Character for character, only the two values differ.
  const a = before.length;
  const b = after.length;
  expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
});
