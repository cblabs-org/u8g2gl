/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/outlines.test.ts
 * Purpose: The Outlines toggle (ui_spec §4) must box every drawn element, sit
 *          in the overlay's draw order between the hatching and the
 *          placeholders, and be remembered per browser without ever breaking
 *          when storage is missing or throws.
 * Description: The pure helpers: `outlineRects()` from a frame's boxes,
 *              `overlayOrder()` over a mixed overlay, and the setting's read
 *              and write against a map, a missing storage and storages that
 *              throw on read and on write.
 */

import { expect, test } from '@playwright/test';
import { overlayOrder, type OverlayRect } from '../../src/canvas/canvas-view';
import { OUTLINES_KEY, outlineRects, readOutlines, writeOutlines } from '../../src/canvas/outlines';

/** A storage held in a map, as `localStorage` would hold the setting. */
function mapStorage(): { readonly stored: Map<string, string>; readonly storage: Pick<Storage, 'getItem' | 'setItem'> } {
  const stored = new Map<string, string>();
  return {
    stored,
    storage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => void stored.set(key, value) },
  };
}

/** A storage that throws on every call: a private window, a sandboxed frame. */
const throwing: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

test('outlineRects boxes every element of the frame, in its order, as kind outline', () => {
  const bounds = new Map([
    ['title', { x: 0, y: 0, width: 128, height: 12 }],
    ['rule', { x: 0, y: 13, width: 128, height: 1 }],
    ['dot', { x: 5, y: 40, width: 1, height: 1 }],
  ]);
  expect(outlineRects(bounds)).toEqual([
    { x: 0, y: 0, width: 128, height: 12, kind: 'outline' },
    { x: 0, y: 13, width: 128, height: 1, kind: 'outline' },
    { x: 5, y: 40, width: 1, height: 1, kind: 'outline' },
  ]);
  expect(outlineRects(new Map())).toEqual([]);
});

test('the overlay draws hatching, then outlines, then placeholders, then the selection, each kind in its given order', () => {
  const rect = (kind: OverlayRect['kind'], x: number): OverlayRect => ({ x, y: 0, width: 1, height: 1, kind });
  const composed = [rect('selection', 1), rect('outline', 2), rect('problem', 3), rect('placeholder', 4), rect('outline', 5), rect('selection', 6), rect('problem', 7)];
  const ordered = overlayOrder(composed);
  expect(ordered.map(({ kind, x }) => `${kind}:${x}`)).toEqual([
    'problem:3',
    'problem:7',
    'outline:2',
    'outline:5',
    'placeholder:4',
    'selection:1',
    'selection:6',
  ]);
  // The view orders a copy: the loop's composed list is untouched.
  expect(composed[0]?.kind).toBe('selection');
});

test('the Outlines setting is off until stored on, and each write is remembered', () => {
  const { stored, storage } = mapStorage();
  expect(readOutlines(storage)).toBe(false);
  writeOutlines(true, storage);
  expect(stored.get(OUTLINES_KEY)).toBe('on');
  expect(readOutlines(storage)).toBe(true);
  writeOutlines(false, storage);
  expect(stored.get(OUTLINES_KEY)).toBe('off');
  expect(readOutlines(storage)).toBe(false);
  stored.set(OUTLINES_KEY, 'garbage');
  expect(readOutlines(storage)).toBe(false);
});

test('a missing or throwing storage reads the setting as off and keeps nothing, without throwing', () => {
  expect(readOutlines(null)).toBe(false);
  expect(() => writeOutlines(true, null)).not.toThrow();
  expect(readOutlines(throwing)).toBe(false);
  expect(() => writeOutlines(true, throwing)).not.toThrow();
});

test('by default the setting uses the page localStorage, and a localStorage getter that throws reads as off', () => {
  const { stored, storage } = mapStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try {
    writeOutlines(true);
    expect(stored.get(OUTLINES_KEY)).toBe('on');
    expect(readOutlines()).toBe(true);
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    expect(readOutlines()).toBe(false);
    expect(() => writeOutlines(false)).not.toThrow();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
