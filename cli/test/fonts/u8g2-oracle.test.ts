/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fonts/u8g2-oracle.test.ts
 * Purpose: compileBdf()'s correctness oracle (PR-04b WO2 item 4). Converts BDF files from
 *          `extern/u8g2/tools/font/bdf/` with the same map U8G2's own `build.c` used to
 *          generate the matching array in `extern/u8g2/csrc/u8g2_fonts.c`, translated into
 *          our `<bdf range>` grammar, and asserts byte-for-byte equality with the array
 *          U8G2 actually ships. A U8G2 submodule bump that changes the converter's output
 *          fails this build — that is the point of an oracle test, not an accident of one.
 * Description: Covers `u8g2_font_4x6_tr` (723 bytes, PA-measured in PROJECT.md), one `_tf`
 *              variant, one `_tn` variant, and `u8g2_font_6x13_tr` from a different BDF
 *              family, all built with `-b 0` (the only mode this WO ever builds). Every
 *              `build.c` map row measured for these fonts writes its optional `>map_to`
 *              override equal to its own range's `lo` (`bdf_map.c`: `map_to = range_from`
 *              is already the default when `>` is omitted), so it translates losslessly
 *              into our grammar, which has no `>` operator, by simply dropping it.
 *
 *              The expected side is read by this file's own small reader, deliberately not
 *              `src/core/fonts/bdfconv-output.ts` — sharing one parser would let one bug in
 *              understanding bdfconv's C-string-literal grammar cancel out on both sides of
 *              the comparison instead of failing it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileBdf } from '../../src/core/fonts/compile-bdf.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');
const u8g2FontsC = resolve(repoRoot, 'extern', 'u8g2', 'csrc', 'u8g2_fonts.c');

/**
 * @brief This test's own reader for one named array in u8g2_fonts.c.
 *
 * Deliberately independent of bdfconv-output.ts: matches every double-quoted segment with
 * a regular expression (rather than a hand-rolled character walk), then decodes each with
 * a `replace()` callback (rather than an index-driven loop) — a different shape of code
 * checking the same C grammar, so a shared misunderstanding cannot cancel out.
 *
 * @param name The array's identifier, e.g. 'u8g2_font_4x6_tr'.
 * @return The array's declared length and its exact bytes, including the trailing NUL a C
 *         compiler appends to the final string literal.
 */
function readU8g2FontArray(name: string): { readonly declaredLength: number; readonly bytes: Uint8Array } {
  const source = readFileSync(u8g2FontsC, 'utf8');
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
      `readU8g2FontArray: '${name}' decoded to ${bytes.length} bytes, declared length is ${declaredLength}`
    );
  }
  return { declaredLength, bytes: Uint8Array.from(bytes) };
}

interface OracleCase {
  readonly bdfFile: string;
  readonly arrayName: string;
  /** Our <bdf range> grammar, translated from build.c's map row (its `>map_to` dropped —
   *  see the file header — since every case here has map_to === the range's own lo). */
  readonly range: string | undefined;
}

const ORACLE_CASES: readonly OracleCase[] = [
  // MM_R: build.c '-m 32-127>32' == '32-127' (map_to defaults to range_from).
  { bdfFile: '4x6.bdf', arrayName: 'u8g2_font_4x6_tr', range: '32-127' },
  // MM_F: build.c '-m 32-255>32' == '32-255'.
  { bdfFile: '4x6.bdf', arrayName: 'u8g2_font_4x6_tf', range: '32-255' },
  // MM_N: build.c '-m 32,42-58>42' == '32,42-58' (both items' map_to equal their own lo).
  { bdfFile: '4x6.bdf', arrayName: 'u8g2_font_4x6_tn', range: '32,42-58' },
  // A different BDF family entirely, still MM_R.
  { bdfFile: '6x13.bdf', arrayName: 'u8g2_font_6x13_tr', range: '32-127' },
];

describe('compileBdf() — U8G2 oracle', () => {
  it.each(ORACLE_CASES)('reproduces $arrayName byte for byte', async ({ bdfFile, arrayName, range }) => {
    const bdfBytes = readFileSync(resolve(bdfDir, bdfFile));
    const expected = readU8g2FontArray(arrayName);

    const result = await compileBdf({ bdf: bdfBytes, identifier: arrayName, range });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.declaredLength).toBe(expected.declaredLength);
    expect(result.bytes).toEqual(expected.bytes);
  });
});
