/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/content-version.test.ts
 * Purpose: `contentVersion`, the version every read carries: correct FNV-1a
 *          64 against published vectors (the limb arithmetic is the easy part
 *          to get subtly wrong), equal for equal bytes, different for a
 *          one-byte change.
 * Description: Vectors are the FNV reference values for "" and "a" and
 *              "foobar".
 */

import { describe, expect, it } from 'vitest';
import { contentVersion } from '../../src/core/project-fs/index.js';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('contentVersion()', () => {
  it.each([
    ['', 'cbf29ce484222325-0'],
    ['a', 'af63dc4c8601ec8c-1'],
    ['foobar', '85944171f73967e8-6'],
  ])('matches the FNV-1a 64 reference for %j', (text, expected) => {
    expect(contentVersion(utf8(text))).toBe(expected);
  });

  it('is equal for equal bytes and differs for a one-byte change', () => {
    const big = new Uint8Array(100_000).map((_, i) => i * 31);
    const copy = big.slice();
    expect(contentVersion(copy)).toBe(contentVersion(big));
    copy[50_000] = (copy[50_000] ?? 0) ^ 1;
    expect(contentVersion(copy)).not.toBe(contentVersion(big));
  });
});
