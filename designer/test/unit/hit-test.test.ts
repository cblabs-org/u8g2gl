/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/hit-test.test.ts
 * Purpose: Canvas hit-testing (ui_spec §4.3, §8): the topmost element wins,
 *          repeated clicks at one pixel cycle down through overlaps and a click
 *          elsewhere starts again, a marquee selects what it intersects, and a
 *          hit on a composite's child selects the instance — checked both on
 *          literal targets and through the live pipeline on a real composite.
 * Description: Targets in draw order, then a small project run through
 *              `runTextPipeline` with no fonts, so it needs no compiled asset.
 */

import { expect, test } from '@playwright/test';
import { ClickCycler, hitsAt, marqueeHits, type HitTarget } from '../../src/selection/hit-test';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

/** Three overlapping boxes, drawn back to front, and one apart. */
const TARGETS: readonly HitTarget[] = [
  { name: 'back', rect: { x: 0, y: 0, width: 40, height: 20 } },
  { name: 'middle', rect: { x: 10, y: 5, width: 20, height: 10 } },
  { name: 'front', rect: { x: 12, y: 6, width: 4, height: 4 } },
  { name: 'apart', rect: { x: 100, y: 0, width: 10, height: 10 } },
];

test('the topmost element at a pixel is hit first, then each one under it', () => {
  expect(hitsAt(TARGETS, 13, 7)).toEqual(['front', 'middle', 'back']);
  expect(hitsAt(TARGETS, 1, 1)).toEqual(['back']);
  expect(hitsAt(TARGETS, 60, 1)).toEqual([]);
  // Half-open: a 40-wide box at x = 0 covers pixels 0..39.
  expect(hitsAt(TARGETS, 39, 0)).toEqual(['back']);
  expect(hitsAt(TARGETS, 40, 0)).toEqual([]);
});

test('repeated clicks at one pixel cycle down through the overlaps and wrap', () => {
  const cycler = new ClickCycler();
  expect([1, 2, 3, 4].map(() => cycler.click(TARGETS, 13, 7))).toEqual(['front', 'middle', 'back', 'front']);
});

test('a click at another pixel starts the cycle again at the top', () => {
  const cycler = new ClickCycler();
  cycler.click(TARGETS, 13, 7);
  cycler.click(TARGETS, 13, 7);
  expect(cycler.click(TARGETS, 14, 7)).toBe('front');
  expect(cycler.click(TARGETS, 14, 7)).toBe('middle');
  cycler.reset();
  expect(cycler.click(TARGETS, 14, 7)).toBe('front');
  // A click on nothing selects nothing, and the next click starts at the top.
  expect(cycler.click(TARGETS, 60, 60)).toBeUndefined();
  expect(cycler.click(TARGETS, 13, 7)).toBe('front');
});

test('a marquee selects every element it intersects, in document order', () => {
  expect(marqueeHits(TARGETS, { x: 14, y: 8, width: 1, height: 1 })).toEqual(['back', 'middle', 'front']);
  expect(marqueeHits(TARGETS, { x: 35, y: 0, width: 70, height: 2 })).toEqual(['back', 'apart']);
  // Ending at an edge shares no pixel with it.
  expect(marqueeHits(TARGETS, { x: 40, y: 0, width: 60, height: 20 })).toEqual([]);
});

test('a composite’s drawn children are one target, its instance, under its topmost child', () => {
  const targets: HitTarget[] = [
    { name: 'panel', rect: { x: 0, y: 0, width: 60, height: 20 } },
    { name: 'panel', rect: { x: 0, y: 0, width: 60, height: 1 } },
    { name: 'panel', rect: { x: 0, y: 2, width: 60, height: 10 } },
  ];
  expect(hitsAt(targets, 5, 0)).toEqual(['panel']);
  expect(marqueeHits(targets, { x: 0, y: 0, width: 128, height: 64 })).toEqual(['panel']);
});

const PROJECT = new Map([
  [
    'u8g2gl.xml',
    '<u8g2gl schema="0.5" name="hits" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
  ],
  ['globals.xml', '<globals>\n</globals>\n'],
  [
    'widgets/frame/frame.xml',
    '<widget name="frame">\n  <api />\n  <view>\n    <u8g2gl_hline name="top" x="0" y="0" width="#parent_width" />\n    <u8g2gl_box name="body" x="0" y="2" width="#parent_width" height="6" />\n  </view>\n</widget>\n',
  ],
  [
    'screens/screen_home.xml',
    '<screen name="home">\n  <view>\n    <u8g2gl_box name="under" x="0" y="0" width="128" height="64" />\n    <frame name="card" x="10" y="20" width="50" height="10" />\n  </view>\n</screen>\n',
  ],
]);

test('through the live pipeline, a hit on a composite’s child selects the instance written in the screen', () => {
  const result = runTextPipeline({
    texts: PROJECT,
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: 'screens/screen_home.xml',
  });
  expect(result.errors, JSON.stringify(result.diagnostics)).toBe(0);
  expect(result.screenFile).toBe('screens/screen_home.xml');
  // Every target names an element written in the screen; none names a child.
  expect([...new Set(result.targets.map((t) => t.name))]).toEqual(['under', 'card']);
  // The child `body` is drawn at the card's origin plus its own offset.
  expect(hitsAt(result.targets, 15, 23)).toEqual(['card', 'under']);
  expect(hitsAt(result.targets, 5, 5)).toEqual(['under']);
  expect(result.bounds.get('card')).toEqual({ x: 10, y: 20, width: 50, height: 10 });
});
