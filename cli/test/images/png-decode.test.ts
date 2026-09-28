/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/images/png-decode.test.ts
 * Purpose: Pins the PNG decoder (PR-04b WO4 item 1, 5): every colour type at
 *          every bit depth the specification allows, all five scanline filters,
 *          palettes with and without tRNS, several IDAT chunks, and each input
 *          the decoder must refuse with a reason rather than a throw.
 * Description: Inputs are made by `test/helpers/png-builder.ts`, an independent
 *              writer, so the decoder is checked against a second
 *              implementation of the format and against literal expected values,
 *              not against its own arithmetic.
 */

import { describe, expect, it } from 'vitest';
import { decodePng, type DecodedPng } from '../../src/core/images/index.js';
import { buildPng, chunk, PNG_SIGNATURE } from '../helpers/png-builder.js';

/** Decodes and fails the test on a refusal. */
async function decode(png: Buffer): Promise<DecodedPng> {
  const result = await decodePng(new Uint8Array(png));
  if ('reason' in result) {
    throw new Error(`unexpected refusal: ${result.reason}`);
  }
  return result;
}

/** The refusal reason, failing the test if the file decoded. */
async function refusal(png: Buffer): Promise<string> {
  const result = await decodePng(new Uint8Array(png));
  if (!('reason' in result)) {
    throw new Error('expected a refusal, but the file decoded');
  }
  return result.reason;
}

/** The pixels of a decoded image as `[r,g,b,a]` tuples. */
function pixels(image: DecodedPng): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < image.rgba.length; i += 4) {
    out.push([image.rgba[i]!, image.rgba[i + 1]!, image.rgba[i + 2]!, image.rgba[i + 3]!]);
  }
  return out;
}

describe('decodePng — literal expectations, hand-computed', () => {
  it('1-bit greyscale: 0 is black, 1 is white', async () => {
    const image = await decode(buildPng({ width: 3, height: 1, colourType: 0, depth: 1, samples: [0, 1, 0] }));
    expect(pixels(image)).toEqual([[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255]]);
  });

  it('2-bit greyscale scales 0..3 to 0, 85, 170, 255', async () => {
    const image = await decode(buildPng({ width: 4, height: 1, colourType: 0, depth: 2, samples: [0, 1, 2, 3] }));
    expect(pixels(image).map((p) => p[0])).toEqual([0, 85, 170, 255]);
  });

  it('4-bit greyscale scales 0..15 by 17', async () => {
    const image = await decode(buildPng({ width: 3, height: 1, colourType: 0, depth: 4, samples: [0, 5, 15] }));
    expect(pixels(image).map((p) => p[0])).toEqual([0, 85, 255]);
  });

  it('16-bit samples use their high byte', async () => {
    const image = await decode(buildPng({ width: 1, height: 1, colourType: 0, depth: 16, samples: [0xabcd] }));
    expect(pixels(image)).toEqual([[0xab, 0xab, 0xab, 255]]);
    const rgb = await decode(
      buildPng({ width: 1, height: 1, colourType: 2, depth: 16, samples: [0x1234, 0x5678, 0x9abc] }),
    );
    expect(pixels(rgb)).toEqual([[0x12, 0x56, 0x9a, 255]]);
  });

  it('8-bit truecolour with alpha keeps all four channels, unassociated', async () => {
    const image = await decode(buildPng({ width: 2, height: 1, colourType: 6, depth: 8, samples: [10, 20, 30, 40, 250, 240, 230, 0] }));
    expect(pixels(image)).toEqual([[10, 20, 30, 40], [250, 240, 230, 0]]);
  });

  it('greyscale with alpha', async () => {
    const image = await decode(buildPng({ width: 2, height: 1, colourType: 4, depth: 8, samples: [100, 200, 50, 0] }));
    expect(pixels(image)).toEqual([[100, 100, 100, 200], [50, 50, 50, 0]]);
    const wide = await decode(buildPng({ width: 1, height: 1, colourType: 4, depth: 16, samples: [0x8000, 0x4000] }));
    expect(pixels(wide)).toEqual([[0x80, 0x80, 0x80, 0x40]]);
  });
});

describe('decodePng — every colour type at every allowed bit depth', () => {
  /** Allowed depths per colour type (PNG Table 8), and the samples per pixel. */
  const GRID: readonly (readonly [number, readonly number[], number])[] = [
    [0, [1, 2, 4, 8, 16], 1],
    [2, [8, 16], 3],
    [3, [1, 2, 4, 8], 1],
    [4, [8, 16], 2],
    [6, [8, 16], 4],
  ];
  const cases = GRID.flatMap(([colourType, depths, channels]) => depths.map((depth) => ({ colourType, depth, channels })));

  // Width 5 is deliberately not a multiple of 8 / of the samples per byte, so
  // every sub-byte depth ends its scanline mid-byte.
  it.each(cases)('colour type $colourType, depth $depth', async ({ colourType, depth, channels }) => {
    const width = 5;
    const height = 3;
    const maxSample = 2 ** depth - 1;
    const palette = colourType === 3 ? Array.from({ length: 2 ** depth > 256 ? 256 : 2 ** depth }, (_, i) => [i * 3 % 256, i * 5 % 256, i * 7 % 256]).flat() : undefined;
    const paletteSize = palette === undefined ? 0 : palette.length / 3;
    const samples = Array.from({ length: width * height * channels }, (_, k) => {
      const value = (k * 37 + 11) % (maxSample + 1);
      return colourType === 3 ? value % paletteSize : value;
    });
    const image = await decode(buildPng({ width, height, colourType, depth, samples, ...(palette !== undefined ? { palette } : {}) }));

    // The expected pixels, from the specification's own rules stated plainly:
    // a 16-bit sample is its high byte, a sub-8-bit grey sample is scaled to
    // 0..255, and a palette entry is looked up.
    const to8 = (v: number): number => (depth === 16 ? v >> 8 : depth === 8 ? v : (v * 255) / maxSample);
    const expected: number[][] = [];
    for (let p = 0; p < width * height; p += 1) {
      const s = samples.slice(p * channels, (p + 1) * channels);
      if (colourType === 0) expected.push([to8(s[0]!), to8(s[0]!), to8(s[0]!), 255]);
      else if (colourType === 2) expected.push([to8(s[0]!), to8(s[1]!), to8(s[2]!), 255]);
      else if (colourType === 3) expected.push([palette![s[0]! * 3]!, palette![s[0]! * 3 + 1]!, palette![s[0]! * 3 + 2]!, 255]);
      else if (colourType === 4) expected.push([to8(s[0]!), to8(s[0]!), to8(s[0]!), to8(s[1]!)]);
      else expected.push([to8(s[0]!), to8(s[1]!), to8(s[2]!), to8(s[3]!)]);
    }
    expect(image.width).toBe(width);
    expect(image.height).toBe(height);
    expect(pixels(image)).toEqual(expected);
  });
});

describe('decodePng — scanline filters', () => {
  /** A deterministic pseudo-random sample source. */
  function noise(count: number): number[] {
    let state = 12345;
    return Array.from({ length: count }, () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return (state >> 16) & 0xff;
    });
  }

  // Colour types chosen so the "left" distance is 1, 2, 3 and 4 bytes.
  const LAYOUTS = [
    { name: '8-bit grey (bpp 1)', colourType: 0, depth: 8, channels: 1 },
    { name: '16-bit grey (bpp 2)', colourType: 0, depth: 16, channels: 1 },
    { name: '8-bit RGB (bpp 3)', colourType: 2, depth: 8, channels: 3 },
    { name: '8-bit RGBA (bpp 4)', colourType: 6, depth: 8, channels: 4 },
  ];

  it.each([0, 1, 2, 3, 4])('filter type %i, on every pixel size', async (filter) => {
    for (const layout of LAYOUTS) {
      const width = 7;
      const height = 6;
      const samples = noise(width * height * layout.channels).map((v) => (layout.depth === 16 ? v * 257 : v));
      // Every row uses the type under test, so its predictor sees a real row above it.
      const image = await decode(
        buildPng({ width, height, colourType: layout.colourType, depth: layout.depth, samples, filters: [filter] }),
      );
      const direct = await decode(
        buildPng({ width, height, colourType: layout.colourType, depth: layout.depth, samples, filters: [0] }),
      );
      expect(Array.from(image.rgba), layout.name).toEqual(Array.from(direct.rgba));
    }
  });

  it('a different filter on each row of one image', async () => {
    const samples = noise(6 * 5 * 3);
    const mixed = await decode(buildPng({ width: 6, height: 5, colourType: 2, depth: 8, samples, filters: [0, 1, 2, 3, 4] }));
    const plain = await decode(buildPng({ width: 6, height: 5, colourType: 2, depth: 8, samples, filters: [0] }));
    expect(Array.from(mixed.rgba)).toEqual(Array.from(plain.rgba));
    // And the unfiltered result is the samples themselves (alpha 255).
    expect(Array.from(plain.rgba.subarray(0, 4))).toEqual([samples[0], samples[1], samples[2], 255]);
  });

  it('refuses an unknown filter type, naming the scanline', async () => {
    const png = buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [1, 2, 3, 4], filters: [9] });
    expect(await refusal(png)).toMatch(/unknown filter type 9/);
  });
});

describe('decodePng — palette and transparency', () => {
  const PALETTE = [255, 0, 0, 0, 255, 0, 0, 0, 255];

  it('a palette image without tRNS is opaque', async () => {
    const image = await decode(buildPng({ width: 3, height: 1, colourType: 3, depth: 8, samples: [0, 1, 2], palette: PALETTE }));
    expect(pixels(image)).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]]);
  });

  it('tRNS gives palette entries their alpha; entries beyond it are opaque', async () => {
    const image = await decode(
      buildPng({ width: 3, height: 1, colourType: 3, depth: 8, samples: [0, 1, 2], palette: PALETTE, transparency: [0, 128] }),
    );
    expect(pixels(image).map((p) => p[3])).toEqual([0, 128, 255]);
  });

  it('a palette index the palette lacks is refused', async () => {
    const png = buildPng({ width: 1, height: 1, colourType: 3, depth: 8, samples: [7], palette: PALETTE });
    expect(await refusal(png)).toMatch(/palette entry 7/);
  });

  it('a palette image with no PLTE is refused', async () => {
    const png = buildPng({ width: 1, height: 1, colourType: 3, depth: 8, samples: [0] });
    expect(await refusal(png)).toMatch(/no PLTE/);
  });

  it('a greyscale colour key makes that grey transparent, at the image depth', async () => {
    const image = await decode(
      buildPng({ width: 3, height: 1, colourType: 0, depth: 2, samples: [1, 2, 3], transparency: [0, 2] }),
    );
    expect(pixels(image).map((p) => p[3])).toEqual([255, 0, 255]);
  });

  it('an RGB colour key makes only that exact colour transparent', async () => {
    const image = await decode(
      buildPng({ width: 2, height: 1, colourType: 2, depth: 8, samples: [1, 2, 3, 1, 2, 4], transparency: [0, 1, 0, 2, 0, 3] }),
    );
    expect(pixels(image).map((p) => p[3])).toEqual([0, 255]);
  });
});

describe('decodePng — chunk structure', () => {
  const base = { width: 4, height: 4, colourType: 0, depth: 8, samples: Array.from({ length: 16 }, (_, i) => i * 16) } as const;

  it('reads image data split over several IDAT chunks', async () => {
    const whole = await decode(buildPng(base));
    const split = await decode(buildPng({ ...base, idatParts: 3 }));
    expect(Array.from(split.rgba)).toEqual(Array.from(whole.rgba));
  });

  it('ignores an unknown ancillary chunk', async () => {
    const png = buildPng({ ...base, extraChunks: [chunk('tEXt', Buffer.from('Comment\0hello'))] });
    expect((await decode(png)).width).toBe(4);
  });

  it('ignores bytes after IEND', async () => {
    const png = Buffer.concat([buildPng(base), Buffer.from('trailing')]);
    expect((await decode(png)).height).toBe(4);
  });
});

describe('decodePng — refused inputs', () => {
  const good = buildPng({ width: 4, height: 4, colourType: 0, depth: 8, samples: Array.from({ length: 16 }, (_, i) => i) });

  it('not a PNG: a bad signature', async () => {
    expect(await refusal(Buffer.from('GIF89a and not a png at all'))).toMatch(/not a PNG file \(bad signature\)/);
    expect(await refusal(Buffer.alloc(0))).toMatch(/bad signature/);
  });

  it('a failed CRC', async () => {
    const corrupt = Buffer.from(good);
    corrupt[corrupt.length - 20] = (corrupt[corrupt.length - 20]! ^ 0xff) & 0xff; // inside IDAT
    expect(await refusal(corrupt)).toMatch(/fails its CRC check/);
  });

  it('a truncated chunk', async () => {
    expect(await refusal(good.subarray(0, good.length - 30))).toMatch(/truncated/);
  });

  it('a file with no IEND', async () => {
    const png = buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [1, 2, 3, 4], omitIend: true });
    expect(await refusal(png)).toMatch(/truncated/);
  });

  it('an unknown critical chunk', async () => {
    const png = buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [1, 2, 3, 4], extraChunks: [chunk('ZZZZ')] });
    expect(await refusal(png)).toMatch(/unknown critical chunk 'ZZZZ'/);
  });

  it('Adam7 interlacing, saying how to fix it', async () => {
    const png = buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [1, 2, 3, 4], interlace: 1 });
    expect(await refusal(png)).toMatch(/Adam7 interlaced.*save it non-interlaced/);
  });

  it('zero width or height', async () => {
    const zeroWidth = buildPng({ width: 1, height: 1, colourType: 0, depth: 8, samples: [1] });
    zeroWidth.writeUInt32BE(0, 16); // IHDR width
    refreshIhdrCrc(zeroWidth);
    expect(await refusal(zeroWidth)).toMatch(/zero width or height/);
  });

  it('a bit depth the colour type does not allow', async () => {
    const png = buildPng({ width: 1, height: 1, colourType: 2, depth: 8, samples: [1, 2, 3] });
    png[24] = 4; // IHDR depth
    refreshIhdrCrc(png);
    expect(await refusal(png)).toMatch(/bit depth 4 is not allowed for colour type 2/);
  });

  it('a first chunk that is not IHDR', async () => {
    expect(await refusal(Buffer.concat([PNG_SIGNATURE, chunk('IEND')]))).toMatch(/first chunk is not IHDR/);
  });

  it('image data shorter or longer than the header implies', async () => {
    // Same IDAT, but the header claims a taller image than the data holds.
    const tall = Buffer.from(good);
    tall.writeUInt32BE(9, 20); // IHDR height
    refreshIhdrCrc(tall);
    expect(await refusal(tall)).toMatch(/shorter than its header implies/);
    // And a header claiming a shorter image than the data holds.
    const short = Buffer.from(good);
    short.writeUInt32BE(2, 20);
    refreshIhdrCrc(short);
    expect(await refusal(short)).toMatch(/longer than its header implies/);
  });

  it('IDAT bytes that are not a zlib stream', async () => {
    const png = Buffer.concat([
      PNG_SIGNATURE,
      buildPng({ width: 1, height: 1, colourType: 0, depth: 8, samples: [1] }).subarray(8, 33),
      chunk('IDAT', Buffer.from('this is not deflate data')),
      chunk('IEND'),
    ]);
    expect(await refusal(png)).toMatch(/cannot be decompressed/);
  });
});

// refreshIhdrCrc
// Re-seals the IHDR chunk (signature 8 bytes, then length and type 8, data at
// [16, 29), CRC at [29, 33)) after a test patched a header byte, so it is the
// *header* rule that refuses the file and not the CRC check.
//   png — the file, patched in place
function refreshIhdrCrc(png: Buffer): void {
  const sealed = chunk('IHDR', png.subarray(16, 29));
  sealed.copy(png, 29, sealed.length - 4);
}
