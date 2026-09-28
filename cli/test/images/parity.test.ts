/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/images/parity.test.ts
 * Purpose: Proves `<convert>`'s conversion gives the same bytes in Node and in a
 *          browser (PR-04b WO4 item 5), which is what lets the designer and the
 *          CLI generate the same image from the same PNG (§13.9). Not by reading
 *          the source for Node-isms: by bundling `src/core/images/index.ts` for a
 *          browser and running it where only browser globals exist.
 * Description: Uses the shared harness (`test/helpers/browser-bundle.ts`, moved
 *              out of the fonts parity test). The sandbox adds
 *              `DecompressionStream` — a browser global, and the one thing the
 *              decoder needs beyond the language — and nothing else. For a set
 *              of PNGs covering every colour type, both modes and a failing
 *              input, the sandboxed result is compared with a direct Node call.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertPng as nodeConvertPng, type ConvertOptions } from '../../src/core/images/index.js';
import { loadBrowserBundle, type BrowserBundle } from '../helpers/browser-bundle.js';
import { buildPng } from '../helpers/png-builder.js';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entryPath = resolve(cliDir, 'src', 'core', 'images', 'index.ts');

interface BrowserImagesApi {
  convertPng(png: Uint8Array, options?: ConvertOptions): Promise<{ width: number; height: number; bytes: number[] } | { reason: string }>;
}

let bundle: BrowserBundle<BrowserImagesApi>;

beforeAll(() => {
  bundle = loadBrowserBundle<BrowserImagesApi>(entryPath, 'U8G2GLImages', 'images-parity-bundle.js', {
    DecompressionStream,
    console,
  });
}, 30000);

afterAll(() => {
  bundle.cleanup();
});

/** Runs the sandboxed conversion, with the input built in the sandbox's own realm. */
async function inBrowser(png: Buffer, options?: ConvertOptions) {
  const result = await bundle.api.convertPng(new bundle.Uint8Array(png), options);
  // Bring the result back into this realm before comparing: a cross-realm Array
  // is not `toEqual` to a host one.
  return JSON.parse(JSON.stringify(result)) as typeof result;
}

/** A deterministic pseudo-random sample source. */
function noise(count: number, max = 255): number[] {
  let state = 2024;
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state >> 8) % (max + 1);
  });
}

const CASES: readonly { name: string; png: Buffer; options?: ConvertOptions }[] = [
  { name: 'RGBA, threshold', png: buildPng({ width: 13, height: 9, colourType: 6, depth: 8, samples: noise(13 * 9 * 4) }) },
  { name: 'RGBA, dither', png: buildPng({ width: 13, height: 9, colourType: 6, depth: 8, samples: noise(13 * 9 * 4), filters: [4] }), options: { mode: 'dither' } },
  { name: '16-bit RGB, dither, threshold 90', png: buildPng({ width: 9, height: 7, colourType: 2, depth: 16, samples: noise(9 * 7 * 3, 65535) }), options: { mode: 'dither', threshold: 90 } },
  { name: '4-bit grey, threshold 200', png: buildPng({ width: 11, height: 5, colourType: 0, depth: 4, samples: noise(55, 15) }), options: { threshold: 200 } },
  { name: '2-bit palette with tRNS, dither', png: buildPng({ width: 10, height: 4, colourType: 3, depth: 2, samples: noise(40, 3), palette: [0, 0, 0, 255, 255, 255, 128, 128, 128, 40, 200, 90], transparency: [0, 255, 128] }), options: { mode: 'dither' } },
  { name: 'grey + alpha, filters 1-3', png: buildPng({ width: 8, height: 8, colourType: 4, depth: 8, samples: noise(128), filters: [1, 2, 3] }) },
  { name: 'several IDATs', png: buildPng({ width: 20, height: 20, colourType: 0, depth: 8, samples: noise(400), idatParts: 4 }) },
];

describe('convertPng() — Node/browser parity', () => {
  it.each(CASES)('$name: identical bytes', async ({ png, options }) => {
    const node = await nodeConvertPng(new Uint8Array(png), options);
    const browser = await inBrowser(png, options);

    expect('reason' in node).toBe(false);
    expect(browser).toEqual(JSON.parse(JSON.stringify(node)));
  });

  it('identical failure reasons for a refused file', async () => {
    const interlaced = buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [0, 1, 2, 3], interlace: 1 });
    const corrupt = Buffer.from(buildPng({ width: 4, height: 4, colourType: 0, depth: 8, samples: noise(16) }));
    corrupt[corrupt.length - 20] = (corrupt[corrupt.length - 20]! ^ 0xff) & 0xff;
    for (const png of [interlaced, corrupt, Buffer.from('not a png')]) {
      const node = await nodeConvertPng(new Uint8Array(png));
      const browser = await inBrowser(png);
      expect('reason' in node).toBe(true);
      expect(browser).toEqual(JSON.parse(JSON.stringify(node)));
    }
  });
});
