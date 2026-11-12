/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/drawn-rectangles.test.ts
 * Purpose: Every drawn element has a rectangle the canvas can hit and select
 *          (ui_spec §8). A box, an object, a line and a triangle keep the ones
 *          they had; a circle, an ellipse (a quadrant too), an hline, a vline
 *          and a pixel, which have neither a box nor endpoints, are boxed by
 *          what they draw, the resolver's drawn extent.
 * Description: One screen through `runTextPipeline`, with no fonts, so it needs
 *              no compiled asset; its bounds, targets and placements by name.
 */

import { expect, test } from '@playwright/test';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const SCREEN = 'screens/screen_home.xml';

const ELEMENTS = [
  '<u8g2gl_box name="box" x="2" y="3" width="10" height="6" />',
  '<u8g2gl_progress_bar name="bar" x="20" y="2" width="30" height="10" />',
  '<u8g2gl_line name="line" x1="10" y1="50" x2="40" y2="60" />',
  '<u8g2gl_triangle name="tri" x0="80" y0="10" x1="100" y1="10" x2="90" y2="25" />',
  '<u8g2gl_circle name="circle" x="30" y="30" radius="5" />',
  '<u8g2gl_circle name="quarter" x="60" y="40" radius="6" segments="upper_right" />',
  '<u8g2gl_ellipse name="ellipse" x="110" y="45" rx="8" ry="4" />',
  '<u8g2gl_hline name="hline" x="5" y="20" width="20" />',
  '<u8g2gl_vline name="vline" x="120" y="2" height="12" />',
  '<u8g2gl_pixel name="dot" x="64" y="60" />',
];

/** The screen run through the live pipeline. */
function run(): ReturnType<typeof runTextPipeline> {
  const screen = `<screen name="home">\n  <view>\n${ELEMENTS.map((element) => `    ${element}`).join('\n')}\n  </view>\n</screen>\n`;
  return runTextPipeline({
    texts: new Map([
      [
        'u8g2gl.xml',
        '<u8g2gl schema="0.6" name="extents" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
      ],
      ['globals.xml', '<globals>\n</globals>\n'],
      [SCREEN, screen],
    ]),
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
}

test('a box, a progress bar, a line and a triangle keep the rectangles they had', () => {
  const { bounds } = run();
  expect(bounds.get('box')).toEqual({ x: 2, y: 3, width: 10, height: 6 });
  expect(bounds.get('bar')).toEqual({ x: 20, y: 2, width: 30, height: 10 });
  expect(bounds.get('line')).toEqual({ x: 10, y: 50, width: 31, height: 11 });
  expect(bounds.get('tri')).toEqual({ x: 80, y: 10, width: 21, height: 16 });
});

test('a circle, an ellipse and a quadrant are boxed by what they draw, a radius from the centre on the sides drawn', () => {
  const { bounds } = run();
  expect(bounds.get('circle')).toEqual({ x: 25, y: 25, width: 11, height: 11 });
  // upper_right: right of the centre and above it, the centre's own row and column included.
  expect(bounds.get('quarter')).toEqual({ x: 60, y: 34, width: 7, height: 7 });
  expect(bounds.get('ellipse')).toEqual({ x: 102, y: 41, width: 17, height: 9 });
});

test('an hline and a vline are one pixel thick across the axis they run along, and a pixel is one pixel', () => {
  const { bounds } = run();
  expect(bounds.get('dot')).toEqual({ x: 64, y: 60, width: 1, height: 1 });
  expect(bounds.get('hline')).toEqual({ x: 5, y: 20, width: 20, height: 1 });
  expect(bounds.get('vline')).toEqual({ x: 120, y: 2, width: 1, height: 12 });
});

test('every element is a hit target with a placement, so the canvas can select and resize it', () => {
  const result = run();
  expect(result.errors, JSON.stringify(result.diagnostics)).toBe(0);
  const names = ['box', 'bar', 'line', 'tri', 'circle', 'quarter', 'ellipse', 'hline', 'vline', 'dot'];
  expect(result.targets.map((target) => target.name)).toEqual(names);
  expect([...result.placements.keys()]).toEqual(names);
});
