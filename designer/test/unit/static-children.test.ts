/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/static-children.test.ts
 * Purpose: The designer reads a static child (`<column>`, design_spec §6.5) as
 *          the CLI does. The project model parses manifests before screens and
 *          re-parses a screen when a manifest's `<element>` list changes, though
 *          the screen's own text did not; opening a screen writes a name into
 *          an unnamed element but never into a column; and the panel table's
 *          actions are each the smallest text edit.
 * Description: The departures project's texts, read from the CLI's fixture,
 *              edited in memory.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { isElementNode, staticChildrenOf, type WidgetNode } from '@u8g2gl/core/schema/widget-node.js';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { parseWidgetManifestFile } from '@u8g2gl/core/parser/index.js';
import { withGeneratedNames } from '../../src/documents/generated-names';
import { staticChildEdits, type StaticChildAction } from '../../src/panel/static-children';
import { ProjectModelCache, projectStaticChildNames } from '../../src/project/project-model';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project');
const SCREEN = 'screens/screen_departures.xml';
const MANIFEST = 'widgets/wd_service_list/wd_service_list.xml';

/** Every XML text of the project, by project-relative path. */
function texts(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.xml')) out.set(relative(PROJECT, path), readFileSync(path, 'utf-8'));
    }
  };
  walk(PROJECT);
  return out;
}

/** The `services` list in a model's one screen. */
function services(cache: ProjectModelCache, project: Map<string, string>): WidgetNode {
  const model = cache.build(project);
  return model.screens[0]!.view.children.find((node) => node.attributes.name === 'services') as WidgetNode;
}

test('the project model parses the columns as static children, with no diagnostic', () => {
  const cache = new ProjectModelCache();
  const project = texts();
  expect(cache.build(project).loadDiagnostics).toEqual([]);
  const list = services(cache, project);
  expect(list.children.filter(isElementNode)).toEqual([]);
  expect(staticChildrenOf(list)).toHaveLength(4);
});

test('a screen is re-parsed when a manifest stops declaring its <element>, its own text unchanged', () => {
  const cache = new ProjectModelCache();
  const project = texts();
  expect(staticChildrenOf(services(cache, project))).toHaveLength(4);

  const manifest = project.get(MANIFEST)!.replace(/<element name="column"[\s\S]*?<\/element>/, '');
  project.set(MANIFEST, manifest);
  const list = services(cache, project);
  expect(staticChildrenOf(list)).toEqual([]);
  // Now ordinary elements, each with a generated name.
  expect(list.children.filter(isElementNode).map((node) => node.tag)).toEqual(['column', 'column', 'column', 'column']);
});

test('opening a screen names an unnamed element and never a column', () => {
  const project = texts();
  const text = project.get(SCREEN)!.replace('<u8g2gl_line name="header_sep"', '<u8g2gl_line');
  const named = withGeneratedNames(SCREEN, text, projectStaticChildNames(project));
  expect(named).toContain('<u8g2gl_line name="line_0"');
  expect(named).not.toMatch(/<column name=/);
});

const ELEMENTS = parseWidgetManifestFile(readFileSync(join(PROJECT, MANIFEST), 'utf-8'), MANIFEST).value!.api.elements;

/** The screen text after one table action on `name`. */
function after(text: string, name: string, action: StaticChildAction): string {
  return applyEdits(text, staticChildEdits(text, SCREEN, name, ELEMENTS, action));
}

/** The lines that differ between two texts of the same length in lines. */
function changed(before: string, text: string): string[] {
  const lines = before.split('\n');
  return text.split('\n').filter((line, i) => line !== lines[i]);
}

test('setting an argument rewrites that one value', () => {
  const text = texts().get(SCREEN)!;
  const edited = after(text, 'services', { kind: 'set', tag: 'column', row: 1, arg: 'width', value: '90' });
  expect(changed(text, edited)).toEqual(['            <column width="90" align="left" />']);
  expect(after(text, 'services', { kind: 'set', tag: 'column', row: 1, arg: 'width', value: '102' })).toBe(text);
});

test('adding copies the last row after it, and the first into a list with none', () => {
  const text = texts().get(SCREEN)!;
  const added = after(text, 'services', { kind: 'add', tag: 'column' });
  expect(added.split('\n').length).toBe(text.split('\n').length + 1);
  expect(added).toContain('<column width="40" align="right" />\n            <column width="40" align="right" />\n        </wd_service_list>');

  const bare = text.replace(/(<wd_service_list name="services"[^>]*)>[\s\S]*?<\/wd_service_list>/, '$1 />');
  expect(after(bare, 'services', { kind: 'add', tag: 'column' })).toContain(
    'max_rows="10">\n            <column width="0" align="left" />\n        </wd_service_list>',
  );
});

test('moving swaps two rows in place, and removing deletes a row’s line', () => {
  const text = texts().get(SCREEN)!;
  const moved = after(text, 'services', { kind: 'move', tag: 'column', row: 1, by: -1 });
  expect(changed(text, moved)).toEqual(['            <column width="102" align="left" />', '            <column width="32" align="left" />']);
  expect(after(text, 'services', { kind: 'move', tag: 'column', row: 0, by: -1 })).toBe(text);

  const removed = after(text, 'services', { kind: 'remove', tag: 'column', row: 2 });
  expect(removed).toBe(text.replace('            <column width="16" align="center" />\n            <column width="40"', '            <column width="40"'));
});
