/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/bdf-range-diagnostic.test.ts
 * Purpose: Proves `validate` reports a malformed `<bdf range>` against the declaration's
 *          own location, through the real schema pass — not just that
 *          parseBdfRange() itself rejects it (bdf-range.test.ts covers the grammar).
 * Description: Same `validateSchema` direct-call pattern as schema.test.ts, with a `<bdf>`
 *              font declaration in globals.fonts.
 */

import { describe, expect, it } from 'vitest';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import { validateSchema } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { BdfFontDecl } from '../../src/core/schema/globals.js';

const LOC = { file: 'globals.xml', line: 4, column: 3 };

function inputWithFont(font: BdfFontDecl): ValidateInput {
  return {
    project: { schema: '0.4', name: 'bdf_range_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [font], images: [] },
    screens: [],
    manifests: frameworkRegistry(),
    catalogue: [],
  };
}

describe('validateSchema — <bdf range>', () => {
  it('reports nothing for a well-formed range', () => {
    const font: BdfFontDecl = { kind: 'bdf', name: 'ui_font', src: 'ui_font.bdf', range: '0x20-0x7F', loc: LOC };
    const diagnostics = validateSchema(inputWithFont(font));
    expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MALFORMED_BDF_RANGE)).toEqual([]);
  });

  it('reports nothing when range is omitted', () => {
    const font: BdfFontDecl = { kind: 'bdf', name: 'ui_font', src: 'ui_font.bdf', loc: LOC };
    const diagnostics = validateSchema(inputWithFont(font));
    expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MALFORMED_BDF_RANGE)).toEqual([]);
  });

  it('reports a malformed range at the declaration\'s location, naming the offending item', () => {
    const font: BdfFontDecl = { kind: 'bdf', name: 'ui_font', src: 'ui_font.bdf', range: '32-abc', loc: LOC };
    const diagnostics = validateSchema(inputWithFont(font));
    const malformed = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MALFORMED_BDF_RANGE);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]?.line).toBe(LOC.line);
    expect(malformed[0]?.column).toBe(LOC.column);
    expect(malformed[0]?.offendingText).toBe('range');
    expect(malformed[0]?.message).toContain("32-abc");
    expect(malformed[0]?.message).toContain('ui_font');
  });

  it("reports bdfconv's own reserved syntax as malformed", () => {
    const font: BdfFontDecl = { kind: 'bdf', name: 'ui_font', src: 'ui_font.bdf', range: '*', loc: LOC };
    const diagnostics = validateSchema(inputWithFont(font));
    expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MALFORMED_BDF_RANGE)).toHaveLength(1);
  });
});
