/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/bdfconv-output.ts
 * Purpose: Parses bdfconv's `-b 0` C output — the header comment and the array's C
 *          string-literal grammar — into the bytes a C compiler would actually place in
 *          the array (PR-04b WO2 item 2). This is the one place that grammar is decoded;
 *          nothing else in `compileBdf()` inspects the C text directly.
 * Description: Reads `bf_WriteU8G2CByFP` (`extern/u8g2/tools/font/bdfconv/bdf_font.c`,
 *              ~line 605) to know exactly what it writes: a `/* ... *\/` header naming
 *              Fontname, Copyright and `Glyphs: selected/total`; then
 *              `const uint8_t <name>[N] U8G2_FONT_SECTION("<name>") = ` followed by one or
 *              more double-quoted string-literal segments (C's adjacent-literal
 *              concatenation — bdfconv line-wraps every 32 bytes into its own `"..."`
 *              segment), each byte written either as a literal ASCII character or as a
 *              variable-length octal escape `\ooo`. The writer never emits `\"` or `\\`
 *              (bytes 34 and 92 are always in the octal-escaped set), so a backslash is
 *              always followed by 1–3 octal digits — no other escape form exists to parse.
 *              **Measured relationship**: the writer always emits `declaredLength - 1`
 *              literal bytes; the array's final byte is always the C compiler's own
 *              implicit NUL terminator for the string literal, never anything bdfconv
 *              wrote itself. This function verifies that relationship rather than assuming
 *              it, and fails rather than guess if it does not hold.
 *
 * Exports:
 * - ParsedBdfconvOutput:      One converted font's header fields and its exact array bytes
 * - BdfconvOutputParseResult: Either the parsed output, or a reason it could not be parsed
 * - parseBdfconvOutput():     Parses bdfconv's C output for one named array
 */

/** One converted font's header fields and its exact array bytes. */
export interface ParsedBdfconvOutput {
  /** The BDF's `FONT` name, read from bdfconv's header — absent when bdfconv reports none. */
  readonly fontName: string | undefined;
  /** The BDF's `COPYRIGHT` value, read from bdfconv's header — absent when bdfconv reports none. */
  readonly copyright: string | undefined;
  /** Glyphs bdfconv actually selected (the `n` in `Glyphs: n/m`). */
  readonly selectedGlyphs: number;
  /** Glyphs present in the BDF before selection (the `m` in `Glyphs: n/m`). */
  readonly totalGlyphs: number;
  /** The array's declared length, `N` in `[N]`. */
  readonly declaredLength: number;
  /** Exactly the bytes a C compiler would place in the array, including its final NUL. */
  readonly bytes: Uint8Array;
}

/** Outcome of parsing bdfconv's C output. */
export type BdfconvOutputParseResult =
  | { readonly ok: true; readonly value: ParsedBdfconvOutput }
  | { readonly ok: false; readonly reason: string };

// escapeRegExp
// Escapes a string for literal use inside a RegExp source — the identifier is
// caller-controlled (compileBdf()'s input.identifier), so this guards against it
// containing a regex metacharacter rather than assuming U8G2GL's own naming rules apply
// to whatever string a caller happens to pass.
//   text — the raw text to escape
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// extractStringLiteralSegments
// Walks the C source after the array's `= ` and collects each double-quoted segment's raw
// (still-escaped) content, stopping at the statement's closing `;`. Handles a `\"` or `\\`
// inside a segment defensively (bdfconv's writer never emits either — both bytes are
// always in its octal-escaped set — but a parser for "the whole C string-literal grammar"
// should not silently mis-walk a quote it does not expect to see escaped).
//   source — the C text starting immediately after the array declaration's `= `
function extractStringLiteralSegments(source: string): readonly string[] | undefined {
  const segments: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && source[cursor] !== '"') {
      if (source[cursor] === ';') {
        return segments.length > 0 ? segments : undefined;
      }
      cursor++;
    }
    if (cursor >= source.length) {
      break;
    }
    cursor++; // opening quote
    let segment = '';
    while (cursor < source.length && source[cursor] !== '"') {
      const current = source[cursor]!;
      if (current === '\\' && cursor + 1 < source.length) {
        segment += current + source[cursor + 1]!;
        cursor += 2;
        continue;
      }
      segment += current;
      cursor++;
    }
    cursor++; // closing quote
    segments.push(segment);
  }
  return segments.length > 0 ? segments : undefined;
}

// decodeCStringLiteral
// Decodes one concatenated string literal's raw content into bytes, per bdf_font.c's
// writer: every backslash is followed by 1-3 octal digits (never `\"` or `\\` — see the
// file header), and every other character is a literal ASCII byte.
//   raw — the concatenation of every segment's raw content, in source order
function decodeCStringLiteral(raw: string): readonly number[] | undefined {
  const bytes: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '\\') {
      i++;
      let octal = '';
      while (i < raw.length && octal.length < 3 && raw[i]! >= '0' && raw[i]! <= '7') {
        octal += raw[i];
        i++;
      }
      if (octal === '') {
        return undefined;
      }
      bytes.push(parseInt(octal, 8));
    } else {
      bytes.push(ch.charCodeAt(0));
      i++;
    }
  }
  return bytes;
}

/**
 * @brief Parses bdfconv's C output for one named array.
 *
 * @param source     The full text bdfconv wrote to its `-o` output file.
 * @param identifier The array name passed to bdfconv's `-n` flag.
 * @return The parsed header fields and exact array bytes, or a reason parsing failed.
 */
export function parseBdfconvOutput(source: string, identifier: string): BdfconvOutputParseResult {
  // --- Step 1: the header comment — Fontname, Copyright, Glyphs: n/m ---
  const headerMatch = /\/\*\n([\s\S]*?)\*\//.exec(source);
  if (!headerMatch) {
    return { ok: false, reason: 'No bdfconv header comment found in output.' };
  }
  const header = headerMatch[1]!;
  const glyphsMatch = /Glyphs:\s*(\d+)\/(\d+)/.exec(header);
  if (!glyphsMatch) {
    return { ok: false, reason: 'No "Glyphs: n/m" line found in bdfconv header.' };
  }
  const selectedGlyphs = Number(glyphsMatch[1]);
  const totalGlyphs = Number(glyphsMatch[2]);

  // bdfconv prints the literal string "(null)" via printf("%s", NULL) when the BDF
  // supplies no FONT/COPYRIGHT property (WO1 Finding 2) — never surface that as real text.
  const fontNameMatch = /Fontname:\s*(.*)\r?\n/.exec(header);
  const copyrightMatch = /Copyright:\s*(.*)\r?\n/.exec(header);
  const rawFontName = fontNameMatch?.[1]?.trim();
  const rawCopyright = copyrightMatch?.[1]?.trim();
  const fontName = rawFontName && rawFontName !== '(null)' ? rawFontName : undefined;
  const copyright = rawCopyright && rawCopyright !== '(null)' ? rawCopyright : undefined;

  // --- Step 2: the array declaration, e.g. const uint8_t name[723] U8G2_FONT_SECTION("name") = ---
  const escapedIdentifier = escapeRegExp(identifier);
  const declPattern = new RegExp(
    `const uint8_t ${escapedIdentifier}\\[(\\d+)\\] U8G2_FONT_SECTION\\("${escapedIdentifier}"\\) = `
  );
  const declMatch = declPattern.exec(source);
  if (!declMatch) {
    return { ok: false, reason: `No array declaration found for '${identifier}'.` };
  }
  const declaredLength = Number(declMatch[1]);

  // --- Step 3: concatenate the quoted string-literal segments (C's adjacent-literal rule) ---
  const afterDecl = source.slice(declMatch.index + declMatch[0].length);
  const segments = extractStringLiteralSegments(afterDecl);
  if (!segments) {
    return { ok: false, reason: `No string literal found for '${identifier}'.` };
  }

  // --- Step 4: decode the escape grammar ---
  const bytes = decodeCStringLiteral(segments.join(''));
  if (!bytes) {
    return { ok: false, reason: `Malformed escape in string literal for '${identifier}'.` };
  }

  // --- Step 5: verify the measured relationship — declaredLength is always exactly the
  //     literal's emitted byte count plus one, for the C compiler's own implicit
  //     terminating NUL (bdf_font.c bf_WriteU8G2CByFP: it always writes exactly
  //     target_cnt-1+extra1 explicit bytes for a declared size of target_cnt+extra1). ---
  if (bytes.length + 1 !== declaredLength) {
    return {
      ok: false,
      reason:
        `Parsed ${bytes.length} literal bytes + 1 (compiler NUL) != declared length ` +
        `${declaredLength} for '${identifier}'.`,
    };
  }

  return {
    ok: true,
    value: {
      fontName,
      copyright,
      selectedGlyphs,
      totalGlyphs,
      declaredLength,
      bytes: Uint8Array.from([...bytes, 0]),
    },
  };
}
