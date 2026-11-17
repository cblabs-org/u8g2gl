/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/data-declaration.test.ts
 * Purpose: Schema 0.7's `<data>` block on `<api>`, from what an author writes to
 *          the diagnostic they get. The parser keeps every attribute as written
 *          and located, and refuses one it does not read; the schema pass holds
 *          each rule at the attribute at fault, refuses the block in a 0.4–0.6
 *          project while those versions keep validating, and the departures
 *          fixture's two collection widgets validate clean.
 * Description: Parser cases build manifests from XML strings. Validator cases
 *              start from the `valid` fixture, add one project widget and set
 *              the project's schema, so each assertion is about the rule under
 *              test and nothing else.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateInput } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { dataCountOf, type WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import { loadProject } from '../../src/node/load-project.js';
import { checkProject } from '../../src/core/generator/check-project.js';

const validDir = resolve(__dirname, 'fixtures', 'valid');
const read = (relative: string): string => readFileSync(resolve(validDir, relative), 'utf-8');
const DEPARTURES = resolve(__dirname, '..', 'fixtures', 'departures-project');

const FILE = 'widgets/wd_list/wd_list.xml';

/** Parses a manifest that must parse cleanly. */
function manifestOf(xml: string, file = FILE): WidgetManifest {
  const result = parseWidgetManifestFile(xml, file);
  expect(result.diagnostics).toEqual([]);
  if (result.value === undefined) throw new Error(`${file} did not parse`);
  return result.value;
}

/** A classed project widget with two int props, a string prop, and `body` inside `<api>`. */
function list(body: string, root = '<widget name="wd_list" extends="u8g2gl_obj">'): string {
  return (
    `${root}\n` +
    `  <api>\n` +
    `    <prop name="max_rows" type="int" default="8" />\n` +
    `    <prop name="max_cols" type="int" default="3" />\n` +
    `    <prop name="title" type="string" />\n` +
    `${body}\n` +
    `  </api>\n` +
    `</widget>\n`
  );
}

/** The `valid` fixture at `schema`, with `extra` as project manifests. */
function projectWith(schema: string, extra: readonly WidgetManifest[]): ValidateInput {
  const project = parseProjectFile(read('u8g2gl.xml'), 'u8g2gl.xml').value!;
  const component = manifestOf(read('widgets/status_bar/status_bar.xml'), 'widgets/status_bar/status_bar.xml');
  const badge = manifestOf(read('widgets/wd_badge/wd_badge.xml'), 'widgets/wd_badge/wd_badge.xml');
  return {
    project: { ...project, schema },
    globals: parseGlobalsFile(read('globals.xml'), 'globals.xml').value!,
    screens: [parseScreenFile(read('screens/screen_home.xml'), 'screens/screen_home.xml').value!],
    manifests: buildManifestRegistry({
      framework: parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests,
      project: [component, badge, ...extra],
    }),
    catalogue: CATALOGUE,
  };
}

/** The diagnostics a run reports for the widget under test's file. */
function dataDiagnostics(xml: string, schema = '0.7'): Diagnostic[] {
  return validate(projectWith(schema, [manifestOf(xml)])).diagnostics.filter((d) => d.file === FILE);
}

/** The one diagnostic a run reports for the file, asserting there is exactly one. */
function onlyDiagnostic(xml: string, schema = '0.7'): Diagnostic {
  const found = dataDiagnostics(xml, schema);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('parsing <data> in <api>', () => {
  it('reads each block and field in order, as written, with where each attribute starts', () => {
    const manifest = manifestOf(
      list(
        '    <data name="rows" access="add_row" capacity="max_rows" help="One per row.">\n' +
          '      <field name="cells" type="string" repeat="max_cols" max_len="24" />\n' +
          '      <field name="kind" type="enum" values="a,b" help="Which." />\n' +
          '    </data>\n' +
          '    <data name="marks" access="add_mark">\n' +
          '      <field name="at" type="int" min="-4" max="40" />\n' +
          '    </data>',
      ),
    );
    const [rows, marks] = manifest.api.data ?? [];
    expect(rows).toMatchObject({ name: 'rows', access: 'add_row', capacity: 'max_rows', help: 'One per row.' });
    expect(rows?.fields).toMatchObject([
      { name: 'cells', type: 'string', repeat: 'max_cols', maxLen: '24' },
      { name: 'kind', type: 'enum', values: 'a,b', help: 'Which.' },
    ]);
    expect(marks).toMatchObject({ name: 'marks', access: 'add_mark', fields: [{ name: 'at', type: 'int', min: '-4', max: '40' }] });
    expect(marks).not.toHaveProperty('capacity');
    // Line 6 is the first <data>; `capacity="` starts at column 40, its value at 50.
    expect(rows?.loc).toMatchObject({ file: FILE, line: 6, column: 5 });
    expect(rows?.attributeLocs?.['capacity']).toMatchObject({ name: { line: 6, column: 40 }, value: { line: 6, column: 50 } });
    expect(rows?.fields[0]?.attributeLocs?.['repeat']?.value).toMatchObject({ line: 7, column: 49 });
  });

  it('gives a manifest with no <data> an empty list', () => {
    expect(manifestOf(list('')).api.data).toEqual([]);
  });

  it('refuses an attribute or child it does not read, rather than dropping it', () => {
    const result = parseWidgetManifestFile(
      list(
        '    <data name="rows" access="add_row" capacty="max_rows">\n' +
          '      <field name="cells" type="string" maxlen="4" />\n' +
          '      <arg name="x" type="int" />\n' +
          '    </data>',
      ),
      FILE,
    );
    expect(result.diagnostics.map((d) => [d.code, d.offendingText, d.line])).toEqual([
      [DIAGNOSTIC_CODES.MALFORMED_XML, 'capacty', 6],
      [DIAGNOSTIC_CODES.MALFORMED_XML, 'maxlen', 7],
      [DIAGNOSTIC_CODES.MALFORMED_XML, 'arg', 8],
    ]);
  });

  it('requires a name on <data> and a name and type on <field>', () => {
    const result = parseWidgetManifestFile(list('    <data access="add_row">\n      <field type="int" />\n      <field name="b" />\n    </data>'), FILE);
    expect(result.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [DIAGNOSTIC_CODES.MISSING_REQUIRED, "Missing required attribute 'name' on <data>"],
      [DIAGNOSTIC_CODES.MISSING_REQUIRED, "Missing required attribute 'name' on <field>"],
      [DIAGNOSTIC_CODES.MISSING_REQUIRED, "Missing required attribute 'type' on <field>"],
    ]);
  });
});

describe('dataCountOf()', () => {
  const props = manifestOf(list('')).api.props;

  it('reads a literal, and an int prop with its default', () => {
    expect(dataCountOf('12', props)).toEqual({ kind: 'literal', value: 12 });
    expect(dataCountOf(' max_rows ', props)).toMatchObject({ kind: 'prop', prop: { name: 'max_rows' }, value: 8 });
  });

  it('refuses a negative literal, an unknown name and a non-int prop', () => {
    expect(dataCountOf('-1', props)).toBeUndefined();
    expect(dataCountOf('max_lines', props)).toBeUndefined();
    expect(dataCountOf('title', props)).toBeUndefined();
  });
});

describe('the <data> rules', () => {
  it('accepts a well-formed block', () => {
    expect(
      dataDiagnostics(
        list(
          '    <data name="rows" access="add_row" capacity="max_rows">\n' +
            '      <field name="cells" type="string" repeat="max_cols" max_len="24" />\n' +
            '      <field name="n" type="int" min="1" max="99" />\n' +
            '      <field name="kind" type="enum" values="a,b" />\n' +
            '      <field name="on" type="bool" />\n' +
            '    </data>',
        ),
      ),
    ).toEqual([]);
  });

  it('refuses an unknown field type at its value, offering the four', () => {
    const d = onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="n" type="integer" />\n    </data>'));
    expect(d).toMatchObject({ code: DIAGNOSTIC_CODES.INVALID_ENUM_VALUE, line: 7, column: 29, offendingText: 'integer' });
    expect(d.suggestions).toEqual(['int', 'bool', 'string', 'enum']);
  });

  it('refuses a known type no row can carry, by name', () => {
    const d = onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="f" type="font" />\n    </data>'));
    expect(d).toMatchObject({ code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, offendingText: 'font' });
    expect(d.message).toContain('cannot carry');
  });

  it('refuses min or max on a non-int field, at the attribute name', () => {
    const found = dataDiagnostics(list('    <data name="rows" access="add_row">\n      <field name="s" type="string" min="1" max="4" />\n    </data>'));
    expect(found.map((d) => [d.code, d.offendingText, d.column])).toEqual([
      [DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, 'min', 37],
      [DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, 'max', 45],
    ]);
  });

  it('refuses min above max, and a bound that is not an integer', () => {
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="n" type="int" min="9" max="2" />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: '9',
    });
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="n" type="int" max="ten" />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'ten',
    });
  });

  it('refuses values on a non-enum field, and an enum without values', () => {
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="b" type="bool" values="x,y" />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'values',
    });
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="k" type="enum" />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'k',
    });
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="k" type="enum" values=" , " />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'k',
    });
  });

  it('refuses max_len on a non-string field', () => {
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row">\n      <field name="n" type="int" max_len="4" />\n    </data>'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'max_len',
    });
  });

  it.each([
    ['capacity', '    <data name="rows" access="add_row" capacity="max_lines">\n    </data>', 'max_lines'],
    ['capacity naming a string prop', '    <data name="rows" access="add_row" capacity="title">\n    </data>', 'title'],
    ['repeat', '    <data name="rows" access="add_row">\n      <field name="c" type="string" repeat="-2" />\n    </data>', '-2'],
    ['max_len', '    <data name="rows" access="add_row">\n      <field name="c" type="string" max_len="width" />\n    </data>', 'width'],
  ])('refuses a %s that is neither an int literal nor an int prop of the widget', (_what, body, text) => {
    const d = onlyDiagnostic(list(body));
    expect(d).toMatchObject({ code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, offendingText: text });
    expect(d.message).toMatch(/int prop|not int/);
  });

  it('names a non-int prop by its type', () => {
    expect(onlyDiagnostic(list('    <data name="rows" access="add_row" capacity="title">\n    </data>')).message).toContain(
      `names prop 'title', which is type="string", not int`,
    );
  });

  it('refuses a duplicate data name and a duplicate field name', () => {
    const found = dataDiagnostics(
      list(
        '    <data name="rows" access="add_row">\n' +
          '      <field name="a" type="int" />\n' +
          '      <field name="a" type="bool" />\n' +
          '    </data>\n' +
          '    <data name="rows" access="add_other" />',
      ),
    );
    expect(found.map((d) => [d.code, d.offendingText, d.line])).toEqual([
      [DIAGNOSTIC_CODES.DUPLICATE_NAME, 'a', 8],
      [DIAGNOSTIC_CODES.DUPLICATE_NAME, 'rows', 10],
    ]);
  });

  it('refuses an access that is not a C++ identifier, and a missing one', () => {
    expect(onlyDiagnostic(list('    <data name="rows" access="add-row" />'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'add-row',
    });
    expect(onlyDiagnostic(list('    <data name="rows" access="delete" />'))).toMatchObject({
      code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
      offendingText: 'delete',
    });
    expect(onlyDiagnostic(list('    <data name="rows" />'))).toMatchObject({
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      offendingText: 'access',
    });
  });

  it('refuses a <data> on a drawing element and on a composite, which have no class', () => {
    const drawing =
      '<widget name="wd_list">\n  <api>\n    <prop name="width" type="int" draw="u8g2gl_draw_box" />\n' +
      '    <data name="rows" access="add_row" />\n  </api>\n</widget>\n';
    expect(onlyDiagnostic(drawing).message).toContain('drawing element has only free functions');

    const composite =
      '<widget name="wd_list">\n  <api>\n    <data name="rows" access="add_row" />\n  </api>\n' +
      '  <view><u8g2gl_box name="b" x="0" y="0" width="4" height="4" /></view>\n</widget>\n';
    expect(onlyDiagnostic(composite).message).toContain('composite is a plain u8g2gl_obj container');
  });
});

describe('the 0.7 gate', () => {
  const block = list('    <data name="rows" access="add_row" capacity="max_lines" />');

  it.each(['0.4', '0.5', '0.6'])('tells a %s project to declare 0.7, once per <data>, and judges nothing else', (schema) => {
    const d = onlyDiagnostic(block, schema);
    expect(d).toMatchObject({ code: DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED, line: 6, column: 5 });
    expect(d.message).toContain(`schema '${schema}'`);
    expect(d.message).toContain('Declare schema="0.7"');
  });

  it.each(['0.4', '0.5', '0.6'])('keeps accepting a %s project that writes no <data>', (schema) => {
    expect(dataDiagnostics(list(''), schema)).toEqual([]);
    expect(validate(projectWith(schema, [])).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('the departures fixture', () => {
  it('declares its collection widgets data and validates clean', () => {
    const { model } = loadProject(DEPARTURES);
    expect([...model.loadDiagnostics, ...checkProject(model, 'error').diagnostics]).toEqual([]);
    const formation = model.manifests.get('wd_train_formation')?.api.data;
    const list = model.manifests.get('wd_service_list')?.api.data;
    expect(formation?.map((d) => [d.name, d.access, d.capacity, d.fields.map((f) => f.name)])).toEqual([
      ['carriages', 'add_carriage', 'max_carriages', ['number', 'class_type', 'wheelchair', 'bike', 'loading_pct']],
    ]);
    expect(list?.map((d) => [d.name, d.access, d.capacity, d.fields.map((f) => [f.name, f.repeat, f.maxLen])])).toEqual([
      ['rows', 'add_row', 'max_rows', [['cells', 'max_cols', 'max_cell_chars']]],
    ]);
  });
});
