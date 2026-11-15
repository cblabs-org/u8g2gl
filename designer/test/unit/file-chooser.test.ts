/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/file-chooser.test.ts
 * Purpose: The rules behind the file chooser (ui_spec §6.4): each kind lists
 *          only its own files; a derived element name is a valid identifier
 *          by the validator's rule and unique; an import is proposed in the
 *          kind's folder and refused where it would replace a file or is not
 *          a project path; and a PNG's size is read from its header, or not
 *          at all.
 * Description: The chooser model's pure functions. The derived names are
 *              also checked against the validator's name rule, restated here,
 *              over names chosen to trip each part of it.
 */

import { expect, test } from '@playwright/test';
import { derivedName, fileKindOf, fileKindOfField, filesOfKind, importPath, importRefusal, pngSize, type FileKind } from '../../src/forms/file-chooser-model';

/** A kind's chooser, which every test here expects to exist. */
function kindOf(element: string): FileKind {
  const kind = fileKindOf(element);
  if (kind === undefined) throw new Error(element);
  return kind;
}

const BDF = kindOf('font-bdf');
const XBM = kindOf('image-xbm');
const PNG = kindOf('image-convert');

const PROJECT = ['fonts/A Font.BDF', 'fonts/b.bdf', 'globals.xml', 'images/logo.xbm', 'images/photo.png', 'images/photo.png.txt', 'notes.bdf.md', 'u8g2gl.xml'];

/** The validator's name rule (validate-identifiers.ts), restated to cross-check derived names. */
const VALID_NAME = /^[a-z][a-z0-9_]*$/;

test('only <bdf>, <xbm> and <convert> have a chooser, on src only', () => {
  expect(fileKindOf('font-builtin')).toBeUndefined();
  expect(fileKindOfField('font-bdf', 'src')).toBe(BDF);
  expect(fileKindOfField('font-bdf', 'name')).toBeUndefined();
  expect(fileKindOfField('image-convert', 'src')).toBe(PNG);
});

test('each kind lists only the project files with its extension, any case, in listing order', () => {
  expect(filesOfKind(PROJECT, BDF)).toEqual(['fonts/A Font.BDF', 'fonts/b.bdf']);
  expect(filesOfKind(PROJECT, XBM)).toEqual(['images/logo.xbm']);
  expect(filesOfKind(PROJECT, PNG)).toEqual(['images/photo.png']);
  expect(filesOfKind([], BDF)).toEqual([]);
});

test('a derived name is the file’s base name as a valid identifier', () => {
  expect(derivedName('fonts/Helv-Bold 10.bdf', BDF, new Set())).toBe('helv_bold_10');
  expect(derivedName('fonts/6x10.bdf', BDF, new Set())).toBe('font_6x10');
  expect(derivedName('images/__Logo__.xbm', XBM, new Set())).toBe('logo');
  expect(derivedName('images/class.png', PNG, new Set())).toBe('image_class');
  expect(derivedName('images/ui_icon.png', PNG, new Set())).toBe('image_ui_icon');
  expect(derivedName('images/%%%.png', PNG, new Set())).toBe('image');
  // A dot-file has no extension: its whole name is the base.
  expect(derivedName('images/.xbm', XBM, new Set())).toBe('xbm');
  for (const path of ['fonts/Helv-Bold 10.bdf', 'fonts/6x10.bdf', 'images/a--b.xbm', 'images/u8g2gl_x.png', 'images/int.png']) {
    const name = derivedName(path, BDF, new Set());
    expect(name, path).toMatch(VALID_NAME);
    expect(name, path).not.toContain('__');
  }
});

test('a derived name is unique among the names the list already has', () => {
  expect(derivedName('fonts/mine.bdf', BDF, new Set(['mine']))).toBe('mine_2');
  expect(derivedName('fonts/mine.bdf', BDF, new Set(['mine', 'mine_2']))).toBe('mine_3');
  expect(derivedName('fonts/6x10.bdf', BDF, new Set(['font_6x10']))).toBe('font_6x10_2');
});

test('an import is proposed in the kind’s folder, under the file’s own name', () => {
  expect(importPath('Logo.png', PNG)).toBe('images/Logo.png');
  expect(importPath('helv.bdf', BDF)).toBe('fonts/helv.bdf');
  expect(importPath('C:\\fakepath\\helv.bdf', BDF)).toBe('fonts/helv.bdf');
});

test('an import is refused where it would replace a file, is not a project path, or has the wrong extension', () => {
  expect(importRefusal('fonts/new.bdf', BDF, PROJECT)).toBeUndefined();
  expect(importRefusal('fonts/b.bdf', BDF, PROJECT)).toMatch(/already exists.*never replaces.*Rename/);
  expect(importRefusal('../b.bdf', BDF, PROJECT)).toMatch(/not a project path/);
  expect(importRefusal('', BDF, PROJECT)).toMatch(/not a project path/);
  expect(importRefusal('fonts/new.txt', BDF, PROJECT)).toMatch(/must end in \.bdf/);
  expect(importRefusal('images/new.PNG', PNG, PROJECT)).toBeUndefined();
});

test('a PNG’s width and height are read from its IHDR chunk; anything else gives none', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x01, 0x00, 0, 0, 0, 0x40, 8, 6, 0, 0, 0]);
  expect(pngSize(png)).toEqual({ width: 256, height: 64 });
  expect(pngSize(png.subarray(0, 20))).toBeUndefined();
  const notPng = png.slice();
  notPng[1] = 0;
  expect(pngSize(notPng)).toBeUndefined();
  const notIhdr = png.slice();
  notIhdr[12] = 0x58;
  expect(pngSize(notIhdr)).toBeUndefined();
  const zero = png.slice();
  zero[18] = 0;
  zero[19] = 0;
  expect(pngSize(zero)).toBeUndefined();
});
