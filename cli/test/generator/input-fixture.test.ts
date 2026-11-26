/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/input-fixture.test.ts
 * Purpose: The input fixture (test/input_menu, §12) from its XML to what both
 *          targets build: each screen's ring and event tables and its
 *          descriptor, the callbacks and `ui_dispatch()` in `ui.hpp`, the
 *          merged base style a ring member with several named styles needs,
 *          the scene's ring and events, and the §18 lines for the new tables.
 *          The committed fixture, which the C++ suite and the Wasm parity test
 *          build, must regenerate byte for byte; and a project without input
 *          must emit none of it.
 * Description: The fixture is read through `loadProject()`, the CLI's own
 *              loader, and regenerated as refresh-goldens.mjs does.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { buildGenerateReport } from '../../src/core/generator/report/index.js';
import { findTargetDisplay } from '../../src/core/resolver/index.js';
import { loadProject } from '../../src/node/load-project.js';

/** Must match refresh-goldens.mjs. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const FIXTURE = resolve(__dirname, '../../../test/input_menu');
const STATIC_CHILDREN = resolve(__dirname, '../../../test/static_children');

/** A project regenerated as refresh-goldens.mjs does, firmware and editor. */
async function regenerate(dir: string): Promise<{
  firmware: ReturnType<typeof generate>;
  editor: readonly { path: string; content: string }[];
}> {
  const loaded = loadProject(dir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const firmware = generate({
    ...loaded.model,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    compiledAssets,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
  });
  if (firmware.realised === undefined || firmware.resolved === undefined || firmware.capacities === undefined) {
    throw new Error(`${dir} did not generate: ${JSON.stringify(firmware.diagnostics)}`);
  }
  const editor = emitEditorFiles({
    project: loaded.model.project,
    globals: loaded.model.globals,
    screens: loaded.model.screens,
    realised: firmware.realised,
    resolved: firmware.resolved,
    manifests: loaded.model.manifests,
    capacities: firmware.capacities,
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    target: firmware.target ?? '',
  }).files;
  return { firmware, editor };
}

/** A project's §18 budget, built as the CLI builds it after a generate. */
async function budgetOf(dir: string): Promise<ReturnType<typeof buildGenerateReport>['budget']> {
  const loaded = loadProject(dir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const result = generate({ ...loaded.model, generatorVersion: GOLDEN_GENERATOR_VERSION, compiledAssets });
  const target = loaded.model.project.targets[0]!;
  const display = findTargetDisplay(target, loaded.model.catalogue);
  return buildGenerateReport({
    globals: loaded.model.globals,
    manifests: loaded.model.manifests,
    realised: result.realised ?? [],
    capacities: result.capacities!,
    target,
    ...(display !== undefined ? { display } : {}),
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    images: compiledAssets.images,
    compiledFonts: compiledAssets.fonts,
  }).budget;
}

/** One regenerated file's content. */
function file(files: readonly { path: string; content: string }[], path: string): string {
  const found = files.find((candidate) => candidate.path === path);
  if (found === undefined) {
    throw new Error(`no ${path}`);
  }
  return found.content;
}

describe('the input fixture (§12)', () => {
  it('regenerates every committed byte, firmware and editor', async () => {
    const { firmware, editor } = await regenerate(FIXTURE);
    for (const [dir, files] of [
      ['generated', firmware.files],
      ['generated_editor', editor],
    ] as const) {
      const committed = readdirSync(join(FIXTURE, dir)).sort();
      expect(files.map((f) => f.path).sort()).toEqual(committed);
      for (const generated of files) {
        expect(generated.content, `${dir}/${generated.path}`).toBe(readFileSync(join(FIXTURE, dir, generated.path), 'utf-8'));
      }
    }
  });

  it("emits the ring in the author's order, with each focus style, and every event", async () => {
    const { firmware } = await regenerate(FIXTURE);
    const settings = file(firmware.files, 'ui_screen_settings.cpp');
    expect(settings).toContain(
      [
        'static const u8g2gl_focus_stop ui_screen_settings_ring[] = {',
        '    {nullptr, 0},  // ui_obj_btn_display',
        '    {nullptr, 2},  // ui_obj_sw_wifi',
        '    {nullptr, 3},  // ui_obj_btn_reset',
        '    {&ui_style_selected, 4},  // ui_obj_lbl_about',
        '};',
      ].join('\n'),
    );
    expect(settings).toContain('    {&ui_screen_display, nullptr, 0, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_SCREEN_LOAD},  // ui_obj_btn_display');
    expect(settings).toContain('    {nullptr, on_wifi_changed, 2, U8G2GL_TRIGGER_VALUE_CHANGED, U8G2GL_ACTION_CALLBACK},  // ui_obj_sw_wifi');
    expect(settings).toContain('    {nullptr, on_factory_reset, 3, U8G2GL_TRIGGER_LONG_PRESS, U8G2GL_ACTION_CALLBACK},  // ui_obj_btn_reset');
    expect(settings).toMatch(/ui_screen_settings_ring,\n {4}ui_screen_settings_events,\n {4}4, {2}\/\/ ring entries\n {4}true, {2}\/\/ wrap\n {4}4, {2}\/\/ events\n\};/);
    const display = file(firmware.files, 'ui_screen_display.cpp');
    expect(display).toContain('    {nullptr, nullptr, 3, U8G2GL_TRIGGER_PRESS, U8G2GL_ACTION_SCREEN_BACK},  // ui_obj_btn_back');
    expect(display).toMatch(/ {4}false, {2}\/\/ wrap/);
  });

  it('merges a ring member’s several named styles into one base, and only then', async () => {
    const { firmware } = await regenerate(FIXTURE);
    const settings = file(firmware.files, 'ui_screen_settings.cpp');
    expect(settings).toContain(
      [
        '        static u8g2gl_style base;',
        '        base.merge_from(ui_style_item);',
        '        base.merge_from(ui_style_quiet);',
        '        ui_obj_lbl_about.apply_style(base);',
      ].join('\n'),
    );
    expect(settings.match(/static u8g2gl_style base;/g)).toHaveLength(1);
  });

  it('declares ui_dispatch() and each callback once in ui.hpp, and defines ui_dispatch() in ui.cpp', async () => {
    const { firmware } = await regenerate(FIXTURE);
    const header = file(firmware.files, 'ui.hpp');
    expect(header).toContain('bool ui_dispatch(u8g2gl_event_t event);');
    for (const callback of ['on_wifi_changed', 'on_reset', 'on_factory_reset']) {
      expect(header.split(`void ${callback}(u8g2gl_obj& target, u8g2gl_trigger_t trigger);`)).toHaveLength(2);
    }
    expect(file(firmware.files, 'ui.cpp')).toContain('bool ui_dispatch(u8g2gl_event_t event) {\n    return u8g2gl_dispatch(event);\n}');
  });

  it('carries the ring and events in the scene, version 6', async () => {
    const { editor } = await regenerate(FIXTURE);
    const scene = JSON.parse(file(editor, 'ui_scene.json')) as {
      version: number;
      screens: Array<{ name: string; ring?: unknown; elements: Array<{ name: string; events?: unknown }> }>;
    };
    expect(scene.version).toBe(6);
    const settings = scene.screens.find((screen) => screen.name === 'settings')!;
    expect(settings.ring).toEqual({
      wrap: true,
      stops: [
        { object: 0, focus_style: null },
        { object: 2, focus_style: null },
        { object: 3, focus_style: null },
        { object: 4, focus_style: 'selected' },
      ],
    });
    expect(settings.elements.find((element) => element.name === 'btn_reset')?.events).toEqual([
      { trigger: 'press', action: 'callback', callback: 'on_reset' },
      { trigger: 'long_press', action: 'callback', callback: 'on_factory_reset' },
    ]);
    expect(settings.elements.find((element) => element.name === 'btn_display')?.events).toEqual([
      { trigger: 'press', action: 'screen_load', screen: 'display' },
    ]);
    expect(settings.elements.find((element) => element.name === 'lbl_wifi')).not.toHaveProperty('events');
  });

  it('reports the new tables in §18 by entry, and the screen stack', async () => {
    const { flash, ram } = await budgetOf(FIXTURE);
    expect(flash.find((line) => line.item === 'focus ring entries')).toMatchObject({ count: 5, names: ['display', 'settings'] });
    expect(flash.find((line) => line.item === 'element event entries')).toMatchObject({ count: 5, names: ['display', 'settings'] });
    expect(ram.find((line) => line.item === 'screen stack entries')).toMatchObject({ count: 4 });
  });

  it('emits none of it for a project without a ring or an event', async () => {
    const { firmware, editor } = await regenerate(STATIC_CHILDREN);
    expect(file(firmware.files, 'ui.hpp')).not.toContain('ui_dispatch');
    expect(file(firmware.files, 'ui.cpp')).not.toContain('ui_dispatch');
    const budget = await budgetOf(STATIC_CHILDREN);
    expect(budget.flash.some((line) => line.item.includes('entries'))).toBe(false);
    expect(budget.ram.some((line) => line.item === 'screen stack entries')).toBe(false);
    expect(file(editor, 'ui_scene.json')).not.toContain('"ring"');
  });
});
