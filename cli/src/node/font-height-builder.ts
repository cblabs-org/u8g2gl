/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/font-height-builder.ts
 * Purpose: Reads each bundled U8G2 font's pixel height from U8G2's own font
 *          data, so the designer can show it beside a `<builtin>` font as it
 *          does beside a compiled `<bdf>` one. A built-in font's glyphs live in
 *          the editor Wasm and the firmware, never in the page, so without this
 *          table the page has no way to know how tall the font draws.
 * Description: Every font in `u8g2_fonts.c` is a C string literal whose first
 *              bytes are U8G2's font header. Byte 10 is `max_char_height`, the
 *              height of the font's glyph bounding box in pixels — the same
 *              byte the designer reads from a compiled `<bdf>` font
 *              (`bdfconv` writes the same format). The literal is decoded as C
 *              does (octal escapes of up to three digits, `\x` hex escapes, the
 *              single-character escapes, adjacent literals concatenated) only as
 *              far as the header.
 *
 * Exports:
 * - FONT_HEIGHT_BYTE:        The header byte that holds the height
 * - decodeCStringPrefix():   The first bytes of a C string literal sequence
 * - parseFontHeights():      Each font's height, in the order given
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** U8G2's font header: byte 10 is `max_char_height` (u8g2_font.c, `u8g2_read_font_info`). */
export const FONT_HEIGHT_BYTE = 10;

/** The single-character escapes of C, by the letter after the backslash. */
const SIMPLE_ESCAPES: Readonly<Record<string, number>> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, "'": 39, '"': 34, '?': 63 };

/**
 * @brief Decodes the first `count` bytes of a sequence of adjacent C string
 *        literals, as written in a C source file.
 *
 * @param source The text from the first `"` on; anything between literals
 *               (spaces, line breaks) is skipped, and decoding stops at a `;`.
 * @param count  How many bytes are wanted.
 * @return The bytes, fewer than `count` if the literals end first.
 */
export function decodeCStringPrefix(source: string, count: number): number[] {
  const bytes: number[] = [];
  let i = 0;
  let inside = false;
  while (i < source.length && bytes.length < count) {
    const ch = source[i] ?? '';
    // --- Step 1: Between literals: skip to the next quote, or stop at the end of the statement ---
    if (!inside) {
      if (ch === ';') break;
      if (ch === '"') inside = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inside = false;
      i += 1;
      continue;
    }
    // --- Step 2: A plain character is its own byte (the file is read as Latin-1) ---
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0) & 0xff);
      i += 1;
      continue;
    }
    // --- Step 3: An escape: octal (greedy, up to three digits), hex, or one character ---
    const next = source[i + 1] ?? '';
    if (/[0-7]/.test(next)) {
      const digits = /^[0-7]{1,3}/.exec(source.slice(i + 1))?.[0] ?? '0';
      bytes.push(parseInt(digits, 8) & 0xff);
      i += 1 + digits.length;
    } else if (next === 'x') {
      const digits = /^[0-9A-Fa-f]+/.exec(source.slice(i + 2))?.[0] ?? '0';
      bytes.push(parseInt(digits, 16) & 0xff);
      i += 2 + digits.length;
    } else {
      bytes.push(SIMPLE_ESCAPES[next] ?? next.charCodeAt(0));
      i += 2;
    }
  }
  return bytes;
}

/**
 * @brief Each font's pixel height, from its header in `u8g2_fonts.c`.
 *
 * @param clibDir The directory holding U8G2's C sources (`resolveU8g2Layout().clibDir`).
 * @param fonts   The font symbols, as `parseFontSymbols` lists them.
 * @return `{ name: height }`, keys in the order of `fonts`.
 * @throws Error if a font has no definition or its header is shorter than the
 *         height byte — a build-script precondition, not a user diagnostic.
 */
export function parseFontHeights(clibDir: string, fonts: readonly string[]): Record<string, number> {
  const source = readFileSync(join(clibDir, 'u8g2_fonts.c'), 'latin1');
  // --- Step 1: Where each definition's literal begins ---
  const starts = new Map<string, number>();
  for (const match of source.matchAll(/^const uint8_t (u8g2_font_[A-Za-z0-9_]+)\[\d+\] U8(?:G2|X8)_FONT_SECTION\([^)]*\) =/gm)) {
    if (match[1] !== undefined) starts.set(match[1], (match.index ?? 0) + match[0].length);
  }

  // --- Step 2: Each font's header byte ---
  const heights: Record<string, number> = {};
  for (const font of fonts) {
    const start = starts.get(font);
    if (start === undefined) throw new Error(`u8g2_fonts.c has no definition of ${font}.`);
    const header = decodeCStringPrefix(source.slice(start, start + 400), FONT_HEIGHT_BYTE + 1);
    const height = header[FONT_HEIGHT_BYTE];
    if (height === undefined) throw new Error(`${font}'s data is shorter than its font header.`);
    heights[font] = height;
  }
  return heights;
}
