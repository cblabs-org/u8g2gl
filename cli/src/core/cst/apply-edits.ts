/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/cst/apply-edits.ts
 * Purpose: Applies the TextEdits the edit functions return. Those functions
 *          describe a change and never perform it, so the caller — the
 *          designer's editor model, or a test — decides when and where it
 *          lands. This is the one shared way to land it on a plain string.
 * Description: Validates that the edits are in range and do not overlap, then
 *              splices them in from the end of the text backwards, so every
 *              edit's offsets still refer to the original text when it is
 *              applied.
 *
 * Exports:
 * - applyEdits(): Apply non-overlapping TextEdits to a string
 */

import type { TextEdit } from './cst-types.js';

/**
 * Apply `edits` to `text` and return the result. Offsets in every edit refer
 * to `text` as given, not to any intermediate state.
 *
 * Two insertions at the same offset land in array order. An edit's range may
 * touch a neighbour's (`a.end === b.start`) but not overlap it.
 *
 * @throws RangeError if an edit is out of range, inverted, or overlaps
 *         another. That is a bug in whatever produced the edits, never a
 *         property of the user's document.
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  // --- Step 1: Order from the end; ties keep array order once applied ---
  const order = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => b.edit.start - a.edit.start || b.edit.end - a.edit.end || b.index - a.index);

  // --- Step 2: Validate ranges and overlap against the next-later edit ---
  let limit = text.length;
  for (const { edit } of order) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > text.length) {
      throw new RangeError(`TextEdit [${edit.start}, ${edit.end}) is outside [0, ${text.length}]`);
    }
    if (edit.end > limit) {
      throw new RangeError(`TextEdit [${edit.start}, ${edit.end}) overlaps another edit`);
    }
    limit = edit.start;
  }

  // --- Step 3: Splice from the end backwards ---
  let out = text;
  for (const { edit } of order) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}
