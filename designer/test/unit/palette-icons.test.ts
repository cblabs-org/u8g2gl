/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/palette-icons.test.ts
 * Purpose: A Palette tile's icon follows the lookup order — the element's own
 *          `<api icon>`, then its category's, then `puzzle` — and the data
 *          behind it is complete: every framework manifest declares an icon
 *          the vendored set has, every framework category has one, and every
 *          name in the category table is in the set.
 * Description: The framework's icons and categories are read from the CLI's
 *              shipped manifests, so a framework element added without an
 *              icon fails here rather than quietly showing its category's.
 *              The entries are built through `paletteGroups()` from a real
 *              registry, so the icon is followed from the manifest to the tile.
 */

import { expect, test } from '@playwright/test';
import { FRAMEWORK_MANIFESTS } from '@u8g2gl/data/manifests.js';
import { buildManifestRegistry, parseFrameworkManifests } from '@u8g2gl/core/manifest/index.js';
import { parseWidgetManifestFile } from '@u8g2gl/core/parser/index.js';
import { resolveIcon } from '../../src/icons/icon-names';
import { paletteGroups, type PaletteEntry } from '../../src/palette/palette-entries';
import { CATEGORY_ICONS, FALLBACK_ICON, paletteIcon } from '../../src/palette/palette-icons';

const FRAMEWORK = parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests;
const FRAMEWORK_CATEGORIES = [...new Set(FRAMEWORK.map((manifest) => manifest.api.category ?? ''))].sort();

/** A project widget whose `<api>` carries `apiAttributes`, as the parser reads it. */
function projectWidget(tag: string, apiAttributes: string): ReturnType<typeof parseWidgetManifestFile>['value'] {
  const xml = `<widget name="${tag}" extends="u8g2gl_obj"><api ${apiAttributes} /></widget>`;
  return parseWidgetManifestFile(xml, `widgets/${tag}/${tag}.xml`).value;
}

/** Every Palette entry built from the framework plus `project`, by tag. */
function entriesWith(project: ReturnType<typeof projectWidget>[]): Map<string, { entry: PaletteEntry; category?: string }> {
  const registry = buildManifestRegistry({ framework: FRAMEWORK, project: project.filter((m) => m !== undefined) });
  const found = new Map<string, { entry: PaletteEntry; category?: string }>();
  for (const group of paletteGroups(registry)) {
    for (const section of group.sections) {
      for (const entry of section.entries) found.set(entry.tag, { entry, ...(section.category !== undefined ? { category: section.category } : {}) });
    }
  }
  return found;
}

test('the lookup order: the element’s own icon, then its category’s, then puzzle', () => {
  // Own icon, whatever the category says.
  expect(paletteIcon('train-front', 'Indicators')).toBe('train-front');
  expect(paletteIcon('train-front', 'Made up')).toBe('train-front');
  expect(paletteIcon('train-front', undefined)).toBe('train-front');
  // No own icon: the category's.
  expect(paletteIcon(undefined, 'Text')).toBe('type');
  // An own icon the set does not have falls through to the category's.
  expect(paletteIcon('not-an-icon', 'Indicators')).toBe('gauge');
  // A category an author invented, or none: puzzle.
  expect(paletteIcon(undefined, 'Gauges')).toBe(FALLBACK_ICON);
  expect(paletteIcon(undefined, undefined)).toBe(FALLBACK_ICON);
  expect(paletteIcon('not-an-icon', undefined)).toBe(FALLBACK_ICON);
  expect(FALLBACK_ICON).toBe('puzzle');
});

test('an alias draws as its canonical icon', () => {
  // `alarm-check` is Lucide's old name for `alarm-clock-check`.
  expect(resolveIcon('alarm-check')).toBe('alarm-clock-check');
  expect(paletteIcon('alarm-check', 'Text')).toBe('alarm-clock-check');
});

test('a project widget’s icon goes from its manifest to its entry; one with none shows its category’s', () => {
  const entries = entriesWith([
    projectWidget('wd_board', 'label="Board" category="Text" icon="train-front"'),
    projectWidget('wd_plain', 'label="Plain" category="Text"'),
    projectWidget('wd_blank', 'label="Blank" category="Text" icon=""'),
  ]);

  const board = entries.get('wd_board');
  expect(board?.entry.icon).toBe('train-front');
  expect(paletteIcon(board?.entry.icon, board?.category)).toBe('train-front');

  const plain = entries.get('wd_plain');
  expect(plain?.entry).not.toHaveProperty('icon');
  expect(paletteIcon(plain?.entry.icon, plain?.category)).toBe('type');

  // An empty icon, which the validator refuses, is treated as none.
  const blank = entries.get('wd_blank');
  expect(blank?.entry).not.toHaveProperty('icon');
  expect(paletteIcon(blank?.entry.icon, blank?.category)).toBe('type');
});

test('every framework manifest declares an icon, a canonical name in the vendored set, and its tile shows it', () => {
  expect(FRAMEWORK).toHaveLength(16);
  const entries = entriesWith([]);
  for (const manifest of FRAMEWORK) {
    const icon = manifest.api.icon;
    expect(icon, manifest.name).toBeDefined();
    expect(resolveIcon(icon ?? ''), manifest.name).toBe(icon);
    const placed = entries.get(manifest.name);
    expect(paletteIcon(placed?.entry.icon, placed?.category), manifest.name).toBe(icon);
  }
});

test('the category map covers the framework’s six categories, as ruled', () => {
  expect([...CATEGORY_ICONS.keys()].sort()).toEqual(FRAMEWORK_CATEGORIES);
  expect(Object.fromEntries(CATEGORY_ICONS)).toEqual({
    Controls: 'toggle-left',
    Drawing: 'shapes',
    Images: 'image',
    Indicators: 'gauge',
    Layout: 'layout-template',
    Text: 'type',
  });
});

test('every icon the category table names is a canonical name in the vendored set', () => {
  for (const name of [...CATEGORY_ICONS.values(), FALLBACK_ICON]) {
    expect(resolveIcon(name), name).toBe(name);
  }
});
