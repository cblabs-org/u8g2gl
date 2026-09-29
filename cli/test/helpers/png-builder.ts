/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/png-builder.ts
 * Purpose: Builds PNG files for tests, so every colour type, bit depth and
 *          scanline filter the decoder must read can be produced on demand, and
 *          so a defective file (bad CRC, truncation, an unknown chunk) can be
 *          made by editing a good one. It is a *writer* written independently of
 *          the decoder's reader: a test that used the decoder's own arithmetic
 *          to build its input would prove only that the two agree.
 * Description: `buildPng` packs samples into scanlines at the given depth,
 *              applies the requested filter to each scanline (encoder side, PNG
 *              §9.2), deflates with `node:zlib` (test code may; `src/core/`
 *              may not) and frames the chunks with CRC-32. Options let a test
 *              split the data over several `IDAT` chunks, add a palette and
 *              `tRNS`, or emit extra chunks.
 *
 * Exports:
 * - chunk():       One framed chunk
 * - buildPng():    A whole PNG file from per-pixel samples
 * - PNG_SIGNATURE: The eight signature bytes
 * - PngSpec:       What buildPng takes
 */

import { deflateSync } from 'node:zlib';

/** The eight bytes every PNG opens with. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @brief One framed chunk: length, type, data, CRC.
 *
 * @param type Four-letter chunk type.
 * @param data The chunk's data.
 */
export function chunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** What {@link buildPng} takes. */
export interface PngSpec {
  readonly width: number;
  readonly height: number;
  /** PNG colour type: 0, 2, 3, 4 or 6. */
  readonly colourType: number;
  /** Bits per sample. */
  readonly depth: number;
  /**
   * Samples, row-major, `channels` per pixel, each within the depth's range
   * (palette indices for colour type 3).
   */
  readonly samples: readonly number[];
  /** Filter type for each scanline (cycled if shorter than the height). Default 0. */
  readonly filters?: readonly number[];
  /** PLTE contents as r,g,b triples. */
  readonly palette?: readonly number[];
  /** tRNS contents, raw bytes. */
  readonly transparency?: readonly number[];
  /** Split the deflated data into this many IDAT chunks (default 1). */
  readonly idatParts?: number;
  /** IHDR interlace method (default 0). */
  readonly interlace?: number;
  /** Chunks to insert after IHDR, already framed. */
  readonly extraChunks?: readonly Buffer[];
  /** zlib compression level (default: zlib's own). Level 0 is byte-stable across zlib versions. */
  readonly level?: number;
  /** Omit the IEND chunk (a truncated file). */
  readonly omitIend?: boolean;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// packRow
// Packs one scanline's samples big-endian at the depth, padding the last byte.
function packRow(samples: readonly number[], depth: number): Buffer {
  const bits = samples.length * depth;
  const out = Buffer.alloc(Math.ceil(bits / 8));
  samples.forEach((sample, index) => {
    if (depth === 16) {
      out.writeUInt16BE(sample, index * 2);
    } else if (depth === 8) {
      out[index] = sample;
    } else {
      const bit = index * depth;
      out[bit >> 3] = (out[bit >> 3] as number) | (sample << (8 - depth - (bit & 7)));
    }
  });
  return out;
}

// paeth
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// filterRow
// Applies filter `type` to one packed row given the previous packed row (PNG §9.2).
function filterRow(type: number, row: Buffer, previous: Buffer, bpp: number): Buffer {
  const out = Buffer.alloc(row.length + 1);
  out[0] = type;
  for (let i = 0; i < row.length; i += 1) {
    const x = row[i] as number;
    const a = i >= bpp ? (row[i - bpp] as number) : 0;
    const b = previous[i] as number;
    const c = i >= bpp ? (previous[i - bpp] as number) : 0;
    const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][type];
    if (predicted === undefined) {
      out[i + 1] = x; // An unknown type is written as given; the row keeps its raw bytes.
    } else {
      out[i + 1] = (x - predicted) & 0xff;
    }
  }
  return out;
}

/**
 * @brief Builds a PNG file.
 *
 * @param spec Dimensions, colour type, depth, samples and options.
 * @return The file's bytes.
 */
export function buildPng(spec: PngSpec): Buffer {
  const channels = CHANNELS[spec.colourType] as number;
  const bpp = Math.max(1, (channels * spec.depth) >> 3);
  const perRow = spec.width * channels;

  // --- Step 1: Scanlines, filtered ---
  const rows: Buffer[] = [];
  let previous: Buffer = Buffer.alloc(Math.ceil((perRow * spec.depth) / 8));
  for (let y = 0; y < spec.height; y += 1) {
    const raw = packRow(spec.samples.slice(y * perRow, (y + 1) * perRow), spec.depth);
    const filters = spec.filters ?? [0];
    rows.push(filterRow(filters[y % filters.length] as number, raw, previous, bpp));
    previous = raw;
  }
  const deflated = deflateSync(Buffer.concat(rows), spec.level === undefined ? {} : { level: spec.level });

  // --- Step 2: Chunks ---
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(spec.width, 0);
  ihdr.writeUInt32BE(spec.height, 4);
  ihdr[8] = spec.depth;
  ihdr[9] = spec.colourType;
  ihdr[12] = spec.interlace ?? 0;
  const parts = spec.idatParts ?? 1;
  const size = Math.ceil(deflated.length / parts);
  const idats: Buffer[] = [];
  for (let i = 0; i < parts; i += 1) {
    idats.push(chunk('IDAT', deflated.subarray(i * size, (i + 1) * size)));
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    ...(spec.extraChunks ?? []),
    ...(spec.palette !== undefined ? [chunk('PLTE', Buffer.from(spec.palette))] : []),
    ...(spec.transparency !== undefined ? [chunk('tRNS', Buffer.from(spec.transparency))] : []),
    ...idats,
    ...(spec.omitIend === true ? [] : [chunk('IEND')]),
  ]);
}
