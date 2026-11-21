/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/builtin-fonts.ts
 * Purpose: The bytes of U8G2's built-in fonts, by name, for the designer. The
 *          editor Wasm compiles in no project font (design_spec §9): the
 *          designer injects each declared font's bytes before it applies a
 *          scene. A `<bdf>` it compiles itself; a `<builtin>` comes from here,
 *          read out of the very `u8g2_fonts.c` the package ships and the
 *          firmware links, so the canvas draws the bytes the device draws.
 *          The design server's `GET /api/font/builtin` route is its one caller.
 * Description: `parseU8g2Fonts()` reads every `const uint8_t u8g2_font_…[N]
 *              U8G2_FONT_SECTION(…) = "…" "…";` declaration and decodes its
 *              string literals as a C compiler does: U8G2's generator writes
 *              only octal escapes (`\42`) and printable characters, and the
 *              array's declared length counts the literal's terminating NUL,
 *              which a C compiler appends, so each font's bytes are the decoded
 *              literal padded with zeros to N. A declaration whose decoded
 *              literal does not fit its N is a parse failure, not a font: the
 *              compiler would have refused it too.
 *
 *              The file's `#ifdef U8G2_USE_LARGE_FONTS` blocks are read like
 *              the rest. That macro decides whether a board can link a large
 *              font; the designer always can, and the validator already warns
 *              where a target cannot (§14.1).
 *
 *              The whole file is decoded at once into one buffer, and each
 *              font is a view into it: about 14 MB for U8G2 2.36's 2,039
 *              fonts, and a fifth of a second. `BuiltinFontSource` does that on
 *              the first request, not at start-up, because most sessions never
 *              add a font, and keeps the index for the server's life.
 *
 * Exports:
 * - U8G2_FONTS_FILE:      The fonts file's path inside a framework tree
 * - BuiltinFontIndex:     Every built-in font's bytes, by name
 * - parseU8g2Fonts():     Decode a `u8g2_fonts.c`
 * - BuiltinFontSource:    A lazily parsed, kept index over one file
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `u8g2_fonts.c`'s place in a framework tree (the source tree, or the package's staged copy). */
export const U8G2_FONTS_FILE = join('extern', 'u8g2', 'csrc', 'u8g2_fonts.c');

/** Every built-in font's bytes, by its U8G2 name. */
export interface BuiltinFontIndex {
  /** Each font's exact array bytes, `N` of them; views into one shared buffer. */
  readonly fonts: ReadonlyMap<string, Uint8Array>;
  /** The decoded bytes held, all fonts together. */
  readonly totalBytes: number;
}

// One declaration's head. U8G2's own fonts are declared in U8G2_FONT_SECTION;
// its 8x8 tile fonts in U8X8_FONT_SECTION. Both are u8g2 font tables that
// `<builtin>` may name, so both are read.
const DECLARATION = /^const uint8_t (u8g2_font_\w+)\[(\d+)\] U8(?:G2|X8)_FONT_SECTION\("\w+"\) = *\r?\n/gm;

/** The backslash, double quote and semicolon, as char codes. */
const BACKSLASH = 0x5c;
const QUOTE = 0x22;
const SEMICOLON = 0x3b;

/**
 * @brief Decodes every font declared in a `u8g2_fonts.c`.
 *
 * @param source The file's bytes.
 * @return The index, in the file's order.
 * @throws Error naming the font when a declaration is not the shape U8G2's
 *         generator writes: an escape other than octal, text between literals,
 *         or a literal longer than its declared length. A packaged file that
 *         fails here is a defect in the package, not in a project.
 */
export function parseU8g2Fonts(source: Uint8Array): BuiltinFontIndex {
  // --- Step 1: Find every declaration and its declared length ---
  // latin1, so one character is one byte and offsets match the buffer.
  const text = Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('latin1');
  const found: Array<{ name: string; length: number; start: number }> = [];
  let totalBytes = 0;
  for (const match of text.matchAll(DECLARATION)) {
    const length = Number(match[2]);
    found.push({ name: match[1] ?? '', length, start: (match.index ?? 0) + match[0].length });
    totalBytes += length;
  }

  // --- Step 2: Decode each literal sequence into its slice of one buffer ---
  // Allocated zeroed, so the terminating NUL (and any padding a declared
  // length beyond the literal asks for) is already there.
  const buffer = new Uint8Array(totalBytes);
  const fonts = new Map<string, Uint8Array>();
  let offset = 0;
  for (const { name, length, start } of found) {
    const written = decodeLiterals(source, start, buffer, offset, length, name);
    if (written >= length) {
      // The compiler appends a NUL, so a literal must leave it room.
      throw new Error(`${name}: its literal is ${written} bytes, which does not fit its declared ${length}`);
    }
    fonts.set(name, buffer.subarray(offset, offset + length));
    offset += length;
  }
  return { fonts, totalBytes };
}

// decodeLiterals
// Decodes the adjacent string literals from `start` to the declaration's `;`
// into `out` at `at`, as a C compiler concatenates them, and returns how many
// bytes they made. Each literal is decoded on its own, so an octal escape can
// never run on into the next literal's first digit.
//   source — the file's bytes
//   start  — just after the declaration's `=` line
//   out    — the shared buffer
//   at     — where in it this font's bytes start
//   limit  — the declared length: no more than this is written, so a literal
//            that is too long is measured, not let overrun the next font
//   name   — the font, for an error
function decodeLiterals(source: Uint8Array, start: number, out: Uint8Array, at: number, limit: number, name: string): number {
  let i = start;
  let written = 0;
  for (;;) {
    // --- Between literals: whitespace, then another literal or the end ---
    while (i < source.length && isSpace(source[i] ?? 0)) i++;
    const next = source[i];
    if (next === SEMICOLON) return written;
    if (next !== QUOTE) throw new Error(`${name}: expected a string literal at byte ${i}`);
    i++;

    // --- One literal, to its closing quote ---
    for (;;) {
      const byte = source[i];
      if (byte === undefined) throw new Error(`${name}: the file ends inside its literal`);
      if (byte === QUOTE) break;
      let value = byte;
      if (byte === BACKSLASH) {
        // Octal: one to three digits, the only escape U8G2's generator writes.
        let digits = 0;
        value = 0;
        while (digits < 3 && isOctal(source[i + 1 + digits] ?? 0)) {
          value = value * 8 + ((source[i + 1 + digits] ?? 0) - 0x30);
          digits++;
        }
        if (digits === 0) throw new Error(`${name}: an escape other than octal at byte ${i}`);
        i += digits;
      }
      if (written < limit) out[at + written] = value;
      written++;
      i++;
    }
    i++;
  }
}

// isSpace / isOctal
// The two character classes the literal reader needs, on bytes.
function isSpace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}
function isOctal(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x37;
}

/**
 * One `u8g2_fonts.c`, parsed on the first lookup and kept. A missing file is
 * reported by `available`, never thrown, so the server can answer it.
 */
export class BuiltinFontSource {
  private readonly file: string | undefined;
  private index: BuiltinFontIndex | undefined;
  private parseMs: number | undefined;

  /**
   * @param frameworkRoot The framework tree holding `extern/u8g2`, or
   *                      undefined when this CLI has none (every lookup then
   *                      finds nothing, and `available` is false).
   */
  constructor(frameworkRoot: string | undefined) {
    this.file = frameworkRoot === undefined ? undefined : join(frameworkRoot, U8G2_FONTS_FILE);
  }

  /** @brief Whether there is a fonts file to read. */
  get available(): boolean {
    return this.file !== undefined && existsSync(this.file);
  }

  /**
   * @brief A built-in font's bytes, or undefined for a name U8G2 does not have.
   *
   * The first call reads and parses the file, synchronously; every later one
   * is a map lookup.
   *
   * @throws Error if the file exists but cannot be parsed (a defect in the package).
   */
  lookup(name: string): Uint8Array | undefined {
    return this.load()?.fonts.get(name);
  }

  /** @brief How long the one parse took and what it holds, once it has run. */
  stats(): { readonly parseMs: number; readonly fonts: number; readonly totalBytes: number } | undefined {
    if (this.index === undefined || this.parseMs === undefined) return undefined;
    return { parseMs: this.parseMs, fonts: this.index.fonts.size, totalBytes: this.index.totalBytes };
  }

  // load
  // The index, parsing the file the first time it is wanted.
  private load(): BuiltinFontIndex | undefined {
    if (this.index === undefined && this.available && this.file !== undefined) {
      const started = performance.now();
      this.index = parseU8g2Fonts(readFileSync(this.file));
      this.parseMs = performance.now() - started;
    }
    return this.index;
  }
}
