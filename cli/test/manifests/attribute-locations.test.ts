/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/attribute-locations.test.ts
 * Purpose: A manifest diagnostic about one attribute reports at that
 *          attribute, with its text (§15.1). A location at the `<widget>` or
 *          `<bind>` tag would tell an author — or the editor's property panel —
 *          only that something in the element is wrong.
 * Description: One test per diagnostic, each from real XML so the location is
 *              the parser's: the three `extends` faults the registry reports
 *              (unknown base, drawing-element base, cycle), the drawing element
 *              that declares `extends` at all, and the `<bind>` refusals of
 *              §13.1 (an alias of an inherited or own geometry setter, and a
 *              type its target does not accept). Each asserts file, line,
 *              column, offending text, and that the message carries the text.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { validate } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.5" name="locations" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`;
const GLOBALS_XML =
  '<globals>\n    <subjects><int name="n" value="0" /></subjects>\n</globals>\n';
const SCREEN_XML = '<screen name="home">\n    <view />\n</screen>\n';

// parse
// A manifest from `xml` at widgets/<name>/<name>.xml, which must parse cleanly.
function parse(name: string, xml: string): WidgetManifest {
  const result = parseWidgetManifestFile(xml, `widgets/${name}/${name}.xml`);
  expect(result.diagnostics).toEqual([]);
  return result.value!;
}

// validateWith
// Every validator diagnostic for an empty screen and the given project manifests.
function validateWith(manifests: readonly WidgetManifest[]): readonly Diagnostic[] {
  return validate({
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [parseScreenFile(SCREEN_XML, 'screens/screen_home.xml').value!],
    manifests: frameworkRegistry(manifests),
    catalogue: CATALOGUE,
  }).diagnostics;
}

// located
// The diagnostics with `code` as [file, line, column, offendingText], after
// checking that each message quotes its offending text.
function located(diagnostics: readonly Diagnostic[], code: string): Array<[string, number, number, string | undefined]> {
  const found = diagnostics.filter((d) => d.code === code);
  for (const d of found) {
    expect(d.message).toContain(d.offendingText);
  }
  return found.map((d) => [d.file, d.line, d.column, d.offendingText]);
}

/** A drawing element: `draw=` props only, no class. */
const DRAWING_XML =
  '<widget name="wd_draw">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n    </api>\n</widget>';

describe("an 'extends' fault reports at the 'extends' value", () => {
  it('an unknown element', () => {
    const wd = parse('wd_a', '<widget name="wd_a"\n        extends="wd_missing">\n    <api />\n</widget>');
    expect(located(frameworkRegistry([wd]).diagnostics, DIAGNOSTIC_CODES.UNKNOWN_WIDGET)).toEqual([
      ['widgets/wd_a/wd_a.xml', 2, 18, 'wd_missing'],
    ]);
  });

  it('a drawing element', () => {
    const wd = parse(
      'wd_a',
      '<widget name="wd_a" extends="wd_draw">\n    <api>\n        <prop name="v" type="int" setter="set_v" />\n    </api>\n</widget>',
    );
    const registry = frameworkRegistry([parse('wd_draw', DRAWING_XML), wd]);
    expect(located(registry.diagnostics, DIAGNOSTIC_CODES.EXTENDS_DRAWING_ELEMENT)).toEqual([
      ['widgets/wd_a/wd_a.xml', 1, 30, 'wd_draw'],
    ]);
  });

  it('a cycle, at the manifest whose extends closes it', () => {
    const a = parse('wd_a', '<widget name="wd_a" extends="wd_b">\n    <api />\n</widget>');
    const b = parse('wd_b', '<widget name="wd_b"   extends="wd_a">\n    <api />\n</widget>');
    expect(located(frameworkRegistry([a, b]).diagnostics, DIAGNOSTIC_CODES.CIRCULAR_REFERENCE)).toEqual([
      ['widgets/wd_b/wd_b.xml', 1, 32, 'wd_a'],
    ]);
  });
});

describe("a drawing element declaring 'extends' reports at the attribute's name", () => {
  it('because the fix is to remove it', () => {
    const wd = parse(
      'wd_draw',
      '<widget name="wd_draw" extends="u8g2gl_obj">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n    </api>\n</widget>',
    );
    const found = validateWith([wd]).filter((d) => d.code === DIAGNOSTIC_CODES.DRAWING_ELEMENT_EXTENDS);
    expect(found.map((d) => [d.file, d.line, d.column, d.offendingText])).toEqual([
      ['widgets/wd_draw/wd_draw.xml', 1, 24, 'extends'],
    ]);
    expect(found[0]?.message).toContain('extends="u8g2gl_obj"');
  });
});

describe('a <bind> refused by §13.1 reports at the attribute at fault', () => {
  // `<bind>` on line 3, its attributes at fixed columns:
  //   `        <bind name="` is 20 characters, so name's value starts at 21.
  const custom = (bind: string): WidgetManifest =>
    parse('wd_c', `<widget name="wd_c" extends="u8g2gl_obj">\n    <api>\n        ${bind}\n    </api>\n</widget>`);

  it('an alias of an inherited geometry setter, at name', () => {
    const wd = custom('<bind name="bind_when" type="int" setter="bind_x" />');
    expect(located(validateWith([wd]), DIAGNOSTIC_CODES.BINDING_ALIAS)).toEqual([
      ['widgets/wd_c/wd_c.xml', 3, 21, 'bind_when'],
    ]);
  });

  it("an alias of a drawing element's own geometry prop, at name", () => {
    const wd = parse(
      'wd_draw',
      '<widget name="wd_draw">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n' +
        '        <bind name="bind_w" type="int" setter="width" />\n    </api>\n</widget>',
    );
    expect(located(validateWith([wd]), DIAGNOSTIC_CODES.BINDING_ALIAS)).toEqual([
      ['widgets/wd_draw/wd_draw.xml', 4, 21, 'bind_w'],
    ]);
  });

  it('a type the inherited setter does not accept, at type', () => {
    // `        <bind name="bind_x" type="` is 34 characters.
    const wd = custom('<bind name="bind_x" type="string" setter="bind_x" />');
    expect(located(validateWith([wd]), DIAGNOSTIC_CODES.TYPE_MISMATCH)).toEqual([
      ['widgets/wd_c/wd_c.xml', 3, 35, 'string'],
    ]);
  });

  it("a type a drawing element's prop does not accept, at type", () => {
    // `        <bind name="bind_width" type="` is 38 characters.
    const wd = parse(
      'wd_draw',
      '<widget name="wd_draw">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n' +
        '        <bind name="bind_width" type="bool" setter="width" />\n    </api>\n</widget>',
    );
    expect(located(validateWith([wd]), DIAGNOSTIC_CODES.TYPE_MISMATCH)).toEqual([
      ['widgets/wd_draw/wd_draw.xml', 4, 39, 'bool'],
    ]);
  });

  it('falls back to the <bind> tag when there is no attribute location', () => {
    // A parsed `<bind>` always has its name written (it is required), so the
    // fallback serves a BindDef built without the parser, as unit tests do.
    const wd = custom('<bind name="bind_when" type="int" setter="bind_x" />');
    const bare: WidgetManifest = {
      ...wd,
      api: {
        ...wd.api,
        bindings: wd.api.bindings.map((bind) => ({ ...bind, attributeLocs: undefined })),
      },
    };
    expect(located(validateWith([bare]), DIAGNOSTIC_CODES.BINDING_ALIAS)).toEqual([
      ['widgets/wd_c/wd_c.xml', 3, 9, 'bind_when'],
    ]);
  });
});
