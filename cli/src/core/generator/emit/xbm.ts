/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/xbm.ts
 * Purpose: Reads an `.xbm` asset's dimensions and bytes out of the file's text
 *          (§14.2). An XBM file is already C — a pair of `#define`s and a byte
 *          array — so this is a parse rather than a conversion, and it is the
 *          reason `<xbm>` needs no tooling while `<convert>` needs a PNG decoder
 *          and is refused until PR-04b.
 * Description: Kept apart from the images emitter, and kept **pure**, for two
 *              reasons: `src/core/` may not read files (typescript.md §1), so
 *              the text arrives from `src/node/`; and a malformed asset must
 *              become a diagnostic rather than a thrown error, because it is a
 *              defect in the author's project rather than in the generator.
 *
 *              The parse is deliberately narrow. It reads `<name>_width` and
 *              `<name>_height` by suffix rather than by the declared image name,
 *              because an XBM's internal identifiers come from whatever filename
 *              the exporting tool saw and rarely match the name the project gave
 *              it. Byte values are accepted in hex, octal or decimal — GIMP,
 *              ImageMagick and `bdfconv` do not agree on which they write.
 *
 * Exports:
 * - XbmImage:      One parsed XBM: its dimensions and bytes
 * - XbmParseError: Why an `.xbm` file could not be read
 * - parseXbm():    Parse an `.xbm` file's text
 */

/** One parsed XBM asset (§14.2). */
export interface XbmImage {
  /** Width in pixels, from the file's `_width` define. */
  readonly width: number;
  /** Height in pixels, from the file's `_height` define. */
  readonly height: number;
  /**
   * The bitmap bytes in file order, each 0..255. XBM packs each row into
   * `ceil(width / 8)` bytes, least-significant bit leftmost, which is exactly
   * what U8G2's `drawXBMP` expects — so the bytes are emitted unchanged.
   */
  readonly bytes: readonly number[];
}

/** Why an `.xbm` file could not be parsed. Prose for a diagnostic's message. */
export interface XbmParseError {
  readonly reason: string;
}

/** A `#define <anything>_width 16` line. */
const WIDTH_DEFINE = /#define\s+\w*_width\s+(\d+)/;
const HEIGHT_DEFINE = /#define\s+\w*_height\s+(\d+)/;

/** The byte array's braces. XBM declares exactly one array. */
const ARRAY_BODY = /\{([^}]*)\}/;

/** One byte: hex, octal or decimal, as the various exporters write them. */
const BYTE_LITERAL = /^(?:0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)$/;

/**
 * @brief Parses an `.xbm` file's text (§14.2).
 *
 * @param text The file's contents.
 * @return The image, or the reason it could not be read. Never throws: a
 *         malformed asset is the author's defect and becomes a diagnostic.
 */
export function parseXbm(text: string): XbmImage | XbmParseError {
  // --- Step 1: The dimensions ---
  const width = WIDTH_DEFINE.exec(text)?.[1];
  const height = HEIGHT_DEFINE.exec(text)?.[1];
  if (width === undefined || height === undefined) {
    return {
      reason:
        "it declares no '#define ..._width' and '#define ..._height' pair, which every XBM file has",
    };
  }

  // --- Step 2: The byte array ---
  const body = ARRAY_BODY.exec(text)?.[1];
  if (body === undefined) {
    return { reason: 'it holds no { ... } byte array' };
  }

  // --- Step 3: Each byte, in file order ---
  const bytes: number[] = [];
  for (const raw of body.split(',')) {
    const literal = raw.trim();
    if (literal === '') {
      continue; // A trailing comma, which most exporters write.
    }
    if (!BYTE_LITERAL.test(literal)) {
      return { reason: `'${literal}' in its byte array is not an integer literal` };
    }
    // `0x..` hex, `0..` octal and plain decimal all parse from the same call,
    // because Number() applies C's own prefix rules — except for octal, which it
    // reads as decimal, so that case is converted explicitly.
    const value = /^0[0-7]+$/.test(literal) ? Number.parseInt(literal, 8) : Number(literal);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return { reason: `'${literal}' in its byte array is not a byte (0..255)` };
    }
    bytes.push(value);
  }

  // --- Step 4: The array must match the dimensions ---
  // Checked rather than trusted: a truncated asset would otherwise be emitted
  // as a short array, and `drawXBMP` would read past its end on the device.
  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const expected = Math.ceil(parsedWidth / 8) * parsedHeight;
  if (bytes.length !== expected) {
    return {
      reason:
        `it declares ${parsedWidth}x${parsedHeight}, which needs ${expected} bytes ` +
        `(ceil(width / 8) * height), but its array holds ${bytes.length}`,
    };
  }

  return { width: parsedWidth, height: parsedHeight, bytes };
}
