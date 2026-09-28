/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/validate-convert.test.ts
 * Purpose: `validate` judges `<convert>`'s own attributes (PR-04b WO4 item 2):
 *          `mode` is `threshold` or `dither`, `threshold` an integer 0..255,
 *          `width` and `height` positive integers — and does it without reading
 *          or converting anything, so it works on a project whose PNG is absent.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile } from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.4" name="c" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`;

/** A globals file holding one `<convert>` with the given attributes, parsed. */
function parseConvert(attributes: string) {
  return parseGlobalsFile(
    `<globals>\n<images>\n<convert name="logo" src="assets/absent.png" ${attributes} />\n</images>\n</globals>\n`,
    'globals.xml',
  );
}

/** The diagnostics `validate` gives a globals file holding one `<convert>` attribute set. */
function validateConvert(attributes: string) {
  const globals = parseConvert(attributes);
  return validate({
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: globals.value!,
    screens: [],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
  }).diagnostics.filter((d) => d.severity === 'error');
}

describe('validate — <convert> attributes (PR-04b WO4)', () => {
  it('accepts a well-formed declaration, and never looks for the PNG', () => {
    expect(validateConvert('width="16" height="16"')).toEqual([]);
    expect(validateConvert('width="16" height="16" mode="dither" threshold="90"')).toEqual([]);
    expect(validateConvert('width="1" height="1" mode="threshold" threshold="0"')).toEqual([]);
    expect(validateConvert('width="1" height="1" threshold="255"')).toEqual([]);
  });

  it('a mode that is not threshold or dither is INVALID_ENUM_VALUE, with the valid values', () => {
    const [diagnostic, ...rest] = validateConvert('width="16" height="16" mode="sharpen"');
    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
      file: 'globals.xml',
      line: 3,
      offendingText: 'sharpen',
      suggestions: ['threshold', 'dither'],
    });
    expect(diagnostic?.message).toContain("Expected 'threshold' or 'dither'");
  });

  it('a threshold outside 0..255 is an error', () => {
    for (const bad of ['256', '-1', '1000']) {
      const found = validateConvert(`width="16" height="16" threshold="${bad}"`);
      expect(found, bad).toHaveLength(1);
      expect(found[0]?.message).toContain('integer from 0 to 255');
      expect(found[0]?.offendingText).toBe(bad);
    }
  });

  it('a non-integer threshold is reported by the parser, once, and the validator adds nothing', () => {
    const parsed = parseConvert('width="16" height="16" threshold="half"');
    expect(parsed.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.TYPE_MISMATCH]);
  });

  it('a width or height that is not positive is an error naming the attribute', () => {
    const zero = validateConvert('width="0" height="16"');
    expect(zero).toHaveLength(1);
    expect(zero[0]?.message).toContain('Invalid width 0');
    const negative = validateConvert('width="16" height="-4"');
    expect(negative).toHaveLength(1);
    expect(negative[0]?.message).toContain('Invalid height -4');
  });

  it('a non-numeric width is reported once, by the parser', () => {
    const parsed = parseConvert('width="wide" height="16"');
    expect(parsed.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.TYPE_MISMATCH]);
  });
});
