/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/palette-icons.test.ts
 * Purpose: A Palette tile's icon follows the lookup order — the element's own,
 *          then its category's, then `puzzle` — and the tables behind it are
 *          complete: every framework element has an icon, every framework
 *          category has one, and every name in them is in the vendored set.
 * Description: The framework's tags and categories are read from the CLI's
 *              shipped manifests, so a framework element added without an
 *              icon fails here rather than quietly showing its category's.
 */

import { expect, test } from '@playwright/test';
import { FRAMEWORK_MANIFESTS } from '@u8g2gl/data/manifests.js';
import { resolveIcon } from '../../src/icons/icon-names';
import { CATEGORY_ICONS, FALLBACK_ICON, FRAMEWORK_TAG_ICONS, paletteIcon } from '../../src/palette/palette-icons';

const FRAMEWORK_TAGS = FRAMEWORK_MANIFESTS.map((manifest) => manifest.filename.replace(/\.xml$/, '')).sort();
const FRAMEWORK_CATEGORIES = [
  ...new Set(FRAMEWORK_MANIFESTS.map((manifest) => /<api\b[^>]*\bcategory="([^"]*)"/.exec(manifest.xml)?.[1] ?? '')),
].sort();

test('the lookup order: the element’s own icon, then its category’s, then puzzle', () => {
  // Own icon, whatever the category says.
  expect(paletteIcon('u8g2gl_label', 'Text')).toBe('text-cursor');
  expect(paletteIcon('u8g2gl_label', 'Made up')).toBe('text-cursor');
  // A project widget has no own icon: its category's.
  expect(paletteIcon('wd_service_list', 'Text')).toBe('type');
  expect(paletteIcon('wd_probe_box', 'Indicators')).toBe('gauge');
  // A category an author invented, or none: puzzle.
  expect(paletteIcon('wd_odd', 'Gauges')).toBe(FALLBACK_ICON);
  expect(paletteIcon('wd_odd', undefined)).toBe(FALLBACK_ICON);
  expect(FALLBACK_ICON).toBe('puzzle');
});

test('the tag map covers exactly the framework’s elements', () => {
  expect(FRAMEWORK_TAGS).toHaveLength(16);
  expect([...FRAMEWORK_TAG_ICONS.keys()].sort()).toEqual(FRAMEWORK_TAGS);
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

test('every icon either table names is a canonical name in the vendored set', () => {
  for (const name of [...FRAMEWORK_TAG_ICONS.values(), ...CATEGORY_ICONS.values(), FALLBACK_ICON]) {
    expect(resolveIcon(name), name).toBe(name);
  }
});
