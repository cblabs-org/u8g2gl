/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/project-form.test.ts
 * Purpose: The project-file form's model and its edits (ui_spec §2 principles
 *          5 and 8): every spelling the parser accepts is read, an edit lands
 *          where the value is written, anything new is written in §5.1's
 *          canonical form, comments survive, and text that is not well-formed
 *          has no form.
 * Description: `buildFormModel` and `formEdit` on the departures fixture's
 *              files and on small texts written for one rule each; every
 *              result is parsed by the CLI's own parser, so an edit that wrote
 *              the right characters to the wrong place fails here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { parseGlobalsFile, parseProjectFile } from '@u8g2gl/core/parser/index.js';
import { allNodes, buildFormModel, findList, type FormModel } from '../../src/forms/form-model';
import { formEdit, type FormChange } from '../../src/forms/form-edits';
import { placeProblems } from '../../src/forms/form-problems';
import { nextSectionRows, sectionRows } from '../../src/forms/form-sections';
import type { ProblemRow } from '../../src/pipeline/diagnostics';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project');
const PROJECT = readFileSync(join(FIXTURE, 'u8g2gl.xml'), 'utf8');
const GLOBALS = readFileSync(join(FIXTURE, 'globals.xml'), 'utf8');

/** The form of a text that must have one. */
function form(file: 'u8g2gl.xml' | 'globals.xml', text: string): FormModel {
  const reading = buildFormModel(file, text);
  if (reading.kind !== 'form') throw new Error(reading.problem);
  return reading.model;
}

/** A change, landed. */
function change(file: 'u8g2gl.xml' | 'globals.xml', text: string, what: FormChange): string {
  const result = formEdit(file, text, what);
  expect(result.edits.length).toBeLessThanOrEqual(1);
  return applyEdits(text, result.edits);
}

/** The value a field shows. */
function value(model: FormModel, key: string): string | undefined {
  return allNodes(model).flatMap((node) => node.fields).find((field) => field.key === key)?.value;
}

const TARGET0 = 'u8g2gl.xml>targets#0';
const SETUP0 = `${TARGET0}>display|display/setup`;

test('u8g2gl.xml has Project, Targets and Output sections; globals.xml one per kind, in vocabulary order', () => {
  expect(form('u8g2gl.xml', PROJECT).sections.map((s) => s.title)).toEqual(['Project', 'Targets', 'Output']);
  expect(form('globals.xml', GLOBALS).sections.map((s) => s.title)).toEqual(['Subjects', 'Fonts', 'Images', 'Styles', 'Consts']);
});

test('a value written on <target> instead of <display> is read, and an edit rewrites it there', () => {
  const model = form('u8g2gl.xml', PROJECT);
  expect(value(model, SETUP0)).toBe('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI');
  const after = change('u8g2gl.xml', PROJECT, { kind: 'set', field: SETUP0, value: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C' });
  expect(after).toBe(PROJECT.replace('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI', 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'));
});

test('a new value for an absent <display> joins its siblings on the target, so the parser keeps reading them', () => {
  const after = change('u8g2gl.xml', PROJECT, { kind: 'set', field: `${TARGET0}>display|display/address`, value: '0x3C' });
  expect(after).not.toContain('<display');
  expect(parseProjectFile(after, 'u8g2gl.xml').value?.targets[0]?.bus?.address).toBe('0x3C');
});

test('with nothing written for it, a new value is written in the canonical form, creating <display>', () => {
  const text = '<u8g2gl schema="0.6" name="p" version="1">\n    <targets>\n        <target name="a" />\n    </targets>\n</u8g2gl>\n';
  const after = change('u8g2gl.xml', text, { kind: 'set', field: SETUP0, value: 'U8G2_X_F_HW_I2C' });
  expect(after).toBe(
    '<u8g2gl schema="0.6" name="p" version="1">\n    <targets>\n        <target name="a">\n            <display setup="U8G2_X_F_HW_I2C" />\n        </target>\n    </targets>\n</u8g2gl>\n',
  );
});

test('a <bus> child is read first, and a new bus value goes into it', () => {
  const text =
    '<u8g2gl schema="0.6" name="p" version="1"><targets><target name="a"><display setup="S" cs="9" /><bus dc="4" /></target></targets></u8g2gl>';
  const model = form('u8g2gl.xml', text);
  // The parser reads the <bus> alone once it is there: cs on the display is ignored.
  expect(value(model, `${TARGET0}>display|display/cs`)).toBeUndefined();
  expect(allNodes(model).flatMap((n) => n.fields).find((f) => f.key === `${TARGET0}>display|display/cs`)?.ignored.map((i) => i.value)).toEqual(['9']);
  expect(value(model, `${TARGET0}>display|display/dc`)).toBe('4');
  const after = change('u8g2gl.xml', text, { kind: 'set', field: `${TARGET0}>display|display/reset`, value: '7' });
  expect(after).toContain('<bus dc="4" reset="7" />');
  expect(parseProjectFile(after, 'u8g2gl.xml').value?.targets[0]?.bus?.reset).toBe('7');
});

test('a reset removes the attribute where it is written, and a comment beside it survives', () => {
  const text = '<u8g2gl schema="0.6" name="p" version="1">\n  <!-- keep me -->\n  <output dir="out" prefix="ui_" />\n</u8g2gl>\n';
  const after = change('u8g2gl.xml', text, { kind: 'set', field: 'u8g2gl.xml>output|output/prefix', value: undefined });
  expect(after).toBe('<u8g2gl schema="0.6" name="p" version="1">\n  <!-- keep me -->\n  <output dir="out" />\n</u8g2gl>\n');
});

test('adding the first subject to a file with no <subjects> writes the container and a named item', () => {
  const text = '<globals>\n    <fonts>\n        <builtin name="u8g2_font_6x10_mr" />\n    </fonts>\n</globals>\n';
  const after = change('globals.xml', text, { kind: 'add', list: 'globals.xml>subjects', itemKind: 'subject-int' });
  expect(after).toBe(
    '<globals>\n    <subjects>\n        <int name="subject_1" />\n    </subjects>\n    <fonts>\n        <builtin name="u8g2_font_6x10_mr" />\n    </fonts>\n</globals>\n',
  );
  expect(parseGlobalsFile(after, 'globals.xml').value?.subjects.map((s) => s.name)).toEqual(['subject_1']);
});

test('adding a subject to the fixture appends one line with a fresh name; removing it restores the text', () => {
  const after = change('globals.xml', GLOBALS, { kind: 'add', list: 'globals.xml>subjects', itemKind: 'subject-string' });
  const added = after.split('\n').filter((line) => !GLOBALS.split('\n').includes(line));
  expect(added).toEqual(['        <string name="subject_1" />']);
  const list = findList(form('globals.xml', after), 'globals.xml>subjects');
  const last = list?.items.at(-1)?.key ?? '';
  expect(change('globals.xml', after, { kind: 'remove', item: last })).toBe(GLOBALS);
});

test('a new target carries its required display, seeded from the caller and indented by the file\'s own step', () => {
  const after = change('u8g2gl.xml', PROJECT, { kind: 'add', list: 'u8g2gl.xml>targets', itemKind: 'target', values: { setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C' } });
  const targets = parseProjectFile(after, 'u8g2gl.xml').value?.targets ?? [];
  expect(targets.map((t) => [t.name, t.setup])).toEqual([
    ['primary', 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI'],
    ['target_1', 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C'],
  ]);
  // The fixture indents by four spaces, so the display sits four inside its target.
  expect(after).toContain('\n        <target name="target_1">\n            <display setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />\n        </target>\n');
});

test('moving an item swaps it with its neighbour, layout kept; a move past an item in another element is refused', () => {
  const swapped = change('globals.xml', GLOBALS, { kind: 'move', item: 'globals.xml>subjects#1', delta: -1 });
  expect(parseGlobalsFile(swapped, 'globals.xml').value?.subjects.slice(0, 2).map((s) => s.name)).toEqual(['system_time', 'platform']);
  expect(swapped.split('\n').sort()).toEqual(GLOBALS.split('\n').sort());
  const mixed = '<u8g2gl schema="0.6" name="p" version="1"><targets><target name="a" setup="S" /></targets><target name="b" setup="T" /></u8g2gl>';
  expect(formEdit('u8g2gl.xml', mixed, { kind: 'move', item: 'u8g2gl.xml>targets#1', delta: -1 }).refused).toBeDefined();
});

test('a multi-line item moves with its children, re-indented where it lands', () => {
  const text =
    '<u8g2gl schema="0.6" name="p" version="1">\n  <targets>\n    <target name="a">\n      <display setup="S" />\n    </target>\n    <target name="b" setup="T" />\n  </targets>\n</u8g2gl>\n';
  const after = change('u8g2gl.xml', text, { kind: 'move', item: 'u8g2gl.xml>targets#0', delta: 1 });
  expect(after).toBe(
    '<u8g2gl schema="0.6" name="p" version="1">\n  <targets>\n    <target name="b" setup="T" />\n    <target name="a">\n      <display setup="S" />\n    </target>\n  </targets>\n</u8g2gl>\n',
  );
});

test('a camelCase alias is read and edited where it is written', () => {
  const text = '<globals><subjects><string name="s" maxLen="8" default="hi" /></subjects></globals>';
  const model = form('globals.xml', text);
  expect(value(model, 'globals.xml>subjects#0|subject-string/max_len')).toBe('8');
  expect(value(model, 'globals.xml>subjects#0|subject-string/value')).toBe('hi');
  const after = change('globals.xml', text, { kind: 'set', field: 'globals.xml>subjects#0|subject-string/max_len', value: '12' });
  expect(after).toBe('<globals><subjects><string name="s" maxLen="12" default="hi" /></subjects></globals>');
});

test('text that is not well-formed has no form, and says why', () => {
  const reading = buildFormModel('globals.xml', '<globals><subjects></globals>');
  expect(reading.kind).toBe('unreadable');
  expect(buildFormModel('globals.xml', '<screen />').kind).toBe('unreadable');
});

test('a Problems row lands on the field it is about: its attribute, the attribute it quotes, or the one it names', () => {
  const text = '<u8g2gl schema="0.6" name="p" version="1">\n  <targets>\n    <target name="a" rotation="R9" />\n  </targets>\n  <output prefix="x_" />\n</u8g2gl>\n';
  const model = form('u8g2gl.xml', text);
  const row = (line: number, column: number, message: string): ProblemRow => ({ key: `${line}:${column}:${message}`, severity: 'error', code: 'C', file: 'u8g2gl.xml', line, column, message, suggestions: [] });
  const placed = placeProblems(model, [
    row(3, 5, "Missing required attribute 'setup' on target 'a'."),
    row(3, 5, "Invalid rotation 'R9' on target 'a'. Expected one of: R0."),
    row(5, 3, `'prefix="x_"' on <output> cannot be honoured.`),
    row(3, 5, 'Something about the target as a whole.'),
    { ...row(1, 1, 'Elsewhere.'), file: 'globals.xml' },
  ]);
  expect([...placed.byField.keys()].sort()).toEqual([
    'u8g2gl.xml>output|output/prefix',
    `${TARGET0}>display|display/rotation`,
    `${TARGET0}>display|display/setup`,
  ]);
  expect([...placed.byNode.keys()]).toEqual([TARGET0]);
});

test('the Explorer rows: Project, each target by name, Output; the globals kinds with their counts', () => {
  expect(sectionRows('u8g2gl.xml', PROJECT)).toEqual([
    { key: 'u8g2gl.xml>project', label: 'Project', children: [] },
    { key: 'u8g2gl.xml>targets', label: 'Targets', count: 1, children: [{ key: TARGET0, label: 'primary', children: [] }] },
    { key: 'u8g2gl.xml>output', label: 'Output', children: [] },
  ]);
  expect(sectionRows('globals.xml', GLOBALS)?.map((row) => row.label)).toEqual(['Subjects (7)', 'Fonts (2)', 'Images (0)', 'Styles (0)', 'Consts (0)']);
  // Unreadable text has no rows, so the last ones are kept; unchanged rows keep their identity.
  expect(sectionRows('globals.xml', '<globals>')).toBeUndefined();
  const first = nextSectionRows(new Map(), new Map([['globals.xml', GLOBALS]]));
  expect(nextSectionRows(first, new Map([['globals.xml', GLOBALS.replace('9', '8')]]))).toBe(first);
  expect(nextSectionRows(first, new Map([['globals.xml', '<globals>']]))).toBe(first);
});
