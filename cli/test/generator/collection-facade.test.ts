/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/collection-facade.test.ts
 * Purpose: §9.2's generated collection API: each `<data>` on each instance gets
 *          a facade `ui_<screen>_<element>_<data>` in ui.hpp whose `begin()`,
 *          `add_row(…)` and `commit()` forward to the widget's own begin(),
 *          declared access method and commit(), with `add_row`'s parameters the
 *          fields in declaration order, typed as the editor's fill thunk passes
 *          them, and `capacity()` the instance's declared capacity. Its names go
 *          through the composed-name collision check.
 * Description: Widgets built in memory, one field type at a time, generated
 *              through `generate()`; the declaration in ui.hpp and the
 *              definition in the screen unit are read back.
 */

import { describe, expect, it } from 'vitest';
import { generate, type GenerateResult } from '../../src/core/generator/index.js';
import { parseGlobalsFile, parseProjectFile, parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

/** Generates one screen `home` with `body`, against a widget `wd_t` declaring `api`. */
function build(api: string, body = '<wd_t name="t" x="0" y="0" width="10" height="10" />', screen = 'home'): GenerateResult {
  const widget = parseWidgetManifestFile(`<widget name="wd_t" extends="u8g2gl_obj"><api>${api}</api></widget>`, 'widgets/wd_t/wd_t.xml').value!;
  return generate({
    project: parseProjectFile(
      '<u8g2gl schema="0.7" name="t" version="1.0.0"><targets><target name="p" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets></u8g2gl>',
      'u8g2gl.xml',
    ).value!,
    globals: parseGlobalsFile('<globals />', 'globals.xml').value!,
    screens: [parseScreenFile(`<screen name="${screen}"><view>${body}</view></screen>`, `screens/screen_${screen}.xml`).value!],
    manifests: frameworkRegistry([widget]),
    catalogue: CATALOGUE,
    loadDiagnostics: [],
    hasProjectManifest: true,
    generatorVersion: '0.0.0-test',
  });
}

/** A generated file's text. */
function file(result: GenerateResult, path: string): string {
  const found = result.files.find((candidate) => candidate.path === path);
  if (found === undefined) throw new Error(`${path} was not generated: ${JSON.stringify(result.diagnostics)}`);
  return found.content;
}

/** The facade's add_row declarations for one field. */
function addRows(field: string): string[] {
  const header = file(build(`<data name="rows" access="put" capacity="5">${field}</data>`), 'ui.hpp');
  return header.split('\n').filter((line) => line.includes('bool add_row(')).map((line) => line.trim());
}

describe("add_row's parameters: each field type as the editor's fill thunk passes it", () => {
  it('an int field is an int32_t', () => {
    expect(addRows('<field name="n" type="int" />')).toEqual(['bool add_row(int32_t n) const;']);
  });
  it('a bool field is a bool', () => {
    expect(addRows('<field name="on" type="bool" />')).toEqual(['bool add_row(bool on) const;']);
  });
  it('a string field is a const char*', () => {
    expect(addRows('<field name="label" type="string" max_len="8" />')).toEqual(['bool add_row(const char* label) const;']);
  });
  it('an enum field is its text, a const char*', () => {
    expect(addRows('<field name="kind" type="enum" values="a,b" />')).toEqual(['bool add_row(const char* kind) const;']);
  });
  it('a repeated field is a pointer and a count, with an initializer_list overload beside it', () => {
    expect(addRows('<field name="cells" type="string" repeat="3" max_len="8" />')).toEqual([
      'bool add_row(const char* const* cells, size_t cells_count) const;',
      'bool add_row(std::initializer_list<const char*> cells) const;',
    ]);
  });
  it('several fields, in declaration order', () => {
    expect(addRows('<field name="n" type="int" /><field name="cells" type="string" repeat="2" max_len="4" /><field name="on" type="bool" />')).toEqual([
      'bool add_row(int32_t n, const char* const* cells, size_t cells_count, bool on) const;',
      'bool add_row(int32_t n, std::initializer_list<const char*> cells, bool on) const;',
    ]);
  });
});

describe('the facade object and its definition', () => {
  const result = build(
    '<prop name="cap" type="int" default="4" /><data name="rows" access="put" capacity="cap"><field name="n" type="int" /></data>',
    '<wd_t name="t" x="0" y="0" width="10" height="10" cap="7" />',
  );

  it('is declared in ui.hpp as a const object, its capacity the instance’s', () => {
    const header = file(result, 'ui.hpp');
    expect(header).toContain('struct ui_home_t_rows_t {');
    expect(header).toContain('    size_t capacity() const { return 7; }');
    expect(header).toContain('extern const ui_home_t_rows_t ui_home_t_rows;');
    expect(header).toContain('#include <initializer_list>');
  });

  it('forwards begin, the access method and commit to the widget, in the screen unit', () => {
    const unit = file(result, 'ui_screen_home.cpp');
    expect(unit).toContain('const ui_home_t_rows_t ui_home_t_rows{};');
    expect(unit).toContain('void ui_home_t_rows_t::begin() const { ui_obj_t.begin(); }');
    expect(unit).toContain('    return u8g2gl_row_added([&] { return ui_obj_t.put(n); });');
    expect(unit).toContain('void ui_home_t_rows_t::commit() const { ui_obj_t.commit(); }');
  });
});

describe('facade names go through the composed-name collision check', () => {
  it("element t's rows facade against element t_rows's handle", () => {
    const result = build(
      '<data name="rows" access="put" capacity="2"><field name="n" type="int" /></data>',
      '<wd_t name="t" x="0" y="0" width="10" height="10" /><u8g2gl_label name="t_rows" x="0" y="20" width="10" height="10" font="u8g2_font_6x10_mr" text="x" />',
    );
    const collisions = result.diagnostics.filter((diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.GENERATED_NAME_COLLISION);
    expect(collisions.map((diagnostic) => diagnostic.offendingText)).toEqual(['ui_home_t_rows']);
    expect(collisions[0]?.message).toContain("the collection facade of <wd_t> 't' <data name=\"rows\">");
    expect(result.files).toEqual([]);
  });
});
