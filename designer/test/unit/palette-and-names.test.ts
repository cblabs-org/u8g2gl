/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/palette-and-names.test.ts
 * Purpose: The Palette lists what the manifest registry knows, grouped and in
 *          registry order, and narrows by its filter; and the name the canvas
 *          gives a new element is one the validator accepts, free across the
 *          whole project — past existing elements, other screens, composites'
 *          own elements and globals — and built the way the parser builds the
 *          names it synthesises.
 * Description: Projects are built in memory and run through `checkProject`
 *              (via the live pipeline), so "valid" means what `generate` would
 *              say, not what this module believes.
 */

import { expect, test } from '@playwright/test';
import { parseScreenFile } from '@u8g2gl/core/parser/index.js';
import { DIAGNOSTIC_CODES } from '@u8g2gl/core/schema/diagnostic.js';
import { nameStem, nextElementName, projectNames } from '../../src/documents/element-names';
import { filterPalette, paletteGroups } from '../../src/palette/palette-entries';
import { runTextPipeline, type TextPipelineResult } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const SCREEN = 'screens/screen_home.xml';

/** A project manifest for a 128 × 64 display. */
const PROJECT = '<u8g2gl schema="0.5" name="names" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n';

/** A project widget: a plain class, and a composite whose template has its own element. */
const WIDGET = '<widget name="wd_gauge" extends="u8g2gl_obj">\n  <api>\n    <prop name="level" type="int" setter="set_level" default="0" />\n  </api>\n</widget>\n';
const COMPOSITE =
  '<widget name="wd_badge">\n  <api>\n    <prop name="x" type="int" />\n    <prop name="y" type="int" />\n  </api>\n  <view>\n    <u8g2gl_box name="box_3" x="0" y="0" width="4" height="4" />\n  </view>\n</widget>\n';

/** Runs a project whose screen holds `elements`, with extra files. */
function run(elements: string, extra: Record<string, string> = {}): TextPipelineResult {
  const texts = new Map<string, string>([
    ['u8g2gl.xml', PROJECT],
    ['globals.xml', '<globals>\n  <consts>\n    <int name="box_2" value="2" />\n  </consts>\n</globals>\n'],
    [SCREEN, `<screen name="home">\n  <view>\n${elements}\n  </view>\n</screen>\n`],
    ...Object.entries(extra),
  ]);
  return runTextPipeline({
    texts,
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
}

/** The identifier diagnostics a run raises: a bad name or a duplicate. */
function nameErrors(result: TextPipelineResult): string[] {
  const codes: string[] = [DIAGNOSTIC_CODES.INVALID_NAME, DIAGNOSTIC_CODES.DUPLICATE_NAME];
  return result.diagnostics.filter((d) => codes.includes(d.code)).map((d) => d.message);
}

test('the palette groups framework, project and drawing tags, in registry order, from the registry alone', () => {
  const result = run('', { 'widgets/wd_gauge/wd_gauge.xml': WIDGET, 'widgets/wd_badge/wd_badge.xml': COMPOSITE });
  const registry = result.model.manifests;
  const groups = paletteGroups(registry);
  expect(groups.map((group) => group.title)).toEqual(['Framework', 'Project', 'Drawing']);
  // Every registry tag appears once, and each group keeps the registry's order.
  const listed = groups.flatMap((group) => group.tags);
  expect([...listed].sort()).toEqual([...registry.tags].sort());
  for (const group of groups) {
    expect(group.tags).toEqual(registry.tags.filter((tag) => group.tags.includes(tag)));
  }
  const [framework, project, drawing] = groups;
  expect(framework?.tags).toContain('u8g2gl_label');
  // Registry order is load order, and the project's files load sorted by path.
  expect(project?.tags).toEqual(['wd_badge', 'wd_gauge']);
  expect(drawing?.tags).toContain('u8g2gl_line');
  expect(drawing?.tags).toContain('u8g2gl_box');
  expect(framework?.tags).not.toContain('u8g2gl_line');
});

test('a project with no widgets has no Project group; the filter narrows by substring, ignoring case, and drops empty groups', () => {
  const groups = paletteGroups(run('').model.manifests);
  expect(groups.map((group) => group.title)).toEqual(['Framework', 'Drawing']);
  const lines = filterPalette(groups, '  LINE ');
  expect(lines.map((group) => group.title)).toEqual(['Drawing']);
  expect(lines[0]?.tags).toContain('u8g2gl_line');
  expect(lines[0]?.tags.every((tag) => tag.includes('line'))).toBe(true);
  expect(filterPalette(groups, 'no such element')).toEqual([]);
  expect(filterPalette(groups, '')).toEqual(groups);
});

test('a generated name is the parser’s stem with the lowest free number from 1', () => {
  expect(nameStem('u8g2gl_label')).toBe('label');
  expect(nameStem('wd_service_list')).toBe('service_list');
  expect(nameStem('ui_thing')).toBe('thing');
  expect(nextElementName('u8g2gl_label', new Set())).toBe('label_1');
  expect(nextElementName('u8g2gl_label', new Set(['label_1', 'label_2', 'label_4']))).toBe('label_3');
});

test('the stem is the one the parser itself synthesises a missing name from', () => {
  for (const tag of ['u8g2gl_label', 'wd_service_list', 'u8g2gl_progress_bar', 'wd_Odd-Name_', 'u8g2gl_9lives']) {
    const text = `<screen name="home">\n  <view>\n    <${tag} x="0" y="0" />\n  </view>\n</screen>\n`;
    const parsed = parseScreenFile(text, SCREEN, { missingNamePolicy: 'generate' });
    const synthesised = parsed.value?.view?.children[0];
    const name = synthesised !== undefined && 'tag' in synthesised ? synthesised.attributes.name : undefined;
    // The parser numbers from 0; the stem before the number is what must match.
    expect(name).toBe(`${nameStem(tag)}_0`);
  }
});

test('generated names skip every name the project uses — this screen, another screen, a composite’s elements and a constant — and validate', () => {
  const elements = '    <u8g2gl_box name="box_1" x="0" y="0" width="4" height="4" filled="true" />';
  const other = '<screen name="other">\n  <view>\n    <u8g2gl_box name="box_4" x="0" y="0" width="4" height="4" filled="true" />\n  </view>\n</screen>\n';
  const extra = { 'screens/screen_other.xml': other, 'widgets/wd_badge/wd_badge.xml': COMPOSITE };
  const before = run(elements, extra);
  const taken = projectNames(before.model);
  // box_1 here, box_2 a constant, box_3 the composite's own, box_4 another screen.
  for (const name of ['box_1', 'box_2', 'box_3', 'box_4', 'home', 'other']) expect(taken.has(name)).toBe(true);
  const generated = nextElementName('u8g2gl_box', taken);
  expect(generated).toBe('box_5');

  // Written into the screen, it raises no name diagnostic, where each colliding one does.
  const withName = (name: string): string => `${elements}\n    <u8g2gl_box name="${name}" x="8" y="8" width="4" height="4" filled="true" />`;
  expect(nameErrors(before)).toEqual([]);
  expect(nameErrors(run(withName(generated), extra))).toEqual([]);
  expect(nameErrors(run(withName('box_1'), extra)).length).toBeGreaterThan(0);
  expect(nameErrors(run(withName('u8g2gl_box_1'), extra)).length).toBeGreaterThan(0);
});
