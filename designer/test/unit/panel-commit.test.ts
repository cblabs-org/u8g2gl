/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/panel-commit.test.ts
 * Purpose: What a committed field writes ([UD-3], EDITOR-DESIGN §3.6): the one
 *          attribute's value in place, an attribute added in the element's own
 *          layout, the attribute removed for reset, every selected element in
 *          one list of edits, and nothing at all for a commit that changes
 *          nothing. And the int field's check as typed (ui_spec §9.2).
 * Description: `attributeEdits` on the departures screen's text, landed with
 *              the CST's `applyEdits`, and diffed line by line.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { attributeEdits, ROOT_TARGET } from '../../src/panel/commit-edits';
import { intDraftError } from '../../src/panel/field-state';

const SCREEN = 'screens/screen_departures.xml';
const TEXT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project', SCREEN), 'utf8');

/** The lines that differ between two texts of the same line count. */
function changedLines(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  return b.filter((line, i) => line !== a[i]);
}

/** Commits through attributeEdits and lands the edits. */
function commit(names: readonly string[], attribute: string, value: string | undefined, text = TEXT): string {
  return applyEdits(text, attributeEdits(text, SCREEN, names, attribute, value));
}

test('a written attribute is rewritten in place: a one-line diff, its quote kept', () => {
  const after = commit(['row0'], 'x', '40');
  expect(changedLines(TEXT, after)).toEqual([
    '        <wd_service_list name="row0" x="40" y="0" width="224" height="16" font="u8g2_font_6x10_mr" max_rows="1" />',
  ]);
});

test('an unwritten attribute is added after the last one, in the element’s own layout', () => {
  const after = commit(['row0'], 'max_cols', '4');
  expect(changedLines(TEXT, after)).toEqual([
    '        <wd_service_list name="row0" x="32" y="0" width="224" height="16" font="u8g2_font_6x10_mr" max_rows="1" max_cols="4" />',
  ]);
});

test('reset removes the attribute, and a reset of an unwritten one writes nothing', () => {
  const after = commit(['sys_clock'], 'blink', undefined);
  expect(changedLines(TEXT, after)).toEqual([
    '        <u8g2gl_clock name="sys_clock" x="190" y="51" width="66" height="13" font="u8g2_font_6x10_mr" format="hh_mm_ss" bind_time="system_time" />',
  ]);
  expect(attributeEdits(TEXT, SCREEN, ['sys_clock'], 'secondary_font', undefined)).toEqual([]);
});

test('a value the element already has is no edit at all', () => {
  expect(attributeEdits(TEXT, SCREEN, ['row0'], 'x', '32')).toEqual([]);
});

test('a commit to several elements is one list of edits against one text', () => {
  const edits = attributeEdits(TEXT, SCREEN, ['row0', 'services', 'gone'], 'font', 'u8g2_font_helvR08_tr');
  expect(edits).toHaveLength(2);
  const after = applyEdits(TEXT, edits);
  expect(changedLines(TEXT, after)).toHaveLength(2);
  expect(after.match(/font="u8g2_font_helvR08_tr"/g)).toHaveLength(4);
});

test('values are encoded for their quote, so text with markup stays one attribute', () => {
  const after = commit(['plat_label'], 'text', 'A & "B"');
  expect(changedLines(TEXT, after)[0]).toContain('text="A &amp; &quot;B&quot;"');
});

test('the root target edits the screen element’s own attributes', () => {
  expect(changedLines(TEXT, commit([ROOT_TARGET], 'name', 'arrivals'))).toEqual(['<screen name="arrivals">']);
});

test('an int field accepts integers and #-expressions as typed, and refuses the rest with a reason', () => {
  expect(intDraftError('32')).toBeUndefined();
  expect(intDraftError(' -4 ')).toBeUndefined();
  expect(intDraftError('#margin + 4')).toBeUndefined();
  expect(intDraftError('#screen_width - (8 * 2)')).toBeUndefined();
  expect(intDraftError('3.5')).toMatch(/integer/);
  expect(intDraftError('abc')).toMatch(/integer/);
  expect(intDraftError('')).toMatch(/integer/);
  expect(intDraftError('2147483648')).toMatch(/int32_t/);
});
