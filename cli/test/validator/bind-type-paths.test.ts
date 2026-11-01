/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/bind-type-paths.test.ts
 * Purpose: Pins §13.2's matching-types rule on every path a subject can reach a
 *          geometry setter: the attribute and composite-forwarded paths (checked
 *          by Pass 5) and a custom manifest's own `<bind>` declaration (checked
 *          by the manifest schema pass).
 * Description: Parses real XML so each diagnostic carries a real location, and
 *              runs the whole validator against the bundled framework manifests.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile, parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { validate } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';
const FONT = 'u8g2_font_6x10_mr';

const PROJECT_XML = `<u8g2gl schema="0.5" name="bind_paths" version="1.0.0">
    <targets><target name="primary" setup="${NARROW}" /></targets>
</u8g2gl>
`;

const GLOBALS_XML =
  `<globals>\n    <subjects><time name="t" value="0" /><int name="n" value="0" /><string name="s" max_len="8" /></subjects>\n` +
  `    <fonts><builtin name="${FONT}" /></fonts>\n</globals>\n`;

/** Every diagnostic `validate` gives for a screen holding `body` and the manifests given. */
function run(body: string, manifests: readonly WidgetManifest[] = []): readonly Diagnostic[] {
  return validate({
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, 'screens/screen_home.xml').value!],
    manifests: frameworkRegistry(manifests),
    catalogue: CATALOGUE,
  }).diagnostics;
}

/** A manifest at widgets/<name>/<name>.xml whose `<api>` holds `api`; the first `<bind>` or `<prop>` is on line 2. */
function manifest(name: string, attrs: string, api: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(
    [`<widget name="${name}"${attrs}>`, `    ${api}`, '</widget>'].join('\n'),
    `widgets/${name}/${name}.xml`,
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

const withCode = (diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.code === code);
const errors = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((d) => d.severity === 'error');
/** Errors located in one manifest file, for a drawing manifest whose instance would add its own. */
const errorsIn = (diagnostics: readonly Diagnostic[], file: string): readonly Diagnostic[] =>
  errors(diagnostics).filter((d) => d.file === file);

describe('a mistyped subject through the attribute and composite paths (§13.2)', () => {
  it('refuses a time subject on bind_x of a box, at the attribute', () => {
    const found = withCode(
      run('        <u8g2gl_box name="b1" x="0" y="0" width="10" height="6" bind_x="t" filled="true" radius="0" />'),
      DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['screens/screen_home.xml', 3, 't']]);
    expect(found[0]?.message).toContain("'time'");
  });

  it('refuses a time subject on bind_y of a label, at the attribute', () => {
    const found = withCode(
      run(`        <u8g2gl_label name="l1" x="0" y="20" width="40" height="10" font="${FONT}" text="x" bind_y="t" />`),
      DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(found.map((d) => [d.file, d.line, d.offendingText])).toEqual([['screens/screen_home.xml', 3, 't']]);
  });

  it('refuses both when forwarded through a composite subject prop, naming the instance', () => {
    const wd = manifest(
      'wd_t',
      '',
      '<api><prop name="s" type="subject" default="n" /></api>\n    <view>\n' +
        '        <u8g2gl_box name="b" x="0" y="0" width="10" height="6" bind_x="$s" filled="true" radius="0" />\n' +
        `        <u8g2gl_label name="l" x="0" y="0" width="10" height="10" font="${FONT}" text="x" bind_y="$s" />\n` +
        '    </view>',
    );
    const found = withCode(
      run('        <wd_t name="w" x="0" y="0" width="40" height="20" s="t" />', [wd]),
      DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(found).toHaveLength(2);
    expect(found.every((d) => d.file === 'widgets/wd_t/wd_t.xml')).toBe(true);
    expect(found.every((d) => d.message.includes("instance 'w'"))).toBe(true);
  });
});

describe("a custom manifest's <bind> is checked against the setter it targets (§13.2, [D-20])", () => {
  // `<bind>` is on line 3 of these manifests (widget, api, bind).
  const custom = (name: string, extendsTag: string, bind: string): WidgetManifest =>
    parseWidgetManifestFile(
      `<widget name="${name}" extends="${extendsTag}">\n    <api>\n        ${bind}\n    </api>\n</widget>`,
      `widgets/${name}/${name}.xml`,
    ).value!;
  const instance = (name: string, attrs = ''): string => `        <${name} name="w" x="0" y="0" width="10" height="6"${attrs} />`;

  it('refuses a time bind that re-targets bind_x under another name: both faults are reported at the <bind>', () => {
    const wd = custom('wd_d', 'u8g2gl_obj', '<bind name="bind_when" type="time" setter="bind_x" />');
    const found = errors(run(instance('wd_d', ' bind_when="t"'), [wd]));
    const alias = withCode(found, DIAGNOSTIC_CODES.BINDING_ALIAS);
    const mismatch = withCode(found, DIAGNOSTIC_CODES.TYPE_MISMATCH);
    // Two faults, two fixes: the name (so origin and clamping apply) and the type.
    expect(alias.map((d) => [d.file, d.line])).toEqual([['widgets/wd_d/wd_d.xml', 3]]);
    expect(alias[0]?.message).toContain('bind_x');
    expect(mismatch.map((d) => [d.file, d.line])).toEqual([['widgets/wd_d/wd_d.xml', 3]]);
    expect(mismatch[0]?.message).toContain('int');
  });

  it('refuses an int bind that re-targets bind_x under another name, by the alias rule alone', () => {
    const wd = custom('wd_d', 'u8g2gl_obj', '<bind name="bind_when" type="int" setter="bind_x" />');
    const found = errors(run(instance('wd_d', ' bind_when="n"'), [wd]));
    expect(found.map((d) => [d.code, d.file, d.line])).toEqual([
      [DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_d/wd_d.xml', 3],
    ]);
    expect(found[0]?.message).toContain('bind_x');
  });

  it('refuses a geometry binding redeclared with a type its setter does not accept', () => {
    const wd = custom('wd_d', 'u8g2gl_obj', '<bind name="bind_x" type="time" setter="bind_x" />');
    const found = errors(run(instance('wd_d'), [wd]));
    expect(found.map((d) => [d.code, d.file, d.line])).toEqual([
      [DIAGNOSTIC_CODES.TYPE_MISMATCH, 'widgets/wd_d/wd_d.xml', 3],
    ]);
  });

  it('refuses a drawing manifest whose bind type does not match the prop its setter names', () => {
    const wd = parseWidgetManifestFile(
      '<widget name="wd_draw">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n' +
        '        <bind name="bind_width" type="time" setter="width" />\n    </api>\n</widget>',
      'widgets/wd_draw/wd_draw.xml',
    ).value!;
    const found = errorsIn(run(instance('wd_draw'), [wd]), 'widgets/wd_draw/wd_draw.xml');
    expect(found.map((d) => [d.code, d.file, d.line])).toEqual([
      [DIAGNOSTIC_CODES.TYPE_MISMATCH, 'widgets/wd_draw/wd_draw.xml', 4],
    ]);
  });

  it('accepts a new method on the author\'s own class', () => {
    const wd = custom('wd_d', 'u8g2gl_obj', '<bind name="bind_when" type="time" setter="bind_when" />');
    expect(errors(run(instance('wd_d', ' bind_when="t"'), [wd]))).toEqual([]);
  });

  it('accepts a geometry binding redeclared with the type it already takes', () => {
    const wd = custom('wd_d', 'u8g2gl_obj', '<bind name="bind_x" type="int" setter="bind_x" />');
    expect(errors(run(instance('wd_d'), [wd]))).toEqual([]);
  });

  it('accepts a drawing manifest whose bind type matches its prop', () => {
    const wd = parseWidgetManifestFile(
      '<widget name="wd_draw">\n    <api>\n        <prop name="width" type="int" draw="u8g2gl_draw_box" />\n' +
        '        <bind name="bind_width" type="int" setter="width" />\n    </api>\n</widget>',
      'widgets/wd_draw/wd_draw.xml',
    ).value!;
    expect(errorsIn(run(instance('wd_draw'), [wd]), 'widgets/wd_draw/wd_draw.xml')).toEqual([]);
  });
});

describe("a composite's <bind> is checked by the same rule", () => {
  // `<bind>` is on line 3; a composite's base is u8g2gl_obj (§13.12).
  const composite = (bind: string): WidgetManifest =>
    parseWidgetManifestFile(
      `<widget name="wd_t">\n    <api>\n        ${bind}\n    </api>\n    <view />\n</widget>`,
      'widgets/wd_t/wd_t.xml',
    ).value!;
  const instance = (attrs = ''): string => `        <wd_t name="w" x="0" y="0" width="10" height="6"${attrs} />`;

  it('refuses a time bind that re-targets bind_x under another name, with both diagnostics at the <bind>', () => {
    const found = errors(run(instance(' bind_when="t"'), [composite('<bind name="bind_when" type="time" setter="bind_x" />')]));
    expect(found.map((d) => [d.code, d.file, d.line]).sort()).toEqual(
      [
        [DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_t/wd_t.xml', 3],
        [DIAGNOSTIC_CODES.TYPE_MISMATCH, 'widgets/wd_t/wd_t.xml', 3],
      ].sort(),
    );
  });

  it('refuses the int variant by the alias rule alone', () => {
    const found = errors(run(instance(' bind_when="n"'), [composite('<bind name="bind_when" type="int" setter="bind_x" />')]));
    expect(found.map((d) => [d.code, d.file, d.line])).toEqual([
      [DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_t/wd_t.xml', 3],
    ]);
  });

  it('accepts a bind whose setter is a new method', () => {
    const found = errors(run(instance(' bind_when="t"'), [composite('<bind name="bind_when" type="time" setter="bind_when" />')]));
    expect(found).toEqual([]);
  });
});

describe('a <bind> that re-declares an inherited setter keeps the inherited name (§13.1)', () => {
  // `<bind>` is on line 3 of every manifest here (widget, api, bind).
  const custom = (name: string, extendsTag: string, bind: string): WidgetManifest =>
    parseWidgetManifestFile(
      `<widget name="${name}" extends="${extendsTag}">\n    <api>\n        ${bind}\n    </api>\n</widget>`,
      `widgets/${name}/${name}.xml`,
    ).value!;
  const composite = (bind: string): WidgetManifest =>
    parseWidgetManifestFile(
      `<widget name="wd_c">\n    <api>\n        ${bind}\n    </api>\n    <view />\n</widget>`,
      'widgets/wd_c/wd_c.xml',
    ).value!;
  const drawing = (bind: string, prop: string): WidgetManifest =>
    parseWidgetManifestFile(
      `<widget name="wd_draw">\n    <api>\n        ${bind}\n        ${prop}\n    </api>\n</widget>`,
      'widgets/wd_draw/wd_draw.xml',
    ).value!;
  const instance = (name: string, attrs = ''): string => `        <${name} name="w" x="0" y="0" width="10" height="6"${attrs} />`;
  const summary = (found: readonly Diagnostic[]): unknown[] => found.map((d) => [d.code, d.file, d.line]);

  it('refuses a drawing element whose bind reaches its own geometry prop under another name', () => {
    const wd = drawing('<bind name="bind_when" type="int" setter="x" />', '<prop name="x" type="int" draw="u8g2gl_draw_box" />');
    const found = errorsIn(run(instance('wd_draw'), [wd]), 'widgets/wd_draw/wd_draw.xml');
    expect(summary(found)).toEqual([[DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_draw/wd_draw.xml', 3]]);
    expect(found[0]?.message).toContain('bind_x');
    expect(found[0]?.message).toContain("binds its own prop 'x' under another name");
    expect(found[0]?.message).toContain('(§13.1, §8.4, [D-20])');
  });

  it('refuses a label subclass that binds the inherited bind_text under another name', () => {
    const wd = custom('wd_l', 'u8g2gl_label', '<bind name="bind_foo" type="string" setter="bind_text" />');
    const found = errors(run(instance('wd_l', ` font="${FONT}" bind_foo="s"`), [wd]));
    expect(summary(found)).toEqual([[DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_l/wd_l.xml', 3]]);
    expect(found[0]?.message).toContain('bind_text');
    expect(found[0]?.message).toContain('reaches a setter that is bound under another name');
    expect(found[0]?.message).toContain('(§13.1, [UD-5])');
  });

  it('refuses the same bind on a composite', () => {
    // A composite's base is u8g2gl_obj, which binds bind_text.
    const found = errors(run(instance('wd_c', ' bind_foo="s"'), [composite('<bind name="bind_foo" type="string" setter="bind_text" />')]));
    expect(summary(found)).toEqual([[DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_c/wd_c.xml', 3]]);
  });

  it('refuses an int bind on bind_text by the alias rule alone', () => {
    const wd = custom('wd_l', 'u8g2gl_label', '<bind name="bind_foo" type="int" setter="bind_text" />');
    const found = errors(run(instance('wd_l', ` font="${FONT}" bind_foo="n"`), [wd]));
    expect(summary(found)).toEqual([[DIAGNOSTIC_CODES.BINDING_ALIAS, 'widgets/wd_l/wd_l.xml', 3]]);
  });

  it('accepts a label subclass that re-declares bind_text under its own name', () => {
    const wd = custom('wd_l', 'u8g2gl_label', '<bind name="bind_text" type="string" setter="bind_text" />');
    expect(errors(run(instance('wd_l', ` font="${FONT}" text="hi"`), [wd]))).toEqual([]);
  });

  it('accepts a new method on a label subclass', () => {
    const wd = custom('wd_l', 'u8g2gl_label', '<bind name="bind_foo" type="string" setter="bind_foo" />');
    expect(errors(run(instance('wd_l', ` font="${FONT}" bind_foo="s"`), [wd]))).toEqual([]);
  });

  it('accepts a drawing element binding a non-geometry prop of its own under a new name', () => {
    const wd = drawing('<bind name="bind_foo" type="bool" setter="filled" />', '<prop name="filled" type="bool" draw="u8g2gl_draw_box" />');
    expect(errorsIn(run(instance('wd_draw'), [wd]), 'widgets/wd_draw/wd_draw.xml')).toEqual([]);
  });
});
