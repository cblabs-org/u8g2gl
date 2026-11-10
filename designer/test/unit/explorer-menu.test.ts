/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/explorer-menu.test.ts
 * Purpose: Which items an Explorer entry's context menu holds, what each
 *          acts on, and the platform's reveal label; and the source tab's
 *          read-only title.
 * Description: `entryMenu()` with recording commands, on literal entries.
 */

import { expect, test } from '@playwright/test';
import type { MenuItem } from '../../src/ui/menu-item';
import { entryMenu, type EntryCommands } from '../../src/ui/explorer-menu';
import { isCppSource, revealLabel, sourceTitle } from '../../src/ui/file-actions';

const WIDGET = {
  label: 'wd_a',
  path: 'widgets/wd_a/wd_a.xml',
  files: ['widgets/wd_a/wd_a.xml', 'widgets/wd_a/wd_a.cpp', 'widgets/wd_a/wd_a.hpp'],
};

// recording
// Commands that record what they were asked to do, as `verb path`.
function recording(): { readonly calls: string[]; readonly commands: EntryCommands } {
  const calls: string[] = [];
  return {
    calls,
    commands: {
      view: (path) => calls.push(`view ${path}`),
      openInEditor: (path) => calls.push(`open ${path}`),
      reveal: (path) => calls.push(`reveal ${path}`),
      copyPath: (path) => calls.push(`copy ${path}`),
    },
  };
}

// shape
// A menu as labels, a submenu as [label, [its labels]].
function shape(items: readonly MenuItem[]): unknown[] {
  return items.map((item) => (item.items === undefined ? item.label : [item.label, shape(item.items)]));
}

test("a widget's menu: View source… over its files, then open, reveal and copy", () => {
  const { commands } = recording();
  expect(shape(entryMenu(WIDGET, 'Widgets', 'macOS', commands))).toEqual([
    ['View source…', ['wd_a.xml', 'wd_a.cpp', 'wd_a.hpp']],
    'Open in editor',
    'Reveal in Finder',
    'Copy path',
  ]);
});

test('each item acts on its own file: a source item on that file, the rest on the file the entry opens', () => {
  const { calls, commands } = recording();
  const items = entryMenu(WIDGET, 'Widgets', 'Linux x86_64', commands);
  for (const item of [...(items[0]?.items ?? []), ...items.slice(1)]) item.onSelect?.();
  expect(calls).toEqual([
    'view widgets/wd_a/wd_a.xml',
    'view widgets/wd_a/wd_a.cpp',
    'view widgets/wd_a/wd_a.hpp',
    'open widgets/wd_a/wd_a.xml',
    'reveal widgets/wd_a/wd_a.xml',
    'copy widgets/wd_a/wd_a.xml',
  ]);
});

test('an entry with nothing to view has no View source…; a stray C++ file has itself', () => {
  const { commands } = recording();
  const screen = { label: 'screen_a.xml', path: 'screens/screen_a.xml', files: ['screens/screen_a.xml'] };
  expect(shape(entryMenu(screen, 'Screens', 'Win32', commands))).toEqual(['Open in editor', 'Reveal in file manager', 'Copy path']);
  const stray = { label: 'widgets/wd_b/wd_b.cpp', path: 'widgets/wd_b/wd_b.cpp', files: ['widgets/wd_b/wd_b.cpp'] };
  expect(shape(entryMenu(stray, 'Other files', 'Win32', commands))[0]).toEqual(['View source…', ['wd_b.cpp']]);
});

test('Open in editor is offered only for a file type the server will open', () => {
  const { commands } = recording();
  for (const path of ['run.command', 'scripts/run.sh', 'widgets/wd_a/run']) {
    const entry = { label: path, path, files: [path] };
    expect(shape(entryMenu(entry, 'Other files', 'macOS', commands)), path).toEqual(['Reveal in Finder', 'Copy path']);
  }
  const font = { label: 'fonts/a.bdf', path: 'fonts/a.bdf', files: ['fonts/a.bdf'] };
  expect(shape(entryMenu(font, 'Assets', 'macOS', commands))).toEqual(['Open in editor', 'Reveal in Finder', 'Copy path']);
});

test('the reveal label names Finder on macOS only', () => {
  expect(revealLabel('macOS')).toBe('Reveal in Finder');
  expect(revealLabel('MacIntel')).toBe('Reveal in Finder');
  expect(revealLabel('Linux x86_64')).toBe('Reveal in file manager');
  expect(revealLabel('Windows')).toBe('Reveal in file manager');
});

test('C++ is recognised by extension, and a source tab says read-only', () => {
  expect(['a.cpp', 'w/a.hpp', 'a.h', 'a.cc', 'A.CPP'].every(isCppSource)).toBe(true);
  expect(['a.xml', '.h', 'a.hpp.txt', 'a.c'].some(isCppSource)).toBe(false);
  expect(sourceTitle('widgets/wd_a/wd_a.cpp')).toBe('wd_a.cpp (read-only)');
});
