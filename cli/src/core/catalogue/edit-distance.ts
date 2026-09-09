/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/catalogue/edit-distance.ts
 * Purpose: Computes Levenshtein edit distance and fuzzy string proximity (§5.2).
 *          Used for fuzzy matching in display identification and for diagnostic
 *          suggestions when unrecognized setup identifiers are supplied.
 * Description: Pure isomorphic implementation of the Levenshtein distance metric
 *              using a space-optimized single-row DP algorithm, plus a candidate
 *              ranking helper with deterministic tie-breaking.
 *
 * Exports:
 * - editDistance(a, b): Calculate the minimum number of single-character edits
 * - findClosest(query, candidates, maxDistance?): Rank and filter candidates by distance
 */

/**
 * @brief Computes the Levenshtein edit distance between two strings.
 *
 * Calculates the minimum number of single-character insertions, deletions,
 * or substitutions required to transform string `a` into string `b`.
 * Uses an O(min(N, M)) memory DP algorithm.
 *
 * @param a First string.
 * @param b Second string.
 * @return The non-negative edit distance between `a` and `b`.
 */
export function editDistance(a: string, b: string): number {
  // --- Step 1: Handle trivial identity and empty string cases ---
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  // --- Step 2: Ensure string `b` is the shorter string for O(min(N, M)) storage ---
  let s1 = a;
  let s2 = b;
  if (s1.length < s2.length) {
    s1 = b;
    s2 = a;
  }

  const s1Len = s1.length;
  const s2Len = s2.length;

  // Initialize previous row of distances
  const distances: number[] = new Array<number>(s2Len + 1);
  for (let j = 0; j <= s2Len; j++) {
    distances[j] = j;
  }

  // --- Step 3: Iterate through DP matrix row by row ---
  for (let i = 1; i <= s1Len; i++) {
    const char1 = s1.charCodeAt(i - 1);
    let previousDiagonal = distances[0] ?? 0;
    distances[0] = i;

    for (let j = 1; j <= s2Len; j++) {
      const char2 = s2.charCodeAt(j - 1);
      const temp = distances[j] ?? 0;
      const substitutionCost = char1 === char2 ? 0 : 1;

      const currentDistance = Math.min(
        (distances[j] ?? 0) + 1, // deletion from s1
        (distances[j - 1] ?? 0) + 1, // insertion into s1
        previousDiagonal + substitutionCost // substitution
      );

      previousDiagonal = temp;
      distances[j] = currentDistance;
    }
  }

  return distances[s2Len] ?? s2Len;
}

/**
 * Scored candidate wrapper for sorting and filtering.
 */
interface ScoredCandidate {
  readonly candidate: string;
  readonly distance: number;
}

/**
 * @brief Finds candidates closest to a query string within a maximum edit distance.
 *
 * Compares the query string against a list of candidates in a case-insensitive manner.
 * Filters out candidates whose distance exceeds `maxDistance` (default 3), then sorts
 * results primarily by distance ascending, and secondarily alphabetically by candidate
 * name for strict determinism (§5).
 *
 * @param query The target search string.
 * @param candidates List of candidate strings to match against.
 * @param maxDistance Maximum permissible edit distance (inclusive, default 3).
 * @return Ordered list of candidate strings matching the criteria.
 */
export function findClosest(
  query: string,
  candidates: readonly string[],
  maxDistance = 3
): readonly string[] {
  // --- Step 1: Normalize query and calculate distances ---
  const normalizedQuery = query.toLowerCase();
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    const distance = editDistance(normalizedQuery, normalizedCandidate);
    if (distance <= maxDistance) {
      scored.push({ candidate, distance });
    }
  }

  // --- Step 2: Sort deterministically: lowest distance first, then alphabetical ---
  scored.sort((first, second) => {
    if (first.distance !== second.distance) {
      return first.distance - second.distance;
    }
    return first.candidate.localeCompare(second.candidate);
  });

  // --- Step 3: Extract and return matched candidates ---
  return scored.map((item) => item.candidate);
}
