/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/images/png-to-xbm.test.ts
 * Purpose: Pins the `<convert>` arithmetic (PR-04b WO4 item 5): alpha over
 *          white, Rec. 601 luminance, the strict `Y < threshold` polarity, the
 *          default threshold, XBM packing at a width that is not a multiple of
 *          8, and Floyd-Steinberg dithering with its one documented rounding
 *          rule. Every expected value is worked out by hand in the comment
 *          beside it, so the formulas are checked against arithmetic done
 *          independently of the code.
 */

import { describe, expect, it } from 'vitest';
import { convertPng, DEFAULT_THRESHOLD, rgbaToXbm, type DecodedPng } from '../../src/core/images/index.js';
import { buildPng } from '../helpers/png-builder.js';

/** Pixels from `[r,g,b,a]` tuples, one row. */
function row(...pixels: readonly (readonly [number, number, number, number])[]): DecodedPng {
  return { width: pixels.length, height: 1, rgba: new Uint8Array(pixels.flat()) };
}

/** A grey opaque pixel. */
const grey = (v: number): [number, number, number, number] => [v, v, v, 255];

describe('rgbaToXbm — grey and polarity', () => {
  it('the default threshold is 128', () => {
    expect(DEFAULT_THRESHOLD).toBe(128);
  });

  it('a pixel exactly at the threshold is clear; one below it is set', () => {
    // Y=127 < 128 -> set; Y=128 is not < 128 -> clear. Bit 0 is leftmost.
    expect(rgbaToXbm(row(grey(127), grey(128))).bytes).toEqual([0b01]);
  });

  it('threshold defaults to 128 when absent, and honours an explicit one', () => {
    const pixels = row(grey(100), grey(150), grey(200));
    expect(rgbaToXbm(pixels).bytes).toEqual([0b001]); // 100 < 128 only
    expect(rgbaToXbm(pixels, { threshold: 151 }).bytes).toEqual([0b011]); // 100, 150
    expect(rgbaToXbm(pixels, { threshold: 0 }).bytes).toEqual([0]); // nothing is < 0
    expect(rgbaToXbm(pixels, { threshold: 255 }).bytes).toEqual([0b111]); // all but 255
  });

  it('dark art on white draws the shape: black sets, white clears', () => {
    expect(rgbaToXbm(row(grey(0), grey(255))).bytes).toEqual([0b01]);
  });

  it('luminance is Rec. 601 in integer arithmetic', () => {
    // Pure red:   (299*255 + 500) / 1000 = 76745 / 1000 = 76
    // Pure green: (587*255 + 500) / 1000 = 150185 / 1000 = 150
    // Pure blue:  (114*255 + 500) / 1000 = 29570 / 1000 = 29
    const red: [number, number, number, number] = [255, 0, 0, 255];
    const green: [number, number, number, number] = [0, 255, 0, 255];
    const blue: [number, number, number, number] = [0, 0, 255, 255];
    const at = (threshold: number): number[] => [...rgbaToXbm(row(red, green, blue), { threshold }).bytes];
    expect(at(29)).toEqual([0b000]); // 29 is not < 29
    expect(at(30)).toEqual([0b100]); // blue (29) sets
    expect(at(77)).toEqual([0b101]); // red (76) sets too
    expect(at(76)).toEqual([0b100]); // red (76) is not < 76
    expect(at(150)).toEqual([0b101]); // green (150) is not < 150
    expect(at(151)).toEqual([0b111]);
  });

  it('a grey pixel keeps its grey value through the luminance formula', () => {
    // (299g + 587g + 114g + 500) / 1000 = (1000g + 500) / 1000 = g, for any g.
    for (const g of [0, 1, 99, 127, 128, 254, 255]) {
      expect([...rgbaToXbm(row(grey(g)), { threshold: g }).bytes]).toEqual([0]); // g is not < g
      expect([...rgbaToXbm(row(grey(g)), { threshold: g + 1 }).bytes]).toEqual([1]); // g is < g+1
    }
  });
});

describe('rgbaToXbm — alpha composited over white', () => {
  it('a fully transparent pixel is white whatever its colour', () => {
    // c' = (0*0 + 255*255 + 127) / 255 = 65152 / 255 = 255 (floor of 255.5)
    expect(rgbaToXbm(row([0, 0, 0, 0])).bytes).toEqual([0]);
  });

  it('half-transparent black: alpha 128 is dark enough, alpha 127 is not', () => {
    // a=128: c' = (0*128 + 255*127 + 127) / 255 = 32512 / 255 = 127 (127.49)  -> Y=127 < 128, set
    // a=127: c' = (0*127 + 255*128 + 127) / 255 = 32767 / 255 = 128 (128.49)  -> Y=128, clear
    expect(rgbaToXbm(row([0, 0, 0, 128], [0, 0, 0, 127])).bytes).toEqual([0b01]);
  });

  it('composites per channel before the luminance', () => {
    // Red at alpha 128: R' = (255*128 + 255*127 + 127) / 255 = 65152 / 255 = 255;
    //                   G' = B' = (0 + 255*127 + 127) / 255 = 127 (127.49)
    // Y = (299*255 + 587*127 + 114*127 + 500) / 1000
    //   = (76245 + 74549 + 14478 + 500) / 1000 = 165772 / 1000 = 165
    const red128: [number, number, number, number] = [255, 0, 0, 128];
    expect([...rgbaToXbm(row(red128), { threshold: 165 }).bytes]).toEqual([0]);
    expect([...rgbaToXbm(row(red128), { threshold: 166 }).bytes]).toEqual([1]);
  });
});

describe('rgbaToXbm — XBM packing', () => {
  it('rows are ceil(width/8) bytes, least significant bit leftmost', () => {
    // Width 10 -> 2 bytes per row. Black at x=0 and x=9 only:
    // byte 0 bit 0 = 0x01; byte 1 bit 1 (x=9, bit 9-8=1) = 0x02.
    const pixels: (readonly [number, number, number, number])[] = Array.from({ length: 10 }, (_, x) =>
      x === 0 || x === 9 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const image = rgbaToXbm(row(...pixels));
    expect(image.width).toBe(10);
    expect(image.height).toBe(1);
    expect(image.bytes).toEqual([0x01, 0x02]);
  });

  it('an all-black row of width 10 sets only the 10 pixels the row has', () => {
    const image = rgbaToXbm(row(...Array.from({ length: 10 }, () => grey(0))));
    expect(image.bytes).toEqual([0xff, 0x03]); // padding bits stay clear
  });

  it('rows do not share bytes: a 2x2 image is two bytes', () => {
    const image = rgbaToXbm({
      width: 2,
      height: 2,
      rgba: new Uint8Array([...grey(0), ...grey(255), ...grey(255), ...grey(0)]),
    });
    expect(image.bytes).toEqual([0b01, 0b10]);
  });
});

describe('rgbaToXbm — dither (Floyd-Steinberg, one rounding rule)', () => {
  it('two mid-greys in a row: the second takes the first one\'s error', () => {
    // Threshold 128, Y = 128, 128.
    // (0,0): adjusted 128 is not < 128 -> quantise to 255, clear. e = 128-255 = -127.
    //        right share = trunc(7*-127/16) = trunc(-55.56) = -55.
    // (1,0): adjusted 128-55 = 73 < 128 -> quantise to 0, set.
    // Row bits: x=0 clear, x=1 set -> 0b10.
    expect(rgbaToXbm(row(grey(128), grey(128)), { mode: 'dither' }).bytes).toEqual([0b10]);
  });

  it('a 2x2 mid-grey block, every share worked out', () => {
    // All Y = 128, threshold 128, e = adjusted - quantised.
    // (0,0): adj 128 -> q 255, clear, e = -127.
    //        right = trunc(-889/16 = -55.56) = -55; below-left (off image, dropped);
    //        below = trunc(-635/16 = -39.69) = -39; below-right = e - the three
    //        = -127 - (-55) - (trunc(-381/16 = -23.8) = -23) - (-39) = -10.
    // (1,0): adj 128-55 = 73 -> q 0, set, e = 73.
    //        right dropped; below-left (0,1) = trunc(219/16 = 13.69) = 13;
    //        below (1,1) = trunc(365/16 = 22.8) = 22; below-right dropped.
    // (0,1): adj 128-39+13 = 102 -> q 0, set, e = 102.
    //        right (1,1) = trunc(714/16 = 44.6) = 44.
    // (1,1): adj 128+22-10+44 = 184 -> q 255, clear.
    // Row 0: x=1 set -> 0b10. Row 1: x=0 set -> 0b01.
    const image = rgbaToXbm(
      { width: 2, height: 2, rgba: new Uint8Array([...grey(128), ...grey(128), ...grey(128), ...grey(128)]) },
      { mode: 'dither' },
    );
    expect(image.bytes).toEqual([0b10, 0b01]);
  });

  it('the four shares sum to the error, so a uniform grey keeps its average darkness', () => {
    // A 16x16 field of Y=64 at threshold 128. Error is neither created nor lost,
    // so the fraction of set (dark) pixels tracks the darkness of the grey:
    // (255-64)/255 = 74.9%, about 192 of 256, within a few pixels of rounding.
    const width = 16;
    const rgba = new Uint8Array(width * width * 4);
    for (let i = 0; i < width * width; i += 1) {
      rgba.set(grey(64), i * 4);
    }
    const { bytes } = rgbaToXbm({ width, height: width, rgba }, { mode: 'dither' });
    const set = bytes.reduce((n, b) => n + b.toString(2).split('1').length - 1, 0);
    expect(set).toBeGreaterThan(180);
    expect(set).toBeLessThan(204);
  });

  it('clamps the adjusted value to 0..255 before quantising', () => {
    // Pure black then white: the black pixel's error is 0-0 = 0; nothing leaks.
    expect(rgbaToXbm(row(grey(0), grey(255)), { mode: 'dither' }).bytes).toEqual([0b01]);
  });

  it('is deterministic: the same pixels give the same bytes', () => {
    const rgba = new Uint8Array(20 * 5 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7919) % 256));
    const a = rgbaToXbm({ width: 20, height: 5, rgba }, { mode: 'dither', threshold: 100 });
    const b = rgbaToXbm({ width: 20, height: 5, rgba }, { mode: 'dither', threshold: 100 });
    expect(a).toEqual(b);
  });

  it('mode threshold is the default and ignores neighbours', () => {
    const pixels = row(grey(128), grey(128), grey(128));
    expect(rgbaToXbm(pixels, { mode: 'threshold' })).toEqual(rgbaToXbm(pixels));
    expect(rgbaToXbm(pixels).bytes).toEqual([0]); // none is < 128
  });
});

describe('convertPng — a PNG through the whole conversion', () => {
  it('decodes and converts at the PNG\'s own size', async () => {
    // An RGBA 3x1: opaque black, opaque white, fully transparent.
    const png = buildPng({
      width: 3,
      height: 1,
      colourType: 6,
      depth: 8,
      samples: [0, 0, 0, 255, 255, 255, 255, 255, 9, 9, 9, 0],
    });
    const result = await convertPng(new Uint8Array(png));
    expect(result).toEqual({ width: 3, height: 1, bytes: [0b001] });
  });

  it('carries a decode refusal through as its reason', async () => {
    const result = await convertPng(new Uint8Array([1, 2, 3]));
    expect(result).toEqual({ reason: 'it is not a PNG file (bad signature)' });
  });
});
