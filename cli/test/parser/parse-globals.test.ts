/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-globals.test.ts
 * Purpose: Verification tests for parsing globals.xml declaration files.
 * Description: Asserts that valid-globals.xml is parsed into a typed Globals model
 *              covering compile-time constants, reactive subjects, monochrome styles,
 *              font discriminated unions (bdf vs builtin), and image asset discriminated
 *              unions (xbm vs convert), with source coordinate positions on all declarations.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlobalsFile } from '../../src/core/parser/index.js';
import type {
  BdfFontDecl,
  BuiltinFontDecl,
  ConvertImageDecl,
  XbmImageDecl,
} from '../../src/core/schema/globals.js';

describe('parseGlobalsFile', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-globals.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('parses valid-globals.xml into a typed Globals model with all sections', () => {
    const result = parseGlobalsFile(fixtureXml, 'globals.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const globals = result.value!;

    // 1. Consts
    expect(globals.consts).toHaveLength(3);
    expect(globals.consts[0]).toEqual({
      name: 'header_height',
      type: 'int',
      value: '11',
      loc: expect.objectContaining({ file: 'globals.xml', line: 5 }),
    });
    expect(globals.consts[1]).toEqual({
      name: 'row_height',
      type: 'int',
      value: '13',
      loc: expect.objectContaining({ file: 'globals.xml', line: 6 }),
    });
    expect(globals.consts[2]).toEqual({
      name: 'app_name',
      type: 'string',
      value: 'Departures Board',
      loc: expect.objectContaining({ file: 'globals.xml', line: 7 }),
    });

    // 2. Subjects
    expect(globals.subjects).toHaveLength(4);
    expect(globals.subjects[0]).toMatchObject({
      name: 'temperature',
      type: 'int',
      default: '0',
    });
    expect(globals.subjects[1]).toMatchObject({
      name: 'station_name',
      type: 'string',
      default: '',
      maxLen: 48,
    });
    expect(globals.subjects[2]).toMatchObject({
      name: 'wifi_connected',
      type: 'bool',
      default: 'true',
    });
    expect(globals.subjects[3]).toMatchObject({
      name: 'system_time',
      type: 'time',
    });

    // 3. Styles
    expect(globals.styles).toHaveLength(3);
    const headerStyle = globals.styles[0]!;
    expect(headerStyle.name).toBe('header');
    expect(headerStyle.font).toBe('small_9');
    expect(headerStyle.drawColor).toBe('1');
    expect(headerStyle.align).toBe('left');
    expect(headerStyle.fontMode).toBe('solid');
    expect(headerStyle.bitmapMode).toBe('transparent');

    const selectedStyle = globals.styles[2]!;
    expect(selectedStyle.name).toBe('selected');
    expect(selectedStyle.invert).toBe(true);
    expect(selectedStyle.padding).toBe(2);
    expect(selectedStyle.radius).toBe(1);

    // 4. Fonts: Discriminated Union
    expect(globals.fonts).toHaveLength(5);
    const bdfFont = globals.fonts[0] as BdfFontDecl;
    expect(bdfFont.kind).toBe('bdf');
    expect(bdfFont.name).toBe('small_9');
    expect(bdfFont.src).toBe('fonts/custom_9px.bdf');
    expect(bdfFont.range).toBe('0x20-0x7F');
    expect(bdfFont.loc).toBeDefined();

    const builtinFont = globals.fonts[4] as BuiltinFontDecl;
    expect(builtinFont.kind).toBe('builtin');
    expect(builtinFont.name).toBe('u8g2_font_6x10_mr');
    expect(builtinFont.loc).toBeDefined();

    // 5. Images: Discriminated Union
    expect(globals.images).toHaveLength(3);
    const xbmImage = globals.images[0] as XbmImageDecl;
    expect(xbmImage.kind).toBe('xbm');
    expect(xbmImage.name).toBe('icon_wifi');
    expect(xbmImage.src).toBe('assets/wifi.xbm');
    expect(xbmImage.loc).toBeDefined();

    const convertImage = globals.images[2] as ConvertImageDecl;
    expect(convertImage.kind).toBe('convert');
    expect(convertImage.name).toBe('logo');
    expect(convertImage.src).toBe('assets/logo.png');
    expect(convertImage.width).toBe(32);
    expect(convertImage.height).toBe(32);
    expect(convertImage.mode).toBe('threshold');
    expect(convertImage.threshold).toBe(128);
    expect(convertImage.loc).toBeDefined();
  });

  it('attaches source coordinate locations to all declarations', () => {
    const result = parseGlobalsFile(fixtureXml, 'globals.xml');
    const globals = result.value!;

    expect(globals.loc).toBeDefined();
    expect(globals.loc?.file).toBe('globals.xml');
    expect(globals.loc?.line).toBe(3);

    for (const c of globals.consts) {
      expect(c.loc?.file).toBe('globals.xml');
      expect(c.loc?.line).toBeGreaterThan(0);
    }
    for (const s of globals.subjects) {
      expect(s.loc?.file).toBe('globals.xml');
      expect(s.loc?.line).toBeGreaterThan(0);
    }
    for (const st of globals.styles) {
      expect(st.loc?.file).toBe('globals.xml');
      expect(st.loc?.line).toBeGreaterThan(0);
    }
    for (const f of globals.fonts) {
      expect(f.loc?.file).toBe('globals.xml');
      expect(f.loc?.line).toBeGreaterThan(0);
    }
    for (const img of globals.images) {
      expect(img.loc?.file).toBe('globals.xml');
      expect(img.loc?.line).toBeGreaterThan(0);
    }
  });
});
