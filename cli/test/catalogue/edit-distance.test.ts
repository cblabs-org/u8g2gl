/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/edit-distance.test.ts
 * Purpose: Unit tests for Levenshtein edit distance and closest candidate queries.
 * Description: Validates standard distance cases (kitten/sitting, identical, empty strings,
 *              single insertions/deletions/substitutions) and findClosest filtering and ordering.
 */

import { describe, it, expect } from 'vitest';
import { editDistance, findClosest } from '../../src/core/catalogue/edit-distance.js';

describe('Levenshtein editDistance (§5.2)', () => {
  it('computes known distance for kitten and sitting', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('computes 0 for identical strings', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('SSD1306', 'SSD1306')).toBe(0);
    expect(editDistance('test_string', 'test_string')).toBe(0);
  });

  it('computes correct distance with empty strings', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('hello', '')).toBe(5);
  });

  it('computes single-operation distances', () => {
    // Substitution
    expect(editDistance('cat', 'car')).toBe(1);
    // Deletion
    expect(editDistance('spark', 'park')).toBe(1);
    // Insertion
    expect(editDistance('park', 'spark')).toBe(1);
  });

  it('handles asymmetric length strings', () => {
    expect(editDistance('short', 'much longer string')).toBe(14);
  });
});

describe('findClosest candidate ranking', () => {
  const candidates = [
    'SSD1306',
    'SSD1309',
    'SSD1322',
    'SH1106',
    'ST7565',
    'UC1608',
  ];

  it('finds closest candidates sorted by distance', () => {
    // "SSD1305" is distance 1 from SSD1306 and SSD1309, distance 2 from SSD1322
    const matches = findClosest('SSD1305', candidates, 2);
    expect(matches).toContain('SSD1306');
    expect(matches).toContain('SSD1309');
    expect(matches).toContain('SSD1322');
    expect(matches).not.toContain('SH1106');

    // First two should have distance 1, then distance 2
    expect(matches.slice(0, 2)).toEqual(['SSD1306', 'SSD1309']);
    expect(matches[2]).toBe('SSD1322');
  });

  it('performs case-insensitive matching', () => {
    const matches = findClosest('ssd1306', candidates, 0);
    expect(matches).toEqual(['SSD1306']);
  });

  it('returns empty array when no candidates fall within maxDistance', () => {
    const matches = findClosest('COMPLETELY_UNRELATED', candidates, 2);
    expect(matches).toEqual([]);
  });

  it('uses default maxDistance of 3 when unspecified', () => {
    const matches = findClosest('SSD1036', candidates);
    // "SSD1036" vs "SSD1306": distance 2 (0->3, 3->0)
    expect(matches).toContain('SSD1306');
  });

  it('breaks ties deterministically in alphabetical order', () => {
    const tieCandidates = ['beta', 'alpha', 'delta'];
    // "zeta" has distance 1 to "beta" (b->z) and distance 4 to "alpha"
    const results = findClosest('zeta', tieCandidates, 3);
    expect(results[0]).toBe('beta');
  });
});
