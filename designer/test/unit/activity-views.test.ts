/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/activity-views.test.ts
 * Purpose: The activity bar draws a real icon for every view: each view's
 *          Lucide name resolves, so none falls back to the generic `puzzle`.
 * Description: Checks `ACTIVITY_VIEWS` against `resolveIcon`, the lookup
 *              `<Icon>` itself uses.
 */

import { expect, test } from '@playwright/test';
import { FALLBACK_ICON, resolveIcon } from '../../src/icons/icon-names';
import { ACTIVITY_VIEWS } from '../../src/ui/activity-views';

test('every activity-bar view names an icon that resolves, and none is the fallback', () => {
  expect(ACTIVITY_VIEWS.map((view) => view.id)).toEqual(['explorer', 'palette', 'assets', 'fonts', 'samples', 'flow', 'search']);
  for (const view of ACTIVITY_VIEWS) {
    const symbol = resolveIcon(view.icon);
    expect(symbol, view.id).toBeDefined();
    expect(symbol, view.id).not.toBe(FALLBACK_ICON);
  }
});

test('the views keep their labels and readiness: Explorer and Palette are ready, the rest are not', () => {
  expect(ACTIVITY_VIEWS.map((view) => view.label)).toEqual(['Explorer', 'Palette', 'Assets', 'Fonts', 'Sample data', 'Flow', 'Search']);
  expect(ACTIVITY_VIEWS.filter((view) => view.ready).map((view) => view.id)).toEqual(['explorer', 'palette']);
});
