/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/collection-data-fixture.test.ts
 * Purpose: The editor fill path's generated half (schema 0.7 `<data>`, design_spec
 *          §9.2): per `<data>` the registry carries its field rules, a fill
 *          thunk calling begin(), the access method per row and commit(), and a
 *          static_assert that the declared fields can call the method. The
 *          fixtures the C++ suite and the Wasm parity test compile — the
 *          collection-data project and the fill guard's match and mismatch —
 *          must regenerate byte for byte, and the collection-data project's
 *          manifests must be the departures fixture's own.
 * Description: Reads each fixture through `loadProject()`, generates both
 *              targets exactly as refresh-goldens.mjs does, and compares.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { loadProject } from '../../src/node/load-project.js';

/** Must match refresh-goldens.mjs. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const TEST = resolve(__dirname, '../../../test');
const DEPARTURES = resolve(__dirname, '../fixtures/departures-project');
const FIXTURES = ['collection_data', 'fill_guard/match', 'fill_guard/mismatch'].map((dir) => join(TEST, dir));

/** Both targets' files, as refresh-goldens.mjs writes them. */
async function regenerate(dir: string): Promise<{ firmware: readonly { path: string; content: string }[]; editor: readonly { path: string; content: string }[]; diagnostics: readonly unknown[] }> {
  const loaded = loadProject(dir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const result = generate({ ...loaded.model, generatorVersion: GOLDEN_GENERATOR_VERSION, compiledAssets, bdfLicenceFiles: loaded.bdfLicenceFiles });
  if (result.realised === undefined || result.resolved === undefined || result.capacities === undefined) {
    throw new Error(`${dir} did not generate: ${JSON.stringify(result.diagnostics)}`);
  }
  const editor = emitEditorFiles({
    project: loaded.model.project,
    globals: loaded.model.globals,
    screens: loaded.model.screens,
    realised: result.realised,
    resolved: result.resolved,
    manifests: loaded.model.manifests,
    capacities: result.capacities,
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    target: result.target ?? '',
  }).files;
  return { firmware: result.files, editor, diagnostics: result.diagnostics };
}

/** The collection-data fixture's editor registry. */
async function registry(): Promise<string> {
  const { editor } = await regenerate(join(TEST, 'collection_data'));
  return editor.find((file) => file.path === 'ui_editor_registry.cpp')!.content;
}

describe('the fill entry in the editor registry (§9.2)', () => {
  it('declares each field with its rules: an enum its values, an int its bounds, a repeated string its counts', async () => {
    const text = await registry();
    expect(text).toContain('static const char* const ui_editor_wd_train_formation_carriages_class_type_values[] = {"standard", "first"};');
    expect(text).toContain(
      '{"class_type", ui_editor_wd_train_formation_carriages_class_type_values, {nullptr, 0}, {nullptr, -1}, INT32_MIN, INT32_MAX, U8G2GL_EDITOR_ENUM, 2, false},',
    );
    expect(text).toContain('{"loading_pct", nullptr, {nullptr, 0}, {nullptr, -1}, 0, 100, U8G2GL_EDITOR_INT, 0, false},');
    expect(text).toContain('{"cells", nullptr, {"max_cols", 6}, {"max_cell_chars", 24}, INT32_MIN, INT32_MAX, U8G2GL_EDITOR_STRING, 0, true},');
  });

  it('checks the access method against the fields at compile time, naming the widget and the data', async () => {
    const text = await registry();
    expect(text).toContain(
      'static_assert(std::is_invocable_v<decltype(ui_editor_wd_train_formation_carriages_call), wd_train_formation*, int32_t, const char*, bool, bool, int32_t>,',
    );
    expect(text).toContain('"wd_train_formation <data name=\\"carriages\\">: add_carriage() cannot be called with the fields the manifest declares');
  });

  it('fills through begin(), the access method per row with the fields in order, and commit()', async () => {
    const text = await registry();
    const thunk = text.slice(text.indexOf('// <data name="carriages">'), text.indexOf('ui_editor_wd_train_formation_carriages_fields, {"max_carriages", 12}, 5},'));
    expect(thunk).toContain('self->begin();');
    expect(thunk).toContain(
      'return ui_editor_wd_train_formation_carriages_call(s, c[0].value.integer, c[1].value.text, c[2].value.boolean, c[3].value.boolean, c[4].value.integer);',
    );
    expect(thunk.indexOf('self->commit();')).toBeGreaterThan(thunk.indexOf('for (size_t r = 0;'));
    expect(text).toContain('ui_editor_wd_train_formation_carriages_fields, {"max_carriages", 12}, 5},');
  });

  it('points a class at its fill entries, and a class with none at nullptr', async () => {
    const text = await registry();
    expect(text).toMatch(/ui_editor_wd_train_formation_data,\n\s+sizeof\(wd_train_formation\), alignof\(wd_train_formation\), \d+, \d+, 0, 1\},/);
    expect(text).toMatch(/nullptr,\n\s+nullptr,\n\s+sizeof\(u8g2gl_label\), alignof\(u8g2gl_label\), \d+, \d+, 0, 0\},/);
  });

  it('reads no asset type when a project declares no fonts or images, so the unit builds warning-free', async () => {
    const { editor } = await regenerate(join(TEST, 'fill_guard/match'));
    expect(editor.find((file) => file.path === 'ui_editor_registry.cpp')!.content).toContain(
      'const void* ui_editor_asset(u8g2gl_editor_type_t type, const char* name) {\n    (void)type;',
    );
  });
});

describe('the collection-data and fill-guard fixtures are exactly what the generator writes (§13.9)', () => {
  it('uses the departures fixture widget manifests, byte for byte', () => {
    for (const widget of ['wd_service_list', 'wd_train_formation']) {
      const path = `widgets/${widget}/${widget}.xml`;
      expect(readFileSync(join(TEST, 'collection_data', path), 'utf-8'), path).toBe(readFileSync(join(DEPARTURES, path), 'utf-8'));
    }
  });

  it.each(FIXTURES)('%s regenerates both targets with no diagnostic and an empty diff', async (dir) => {
    const { firmware, editor, diagnostics } = await regenerate(dir);
    expect(diagnostics).toEqual([]);
    for (const [files, sub] of [
      [firmware, 'generated'],
      [editor, 'generated_editor'],
    ] as const) {
      expect(readdirSync(join(dir, sub)).sort()).toEqual(files.map((file) => file.path).sort());
      for (const file of files) {
        expect(readFileSync(join(dir, sub, file.path), 'utf-8'), `${sub}/${file.path}`).toBe(file.content);
      }
    }
  });
});
