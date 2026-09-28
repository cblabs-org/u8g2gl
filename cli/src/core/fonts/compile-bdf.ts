/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/compile-bdf.ts
 * Purpose: The one platform-neutral function that turns a BDF file's bytes into a
 *          U8G2 font array's bytes, behaving identically in Node and in a browser.
 *          `compileProjectAssets()` (`src/core/assets/`) calls it for every `<bdf>`
 *          before `generate()` runs.
 * Description: Translates and validates `range` (bdf-range.ts), runs bdfconv through one
 *              fresh Wasm module instance (bdfconv-instance.ts — one instance serves
 *              exactly one conversion, because the runtime exits after `main`), and parses its C output
 *              (bdfconv-output.ts) into exact array bytes. Never throws for a defect in
 *              the author's input — malformed `range`, bdfconv exiting non-zero, or zero
 *              glyphs selected (a malformed BDF — bdfconv exits 0 with `Glyphs: 0/0` —
 *              or a `range` matching nothing) all come back as a FontCompileFailure with a human-readable reason
 *              and bdfconv's own stderr lines.
 *
 *              An absent `range` means every glyph (`0-MAX_BDF_CODEPOINT`), not
 *              bdfconv's own default map `*`: `bdf_map.c:174` defines `*` as 32–255, so
 *              a font with glyphs above 255 (an icon font, say) would silently lose
 *              them. `<bdf range>` documents itself as an
 *              optional *filter* (globals.ts), so its absence must mean unfiltered.
 *
 * Exports:
 * - CompileBdfInput:    The BDF bytes, the `-n` identifier, and an optional `<bdf range>`
 * - CompiledFont:       The compiled array bytes plus glyph counts and BDF header fields
 * - FontCompileFailure: A human-readable reason plus bdfconv's stderr, never thrown
 * - CompileBdfResult:   CompiledFont on success, FontCompileFailure otherwise
 * - compileBdf():       Compiles one BDF file to a U8G2 font array
 */

import { MAX_BDF_CODEPOINT, parseBdfRange } from './bdf-range.js';
import { convertBdf, instantiateBdfconv } from './bdfconv-instance.js';
import { parseBdfconvOutput } from './bdfconv-output.js';

/** Input to compileBdf(). */
export interface CompileBdfInput {
  /** The BDF file's bytes; the host reads them (never a path — this runs in a browser too). */
  readonly bdf: Uint8Array;
  /** The array's name, e.g. 'ui_font_small_9' — passed to bdfconv's `-n`. */
  readonly identifier: string;
  /**
   * The `<bdf range>` attribute, untranslated. Omitted means every glyph
   * (`0-MAX_BDF_CODEPOINT`) — a filter that selects nothing is not the same as no
   * filter.
   */
  readonly range?: string;
}

/** One successfully compiled font. */
export interface CompiledFont {
  /** Exactly the bytes of the C array, of exactly `declaredLength`. */
  readonly bytes: Uint8Array;
  /** The array's declared length, `N` in `[N]` — equal to `bytes.length`. */
  readonly declaredLength: number;
  /** Glyphs bdfconv actually selected. */
  readonly selectedGlyphs: number;
  /** Glyphs present in the BDF before selection. */
  readonly totalGlyphs: number;
  /** The BDF's `FONT` name, absent when the BDF supplies none — never the string "(null)". */
  readonly fontName: string | undefined;
  /** The BDF's `COPYRIGHT` value, absent when the BDF supplies none — never "(null)". */
  readonly copyright: string | undefined;
}

/** A defect in the author's input. Returned, never thrown. */
export interface FontCompileFailure {
  readonly ok: false;
  /** Human-readable reason — names the offending range item, or what bdfconv reported. */
  readonly reason: string;
  /** bdfconv's stderr lines, empty when the failure was caught before bdfconv ran. */
  readonly stderr: readonly string[];
}

/** compileBdf()'s result: a compiled font, or a failure that is never thrown. */
export type CompileBdfResult = ({ readonly ok: true } & CompiledFont) | FontCompileFailure;

/**
 * @brief Compiles one BDF file to a U8G2 font array's bytes.
 *
 * Safe to call concurrently: each call creates its own bdfconv module instance with its
 * own memory and virtual filesystem, so concurrent calls do not interfere with each other.
 *
 * @param input The BDF bytes, the `-n` identifier, and an optional `<bdf range>` value.
 * @return The compiled font, or a failure describing what went wrong.
 */
export async function compileBdf(input: CompileBdfInput): Promise<CompileBdfResult> {
  // --- Step 1: translate and validate `range` before touching bdfconv at all ---
  // Absent range means unfiltered — every glyph up to bdfconv's own maximum
  // codepoint — never bdfconv's own default map `*` (32-255; see the file header).
  let bdfconvMap = `0-${MAX_BDF_CODEPOINT}`;
  if (input.range !== undefined) {
    const parsedRange = parseBdfRange(input.range);
    if (!parsedRange.ok) {
      return { ok: false, reason: parsedRange.reason, stderr: [] };
    }
    bdfconvMap = parsedRange.bdfconvMap;
  }

  // --- Step 2: run bdfconv through one fresh module instance ---
  const stderrLines: string[] = [];
  const module = await instantiateBdfconv({ onStderr: (line) => stderrLines.push(line) });
  const outputPath = '/out.c';
  // The two fixed options, in bdfconv's own words (`extern/u8g2/tools/font/bdfconv/main.c`
  // help text):
  //   `-b 0` build mode, "Most compact, glyph bitmap is minimal": each glyph's bitmap is
  //     cropped to its ink, not padded to the font's height or width as modes 1-3 do. The
  //     compiled metrics (`u8g2_GetMaxCharHeight()` and friends) follow from that
  //     cropping; test/test_bdf_real_u8g2.cpp derives them the same way. It is the
  //     proportional mode, the only one that keeps a font as small as the BDF allows.
  //   `-f 1` font format, "u8g2 font": the compressed format the U8G2 runtime draws.
  //     The alternatives are `0` (a ucglib font) and `2` (an uncompressed 8x8 font,
  //     which forces `-b 3`); neither is a U8G2 font this library can draw.
  const conversion = convertBdf(module, input.bdf, [
    '-b',
    '0',
    '-f',
    '1',
    '-m',
    bdfconvMap,
    '-n',
    input.identifier,
    '-o',
    outputPath,
  ]);
  if (!conversion.ok) {
    return {
      ok: false,
      reason: `bdfconv exited with status ${conversion.exitStatus ?? '(unknown)'}.`,
      stderr: stderrLines,
    };
  }

  // --- Step 3: read and parse bdfconv's C output ---
  let outputText: string;
  try {
    outputText = module.FS.readFile(outputPath, { encoding: 'utf8' });
  } catch (error) {
    return {
      ok: false,
      reason: `bdfconv produced no output file: ${String(error)}`,
      stderr: stderrLines,
    };
  }
  const parsed = parseBdfconvOutput(outputText, input.identifier);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, stderr: stderrLines };
  }

  // --- Step 4: zero glyphs is a failure, not a degenerate success (a malformed BDF
  //     makes bdfconv exit 0 with "Glyphs: 0/0"; a range matching nothing does too) ---
  if (parsed.value.selectedGlyphs === 0) {
    const rangeDescription = input.range !== undefined ? `range '${input.range}'` : 'the default range';
    const reason =
      parsed.value.totalGlyphs > 0
        ? `${rangeDescription} selected no glyphs from a font with ${parsed.value.totalGlyphs} glyph(s).`
        : 'the BDF file has no usable glyphs (bdfconv reported "Glyphs: 0/0").';
    return { ok: false, reason: `No glyphs compiled: ${reason}`, stderr: stderrLines };
  }

  return {
    ok: true,
    bytes: parsed.value.bytes,
    declaredLength: parsed.value.declaredLength,
    selectedGlyphs: parsed.value.selectedGlyphs,
    totalGlyphs: parsed.value.totalGlyphs,
    fontName: parsed.value.fontName,
    copyright: parsed.value.copyright,
  };
}
