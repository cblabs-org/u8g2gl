/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/explorer-groups.test.ts
 * Purpose: The Explorer groups a listing by what an author edits: the project
 *          files, screens, one entry per widget carrying its C++, assets, and
 *          everything else under "Other files", with no listed path lost.
 * Description: Literal listings through `groupFiles()`.
 */

import { expect, test } from '@playwright/test';
import { groupFiles, type ExplorerGroup } from '../../src/ui/explorer-groups';

// paths
// Every path the groups stand for, entry files included, in group order.
function paths(groups: readonly ExplorerGroup[]): string[] {
  return groups.flatMap((group) => group.entries.flatMap((entry) => entry.files));
}

const DEPARTURES = [
  'fonts/small.bdf',
  'globals.xml',
  'images/logo.png',
  'screens/screen_departures.xml',
  'screens/screen_home.xml',
  'u8g2gl.xml',
  'widgets/wd_probe_box/wd_probe_box.cpp',
  'widgets/wd_probe_box/wd_probe_box.hpp',
  'widgets/wd_probe_box/wd_probe_box.xml',
  'widgets/wd_service_list/wd_service_list.cpp',
  'widgets/wd_service_list/wd_service_list.hpp',
  'widgets/wd_service_list/wd_service_list.xml',
];

test('groups a project as Project, Screens, Widgets and Assets, each widget one entry under its own name', () => {
  expect(groupFiles(DEPARTURES)).toEqual([
    {
      title: 'Project',
      entries: [
        { label: 'globals.xml', path: 'globals.xml', files: ['globals.xml'] },
        { label: 'u8g2gl.xml', path: 'u8g2gl.xml', files: ['u8g2gl.xml'] },
      ],
    },
    {
      title: 'Screens',
      entries: [
        { label: 'screen_departures.xml', path: 'screens/screen_departures.xml', files: ['screens/screen_departures.xml'] },
        { label: 'screen_home.xml', path: 'screens/screen_home.xml', files: ['screens/screen_home.xml'] },
      ],
    },
    {
      title: 'Widgets',
      entries: [
        {
          label: 'wd_probe_box',
          path: 'widgets/wd_probe_box/wd_probe_box.xml',
          files: [
            'widgets/wd_probe_box/wd_probe_box.xml',
            'widgets/wd_probe_box/wd_probe_box.cpp',
            'widgets/wd_probe_box/wd_probe_box.hpp',
          ],
        },
        {
          label: 'wd_service_list',
          path: 'widgets/wd_service_list/wd_service_list.xml',
          files: [
            'widgets/wd_service_list/wd_service_list.xml',
            'widgets/wd_service_list/wd_service_list.cpp',
            'widgets/wd_service_list/wd_service_list.hpp',
          ],
        },
      ],
    },
    {
      title: 'Assets',
      entries: [
        { label: 'fonts/small.bdf', path: 'fonts/small.bdf', files: ['fonts/small.bdf'] },
        { label: 'images/logo.png', path: 'images/logo.png', files: ['images/logo.png'] },
      ],
    },
  ]);
});

test('a widget directory with no .xml has no entry: its files fall to Other files', () => {
  const groups = groupFiles(['u8g2gl.xml', 'widgets/wd_half/wd_half.cpp', 'widgets/wd_half/wd_half.hpp']);
  expect(groups.map((group) => group.title)).toEqual(['Project', 'Other files']);
  expect(groups[1]?.entries.map((entry) => entry.path)).toEqual(['widgets/wd_half/wd_half.cpp', 'widgets/wd_half/wd_half.hpp']);
});

test('anything the layout does not read lands in Other files, and every listed path appears exactly once', () => {
  const listing = [
    'README.md',
    'screens/notes.txt',
    'screens/sub/screen_x.xml',
    'u8g2gl.xml',
    'widgets/wd_a/notes.md',
    'widgets/wd_a/wd_a.cpp',
    'widgets/wd_a/wd_a.xml',
  ];
  const groups = groupFiles(listing);
  expect(groups.find((group) => group.title === 'Other files')?.entries.map((entry) => entry.path)).toEqual([
    'README.md',
    'screens/notes.txt',
    'screens/sub/screen_x.xml',
    'widgets/wd_a/notes.md',
  ]);
  expect(paths(groups).sort()).toEqual([...listing].sort());
});

test('a flat widgets/<name>.xml manifest is an entry, and claims no C++ beside it', () => {
  const groups = groupFiles(['widgets/wd_flat.xml', 'widgets/helper.cpp']);
  expect(groups).toEqual([
    { title: 'Widgets', entries: [{ label: 'wd_flat', path: 'widgets/wd_flat.xml', files: ['widgets/wd_flat.xml'] }] },
    { title: 'Other files', entries: [{ label: 'widgets/helper.cpp', path: 'widgets/helper.cpp', files: ['widgets/helper.cpp'] }] },
  ]);
});

test('with two manifests in one directory, the one named after it owns the C++', () => {
  const groups = groupFiles(['widgets/wd_a/extra.xml', 'widgets/wd_a/wd_a.cpp', 'widgets/wd_a/wd_a.xml']);
  expect(groups[0]?.entries).toEqual([
    { label: 'extra', path: 'widgets/wd_a/extra.xml', files: ['widgets/wd_a/extra.xml'] },
    { label: 'wd_a', path: 'widgets/wd_a/wd_a.xml', files: ['widgets/wd_a/wd_a.xml', 'widgets/wd_a/wd_a.cpp'] },
  ]);
});

test('an empty listing has no groups', () => {
  expect(groupFiles([])).toEqual([]);
});
