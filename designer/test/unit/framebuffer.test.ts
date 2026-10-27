/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/framebuffer.test.ts
 * Purpose: The canvas must put each pixel where U8G2 does: tile rows of eight
 *          vertical bits, least significant at the top.
 * Description: Hand-built buffers, checked pixel by pixel.
 */

import { expect, test } from '@playwright/test';
import { blitFrame, countLit, LIT, UNLIT } from '../../src/canvas/framebuffer';

test('bit y & 7 of byte x + (y >> 3) * width lights pixel (x, y)', () => {
  const width = 4;
  const height = 16;
  const buffer = new Uint8Array(width * 2);
  buffer[1] = 0b0000_0001; // (1, 0)
  buffer[2] = 0b1000_0000; // (2, 7)
  buffer[width + 3] = 0b0000_0100; // (3, 10)
  const pixels = new Uint32Array(width * height);
  blitFrame(buffer, width, height, pixels);
  const lit = [...pixels.keys()].filter((i) => pixels[i] === LIT).map((i) => [i % width, Math.floor(i / width)]);
  expect(lit).toEqual([
    [1, 0],
    [2, 7],
    [3, 10],
  ]);
  expect(pixels.filter((p) => p === UNLIT).length).toBe(width * height - 3);
  expect(countLit(buffer)).toBe(3);
});
