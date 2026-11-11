/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/session-status.test.ts
 * Purpose: The words the designer shows when its session ends or a save
 *          fails: the banner names every file with unsaved changes, or says
 *          there are none, and always says how to continue; the status item
 *          names the files that did not save, and is gone when none is left.
 * Description: `session-status.ts` is pure, so these run without a browser.
 */

import { expect, test } from '@playwright/test';
import { describeNotSaved, describeSessionEnded } from '../../src/ui/session-status';

const NEXT = 'To continue, run npx u8g2gl design in the project folder, which opens a new session. Until then, saving is not possible.';

test('the banner says the server stopped, and that there are no unsaved changes when there are none', () => {
  expect(describeSessionEnded([])).toEqual({
    lead: 'The design server has stopped.',
    changes: 'There are no unsaved changes.',
    next: NEXT,
  });
});

test('the banner names the one file with unsaved changes', () => {
  expect(describeSessionEnded(new Set(['screens/screen_home.xml'])).changes).toBe(
    'Your unsaved changes to screens/screen_home.xml are still in this tab.',
  );
});

test('the banner counts and lists several files with unsaved changes, sorted', () => {
  const text = describeSessionEnded(new Set(['screens/screen_b.xml', 'globals.xml', 'screens/screen_a.xml']));
  expect(text.changes).toBe('Your unsaved changes to 3 files are still in this tab: globals.xml, screens/screen_a.xml, screens/screen_b.xml.');
  expect(text.next).toBe(NEXT);
});

test('the status item names the files that did not save, and is gone when none is left', () => {
  expect(describeNotSaved(['screens/screen_home.xml'])).toBe('✕ not saved: screens/screen_home.xml');
  expect(describeNotSaved(new Set(['screens/b.xml', 'globals.xml']))).toBe('✕ not saved: globals.xml, screens/b.xml');
  expect(describeNotSaved([])).toBeUndefined();
});
