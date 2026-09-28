/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/u8g2-font-reader.ts
 * Purpose: One named array's bytes, read out of `extern/u8g2/csrc/u8g2_fonts.c`,
 *          independent of `src/core/fonts/bdfconv-output.ts`. Originally
 *          `u8g2-oracle.test.ts`'s own reader (PR-04b WO2 item 4); moved here
 *          in PR-04b WO3 so WO3's own oracle assertion (a `<bdf>` compiled
 *          through `generate()` matches `u8g2_font_4x6_tr` byte for byte) can
 *          use the identical reader rather than a second copy that could drift
 *          from it.
 * Description: Matches every double-quoted segment with a regular expression
 *              (rather than a hand-rolled character walk), then decodes each
 *              with a `replace()` callback (rather than an index-driven loop)
 *              — a different shape of code checking the same C grammar than
 *              `bdfconv-output.ts` does, so a shared misunderstanding of that
 *              grammar cannot cancel out on both sides of a comparison.
 *
 * Exports:
 * - readU8g2FontArray(): One array's declared length and exact bytes
 */

import { readFileSync } from 'node:fs';

/**
 * @brief Reads one named font array out of `u8g2_fonts.c`.
 *
 * @param u8g2FontsCPath Absolute path to `extern/u8g2/csrc/u8g2_fonts.c`.
 * @param name The array's identifier, e.g. `'u8g2_font_4x6_tr'`.
 * @return The array's declared length and its exact bytes, including the
 *         trailing NUL a C compiler appends to the final string literal.
 * @throws Error if the array is not found, or its decoded length disagrees
 *         with its declared length — a test precondition, not a diagnostic.
 */
export function readU8g2FontArray(
  u8g2FontsCPath: string,
  name: string,
): { readonly declaredLength: number; readonly bytes: Uint8Array } {
  const source = readFileSync(u8g2FontsCPath, 'utf8');
  // The body ends at the closing quote immediately followed by ';' — a literal ';' byte
  // inside the array (printable ASCII, not one of bdfconv's always-escaped bytes) is
  // written out unescaped, so a bare '[\s\S]*?;' would stop at that instead.
  const declPattern = new RegExp(`const uint8_t ${name}\\[(\\d+)\\] U8G2_FONT_SECTION\\("${name}"\\) = \\n([\\s\\S]*?");`);
  const declMatch = declPattern.exec(source);
  if (!declMatch) {
    throw new Error(`readU8g2FontArray: '${name}' not found in u8g2_fonts.c`);
  }
  const declaredLength = Number(declMatch[1]);
  const body = declMatch[2]!;

  const segmentPattern = /"((?:[^"\\]|\\.)*)"/g;
  const rawSegments = [...body.matchAll(segmentPattern)].map((m) => m[1]!);
  if (rawSegments.length === 0) {
    throw new Error(`readU8g2FontArray: no string literal for '${name}'`);
  }

  const bytes: number[] = [];
  for (const raw of rawSegments) {
    // Decode octal escapes (bdfconv never emits any other escape form — see
    // bdfconv-output.ts's file header) via a global replace callback: each match consumes
    // 1-3 octal digits, matching the same greedy-then-stop rule a C compiler applies.
    raw.replace(/\\([0-7]{1,3})|([\s\S])/g, (_match, octal: string | undefined, literal: string | undefined) => {
      if (octal !== undefined) {
        bytes.push(parseInt(octal, 8));
      } else if (literal !== undefined) {
        bytes.push(literal.charCodeAt(0));
      }
      return '';
    });
  }
  // The compiler's own implicit NUL terminator for the (concatenated) string literal is
  // always the array's final byte.
  bytes.push(0);

  if (bytes.length !== declaredLength) {
    throw new Error(
      `readU8g2FontArray: '${name}' decoded to ${bytes.length} bytes, declared length is ${declaredLength}`,
    );
  }
  return { declaredLength, bytes: Uint8Array.from(bytes) };
}
