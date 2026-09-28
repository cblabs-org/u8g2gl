/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/order.ts
 * Purpose: The one string order in the codebase, and the one place the reason for
 *          it is written down. §13.9 requires generated output to be
 *          byte-identical for identical input, and [D-16]'s JSON to be a contract
 *          rather than a dump — both of which fail the moment an order depends on
 *          the machine rather than on the data. `String.prototype.localeCompare`
 *          does exactly that: it consults the host's collation, which case-folds
 *          and weakens punctuation.
 * Description: A single comparator, `compareCodeUnits`, comparing by UTF-16 code
 *              unit. Everything whose order a person or a consumer can see sorts
 *              through it: diagnostics, discovered project files, the display
 *              catalogue's committed records, `find` results, and the near-miss
 *              suggestions in the `--json` contract.
 *
 *              **How easily this bites.** It is tempting to think lowercase ASCII
 *              filenames are safe. They are not: `'screen_a_1.xml'` sorts
 *              *before* `'screen_a1.xml'` under ICU collation, which weakens the
 *              underscore, and *after* it by code unit, where `'1'` is 0x31 and
 *              `'_'` is 0x5F. Both names are ordinary, valid U8G2GL screen files.
 *              A project containing both would generate different bytes on two
 *              machines, and neither diff would be wrong.
 *
 *              It is a module of its own rather than a helper inside the first
 *              module that needed it, because this repository has now paid four
 *              times for one rule spelled in several places (PR-04 WO8c's second
 *              object count, two reserved-prefix lists, three spellings of
 *              "drawing element", and this comparator itself in four modules).
 *
 * Exports:
 * - compareCodeUnits(): §13.9's string order — by UTF-16 code unit, never locale
 */

/**
 * @brief Compares two strings by UTF-16 code unit, never by locale.
 *
 * The comparison JavaScript's own relational operators make, wrapped so that a
 * caller cannot reach for `localeCompare` out of habit and so that the reason
 * lives in one place.
 *
 * It is a property of the data alone: the same two strings order the same way in
 * every process, on every platform, under every `LANG`. That is the whole
 * requirement — §13.9 does not ask for an order a reader would call
 * alphabetical, it asks for one that never changes.
 *
 * @param a First string.
 * @param b Second string.
 * @return Negative if `a` sorts first, positive if `b` does, 0 if they are equal.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
