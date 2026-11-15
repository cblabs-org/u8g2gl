/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/resolver/oriented-display.test.ts
 * Purpose: Pins the two helpers every rotation consumer goes through
 *          (design_spec §5.1). `normaliseRotation()` is the one table equating
 *          `90` with `R1`, and `orientedDisplay()` the one place the R1/R3
 *          size swap is computed; a consumer that spelled either out for itself
 *          could disagree with the rest, so both are checked over every
 *          accepted spelling, an absent attribute and an invalid one.
 * Description: Table-driven over the ten spellings: the eight turning ones
 *              and U8G2's two mirrors, which are layout-neutral as R0 and R2
 *              are. Also checks that the
 *              record handed to `orientedDisplay()` comes back untouched, since
 *              the framebuffer and tiles must stay native, and that
 *              `findOrientedDisplay()` reads the target's own rotation.
 */

import { describe, expect, it } from 'vitest';
import { findOrientedDisplay, orientedDisplay } from '../../src/core/resolver/index.js';
import { normaliseRotation, ROTATION_VALUES, type Rotation } from '../../src/core/schema/index.js';
import type { Target } from '../../src/core/schema/project.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

const SSD1322 = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const RECORD = CATALOGUE.find((record) => record.setup === SSD1322)!;

/** Every accepted spelling, what it normalises to, and whether it swaps the size. */
const SPELLINGS: readonly (readonly [string, Rotation, boolean])[] = [
  ['R0', 'R0', false],
  ['R1', 'R1', true],
  ['R2', 'R2', false],
  ['R3', 'R3', true],
  ['0', 'R0', false],
  ['90', 'R1', true],
  ['180', 'R2', false],
  ['270', 'R3', true],
  ['MIRROR', 'MIRROR', false],
  ['MIRROR_VERTICAL', 'MIRROR_VERTICAL', false],
];

describe('normaliseRotation()', () => {
  it('covers exactly the spellings the vocabulary accepts', () => {
    expect(SPELLINGS.map(([spelling]) => spelling)).toEqual([...ROTATION_VALUES]);
  });

  it.each(SPELLINGS)('maps %s to %s', (spelling, rotation) => {
    expect(normaliseRotation(spelling)).toBe(rotation);
  });

  it('treats an absent rotation as R0, U8G2\'s default', () => {
    expect(normaliseRotation(undefined)).toBe('R0');
  });

  it.each(['R4', 'r1', '45', '', ' 90', 'U8G2_R1'])('returns undefined for %j', (spelling) => {
    expect(normaliseRotation(spelling)).toBeUndefined();
  });
});

describe('orientedDisplay()', () => {
  it('starts from a 256×64 record', () => {
    expect([RECORD.width, RECORD.height]).toEqual([256, 64]);
  });

  it.each(SPELLINGS)('at %s is %s, swapped: %s', (spelling, rotation, swapped) => {
    const oriented = orientedDisplay(RECORD, spelling);
    expect(oriented).toEqual({
      width: swapped ? 64 : 256,
      height: swapped ? 256 : 64,
      rotation,
      native: { width: 256, height: 64 },
    });
  });

  it('lays out an absent rotation natively', () => {
    expect(orientedDisplay(RECORD, undefined)).toEqual({ width: 256, height: 64, rotation: 'R0', native: { width: 256, height: 64 } });
  });

  it('lays out an invalid rotation natively, leaving Pass 1 to report it', () => {
    expect(orientedDisplay(RECORD, 'R5')).toEqual({ width: 256, height: 64, rotation: 'R0', native: { width: 256, height: 64 } });
  });

  it('never rotates the record: framebuffer and tiles stay the hardware\'s', () => {
    const before = JSON.stringify(RECORD);
    orientedDisplay(RECORD, 'R1');
    expect(JSON.stringify(RECORD)).toBe(before);
  });
});

describe('findOrientedDisplay()', () => {
  const target = (rotation?: string): Target => ({
    name: 'primary',
    setup: SSD1322,
    ...(rotation !== undefined ? { rotation } : {}),
  });

  it('orients the target\'s record by the target\'s own rotation', () => {
    expect(findOrientedDisplay(target('270'), CATALOGUE)).toMatchObject({ width: 64, height: 256, rotation: 'R3' });
    expect(findOrientedDisplay(target(), CATALOGUE)).toMatchObject({ width: 256, height: 64, rotation: 'R0' });
  });

  it('finds nothing for no target, or a setup the catalogue lacks', () => {
    expect(findOrientedDisplay(undefined, CATALOGUE)).toBeUndefined();
    expect(findOrientedDisplay({ ...target('R1'), setup: 'U8G2_NO_SUCH_DISPLAY' }, CATALOGUE)).toBeUndefined();
  });
});
