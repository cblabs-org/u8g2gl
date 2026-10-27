/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/line-diff.ts
 * Purpose: The measuring stick for the edit tests: an edit must change only its
 *          target's lines. A reviewer judges an edit by its diff, so the test
 *          judges it the same way — by which lines a line diff reports.
 * Description: Trims the longest common prefix and suffix of whole lines
 *              (line terminators included, so a CRLF → LF change counts as a
 *              change) and reports the remaining middle of each side. That is
 *              the region any line diff must show; an edit that touches more
 *              than its target makes it wider.
 *
 * Exports:
 * - LineChange:   The changed region of a before/after pair, as line spans
 * - splitLines(): Lines with their terminators
 * - lineDiff():   The changed region, or undefined when identical
 */

/**
 * The changed lines of a before/after pair, 1-based and inclusive. For a pure
 * insertion `beforeLast === beforeFirst - 1` (no line of `before` changed);
 * for a pure deletion the same holds for `after`.
 */
export interface LineChange {
  readonly beforeFirst: number;
  readonly beforeLast: number;
  readonly afterFirst: number;
  readonly afterLast: number;
}

/** Split `text` into lines, each keeping its own terminator. */
export function splitLines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
}

/** The region of lines that differ between `before` and `after`. */
export function lineDiff(before: string, after: string): LineChange | undefined {
  const a = splitLines(before);
  const b = splitLines(after);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  if (prefix === a.length && prefix === b.length) {
    return undefined;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    beforeFirst: prefix + 1,
    beforeLast: a.length - suffix,
    afterFirst: prefix + 1,
    afterLast: b.length - suffix,
  };
}
