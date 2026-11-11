/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/save-status.test.ts
 * Purpose: The words and the choice behind saving: the status bar's Save
 *          button counts the unsaved files and is gone when there are none, its
 *          tooltip lists them and both shortcuts, and ⌘S saves the active
 *          editor's file, or the canvas's when no editor tab is active.
 * Description: `save-status.ts` is pure, so these run without a browser.
 */

import { expect, test } from '@playwright/test';
import { describeUnsaved, SAVE_ALL_SHORTCUT, SAVE_SHORTCUT, saveTarget } from '../../src/ui/save-status';

test('nothing unsaved: there is no Save button', () => {
  expect(describeUnsaved([])).toBeUndefined();
  expect(describeUnsaved(new Set())).toBeUndefined();
});

test('one unsaved file: the button counts it, and its tooltip names it and both shortcuts', () => {
  expect(describeUnsaved(['screens/screen_home.xml'])).toEqual({
    label: '● 1 unsaved · Save',
    title: ['Save the unsaved file:', '  screens/screen_home.xml', `Save all: ${SAVE_ALL_SHORTCUT}. Save the active file: ${SAVE_SHORTCUT}.`].join('\n'),
  });
});

test('several unsaved files: the button counts them, and its tooltip lists them sorted', () => {
  const text = describeUnsaved(new Set(['screens/screen_b.xml', 'globals.xml', 'screens/screen_a.xml']));
  expect(text?.label).toBe('● 3 unsaved · Save');
  expect(text?.title.split('\n')).toEqual([
    'Save all 3 unsaved files:',
    '  globals.xml',
    '  screens/screen_a.xml',
    '  screens/screen_b.xml',
    'Save all: ⌘⌥S / Ctrl-Alt-S. Save the active file: ⌘S / Ctrl-S.',
  ]);
});

test('⌘S saves the active editor file when there is one, even if the canvas draws another', () => {
  expect(saveTarget('widgets/wd_box.xml', 'screens/screen_home.xml')).toBe('widgets/wd_box.xml');
  expect(saveTarget('screens/screen_home.xml', undefined)).toBe('screens/screen_home.xml');
});

test('⌘S with no editor tab active saves the canvas\'s file, and with neither saves nothing', () => {
  expect(saveTarget(undefined, 'screens/screen_home.xml')).toBe('screens/screen_home.xml');
  expect(saveTarget(undefined, undefined)).toBeUndefined();
});
