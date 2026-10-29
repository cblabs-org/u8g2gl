/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/panel-guidance.test.ts
 * Purpose: The rules that decide what a field shows (ui_spec §9.2, §9.4): its
 *          value, the default while unwritten, *mixed* across a selection, its
 *          diagnostics; disabled with the reason when `bind_<prop>` binds it,
 *          when `right` or `bottom` anchors its axis, when several elements
 *          share it as geometry, or when the text is not well-formed; and
 *          Detach's literal for geometry written as an expression.
 * Description: `fieldState` over hand-made element facts, so each rule is seen
 *              alone.
 */

import { expect, test } from '@playwright/test';
import type { ElementFacts } from '../../src/panel/element-facts';
import { fieldState, sameFieldState, type FieldContext } from '../../src/panel/field-state';
import type { FieldSpec } from '../../src/panel/panel-layout';

/** An int prop field. */
function int(key: string, extra: Partial<FieldSpec> = {}): FieldSpec {
  return { key, kind: 'prop', type: 'int', subjectTypes: [], options: [], default: undefined, required: false, help: undefined, source: 'u8g2gl_obj', ...extra };
}

/** One element's facts from its written attributes. */
function element(name: string, attributes: Record<string, string>, extra: Partial<ElementFacts> = {}): ElementFacts {
  return { name, tag: 'u8g2gl_label', attributes: new Map(Object.entries(attributes)), problems: new Map(), placed: undefined, ...extra };
}

const OK: FieldContext = { wellFormed: true, box: undefined };

test('a written value shows as written; an unwritten one shows nothing but is not mixed, so the default is greyed', () => {
  expect(fieldState(int('x'), [element('a', { x: '4' })], OK)).toMatchObject({ value: '4', written: true, mixed: false, disabled: undefined });
  expect(fieldState(int('padding', { default: '0' }), [element('a', {})], OK)).toMatchObject({ value: undefined, written: false, mixed: false });
});

test('the diagnostics at the attribute are the field’s, once each across the selection', () => {
  const problems = new Map([['width', [{ severity: 'error' as const, message: 'overflows the display' }]]]);
  const state = fieldState(int('width'), [element('a', { width: '300' }, { problems }), element('b', { width: '300' }, { problems })], OK);
  expect(state.problems).toEqual([{ severity: 'error', message: 'overflows the display' }]);
});

test('bind_<prop> disables <prop>, with the subject named, and offers the binding in the XML', () => {
  const state = fieldState({ ...int('text'), type: 'string' }, [element('bar', { text: 'x', bind_text: 'message_text' })], OK);
  expect(state.disabled).toBe("text is bound to 'message_text' by bind_text: the subject's value replaces it, so edit the binding or the sample data instead (§8.4).");
  expect(state.reveal).toBe('bind_text');
  expect(state.detach).toBeUndefined();
});

test('right disables x and bottom disables y, each with the reason; the other axis is unaffected', () => {
  const anchored = [element('a', { right: '0', y: '3', bottom: '2' })];
  expect(fieldState(int('x'), anchored, OK).disabled).toBe(
    `x is set by right="0": the element is anchored to its container's right edge, and setting both would over-constrain it (§7.2).`,
  );
  expect(fieldState(int('x'), anchored, OK).reveal).toBe('right');
  expect(fieldState(int('y'), anchored, OK).disabled).toContain('bottom="2"');
  expect(fieldState(int('width'), anchored, OK).disabled).toBeUndefined();
});

test('several elements: a common value, or mixed; geometry is their bounding box, read-only', () => {
  const two = [element('a', { x: '4', font: 'f' }), element('b', { x: '10', font: 'f' })];
  const box = { x: 4, y: 0, width: 30, height: 12 };
  expect(fieldState({ ...int('font'), type: 'font' }, two, { wellFormed: true, box })).toMatchObject({ value: 'f', mixed: false });
  expect(fieldState(int('padding'), [element('a', { padding: '1' }), element('b', {})], OK)).toMatchObject({ value: undefined, mixed: true, written: true });
  const x = fieldState(int('x'), two, { wellFormed: true, box });
  expect(x).toMatchObject({ mixed: true, shown: '4', disabled: 'The bounding box of 2 elements, read-only here: move or align them on the canvas.' });
  expect(fieldState(int('width'), two, { wellFormed: true, box }).shown).toBe('30');
});

test('text that is not well-formed disables every field', () => {
  expect(fieldState(int('x'), [element('a', { x: '4' })], { wellFormed: false, box: undefined }).disabled).toMatch(/not well-formed/);
});

test('geometry written as an expression offers Detach to the literal the scene computed, and Edit in XML', () => {
  const placed = { x: 8, y: 2, width: 20, height: 10 };
  const state = fieldState(int('x'), [element('a', { x: '#margin + 4', width: '20' }, { placed })], OK);
  expect(state).toMatchObject({ detach: '8', reveal: 'x', disabled: undefined });
  // A literal has nothing to detach; nor has a non-geometry prop, nor a field the scene did not place.
  expect(fieldState(int('width'), [element('a', { x: '#margin + 4', width: '20' }, { placed })], OK).detach).toBeUndefined();
  expect(fieldState(int('padding'), [element('a', { padding: '#gap' }, { placed })], OK).detach).toBeUndefined();
  expect(fieldState(int('x'), [element('a', { x: '#margin' })], OK).detach).toBeUndefined();
  // A bound coordinate is live data: Edit in XML only, never Detach.
  const bound = fieldState(int('x'), [element('a', { x: '#margin', bind_x: 'knob_x' }, { placed })], OK);
  expect(bound).toMatchObject({ detach: undefined, reveal: 'bind_x' });
});

test('states that render the same are equal, so an unchanged field does not re-render', () => {
  const a = fieldState(int('x'), [element('a', { x: '4' })], OK);
  const b = fieldState(int('x'), [element('a', { x: '4' })], OK);
  expect(a).not.toBe(b);
  expect(sameFieldState(a, b)).toBe(true);
  expect(sameFieldState(a, fieldState(int('x'), [element('a', { x: '5' })], OK))).toBe(false);
});
