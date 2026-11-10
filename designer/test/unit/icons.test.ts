/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/icons.test.ts
 * Purpose: The vendored icon set is whole and consistent: the CLI's name list
 *          and the designer's sprite describe the same icons, every alias
 *          lands on one of them, and a name resolves as the list says.
 * Description: Reads `cli/src/data/icons.json` and the committed sprite, as
 *              `scripts/update-icons.mjs` wrote them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import ICONS from '@u8g2gl/data/icons.json' with { type: 'json' };
import { ICON_SET_VERSION, resolveIcon } from '../../src/icons/icon-names';

const SPRITE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'icons', 'lucide-sprite.svg'), 'utf8');
const SYMBOLS = [...SPRITE.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1] ?? '');

test('the sprite has exactly one symbol per listed name, in the same order', () => {
  expect(SYMBOLS).toEqual(ICONS.names);
  expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length);
  expect(ICONS.names.length).toBeGreaterThan(1500);
  expect(SPRITE).toContain(`Lucide ${ICON_SET_VERSION} `);
});

test('every alias lands on a listed icon and is not itself one', () => {
  for (const [alias, canonical] of Object.entries(ICONS.aliases)) {
    expect(ICONS.names, alias).toContain(canonical);
    expect(ICONS.names, alias).not.toContain(alias);
  }
});

test('a name resolves to itself, an alias to its icon, anything else to nothing', () => {
  expect(resolveIcon('gauge')).toBe('gauge');
  const [alias, canonical] = Object.entries(ICONS.aliases)[0] ?? ['', ''];
  expect(resolveIcon(alias)).toBe(canonical);
  expect(resolveIcon('no-such-icon')).toBeUndefined();
});

test('the icons the framework will use are all in the set', () => {
  for (const name of ['toggle-left', 'shapes', 'image', 'gauge', 'layout-template', 'type', 'puzzle']) {
    expect(resolveIcon(name), name).toBe(name);
  }
});
