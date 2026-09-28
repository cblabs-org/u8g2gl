/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/fixture-logo.ts
 * Purpose: The single definition of the committed fixture's `<convert>` source
 *          image (`test/generated_fixture/assets/logo_mark.png`), so the PNG can
 *          be regenerated (`test/fixtures/make-fixture-logo.ts`) and a test can
 *          prove the committed file is still exactly what this produces.
 * Description: A 16x16 RGBA image: a soft-edged dark ring on a transparent
 *              ground, with a diagonal ramp inside, so a conversion has
 *              transparency to composite, mid-greys to dither and a shape to
 *              draw. Stored with zlib level 0 (uncompressed deflate blocks),
 *              because a compressed stream's bytes depend on the zlib version
 *              and this file must be byte-stable across machines.
 *
 * Exports:
 * - fixtureLogoPng(): The PNG's bytes
 */

import { buildPng } from './png-builder.js';

/** @brief The fixture logo's PNG bytes; identical on every run and machine. */
export function fixtureLogoPng(): Buffer {
  const samples: number[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const ring = Math.max(0, 255 - Math.round(Math.abs(d - 5.5) * 90));
      const ramp = Math.round(((x + y) * 255) / 30);
      samples.push(ramp, 255 - ramp, 40, ring);
    }
  }
  return buildPng({ width: 16, height: 16, colourType: 6, depth: 8, samples, filters: [1, 2, 3, 4, 0], level: 0 });
}
