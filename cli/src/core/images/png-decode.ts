/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/images/png-decode.ts
 * Purpose: Turns the bytes of a PNG file into 8-bit RGBA pixels, so that
 *          `<convert>` (§14.2) can reduce an author's artwork to a 1-bit XBM at
 *          build time. It exists because the generator ships with no image
 *          library: the PNG format is small enough to decode from its
 *          specification (W3C, PNG Third Edition), and a dependency here would
 *          have to run identically in Node and in the designer's browser.
 * Description: Reads the chunk stream (checking every CRC), collects `IHDR`,
 *              `PLTE`, `tRNS` and the `IDAT` run, inflates the run with the
 *              platform's `DecompressionStream('deflate')` (a zlib stream, which
 *              is what PNG's compression method 0 is), reverses the five scanline
 *              filters, and expands every colour type and bit depth to RGBA8.
 *
 *              **Pure and non-throwing for the author's defects.** A file that
 *              is not a PNG, is corrupt, is truncated, uses an unknown critical
 *              chunk or is interlaced is the *author's* problem, so it is
 *              returned as a reason string, never thrown. Adam7 interlacing is
 *              refused rather than decoded: an icon is small, "save it
 *              non-interlaced" costs the author nothing, and supporting a
 *              second pixel order would be code no build needs (§1.5).
 *
 *              16-bit samples use their high byte; sub-8-bit greyscale is
 *              scaled exactly (`v * 255 / (2^depth - 1)`, an integer for depths
 *              1, 2 and 4). The `tRNS` colour key of greyscale and RGB images is
 *              compared at the image's own bit depth, as the specification says.
 *              A decompressed size larger than the header implies is refused
 *              while it is being read, so a hostile file cannot inflate without
 *              bound.
 *
 * Exports:
 * - DecodedPng:    Width, height and RGBA8 pixels
 * - PngDecodeError: Why a file could not be decoded
 * - decodePng():   Decode PNG bytes
 */

/** A decoded PNG. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes: R, G, B, A per pixel, row-major, unassociated alpha. */
  readonly rgba: Uint8Array;
}

/** Why a PNG could not be decoded. Prose for a diagnostic's message. */
export interface PngDecodeError {
  readonly reason: string;
}

/** The eight bytes every PNG file opens with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Colour types (PNG §11.2.2). */
const GREYSCALE = 0;
const TRUECOLOUR = 2;
const INDEXED = 3;
const GREYSCALE_ALPHA = 4;
const TRUECOLOUR_ALPHA = 6;

/** The bit depths each colour type allows (PNG Table 8). */
const ALLOWED_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  [GREYSCALE]: [1, 2, 4, 8, 16],
  [TRUECOLOUR]: [8, 16],
  [INDEXED]: [1, 2, 4, 8],
  [GREYSCALE_ALPHA]: [8, 16],
  [TRUECOLOUR_ALPHA]: [8, 16],
};

/** Samples per pixel for each colour type. */
const CHANNELS: Readonly<Record<number, number>> = {
  [GREYSCALE]: 1,
  [TRUECOLOUR]: 3,
  [INDEXED]: 1,
  [GREYSCALE_ALPHA]: 2,
  [TRUECOLOUR_ALPHA]: 4,
};

/**
 * The largest decompressed image data accepted, in bytes. A 1-bit icon is a few
 * hundred bytes; this bounds a corrupt or hostile header without limiting any
 * artwork a 128x64-class display could use.
 */
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

/** The parsed `IHDR`. */
interface Header {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colourType: number;
}

/** The chunks a decode needs, gathered in one pass. */
interface Chunks {
  header: Header;
  palette: Uint8Array | undefined;
  transparency: Uint8Array | undefined;
  data: Uint8Array[];
}

// The CRC-32 table (PNG Annex D), built once.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

// crc32
// The PNG CRC of bytes[start, end): CRC-32/ISO-HDLC, over chunk type and data.
//   bytes — the whole file
//   start — first byte covered
//   end   — one past the last byte covered
function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// readU32
// A big-endian unsigned 32-bit integer.
//   bytes  — the buffer
//   offset — position of the first byte; the caller has checked the bounds
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

// chunkName
// The four-letter chunk type at a position, as text.
function chunkName(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

// parseHeader
// Validates the 13 bytes of IHDR (PNG §11.2.2).
//   data — the chunk's data
function parseHeader(data: Uint8Array): Header | PngDecodeError {
  if (data.length !== 13) {
    return { reason: 'its IHDR chunk is not 13 bytes long' };
  }
  const width = readU32(data, 0);
  const height = readU32(data, 4);
  const depth = data[8] ?? 0;
  const colourType = data[9] ?? 0;
  if (width === 0 || height === 0) {
    return { reason: 'it has zero width or height' };
  }
  if (width > 0x7fffffff || height > 0x7fffffff) {
    return { reason: 'its width or height exceeds the PNG limit of 2^31-1' };
  }
  const depths = ALLOWED_DEPTHS[colourType];
  if (depths === undefined) {
    return { reason: `it has an invalid colour type (${colourType})` };
  }
  if (!depths.includes(depth)) {
    return { reason: `bit depth ${depth} is not allowed for colour type ${colourType}` };
  }
  if ((data[10] ?? 0) !== 0) {
    return { reason: 'it uses an unknown compression method' };
  }
  if ((data[11] ?? 0) !== 0) {
    return { reason: 'it uses an unknown filter method' };
  }
  const interlace = data[12] ?? 0;
  if (interlace === 1) {
    return { reason: 'it is Adam7 interlaced, which is not supported; save it non-interlaced' };
  }
  if (interlace !== 0) {
    return { reason: 'it has an invalid interlace method' };
  }
  return { width, height, depth, colourType };
}

// readChunks
// Walks the chunk stream: signature, then chunks until IEND, each length and
// CRC checked. Ancillary chunks other than tRNS are skipped; an unknown
// *critical* chunk (type's first letter upper case) is refused, because it may
// change how the pixels are to be read (PNG §5.4).
//   bytes — the whole file
function readChunks(bytes: Uint8Array): Chunks | PngDecodeError {
  // --- Step 1: The signature ---
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    return { reason: 'it is not a PNG file (bad signature)' };
  }

  let header: Header | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  let sawEnd = false;
  let offset = PNG_SIGNATURE.length;

  // --- Step 2: Each chunk: length, type, data, CRC ---
  while (!sawEnd) {
    if (offset + 12 > bytes.length) {
      return { reason: 'it is truncated (a chunk is cut short or IEND is missing)' };
    }
    const length = readU32(bytes, offset);
    const type = chunkName(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length > 0x7fffffff || dataEnd + 4 > bytes.length) {
      return { reason: `it is truncated (the ${type} chunk is cut short)` };
    }
    if (crc32(bytes, offset + 4, dataEnd) !== readU32(bytes, dataEnd)) {
      return { reason: `its ${type} chunk fails its CRC check (the file is corrupt)` };
    }
    const chunk = bytes.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (header === undefined && type !== 'IHDR') {
      return { reason: 'its first chunk is not IHDR' };
    }
    switch (type) {
      case 'IHDR': {
        if (header !== undefined) {
          return { reason: 'it has more than one IHDR chunk' };
        }
        const parsed = parseHeader(chunk);
        if ('reason' in parsed) {
          return parsed;
        }
        header = parsed;
        break;
      }
      case 'PLTE':
        palette = chunk;
        break;
      case 'tRNS':
        transparency = chunk;
        break;
      case 'IDAT':
        data.push(chunk);
        break;
      case 'IEND':
        sawEnd = true;
        break;
      default: {
        const critical = ((type.charCodeAt(0) >> 5) & 1) === 0;
        if (critical) {
          return { reason: `it contains the unknown critical chunk '${type}'` };
        }
      }
    }
  }

  if (header === undefined) {
    return { reason: 'its first chunk is not IHDR' };
  }
  if (data.length === 0) {
    return { reason: 'it has no image data (no IDAT chunk)' };
  }
  return { header, palette, transparency, data };
}

// inflate
// Decompresses the concatenated IDAT payload (a zlib stream) with the
// platform's DecompressionStream, refusing to produce more than `limit` bytes.
// Node >= 18 and every browser provide the global; nothing is imported.
//   compressed — the IDAT payloads, concatenated
//   expected   — the size the header implies; more than this is corrupt
async function inflate(compressed: Uint8Array, expected: number): Promise<Uint8Array | PngDecodeError> {
  const stream = new DecompressionStream('deflate');
  // Written without awaiting: the readable side only drains once someone reads
  // it, so awaiting the write first would deadlock on a large payload. A
  // corrupt stream rejects both sides; the read loop below reports it, so the
  // write's own rejection is deliberately swallowed.
  const writer = stream.writable.getWriter();
  writer.write(compressed as Uint8Array<ArrayBuffer>).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const out = new Uint8Array(expected);
  let filled = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (filled + value.length > expected) {
        await reader.cancel();
        return { reason: 'its image data is longer than its header implies (the file is corrupt)' };
      }
      out.set(value, filled);
      filled += value.length;
    }
  } catch {
    return { reason: 'its image data cannot be decompressed (the file is corrupt or truncated)' };
  }
  if (filled !== expected) {
    return { reason: 'its image data is shorter than its header implies (the file is truncated)' };
  }
  return out;
}

// paeth
// The Paeth predictor (PNG §9.4).
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

// unfilter
// Reverses the per-scanline filters in place and returns the packed scanlines,
// filter bytes removed (PNG §9).
//   raw     — height * (1 + stride) bytes: a filter byte then the scanline
//   stride  — bytes in one scanline
//   bpp     — bytes per complete pixel, at least 1 (the filters' "left" distance)
//   height  — scanline count
function unfilter(raw: Uint8Array, stride: number, bpp: number, height: number): Uint8Array | PngDecodeError {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i] ?? 0;
      const left = i >= bpp ? (out[dst + i - bpp] ?? 0) : 0;
      const above = y > 0 ? (out[up + i] ?? 0) : 0;
      const aboveLeft = y > 0 && i >= bpp ? (out[up + i - bpp] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + left;
          break;
        case 2:
          value = x + above;
          break;
        case 3:
          value = x + ((left + above) >> 1);
          break;
        case 4:
          value = x + paeth(left, above, aboveLeft);
          break;
        default:
          return { reason: `scanline ${y} uses the unknown filter type ${filter}` };
      }
      out[dst + i] = value & 0xff;
    }
  }
  return out;
}

// sampleAt
// The `index`-th sample of a scanline at `depth` bits, as its full-precision
// value (16-bit samples are two bytes, big-endian).
//   line  — the packed scanlines
//   base  — offset of this scanline
//   index — sample number within the scanline
//   depth — bits per sample
function sampleAt(line: Uint8Array, base: number, index: number, depth: number): number {
  if (depth === 8) {
    return line[base + index] ?? 0;
  }
  if (depth === 16) {
    return ((line[base + index * 2] ?? 0) << 8) | (line[base + index * 2 + 1] ?? 0);
  }
  const bit = index * depth;
  const byte = line[base + (bit >> 3)] ?? 0;
  const shift = 8 - depth - (bit & 7);
  return (byte >> shift) & ((1 << depth) - 1);
}

// to8
// A sample reduced to 0..255: 16-bit uses its high byte; sub-8-bit greyscale is
// scaled exactly (255 is divisible by 1, 3 and 15).
//   value — the sample
//   depth — its bit depth
function to8(value: number, depth: number): number {
  if (depth === 16) {
    return value >> 8;
  }
  if (depth === 8) {
    return value;
  }
  return Math.trunc((value * 255) / ((1 << depth) - 1));
}

/**
 * @brief Decodes a PNG file to RGBA8 pixels.
 *
 * Asynchronous only because decompression is (`DecompressionStream`).
 *
 * @param bytes The file's bytes.
 * @return The pixels, or the reason the file is refused: not a PNG, corrupt,
 *         truncated, an unknown critical chunk, interlaced, or zero-sized.
 *         Never throws for a defect in the file.
 */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng | PngDecodeError> {
  // --- Step 1: The chunks ---
  const chunks = readChunks(bytes);
  if ('reason' in chunks) {
    return chunks;
  }
  const { header, palette, transparency } = chunks;
  const { width, height, depth, colourType } = header;
  const channels = CHANNELS[colourType] ?? 1;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const expected = height * (stride + 1);
  if (expected > MAX_IMAGE_BYTES) {
    return { reason: `its ${width}x${height} pixels are too many to convert` };
  }
  if (colourType === INDEXED) {
    if (palette === undefined) {
      return { reason: 'it is a palette image with no PLTE chunk' };
    }
    if (palette.length % 3 !== 0 || palette.length === 0 || palette.length / 3 > 1 << depth) {
      return { reason: 'its PLTE chunk is not a valid palette' };
    }
    if (transparency !== undefined && transparency.length > palette.length / 3) {
      return { reason: 'its tRNS chunk has more entries than its palette' };
    }
  }

  // --- Step 2: Inflate the concatenated IDAT payload ---
  let total = 0;
  for (const part of chunks.data) {
    total += part.length;
  }
  const compressed = new Uint8Array(total);
  let at = 0;
  for (const part of chunks.data) {
    compressed.set(part, at);
    at += part.length;
  }
  const raw = await inflate(compressed, expected);
  if ('reason' in raw) {
    return raw;
  }

  // --- Step 3: Reverse the scanline filters ---
  const lines = unfilter(raw, stride, Math.max(1, bitsPerPixel >> 3), height);
  if ('reason' in lines) {
    return lines;
  }

  // --- Step 4: Expand every pixel to RGBA8 ---
  // A greyscale or RGB colour key (tRNS) is compared at the image's own depth.
  const keyOf = (index: number): number | undefined =>
    transparency !== undefined && transparency.length >= index * 2 + 2
      ? ((transparency[index * 2] ?? 0) << 8) | (transparency[index * 2 + 1] ?? 0)
      : undefined;
  const greyKey = colourType === GREYSCALE ? keyOf(0) : undefined;
  const rgbKey =
    colourType === TRUECOLOUR && transparency !== undefined && transparency.length >= 6
      ? [keyOf(0), keyOf(1), keyOf(2)]
      : undefined;

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const base = y * stride;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      let a = 255;
      switch (colourType) {
        case GREYSCALE: {
          const v = sampleAt(lines, base, x, depth);
          r = g = b = to8(v, depth);
          if (greyKey !== undefined && v === greyKey) {
            a = 0;
          }
          break;
        }
        case TRUECOLOUR: {
          const vr = sampleAt(lines, base, x * 3, depth);
          const vg = sampleAt(lines, base, x * 3 + 1, depth);
          const vb = sampleAt(lines, base, x * 3 + 2, depth);
          r = to8(vr, depth);
          g = to8(vg, depth);
          b = to8(vb, depth);
          if (rgbKey !== undefined && vr === rgbKey[0] && vg === rgbKey[1] && vb === rgbKey[2]) {
            a = 0;
          }
          break;
        }
        case INDEXED: {
          const index = sampleAt(lines, base, x, depth);
          if (palette === undefined || index * 3 + 2 >= palette.length) {
            return { reason: `pixel (${x}, ${y}) names palette entry ${index}, which the palette does not have` };
          }
          r = palette[index * 3] ?? 0;
          g = palette[index * 3 + 1] ?? 0;
          b = palette[index * 3 + 2] ?? 0;
          a = transparency !== undefined && index < transparency.length ? (transparency[index] ?? 255) : 255;
          break;
        }
        case GREYSCALE_ALPHA:
          r = g = b = to8(sampleAt(lines, base, x * 2, depth), depth);
          a = to8(sampleAt(lines, base, x * 2 + 1, depth), depth);
          break;
        default:
          r = to8(sampleAt(lines, base, x * 4, depth), depth);
          g = to8(sampleAt(lines, base, x * 4 + 1, depth), depth);
          b = to8(sampleAt(lines, base, x * 4 + 2, depth), depth);
          a = to8(sampleAt(lines, base, x * 4 + 3, depth), depth);
          break;
      }
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return { width, height, rgba };
}
