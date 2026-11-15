/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/font-samples.ts
 * Purpose: Gives the font picker a rendered sample of every built-in U8G2
 *          font without putting them in the page every session loads. The
 *          editor Wasm links only the fonts a project declares, so it cannot
 *          draw one the author has not chosen yet; the samples are drawn by
 *          U8G2 itself when the catalogue is built (`u8g2-font-samples.json`,
 *          about 1.2 MB) and fetched here the first time a picker opens.
 * Description: A dynamic `import()` of the JSON, which Vite emits as a chunk of
 *              its own beside the bundle. The design server already serves
 *              every file of the built designer, so this needs no new route,
 *              and the static designer works the same way. The promise is
 *              shared, so every picker in a session waits on one fetch. A
 *              sample's bits are row-major, one bit per pixel, most
 *              significant bit first (tools/font-samples/font_samples.cpp).
 *
 * Exports:
 * - FontSample:          One font's sample: width, height and base64 bits
 * - FontSamples:         Every sample, by font name
 * - loadFontSamples():   The samples, fetched on first call
 * - loadedFontSamples(): The samples if they have already arrived, without fetching
 * - samplePixel():       Whether one pixel of a decoded sample is lit
 * - decodeSampleBits():  A sample's bits as bytes
 */

/** One font's sample: `bits` is base64 of `ceil(w*h/8)` bytes. */
export interface FontSample {
  readonly w: number;
  readonly h: number;
  readonly bits: string;
}

/** Every sample, by font name. */
export type FontSamples = Readonly<Record<string, FontSample>>;

let pending: Promise<FontSamples> | undefined;
let loaded: FontSamples | undefined;

/**
 * @brief The samples, fetched the first time any caller asks.
 *
 * @return One shared promise. If the fetch fails it is forgotten, so a later
 *         call tries again rather than failing for the rest of the session.
 */
export function loadFontSamples(): Promise<FontSamples> {
  if (pending === undefined) {
    pending = import('@u8g2gl/data/u8g2-font-samples.json').then(
      (module) => {
        loaded = module.default as FontSamples;
        return loaded;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
  }
  return pending;
}

/**
 * @brief The samples if an earlier call has fetched them, else undefined.
 *
 * Lets a field show its font's sample once any picker has opened, without
 * being the thing that fetches 1.2 MB for a form that only displays a name.
 */
export function loadedFontSamples(): FontSamples | undefined {
  return loaded;
}

/** @brief A sample's bits as bytes. */
export function decodeSampleBits(sample: FontSample): Uint8Array {
  const text = atob(sample.bits);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** @brief Whether pixel (x, y) of a sample `w` wide is lit, given its decoded bits. */
export function samplePixel(bytes: Uint8Array, w: number, x: number, y: number): boolean {
  const bit = y * w + x;
  return (((bytes[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1) === 1;
}
