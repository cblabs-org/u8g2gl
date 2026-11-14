/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/project-targets.test.ts
 * Purpose: The rules behind the u8g2gl.xml editor (rulings 6–8, D1): the
 *          display picker's grouping and search, which bus fields a family
 *          uses, rotations read as angles, the impact preview's outside test,
 *          the active target's fallback and storage, Run refusing a canvas on
 *          another target, and the last target never being removed.
 * Description: Pure functions on the shipped catalogue and small texts; the
 *              storage is an in-memory or a throwing stand-in.
 */

import { expect, test } from '@playwright/test';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { vocabularyElement } from '@u8g2gl/core/schema/index.js';
import type { Target } from '@u8g2gl/core/schema/project.js';
import { busFieldApplies, controllerOptions, rotationLabel, searchSetups, variantOptions, wiringOptions } from '../../src/forms/display-picker-model';
import { formEdit } from '../../src/forms/form-edits';
import { candidateTexts, outsideElements } from '../../src/forms/impact-preview';
import { ACTIVE_TARGET_KEY, ActiveTarget, pickTarget } from '../../src/project/active-target';
import { runAvailability } from '../../src/test-run/verdict';

test('the picker steps controller → size and variant → wiring, each grouping what the catalogue holds', () => {
  const controllers = controllerOptions(CATALOGUE);
  expect(controllers.reduce((sum, c) => sum + c.setups, 0)).toBe(CATALOGUE.length);
  expect(controllers.map((c) => c.controller)).toEqual([...controllers.map((c) => c.controller)].sort((a, b) => a.localeCompare(b, 'en')));
  const variants = variantOptions(CATALOGUE, 'SSD1306');
  const noname = variants.find((v) => v.key === '128X64 NONAME');
  expect(noname).toMatchObject({ width: 128, height: 64, framebufferBytes: 1024, tiles: { width: 16, height: 8 } });
  // Smallest display first.
  expect(variants.map((v) => v.width * v.height)).toEqual([...variants.map((v) => v.width * v.height)].sort((a, b) => a - b));
  const wirings = wiringOptions(CATALOGUE, 'SSD1306', '128X64 NONAME');
  expect(wirings.map((w) => w.bus.raw)).toEqual(['2ND_4W_HW_SPI', '3W_HW_SPI', '3W_SW_SPI', '4W_HW_SPI', '4W_SW_SPI', '2ND_HW_I2C', 'HW_I2C', 'SW_I2C', '6800', '8080']);
  expect(wirings.every((w) => w.controller === 'SSD1306')).toBe(true);
});

test('the search matches every word in the setup name, shortest first; failing that it asks u8g2gl find', () => {
  const found = searchSetups(CATALOGUE, 'ssd1306 128x64 noname hw_i2c');
  expect(found.matches[0]?.setup).toBe('U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
  expect(found.matches.every((m) => m.setup.includes('SSD1306') && m.setup.includes('128X64'))).toBe(true);
  expect(searchSetups(CATALOGUE, '').matches).toEqual([]);
  // A typo no setup contains still finds the controller through the CLI's fuzzy identify.
  const fuzzy = searchSetups(CATALOGUE, 'SSD1036 128x64');
  expect(fuzzy.matches.length + fuzzy.notes.length).toBeGreaterThan(0);
});

test('bus fields follow the family: address for I²C, cs, dc and reset for SPI and parallel', () => {
  const display = vocabularyElement('display');
  const attribute = (name: string) => display?.attributes.find((a) => a.name === name);
  const applies = (name: string, family: 'spi' | 'i2c' | 'parallel') => {
    const found = attribute(name);
    return found !== undefined && busFieldApplies(found, family);
  };
  expect(['address', 'cs', 'dc', 'reset'].filter((name) => applies(name, 'i2c'))).toEqual(['address']);
  expect(['address', 'cs', 'dc', 'reset'].filter((name) => applies(name, 'spi'))).toEqual(['cs', 'dc', 'reset']);
  expect(['address', 'cs', 'dc', 'reset'].filter((name) => applies(name, 'parallel'))).toEqual(['cs', 'dc', 'reset']);
  // Not a bus field, or no known family: shown.
  const setup = attribute('setup');
  expect(setup !== undefined && busFieldApplies(setup, 'i2c')).toBe(true);
  const address = attribute('address');
  expect(address !== undefined && busFieldApplies(address, undefined)).toBe(true);
});

test('a rotation reads with its angle', () => {
  expect(['R0', 'R1', 'R2', 'R3', '90'].map(rotationLabel)).toEqual(['R0 · 0°', 'R1 · 90°', 'R2 · 180°', 'R3 · 270°', '90°']);
});

test('the impact preview names an element whose box leaves the display, and its texts change only the setup', () => {
  const bounds = new Map([
    ['inside', { x: 0, y: 0, width: 128, height: 64 }],
    ['right', { x: 120, y: 0, width: 16, height: 8 }],
    ['below', { x: 0, y: 60, width: 8, height: 8 }],
    ['left', { x: -1, y: 0, width: 4, height: 4 }],
  ]);
  expect(outsideElements(bounds, 128, 64).map((e) => e.name)).toEqual(['right', 'below', 'left']);
  const texts = new Map([
    ['u8g2gl.xml', '<u8g2gl schema="0.6" name="p" version="1"><targets><target name="a" setup="OLD" /></targets></u8g2gl>'],
    ['globals.xml', '<globals />'],
  ]);
  const candidate = candidateTexts(texts, 'u8g2gl.xml>targets#0>display|display/setup', 'NEW');
  expect(candidate.get('u8g2gl.xml')).toBe('<u8g2gl schema="0.6" name="p" version="1"><targets><target name="a" setup="NEW" /></targets></u8g2gl>');
  expect(candidate.get('globals.xml')).toBe('<globals />');
  expect(texts.get('u8g2gl.xml')).toContain('OLD');
});

test('the active target: the chosen one if declared, else the first; remembered per project; storage that throws is survived', () => {
  const a = { name: 'a', setup: 'S' } as Target;
  const b = { name: 'b', setup: 'T' } as Target;
  expect(pickTarget([a, b], undefined)).toBe(a);
  expect(pickTarget([a, b], 'b')).toBe(b);
  expect(pickTarget([a, b], 'renamed')).toBe(a);
  expect(pickTarget([], 'b')).toBeUndefined();

  const kept = new Map<string, string>();
  const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
  const first = new ActiveTarget(storage);
  first.load('probe');
  expect(first.name.get()).toBeUndefined();
  first.choose('b');
  expect(kept.get(`${ACTIVE_TARGET_KEY}probe`)).toBe('b');
  const again = new ActiveTarget(storage);
  again.load('probe');
  expect(again.name.get()).toBe('b');
  const other = new ActiveTarget(storage);
  other.load('another');
  expect(other.name.get()).toBeUndefined();

  const throwing = { getItem: (): string | null => { throw new Error('denied'); }, setItem: (): void => { throw new Error('denied'); } };
  const fragile = new ActiveTarget(throwing);
  fragile.load('probe');
  fragile.choose('b');
  expect(fragile.name.get()).toBe('b');
});

test('Run is unavailable while the canvas shows another target than the first, and says which to switch to', () => {
  const ready = { cannotBuild: undefined, wasm: 'current', placeholders: 0, wellFormed: true, live: true } as const;
  expect(runAvailability(ready)).toEqual({ state: 'ready' });
  expect(runAvailability({ ...ready, defaultTarget: 'primary' })).toEqual({
    state: 'unavailable',
    reason: 'a test run builds the first target: switch the canvas to primary to run it',
  });
});

test('the last target cannot be removed; one of two can', () => {
  const one = '<u8g2gl schema="0.6" name="p" version="1"><targets><target name="a" setup="S" /></targets></u8g2gl>';
  const refused = formEdit('u8g2gl.xml', one, { kind: 'remove', item: 'u8g2gl.xml>targets#0' });
  expect(refused.edits).toEqual([]);
  expect(refused.refused).toContain('at least one target');
  const two = one.replace('</targets>', '<target name="b" setup="T" /></targets>');
  expect(applyEdits(two, formEdit('u8g2gl.xml', two, { kind: 'remove', item: 'u8g2gl.xml>targets#1' }).edits)).toBe(one);
});
