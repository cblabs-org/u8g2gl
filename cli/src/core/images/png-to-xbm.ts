/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/images/png-to-xbm.ts
 * Purpose: The `<convert>` conversion (§14.2): a PNG in, the same `XbmImage` an
 *          `<xbm>` parses to out, so a converted image and a hand-exported one
 *          are indistinguishable to the emitter, the budget and the editor.
 * Description: Two stages over the decoder's RGBA8 pixels, all in integer
 *              arithmetic so the bytes are identical in Node and in a browser
 *              and on every platform (§13.9):
 *
 *              1. **Grey.** Alpha is composited over white per channel,
 *                 `c' = (c*a + 255*(255-a) + 127) / 255`, then luminance is
 *                 Rec. 601, `Y = (299R + 587G + 114B + 500) / 1000`, both with
 *                 integer (floor) division. A grey pixel has R=G=B, for which
 *                 the luminance formula returns the grey value unchanged.
 *              2. **One bit.** A pixel with `Y < threshold` *sets* its bit
 *                 (drawn in the foreground colour), so dark artwork on a
 *                 transparent or white background draws the shape. `threshold`
 *                 is 128 unless given. In `dither` mode the same test is the
 *                 quantiser inside Floyd-Steinberg error diffusion, left to
 *                 right and top to bottom (no serpentine).
 *
 *              **Dither rounding rule (one, exactly).** For a pixel whose
 *              clamped adjusted value is `v` and quantised value `q` (0 when
 *              `v < threshold`, else 255), the error is `e = v - q`. The right,
 *              below-left and below neighbours receive `trunc(7e/16)`,
 *              `trunc(3e/16)` and `trunc(5e/16)` (`Math.trunc`, toward zero);
 *              the below-right neighbour receives the remainder
 *              `e - (those three)`, so the four shares always sum to `e` and no
 *              error is created or lost inside the image. Error that would fall
 *              outside the image is dropped.
 *
 *              Packing is XBM's: `ceil(width/8)` bytes per row, least
 *              significant bit leftmost (what `drawXBMP` reads).
 *
 * Exports:
 * - DEFAULT_THRESHOLD:  128, the cutoff when `threshold` is absent
 * - ConvertMode:        'threshold' | 'dither'
 * - ConvertOptions:     The optional `mode` and `threshold`
 * - ConvertFailure:     Why a PNG could not be converted (the decoder's error)
 * - rgbaToXbm():        The conversion over decoded pixels (pure, synchronous)
 * - convertPng():       Decode a PNG and convert it, at the PNG's own size
 */

import { decodePng, type DecodedPng, type PngDecodeError } from './png-decode.js';
import type { XbmImage } from './xbm.js';

/** The luminance cutoff when a `<convert>` declares none (§14.2). */
export const DEFAULT_THRESHOLD = 128;

/** How grey is reduced to one bit. */
export type ConvertMode = 'threshold' | 'dither';

/** What to convert with. */
export interface ConvertOptions {
  /** `threshold` (default) or `dither`. */
  readonly mode?: ConvertMode;
  /** 0..255; a pixel darker than this sets its bit. Default {@link DEFAULT_THRESHOLD}. */
  readonly threshold?: number;
}

// lumaOf
// Rec. 601 luminance of one pixel after compositing over white, integers only.
//   rgba   — the pixels
//   offset — index of the pixel's R byte
function lumaOf(rgba: Uint8Array, offset: number): number {
  const a = rgba[offset + 3] ?? 255;
  const over = (c: number): number => Math.floor((c * a + 255 * (255 - a) + 127) / 255);
  const r = over(rgba[offset] ?? 0);
  const g = over(rgba[offset + 1] ?? 0);
  const b = over(rgba[offset + 2] ?? 0);
  return Math.floor((299 * r + 587 * g + 114 * b + 500) / 1000);
}

// setBit
// Sets pixel (x, y) in XBM packing: LSB leftmost within each byte.
//   bytes  — the bitmap
//   stride — bytes per row
function setBit(bytes: number[], stride: number, x: number, y: number): void {
  const index = y * stride + (x >> 3);
  bytes[index] = (bytes[index] ?? 0) | (1 << (x & 7));
}

/**
 * @brief Reduces RGBA8 pixels to a 1-bit XBM image.
 *
 * @param pixels  Decoded pixels.
 * @param options Mode and threshold; absent means `threshold` at 128.
 * @return The image, at the pixels' own size. `threshold` is used as given
 *         (the validator has already required an integer 0..255).
 */
export function rgbaToXbm(pixels: DecodedPng, options: ConvertOptions = {}): XbmImage {
  const { width, height, rgba } = pixels;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const stride = Math.ceil(width / 8);
  const bytes: number[] = new Array<number>(stride * height).fill(0);

  // --- Step 1: Grey ---
  const grey = new Int32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) {
    grey[i] = lumaOf(rgba, i * 4);
  }

  if (options.mode !== 'dither') {
    // --- Step 2a: One bit per pixel, by the cutoff alone ---
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((grey[y * width + x] ?? 255) < threshold) {
          setBit(bytes, stride, x, y);
        }
      }
    }
    return { width, height, bytes };
  }

  // --- Step 2b: Floyd-Steinberg, left to right, top to bottom ---
  // `grey` doubles as the working buffer: each pixel is final by the time it is
  // read, and diffusion only ever writes to pixels not yet visited.
  const add = (x: number, y: number, amount: number): void => {
    if (x >= 0 && x < width && y < height) {
      grey[y * width + x] = (grey[y * width + x] ?? 0) + amount;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const adjusted = Math.min(255, Math.max(0, grey[y * width + x] ?? 0));
      const quantised = adjusted < threshold ? 0 : 255;
      if (quantised === 0) {
        setBit(bytes, stride, x, y);
      }
      const error = adjusted - quantised;
      const right = Math.trunc((7 * error) / 16);
      const belowLeft = Math.trunc((3 * error) / 16);
      const below = Math.trunc((5 * error) / 16);
      add(x + 1, y, right);
      add(x - 1, y + 1, belowLeft);
      add(x, y + 1, below);
      add(x + 1, y + 1, error - right - belowLeft - below);
    }
  }
  return { width, height, bytes };
}

/** Why a PNG could not be converted. */
export type ConvertFailure = PngDecodeError;

/**
 * @brief Decodes a PNG and converts it to XBM at the PNG's own size.
 *
 * Whether that size is the one a `<convert>` declared is the caller's check —
 * this function has no declaration to name in the message.
 *
 * @param png     The file's bytes.
 * @param options Mode and threshold.
 * @return The image, or why the file was refused. Never throws for a defect in
 *         the file.
 */
export async function convertPng(png: Uint8Array, options: ConvertOptions = {}): Promise<XbmImage | ConvertFailure> {
  const decoded = await decodePng(png);
  if ('reason' in decoded) {
    return decoded;
  }
  return rgbaToXbm(decoded, options);
}
