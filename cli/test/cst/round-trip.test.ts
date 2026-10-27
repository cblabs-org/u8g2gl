/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/round-trip.test.ts
 * Purpose: The CST's losslessness and range exactness over every XML file the
 *          repository holds (E-1a a1 and a5). A designer edit is computed from
 *          these ranges, so a range one byte off is an edit that corrupts the
 *          author's file.
 * Description: One test per tracked `.xml` file, found by `git ls-files` at
 *              test time. Malformed fixtures are included on purpose: the tree
 *              must be lossless on them too.
 */

import { describe, expect, it } from 'vitest';
import { parseCst, printCst } from '../../src/core/cst/index.js';
import { allElements, readRepoFile, repoXmlFiles } from './cst-test-helpers.js';

const FILES = repoXmlFiles();

describe('CST round-trip over the repository corpus (a1)', () => {
  it('finds the corpus', () => {
    // 105 at the time E-1a was specified; a much smaller number means the glob broke.
    expect(FILES.length).toBeGreaterThanOrEqual(100);
  });

  it.each(FILES)('printCst(parseCst(t)) === t for %s', (file) => {
    const text = readRepoFile(file);
    expect(printCst(parseCst(text, file).cst)).toBe(text);
  });
});

describe('CST ranges over the repository corpus (a5)', () => {
  it.each(FILES)('every attribute range slices to its name and raw value in %s', (file) => {
    const text = readRepoFile(file);
    const { cst } = parseCst(text, file);
    for (const element of allElements(cst)) {
      expect(text.slice(element.nameRange.start, element.nameRange.end)).toBe(element.name);
      for (const attr of element.attributes) {
        expect(text.slice(attr.nameRange.start, attr.nameRange.end)).toBe(attr.name);
        expect(text.slice(attr.valueRange.start, attr.valueRange.end)).toBe(attr.rawValue);
        // The quotes sit immediately outside the value range (unless unclosed).
        expect(text[attr.valueRange.start - 1]).toBe(attr.quote);
      }
    }
  });

  it('covers a non-trivial number of attributes', () => {
    let count = 0;
    for (const file of FILES) {
      const { cst } = parseCst(readRepoFile(file), file);
      for (const element of allElements(cst)) {
        count += element.attributes.length;
      }
    }
    expect(count).toBeGreaterThan(500);
  });
});
