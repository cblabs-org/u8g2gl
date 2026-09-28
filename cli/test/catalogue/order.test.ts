/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/order.test.ts
 * Purpose: Holds §13.9's order on the catalogue and on the `--json` contract
 *          (PR-04 WO12 follow-up). `src/data/catalogue.json` is **committed**, so
 *          a host-dependent record order means the same U8G2 submodule produces a
 *          different committed file on a different machine — §13.9's hazard
 *          applied to an artefact the tool ships. The `suggestions` array and
 *          `find`'s results are read by agents and CI, which compare runs.
 * Description: Every test names the pair whose collated and code-unit orders
 *              genuinely differ, and asserts the collated order is *not* what is
 *              produced — so each one fails under `localeCompare` on the same
 *              machine it passes on now, rather than only under some other locale
 *              nobody runs.
 */

import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { findClosest } from '../../src/core/catalogue/edit-distance.js';
import { identifyDisplay } from '../../src/core/catalogue/query.js';
import { compareCodeUnits } from '../../src/core/order.js';
import type { DisplayRecord } from '../../src/core/schema/display-record.js';

/**
 * The real pair in the real catalogue whose two orders disagree.
 *
 * ICU collation weakens the underscore, so `…100X32_F…` collates before
 * `…100X32I_F…`; by code unit `'I'` (0x49) precedes `'_'` (0x5F), so the `I`
 * variant comes first. The same shape moved 86 records: a variant or controller
 * token that is a prefix of a longer one — `100X32`/`100X32I`,
 * `SSD1362`/`SSD1362Z`, `JLX256160`/`JLX256160M`.
 */
const PAIR = ['U8G2_S1D15300_100X32I_F_6800', 'U8G2_S1D15300_100X32_F_6800'] as const;

describe('the committed display catalogue is ordered by code unit (§13.9)', () => {
  it('is the pair that tells the two orders apart', () => {
    // Guards the rest: if ICU ever agreed with a code-unit comparison here, the
    // assertions below would stop proving anything without failing.
    expect(PAIR[0].localeCompare(PAIR[1])).toBeGreaterThan(0);
    expect(compareCodeUnits(PAIR[0], PAIR[1])).toBeLessThan(0);
  });

  it('lists every record in code-unit order of its setup', () => {
    const setups = CATALOGUE.map((record) => record.setup);
    expect(setups).toEqual([...setups].sort(compareCodeUnits));
    expect(setups.length).toBeGreaterThan(1000);
  });

  it('is not in the collated order the file was committed in before', () => {
    // The committed file was in locale order until this follow-up. Asserting the
    // difference, rather than only the sortedness, is what makes the guard bite:
    // for most of the 1637 records the two orders agree.
    const setups = CATALOGUE.map((record) => record.setup);
    expect(setups).not.toEqual([...setups].sort((a, b) => a.localeCompare(b)));
  });

  it('puts the I variant before the plain one, which is where the two orders part', () => {
    const setups = CATALOGUE.map((record) => record.setup);
    expect(setups.indexOf(PAIR[0])).toBeGreaterThan(-1);
    expect(setups.indexOf(PAIR[0])).toBeLessThan(setups.indexOf(PAIR[1]));
  });
});

describe("the --json contract's suggestion order is code-unit (§15.3, [D-16])", () => {
  it('breaks a distance tie by code unit, not by collation', () => {
    // Both candidates are one edit from the query, so the tie-break decides which
    // a caller applying `suggestions[0]` gets. Two machines must not disagree.
    const suggestions = findClosest('a_1', ['a1', 'a_2']);
    expect(suggestions).toEqual(['a1', 'a_2']);
    expect(suggestions).not.toEqual([...suggestions].sort((a, b) => a.localeCompare(b)));
  });

  it('is the pair that tells the two orders apart', () => {
    expect('a1'.localeCompare('a_2')).toBeGreaterThan(0);
    expect(compareCodeUnits('a1', 'a_2')).toBeLessThan(0);
  });
});

describe("find's result order is code-unit (§5.2, [D-16])", () => {
  /** Two records identical but for the setup name, so their scores must tie. */
  function twoRecords(): readonly DisplayRecord[] {
    const base: Omit<DisplayRecord, 'setup'> = {
      controller: 'S1D15300',
      variant: ['100X32'],
      width: 100,
      height: 32,
      tiles: { width: 13, height: 4 },
      framebufferBytes: 416,
      bus: { family: 'parallel', wiring: '6800', raw: '6800' },
      xOffset: { default: 0, flipmode: 0 },
      driver: 'u8x8_d_s1d15300_100x32',
    };
    // Deliberately supplied in the collated order, so a comparator that kept the
    // input order would pass by accident.
    return [
      { ...base, setup: PAIR[1] },
      { ...base, setup: PAIR[0] },
    ];
  }

  it('orders tied matches by code unit', () => {
    const result = identifyDisplay(twoRecords(), 's1d15300');
    const setups = result.matches.map((m) => m.setup);
    expect(setups).toEqual([PAIR[0], PAIR[1]]);
    expect(setups).not.toEqual([...setups].sort((a, b) => a.localeCompare(b)));
  });
});
