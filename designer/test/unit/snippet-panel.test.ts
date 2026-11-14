/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/snippet-panel.test.ts
 * Purpose: The rules behind the target section's constructor snippet and the
 *          rotation select (ui_spec §6.4, [D-22]): the panel's text is core's
 *          `constructorSnippet()` for the target as the form reads it, so it
 *          matches `u8g2gl display --snippet`; it follows the display and the
 *          rotation; and the mirrors are offered only where the schema has
 *          them, apply without resizing, and read by their axis.
 * Description: Form models built from small `u8g2gl.xml` texts, as the form
 *              builds them, and the picker model's pure rotation functions.
 */

import { expect, test } from '@playwright/test';
import { constructorSnippet } from '@u8g2gl/core/catalogue/index.js';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import { allNodes, buildFormModel, type FormModel, type FormNode } from '../../src/forms/form-model';
import { rotationLabel, rotationOptions, rotationResizes } from '../../src/forms/display-picker-model';
import { projectSchema, targetSnippet } from '../../src/forms/snippet-panel-model';

const SSD1322 = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const SSD1306_I2C = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';

/** A u8g2gl.xml with one target, at a schema, as the form reads it. */
function form(target: string, schema = '0.7'): FormModel {
  const reading = buildFormModel('u8g2gl.xml', `<u8g2gl schema="${schema}" name="p" version="1">\n  <targets>\n    ${target}\n  </targets>\n</u8g2gl>\n`);
  if (reading.kind !== 'form') throw new Error(reading.problem);
  return reading.model;
}

/** The form's first target node. */
function firstTarget(model: FormModel): FormNode {
  const target = allNodes(model).find((node) => node.element.id === 'target');
  if (target === undefined) throw new Error('no target');
  return target;
}

/** The catalogue record a setup names. */
function record(setup: string): (typeof CATALOGUE)[number] {
  const found = CATALOGUE.find((r) => r.setup === setup);
  if (found === undefined) throw new Error(setup);
  return found;
}

test("the panel's text is constructorSnippet() for the target's setup, rotation and name", () => {
  const snippet = targetSnippet(firstTarget(form(`<target name="main"><display setup="${SSD1322}" rotation="R2" /></target>`)));
  expect(snippet).toEqual({
    targetName: 'main',
    setup: SSD1322,
    rotation: 'R2',
    text: constructorSnippet(record(SSD1322), 'R2', 'main'),
  });
  expect(snippet?.text).toContain('#define DISPLAY_CS');
});

test('it reads a setup and rotation written on <target>, as the parser does', () => {
  const snippet = targetSnippet(firstTarget(form(`<target name="portrait" setup="${SSD1306_I2C}" rotation="90" />`)));
  expect(snippet?.text).toBe(constructorSnippet(record(SSD1306_I2C), '90', 'portrait'));
});

test('it follows the display and the rotation', () => {
  const spi = targetSnippet(firstTarget(form(`<target name="main"><display setup="${SSD1322}" /></target>`)));
  const i2c = targetSnippet(firstTarget(form(`<target name="main"><display setup="${SSD1306_I2C}" /></target>`)));
  const mirrored = targetSnippet(firstTarget(form(`<target name="main"><display setup="${SSD1322}" rotation="MIRROR" /></target>`)));
  expect(spi?.text).not.toBe(i2c?.text);
  expect(i2c?.text).toContain('setI2CAddress');
  expect(mirrored?.text).toContain('it is U8G2_MIRROR.');
});

test('it shows nothing for an unknown or absent setup, or for a node that is not a target', () => {
  expect(targetSnippet(firstTarget(form('<target name="main"><display setup="U8G2_NOT_A_DISPLAY_F" /></target>')))).toBeUndefined();
  expect(targetSnippet(firstTarget(form('<target name="main" />')))).toBeUndefined();
  const model = form(`<target name="main"><display setup="${SSD1322}" /></target>`);
  const display = allNodes(model).find((node) => node.element.id === 'display');
  expect(display !== undefined && targetSnippet(display)).toBeUndefined();
});

test('the project schema is read from the form', () => {
  expect(projectSchema(form('<target name="main" />', '0.6'))).toBe('0.6');
  expect(projectSchema(undefined)).toBeUndefined();
});

test('the rotation select offers the mirrors from schema 0.7, and a written one always', () => {
  const turning = ['R0', 'R1', 'R2', 'R3', '0', '90', '180', '270'];
  expect(rotationOptions('0.6', undefined)).toEqual(turning);
  expect(rotationOptions('0.4', 'R1')).toEqual(turning);
  expect(rotationOptions('0.7', undefined)).toEqual([...turning, 'MIRROR', 'MIRROR_VERTICAL']);
  expect(rotationOptions('0.10', undefined)).toContain('MIRROR');
  // Written at 0.6, it is shown (the validator says it needs 0.7), never dropped.
  expect(rotationOptions('0.6', 'MIRROR')).toEqual([...turning, 'MIRROR']);
  expect(rotationOptions('0.7', 'R9')).toEqual([...turning, 'MIRROR', 'MIRROR_VERTICAL', 'R9']);
});

test('a mirror reads by its axis and applies without resizing', () => {
  expect(rotationLabel('MIRROR')).toBe('MIRROR · mirrored left–right');
  expect(rotationLabel('MIRROR_VERTICAL')).toBe('MIRROR_VERTICAL · mirrored top–bottom');
  const panel = record(SSD1322);
  expect(rotationResizes(panel, 'R0', 'MIRROR')).toBe(false);
  expect(rotationResizes(panel, 'MIRROR', 'MIRROR_VERTICAL')).toBe(false);
  expect(rotationResizes(panel, 'MIRROR', 'R1')).toBe(true);
});
