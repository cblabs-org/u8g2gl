/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/line-index.ts
 * Purpose: Turns a CST offset into the 1-based line and column a diagnostic
 *          reports. The CST stores offsets only, so this is the single place
 *          the line/column convention lives — and it is the convention of the
 *          hand-rolled scanner the parser used before the CST, exactly, so no
 *          diagnostic moved when the parser switched.
 * Description: Records each line's starting offset once, then answers lookups
 *              by binary search. The convention: LF, CRLF and a lone CR each
 *              end a line; every other UTF-16 code unit, a tab included, is one
 *              column. One addition the old scanner had no rule for, because it
 *              could not parse such a file: a leading BOM occupies no column, so
 *              a file with a BOM reports the same coordinates as without.
 *
 * Exports:
 * - BOM:         The byte-order mark, U+FEFF
 * - LineColumn:  A 1-based line and column pair
 * - LineIndex:   Offset → line/column lookup over one text
 */

/**
 * The byte-order mark, U+FEFF. Written as an escape everywhere it is needed,
 * because the literal character is invisible and reads as an empty string.
 */
export const BOM = '\uFEFF';

/** A 1-based line and column, as diagnostics report them. */
export interface LineColumn {
  readonly line: number;
  readonly column: number;
}

/**
 * Offset → line/column lookup for one immutable text. Built once per parse;
 * each lookup is O(log lines).
 */
export class LineIndex {
  /** Offset of the first code unit of each line; `lineStarts[0]` is 0. */
  private readonly lineStarts: readonly number[];
  /** 1 when the text starts with a BOM, which line 1's columns skip. */
  private readonly bomWidth: number;

  /**
   * @param text  The source text. Lookups are only meaningful for offsets in
   *              `[0, text.length]`.
   */
  constructor(text: string) {
    const starts: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 0x0a) {
        starts.push(i + 1);
      } else if (ch === 0x0d && text.charCodeAt(i + 1) !== 0x0a) {
        // A lone CR ends a line; CR LF ends it at the LF instead.
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
    this.bomWidth = text.startsWith(BOM) ? 1 : 0;
  }

  /** Number of lines in the text (a trailing newline opens one more, empty, line). */
  get lineCount(): number {
    return this.lineStarts.length;
  }

  /**
   * The 1-based line and column of `offset`.
   * An offset on the LF of a CRLF pair reports the CR's line, one column on.
   */
  locate(offset: number): LineColumn {
    // Binary search for the last line starting at or before `offset`.
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.lineStarts[mid] ?? 0) <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const lineStart = this.lineStarts[lo] ?? 0;
    // Only line 1 can contain the BOM, and only offsets past it are shifted.
    const skip = lo === 0 && offset >= this.bomWidth ? this.bomWidth : 0;
    return { line: lo + 1, column: offset - lineStart - skip + 1 };
  }

  /** Offset of the first code unit of 1-based `line`, clamped to the last line. */
  lineStart(line: number): number {
    const i = Math.min(Math.max(line - 1, 0), this.lineStarts.length - 1);
    return this.lineStarts[i] ?? 0;
  }
}
