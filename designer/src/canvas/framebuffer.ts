/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/canvas/framebuffer.ts
 * Purpose: Converts the 1-bit frame the editor Wasm draws into the RGBA pixels
 *          a `<canvas>` takes. It is the last step before the blit, runs every
 *          frame, and must agree with U8G2 about where each pixel is, or the
 *          canvas would show a frame the display never would.
 * Description: U8G2's full buffer is tile rows: the byte for pixel (x, y) is
 *              `x + (y >> 3) * width`, and the pixel is bit `y & 7` of it,
 *              least significant at the top. Pixels are written as packed
 *              32-bit words into a reused buffer, so a frame allocates nothing.
 *
 * Exports:
 * - LIT, UNLIT:      The two colours, as little-endian RGBA words
 * - blitFrame():     A U8G2 buffer into an RGBA word buffer
 * - countLit():      How many pixels a U8G2 buffer lights
 */

/** A lit pixel: the pale amber of a common OLED, as ABGR for a little-endian word. */
export const LIT = 0xff4fd8ff;
/** An unlit pixel: near black. */
export const UNLIT = 0xff141414;

/**
 * @brief Writes a U8G2 tile buffer into RGBA pixels.
 *
 * @param buffer U8G2's buffer: `width * ceil(height / 8)` bytes.
 * @param width  Display width in pixels.
 * @param height Display height in pixels.
 * @param pixels `width * height` words over the ImageData's bytes.
 */
export function blitFrame(buffer: Uint8Array, width: number, height: number, pixels: Uint32Array): void {
  for (let y = 0; y < height; y++) {
    const row = (y >> 3) * width;
    const bit = 1 << (y & 7);
    const out = y * width;
    for (let x = 0; x < width; x++) {
      pixels[out + x] = (buffer[row + x] ?? 0) & bit ? LIT : UNLIT;
    }
  }
}

/** @brief The number of set bits in a U8G2 buffer: the frame's lit pixels. */
export function countLit(buffer: Uint8Array): number {
  let lit = 0;
  for (const byte of buffer) {
    for (let b = byte; b !== 0; b &= b - 1) {
      lit++;
    }
  }
  return lit;
}
