/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/static-children-fixture.test.ts
 * Purpose: Static children (design_spec §6.5) from the XML an author writes to
 *          the C++ both targets compile. A `<column>` inside a service list is
 *          parsed as configuration of its parent, never as an element; Pass 4
 *          holds it to the manifest's `<element>`/`<arg>`s; the firmware init
 *          calls the access method once per child after the setters; the scene
 *          carries the same calls as data; and the registry adds them by name.
 *          The committed static-children fixture, which the C++ suite compiles
 *          and runs, must regenerate byte for byte.
 * Description: Parser and validator cases build documents from strings with the
 *              departures fixture's real service list manifest. Emission cases
 *              read the departures fixture and the static-children fixture
 *              through `loadProject()`, the CLI's own loader.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { checkProject } from '../../src/core/generator/check-project.js';
import { generate } from '../../src/core/generator/index.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { parseScreenFile, parseWidgetManifestFile, staticChildNamesOf } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { isElementNode, staticChildrenOf } from '../../src/core/schema/widget-node.js';
import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import { loadProject } from '../../src/node/load-project.js';

/** Must match refresh-goldens.mjs. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const FIXTURE = resolve(__dirname, '../../../test/static_children');
const DEPARTURES = resolve(__dirname, '../fixtures/departures-project');
const MANIFEST_PATH = 'widgets/wd_service_list/wd_service_list.xml';
const DEPARTURES_MANIFEST = readFileSync(join(DEPARTURES, MANIFEST_PATH), 'utf-8');

const SERVICE_LIST = parseWidgetManifestFile(DEPARTURES_MANIFEST, MANIFEST_PATH).value!;
const NAMES = staticChildNamesOf([SERVICE_LIST]);

/** A screen with one service list holding `children`. */
function screen(children: string): string {
  return (
    '<screen name="s">\n  <view>\n' +
    '    <wd_service_list name="list" x="0" y="0" width="100" height="20" font="u8g2_font_6x10_mr">\n' +
    `${children}\n` +
    '    </wd_service_list>\n  </view>\n</screen>\n'
  );
}

/** The fixture regenerated as refresh-goldens.mjs does, firmware and editor. */
async function regenerate(dir: string): Promise<{ firmware: ReturnType<typeof generate>; editor: readonly { path: string; content: string }[] }> {
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

describe('parsing static children', () => {
  it('parses a declared child as static: no name needed, no element, attributes located', () => {
    const result = parseScreenFile(screen('      <column width="30" align="left" />'), 'screens/screen_s.xml', {
      staticChildren: NAMES,
    });
    expect(result.diagnostics).toEqual([]);
    const list = result.value!.view.children[0]!;
    expect(list.children.filter(isElementNode)).toEqual([]);
    const [column] = staticChildrenOf(list);
    expect(column).toMatchObject({ kind: 'static', tag: 'column', attributes: { width: '30', align: 'left' } });
    expect(column?.attributeLocs['align']).toMatchObject({ line: 4, column: 33 });
    expect(column?.attributeNameLocs['align']).toMatchObject({ line: 4, column: 26 });
  });

  it('never generates a name for one, and never reserves one', () => {
    const result = parseScreenFile(screen('      <column width="30" align="left" />'), 'screens/screen_s.xml', {
      staticChildren: NAMES,
      missingNamePolicy: 'generate',
    });
    expect(result.nameEdits).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('without the names, the same child is an element, as before', () => {
    const result = parseScreenFile(screen('      <column width="30" align="left" />'), 'screens/screen_s.xml');
    expect(result.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MISSING_NAME]);
  });

  it('is static only under the parent that declares it', () => {
    const text =
      '<screen name="s"><view><u8g2gl_box name="b" x="0" y="0" width="4" height="4">' +
      '<column width="3" align="left" /></u8g2gl_box></view></screen>';
    const result = parseScreenFile(text, 'screens/screen_s.xml', { staticChildren: NAMES });
    expect(result.diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MISSING_NAME]);
  });

  it('refuses a child element inside a static child', () => {
    const result = parseScreenFile(
      screen('      <column width="30" align="left"><u8g2gl_box name="x" /></column>'),
      'screens/screen_s.xml',
      { staticChildren: NAMES },
    );
    expect(result.diagnostics.map((d) => [d.code, d.offendingText])).toEqual([[DIAGNOSTIC_CODES.MALFORMED_XML, 'u8g2gl_box']]);
  });

  it('builds the names from manifests: per tag, only those that declare elements', () => {
    expect([...NAMES.entries()].map(([tag, set]) => [tag, [...set]])).toEqual([['wd_service_list', ['column']]]);
  });
});

describe('the static child rules', () => {
  /** The departures fixture's errors and warnings with `children` in `services`. */
  function problems(children: string): { code: string; offendingText?: string; message: string }[] {
    const loaded = loadProject(DEPARTURES);
    const screenText = readFileSync(join(DEPARTURES, 'screens/screen_departures.xml'), 'utf-8').replace(
      /(<wd_service_list name="services"[^>]*>)[\s\S]*?(<\/wd_service_list>)/,
      `$1\n${children}\n        $2`,
    );
    const names = staticChildNamesOf([...loaded.model.manifests.declaredWidgets]);
    const parsed = parseScreenFile(screenText, 'screens/screen_departures.xml', { staticChildren: names });
    expect(parsed.diagnostics).toEqual([]);
    const model = { ...loaded.model, screens: [parsed.value!] };
    return checkProject(model, 'error').diagnostics.map((d) => ({
      code: d.code,
      message: d.message,
      ...(d.offendingText !== undefined ? { offendingText: d.offendingText } : {}),
    }));
  }

  it('accepts the departures fixture as committed', () => {
    const { model } = loadProject(DEPARTURES);
    expect([...model.loadDiagnostics, ...checkProject(model, 'error').diagnostics]).toEqual([]);
  });

  it('refuses a missing argument, at the child', () => {
    expect(problems('<column width="30" />')).toMatchObject([{ code: DIAGNOSTIC_CODES.MISSING_REQUIRED, offendingText: 'align' }]);
  });

  it('refuses an unknown attribute, suggesting the close one', () => {
    const [found] = problems('<column width="30" align="left" alignn="x" />');
    expect(found).toMatchObject({ code: DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE, offendingText: 'alignn' });
  });

  it('refuses a value of the wrong type', () => {
    expect(problems('<column width="wide" align="left" />')).toMatchObject([
      { code: DIAGNOSTIC_CODES.TYPE_MISMATCH, offendingText: 'wide' },
    ]);
    expect(problems('<column width="30" align="middle" />')).toMatchObject([
      { code: DIAGNOSTIC_CODES.INVALID_ENUM_VALUE, offendingText: 'middle' },
    ]);
  });

  it('refuses an unknown child of a classed element, naming the static children it takes', () => {
    const found = problems('<colum name="c" width="30" align="left" />');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: DIAGNOSTIC_CODES.UNKNOWN_COMPONENT, offendingText: 'colum' });
    expect(found[0]?.message).toContain('<wd_service_list> takes the static children <column>');
  });

  it('no longer refuses a declared static child as not yet supported', () => {
    expect(problems('<column width="30" align="left" />')).toEqual([]);
  });
});

describe('<element> declarations', () => {
  /** Pass 1's findings for a service list manifest with `element` in place of its own. */
  function declarationProblems(element: string): { code: string; offendingText?: string }[] {
    const text = DEPARTURES_MANIFEST.replace(/<element name="column"[\s\S]*?<\/element>/, element);
    const manifest = parseWidgetManifestFile(text, MANIFEST_PATH).value!;
    const loaded = loadProject(DEPARTURES);
    const framework = parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests;
    const declared = loaded.model.manifests.declaredWidgets.filter(
      (m) => m.name !== 'wd_service_list' && !framework.some((f) => f.name === m.name),
    );
    const manifests = buildManifestRegistry({ framework, project: [...declared, manifest] });
    return checkProject({ ...loaded.model, manifests, screens: [] }, 'error')
      .diagnostics.filter((d) => d.file === MANIFEST_PATH)
      .map((d) => ({ code: d.code, ...(d.offendingText !== undefined ? { offendingText: d.offendingText } : {}) }));
  }

  it('refuses an enum argument with no values, and a type no literal can be', () => {
    expect(
      declarationProblems('<element name="column" access="add_column"><arg name="align" type="enum" /></element>'),
    ).toMatchObject([{ code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, offendingText: 'align' }]);
    expect(
      declarationProblems('<element name="column" access="add_column"><arg name="f" type="font" /></element>'),
    ).toMatchObject([{ code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, offendingText: 'font' }]);
  });

  it('refuses an access that is not a C++ identifier', () => {
    expect(declarationProblems('<element name="column" access="add column" />')).toMatchObject([
      { code: DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION, offendingText: 'add column' },
    ]);
  });
});

describe('emission', () => {
  it('calls the access method after the setters, once per child, in document order', async () => {
    const { firmware } = await regenerate(DEPARTURES);
    const unit = firmware.files.find((file) => file.path === 'ui_screen_departures.cpp')!.content;
    // From init on: the collection facade above it forwards to the same object.
    const init = unit.slice(unit.indexOf('void ui_screen_departures_init() {'));
    const services = init.split('\n').filter((line) => line.includes('ui_obj_services.'));
    expect(services).toEqual([
      '    ui_obj_services.set_coords(0, 51, 190, 13);',
      '    ui_obj_services.set_font(ui_font_u8g2_font_6x10_mr);',
      '    ui_obj_services.set_max_rows(10);',
      '    ui_obj_services.add_column(32, U8G2GL_ALIGN_LEFT);  // <column>',
      '    ui_obj_services.add_column(102, U8G2GL_ALIGN_LEFT);  // <column>',
      '    ui_obj_services.add_column(16, U8G2GL_ALIGN_CENTER);  // <column>',
      '    ui_obj_services.add_column(40, U8G2GL_ALIGN_RIGHT);  // <column>',
      // Its storage, after the static children (§9.2).
      '    ui_obj_services.attach_rows(0, u8g2gl_rows(ui_rows_services_rows, 10, &ui_rows_services_rows_layout));  // <data name="rows">',
      '    next = u8g2gl_min(next, ui_obj_services.tick(now_ms));',
    ]);
  });

  it('describes the same calls in the scene, and only on an object that has them', async () => {
    const { editor } = await regenerate(DEPARTURES);
    const scene = JSON.parse(editor.find((file) => file.path === 'ui_scene.json')!.content) as {
      version: number;
      screens: { elements: { name: string; static_children?: unknown }[] }[];
    };
    expect(scene.version).toBe(6);
    const elements = scene.screens[0]!.elements;
    expect(elements.find((e) => e.name === 'services')?.static_children).toEqual([
      { element: 'column', args: [{ name: 'width', value: 32 }, { name: 'align', value: 'left' }] },
      { element: 'column', args: [{ name: 'width', value: 102 }, { name: 'align', value: 'left' }] },
      { element: 'column', args: [{ name: 'width', value: 16 }, { name: 'align', value: 'center' }] },
      { element: 'column', args: [{ name: 'width', value: 40 }, { name: 'align', value: 'right' }] },
    ]);
    expect(elements.find((e) => e.name === 'formation')).not.toHaveProperty('static_children');
  });

  it('gives the class an add-by-name entry spelling each enum as firmware does', async () => {
    const { editor } = await regenerate(DEPARTURES);
    const registry = editor.find((file) => file.path === 'ui_editor_registry.cpp')!.content;
    expect(registry).toContain('static const u8g2gl_editor_element ui_editor_wd_service_list_elements[] = {');
    expect(registry).toContain('if (u8g2gl_editor_is(args[1], "center")) {\n                a1 = U8G2GL_ALIGN_CENTER;');
    expect(registry).toContain('static_cast<wd_service_list*>(obj)->add_column(a0, a1);');
    expect(registry).toMatch(/ui_editor_wd_service_list_elements,\n\s+ui_editor_wd_service_list_data,\n\s+sizeof\(wd_service_list\)/);
  });
});

describe('the static-children fixture is exactly what the generator writes (§13.9)', () => {
  it('uses the departures fixture service list manifest, byte for byte', () => {
    expect(readFileSync(join(FIXTURE, MANIFEST_PATH), 'utf-8')).toBe(DEPARTURES_MANIFEST);
  });

  it('regenerates both targets with no diagnostic and an empty diff', async () => {
    const { firmware, editor } = await regenerate(FIXTURE);
    expect(firmware.diagnostics).toEqual([]);
    expect(readdirSync(join(FIXTURE, 'generated')).sort()).toEqual(firmware.files.map((f) => f.path).sort());
    for (const file of firmware.files) {
      expect(readFileSync(join(FIXTURE, 'generated', file.path), 'utf-8'), file.path).toBe(file.content);
    }
    expect(readdirSync(join(FIXTURE, 'generated_editor')).sort()).toEqual(editor.map((f) => f.path).sort());
    for (const file of editor) {
      expect(readFileSync(join(FIXTURE, 'generated_editor', file.path), 'utf-8'), file.path).toBe(file.content);
    }
  });
});
