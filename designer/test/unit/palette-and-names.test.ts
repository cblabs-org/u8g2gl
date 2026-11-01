/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/palette-and-names.test.ts
 * Purpose: The Palette lists what the manifest registry knows, grouped, filed
 *          by category in first-appearance order and in registry order within
 *          one, shown by each element's own label and description, and
 *          narrowed by a filter over label, tag and description; and the name the canvas
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
import { filterPalette, paletteGroups, type PaletteEntry, type PaletteGroup } from '../../src/palette/palette-entries';
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

/** Every tag a group lists, in display order. */
function tagsOf(group: PaletteGroup | undefined): string[] {
  return (group?.sections ?? []).flatMap((section) => section.entries.map((entry) => entry.tag));
}

/** A project widget whose `<api>` carries `metadata`. */
function widget(name: string, metadata: string, extendsTag = 'u8g2gl_obj'): string {
  return `<widget name="${name}" extends="${extendsTag}">\n  <api ${metadata}>\n    <prop name="level" type="int" setter="set_level" default="0" />\n  </api>\n</widget>\n`;
}

test('the palette groups framework, project and drawing tags, each once, in registry order within a category, from the registry alone', () => {
  const result = run('', { 'widgets/wd_gauge/wd_gauge.xml': WIDGET, 'widgets/wd_badge/wd_badge.xml': COMPOSITE });
  const registry = result.model.manifests;
  const groups = paletteGroups(registry);
  expect(groups.map((group) => group.title)).toEqual(['Framework', 'Project', 'Drawing']);
  // Every registry tag appears once, and each section keeps the registry's order.
  const listed = groups.flatMap((group) => tagsOf(group));
  expect([...listed].sort()).toEqual([...registry.tags].sort());
  for (const section of groups.flatMap((group) => group.sections)) {
    const tags = section.entries.map((entry) => entry.tag);
    expect(tags).toEqual(registry.tags.filter((tag) => tags.includes(tag)));
  }
  const [framework, project, drawing] = groups;
  expect(tagsOf(framework)).toContain('u8g2gl_label');
  // Registry order is load order, and the project's files load sorted by path.
  expect(tagsOf(project)).toEqual(['wd_badge', 'wd_gauge']);
  expect(tagsOf(drawing)).toContain('u8g2gl_line');
  expect(tagsOf(drawing)).toContain('u8g2gl_box');
  expect(tagsOf(framework)).not.toContain('u8g2gl_line');
});

test('within a group, entries are filed by category in registry first-appearance order, the uncategorised last under no heading', () => {
  const registry = run('', {
    // Loaded in path order: wd_a declares a category the framework never uses,
    // wd_b one it does, and wd_c none.
    'widgets/wd_a/wd_a.xml': widget('wd_a', 'label="A" category="Gauges"'),
    'widgets/wd_b/wd_b.xml': widget('wd_b', 'label="B" category="Text"'),
    'widgets/wd_c/wd_c.xml': widget('wd_c', ''),
  }).model.manifests;
  const groups = paletteGroups(registry);

  // The order each category first appears in across the whole registry.
  const firstSeen: string[] = [];
  for (const tag of registry.tags) {
    const category = registry.get(tag)?.declared.api.category;
    if (category !== undefined && !firstSeen.includes(category)) firstSeen.push(category);
  }
  for (const group of groups) {
    const categories = group.sections.map((section) => section.category);
    const named = categories.filter((category): category is string => category !== undefined);
    expect(named, group.title).toEqual(firstSeen.filter((category) => named.includes(category)));
    // The uncategorised section, if any, is last.
    expect([-1, categories.length - 1], group.title).toContain(categories.indexOf(undefined));
  }

  const project = groups.find((group) => group.title === 'Project');
  // 'Text' is the framework's before it is wd_b's, so it heads wd_a's 'Gauges'.
  expect(project?.sections.map((section) => [section.category, section.entries.map((entry) => entry.tag)])).toEqual([
    ['Text', ['wd_b']],
    ['Gauges', ['wd_a']],
    [undefined, ['wd_c']],
  ]);
  // Every framework manifest declares a category, so no framework entry is left uncategorised.
  expect(groups.find((group) => group.title === 'Framework')?.sections.every((section) => section.category !== undefined)).toBe(true);
  expect(groups.find((group) => group.title === 'Drawing')?.sections.map((section) => section.category)).toEqual(['Drawing']);
});

test('an entry carries its own label and description, none invented, none inherited, and none shown blank', () => {
  const registry = run('', {
    'widgets/wd_gauge/wd_gauge.xml': widget('wd_gauge', 'label="Gauge" category="Gauges" description="A round dial."'),
    'widgets/wd_meter/wd_meter.xml': widget('wd_meter', '', 'wd_gauge'),
    'widgets/wd_odd/wd_odd.xml': widget('wd_odd', 'label="" category="" description=""'),
  }).model.manifests;
  const entries = paletteGroups(registry).flatMap((group) => group.sections.flatMap((section) => section.entries));
  const entry = (tag: string): PaletteEntry | undefined => entries.find((candidate) => candidate.tag === tag);

  expect(entry('wd_gauge')).toEqual({ tag: 'wd_gauge', label: 'Gauge', description: 'A round dial.' });
  // Extends wd_gauge, and gets none of its metadata.
  expect(entry('wd_meter')).toEqual({ tag: 'wd_meter' });
  // Empty values (which the validator refuses) are not shown as blanks.
  expect(entry('wd_odd')).toEqual({ tag: 'wd_odd' });
  const label = entry('u8g2gl_label');
  expect(label?.label).toBeDefined();
  expect(label?.description).toBeDefined();
});

test('a project with no widgets has no Project group; the filter matches label, tag or description, ignoring case, and drops what it empties', () => {
  const groups = paletteGroups(run('').model.manifests);
  expect(groups.map((group) => group.title)).toEqual(['Framework', 'Drawing']);
  const all = groups.flatMap((group) => group.sections.flatMap((section) => section.entries));
  const matching = (needle: string): string[] => filterPalette(groups, needle).flatMap((group) => tagsOf(group));

  // By tag, padded and in another case: 'hline' is in no label or description.
  const lines = filterPalette(groups, '  HLINE ');
  expect(lines.map((group) => group.title)).toEqual(['Drawing']);
  expect(tagsOf(lines[0])).toEqual(['u8g2gl_hline']);

  // By a word that is only in one entry's description, never in a tag or label.
  const box = all.find((entry) => entry.tag === 'u8g2gl_box');
  const word = box?.description?.split(/\W+/).find(
    (candidate) =>
      candidate.length > 4 &&
      all.every((entry) => !entry.tag.includes(candidate.toLowerCase()) && !(entry.label ?? '').toLowerCase().includes(candidate.toLowerCase())),
  );
  expect(word).toBeDefined();
  expect(matching(word!.toUpperCase())).toContain('u8g2gl_box');

  // By label: each label finds its own entry.
  for (const entry of all.filter((candidate) => candidate.label !== undefined)) {
    expect(matching(entry.label!), entry.tag).toContain(entry.tag);
  }

  // A filter keeps only matching entries, and drops the sections it empties.
  for (const group of filterPalette(groups, 'line')) {
    for (const section of group.sections) expect(section.entries.length).toBeGreaterThan(0);
  }
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
