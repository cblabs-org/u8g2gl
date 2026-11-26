/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/collection-storage.test.ts
 * Purpose: Generated collection storage ([Q-19], design_spec §9.2, §18). A
 *          `<data>` block's row has a fixed layout derived from its fields, the
 *          generator allocates capacity × row bytes per instance from that
 *          instance's own props, and §18 reports exactly those bytes. Q-19's
 *          own example is the headline: two service lists declaring
 *          `max_rows="1"` and `max_rows="10"` get 1× and 10× the row's bytes,
 *          where both used to carry the manifest's defaults.
 * Description: The layout module is tested directly; the departures fixture is
 *              generated and reported through the CLI's own loader; refusals
 *              use widgets built in memory, generated and validated through
 *              the two journeys' entry points.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { checkProject, type ProjectModel } from '../../src/core/generator/check-project.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { generate, type GenerateResult } from '../../src/core/generator/index.js';
import { buildGenerateReport, MEASURED_KIND, type BudgetLine } from '../../src/core/generator/report/index.js';
import { parseGlobalsFile, parseProjectFile, parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import { rowLayout, ROW_ALIGNMENT } from '../../src/core/realise/index.js';
import { findTargetDisplay } from '../../src/core/resolver/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { formatBudgetReport } from '../../src/node/format-budget.js';
import { loadProject } from '../../src/node/load-project.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const DEPARTURES = resolve(__dirname, '../fixtures/departures-project');
const STATIC_CHILDREN = resolve(__dirname, '../../../test/static_children');

/** A project generated as the CLI generates it, its editor target and its §18 report. */
async function built(dir: string): Promise<{
  readonly result: GenerateResult;
  readonly text: string;
  readonly ram: readonly BudgetLine[];
  readonly scene: { screens: { elements: Record<string, unknown>[] }[] };
}> {
  const loaded = loadProject(dir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const result = generate({ ...loaded.model, generatorVersion: '0.0.0-test', compiledAssets });
  expect(result.errors, JSON.stringify(result.diagnostics)).toBe(0);
  const target = loaded.model.project.targets[0]!;
  const display = findTargetDisplay(target, loaded.model.catalogue);
  const report = buildGenerateReport({
    globals: loaded.model.globals,
    manifests: loaded.model.manifests,
    realised: result.realised!,
    capacities: result.capacities!,
    target,
    ...(display !== undefined ? { display } : {}),
    generatorVersion: '0.0.0-test',
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
  });
  const editor = emitEditorFiles({
    project: loaded.model.project,
    globals: loaded.model.globals,
    screens: loaded.model.screens,
    realised: result.realised!,
    resolved: result.resolved!,
    manifests: loaded.model.manifests,
    capacities: result.capacities!,
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
    generatorVersion: '0.0.0-test',
    target: result.target!,
  });
  const scene = JSON.parse(editor.files.find((file) => file.path === 'ui_scene.json')!.content);
  return { result, text: formatBudgetReport(report), ram: report.budget.ram, scene };
}

/** The storage line §18 reports for one block, by `screen.element.data`. */
function storageLine(ram: readonly BudgetLine[], name: string): BudgetLine {
  const found = ram.find((line) => line.item === 'collection storage' && line.names?.[0] === name);
  expect(found, `no storage line for ${name}`).toBeDefined();
  return found!;
}

describe('the row layout (§9.2): fields in order, naturally aligned, the row padded to four', () => {
  it("lays out the formation's carriages as the runtime test expects", () => {
    const layout = rowLayout([
      { name: 'number', type: 'int', repeat: 1 },
      { name: 'class_type', type: 'enum', repeat: 1 },
      { name: 'wheelchair', type: 'bool', repeat: 1 },
      { name: 'bike', type: 'bool', repeat: 1 },
      { name: 'loading_pct', type: 'int', repeat: 1 },
    ]);
    expect(layout.fields.map((field) => [field.name, field.offset, field.size])).toEqual([
      ['number', 0, 4],
      ['class_type', 4, 1],
      ['wheelchair', 5, 1],
      ['bike', 6, 1],
      ['loading_pct', 8, 4],
    ]);
    expect(layout.rowBytes).toBe(12);
  });

  it('aligns an int after a byte and pads the row to four', () => {
    const layout = rowLayout([
      { name: 'a', type: 'bool', repeat: 1 },
      { name: 'b', type: 'int', repeat: 1 },
      { name: 'c', type: 'bool', repeat: 1 },
    ]);
    expect(layout.fields.map((field) => field.offset)).toEqual([0, 4, 8]);
    expect(layout.rowBytes).toBe(12);
    expect(layout.rowBytes % ROW_ALIGNMENT).toBe(0);
  });

  it('stores a string as max_len + 1 bytes per repeat, its repeats contiguous', () => {
    const layout = rowLayout([{ name: 'cells', type: 'string', repeat: 6, maxLen: 24 }]);
    expect(layout.fields[0]).toMatchObject({ offset: 0, size: 25, repeat: 6, maxLen: 24 });
    expect(layout.rowBytes).toBe(152); // 150, padded to four
  });

  it('gives a row with no fields no bytes', () => {
    expect(rowLayout([]).rowBytes).toBe(0);
  });
});

describe("Q-19's example: max_rows 1 and 10 get 1× and 10× the row's bytes", async () => {
  const { result, ram, scene } = await built(DEPARTURES);
  const unit = result.files.find((file) => file.path === 'ui_screen_departures.cpp')!.content;

  it('declares each instance a buffer of its own capacity × the row', () => {
    expect(unit).toContain('alignas(4) static uint8_t ui_rows_row0_rows[152];');
    expect(unit).toContain('alignas(4) static uint8_t ui_rows_services_rows[1520];');
    expect(unit).toContain('alignas(4) static uint8_t ui_rows_formation_carriages[144];');
  });

  it("hands each widget its buffer after its setters and static children", () => {
    const init = unit.slice(unit.indexOf('void ui_screen_departures_init() {'));
    const row0 = init.split('\n').filter((line) => line.includes('ui_obj_row0.'));
    expect(row0.at(-2)).toBe(
      '    ui_obj_row0.attach_rows(0, u8g2gl_rows(ui_rows_row0_rows, 1, &ui_rows_row0_rows_layout));  // <data name="rows">',
    );
  });

  it('reports each instance exactly, with its derivation', () => {
    const row0 = storageLine(ram, 'departures.row0.rows');
    const services = storageLine(ram, 'departures.services.rows');
    expect(row0.figure).toMatchObject({ kind: MEASURED_KIND, bytes: 152 });
    expect(services.figure).toMatchObject({ kind: MEASURED_KIND, bytes: 1520 });
    expect(services.count).toBe(10);
    expect(services.figure.kind === MEASURED_KIND && services.figure.derivation).toContain(
      '10 rows × 152 bytes (cells: 6 × string, 25 bytes each, max_len 24 + 1, at 0; padded to 4)',
    );
    expect(storageLine(ram, 'departures.formation.carriages').figure).toMatchObject({ bytes: 144 });
  });

  it('carries the same layout in the scene, for the editor host to allocate', () => {
    const services = scene.screens[0]!.elements.find((element) => element.name === 'services')!;
    expect(services.storage).toEqual([
      {
        data: 'rows',
        capacity: 10,
        row_bytes: 152,
        bytes: 1520,
        fields: [{ name: 'cells', type: 'string', offset: 0, size: 25, repeat: 6 }],
      },
    ]);
    const box = scene.screens[0]!.elements.find((element) => element.name === 'plat_box');
    expect(box).not.toHaveProperty('storage');
  });
});

describe("the static-children fixture's figure, which test_storage_sizeof.cpp holds to sizeof", async () => {
  const { ram } = await built(STATIC_CHILDREN);

  it('reports 400 bytes for board.board.rows: 4 rows × 4 cells of 24 + 1, a 100-byte row', () => {
    expect(storageLine(ram, 'board.board.rows').figure).toMatchObject({ kind: MEASURED_KIND, bytes: 400 });
  });
});

// --- Refusals: a block that cannot be sized has no storage to generate ---

const GLOBALS = '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>';

/** A project with one widget, `wd_t`, declaring `data`, placed with `attributes`. */
function model(data: string, attributes = '', props = ''): ProjectModel {
  const widget = parseWidgetManifestFile(
    `<widget name="wd_t" extends="u8g2gl_obj"><api>${props}${data}</api></widget>`,
    'widgets/wd_t/wd_t.xml',
  ).value!;
  const screen = parseScreenFile(
    `<screen name="home"><view><wd_t name="t" x="0" y="0" width="10" height="10" ${attributes} /></view></screen>`,
    'screens/screen_home.xml',
  ).value!;
  return {
    project: parseProjectFile(
      '<u8g2gl schema="0.7" name="t" version="1.0.0"><targets><target name="p" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets></u8g2gl>',
      'u8g2gl.xml',
    ).value!,
    globals: parseGlobalsFile(GLOBALS, 'globals.xml').value!,
    screens: [screen],
    manifests: frameworkRegistry([widget]),
    catalogue: CATALOGUE,
    loadDiagnostics: [],
    hasProjectManifest: true,
  };
}

/** The UNSIZED_DATA diagnostics a model raises in each journey. */
function unsized(input: ProjectModel): { generate: readonly Diagnostic[]; validate: readonly Diagnostic[] } {
  const pick = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
    diagnostics.filter((diagnostic) => diagnostic.code === DIAGNOSTIC_CODES.UNSIZED_DATA);
  return {
    generate: pick(generate({ ...input, generatorVersion: '0.0.0-test' }).diagnostics),
    validate: pick(checkProject(input, 'warning').diagnostics),
  };
}

describe('a block that cannot be sized is refused by generate, naming the widget, the data and the field', () => {
  it('a string field with no max_len, located at the field', () => {
    const found = unsized(model('<data name="rows" access="add" capacity="4"><field name="label" type="string" /></data>'));
    expect(found.generate).toHaveLength(1);
    expect(found.generate[0]).toMatchObject({ severity: 'error', file: 'widgets/wd_t/wd_t.xml' });
    expect(found.generate[0]?.message).toContain('<wd_t> <data name="rows"> <field name="label"> is a string with no max_len');
  });

  it('a warning in validate, as Pass 9 reports its other refusals', () => {
    const found = unsized(model('<data name="rows" access="add" capacity="4"><field name="label" type="string" /></data>'));
    expect(found.validate.map((diagnostic) => diagnostic.severity)).toEqual(['warning']);
  });

  it('a <data> with no capacity', () => {
    const found = unsized(model('<data name="rows" access="add"><field name="n" type="int" /></data>'));
    expect(found.generate[0]?.message).toContain('<wd_t> <data name="rows"> declares no capacity');
  });

  it('a count naming a prop the instance leaves unset, with no default, located at the instance', () => {
    const data = '<data name="rows" access="add" capacity="cap"><field name="n" type="int" /></data>';
    const found = unsized(model(data, '', '<prop name="cap" type="int" />'));
    expect(found.generate).toHaveLength(1);
    expect(found.generate[0]).toMatchObject({ file: 'screens/screen_home.xml' });
    expect(found.generate[0]?.message).toContain(`<wd_t> 't' <data name="rows">: its capacity cannot be sized`);
    // The same instance setting it is sized.
    expect(unsized(model(data, 'cap="3"', '<prop name="cap" type="int" />')).generate).toEqual([]);
  });

  it("generates a sized block's storage from the instance's own value", () => {
    const data = '<data name="rows" access="add" capacity="cap"><field name="n" type="int" /></data>';
    const result = generate({ ...model(data, 'cap="3"', '<prop name="cap" type="int" />'), generatorVersion: '0.0.0-test' });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(result.files.find((file) => file.path === 'ui_screen_home.cpp')?.content).toContain(
      'alignas(4) static uint8_t ui_rows_t_rows[12];',
    );
  });
});

describe('the text §18 report (Q4a)', () => {
  it("prints each storage line's name and derivation, as --json gives them", async () => {
    const { text, ram } = await built(DEPARTURES);
    const lines = ram.filter((line) => line.item === 'collection storage');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      const name = line.names?.[0] ?? '';
      expect(text).toMatch(new RegExp(`collection storage \\(${line.count}\\) ${name.replace(/\./g, '\\.')}\\s+\\d+ bytes`));
      if (line.figure.kind === MEASURED_KIND) {
        // Wrapped to the report's width, so compared with the spaces collapsed.
        expect(text.replace(/\s+/g, ' ')).toContain(`storage — ${name}: ${line.figure.derivation}`.replace(/\s+/g, ' '));
      }
    }
  });
});
