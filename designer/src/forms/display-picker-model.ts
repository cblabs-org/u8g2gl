/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/display-picker-model.ts
 * Purpose: What the display picker offers, from the display catalogue alone
 *          ([D-14], ui_spec §6.4): the controllers, then each controller's sizes
 *          and variants, then each variant's bus wirings, and a search over
 *          the full setup name for those who know the part. Every option
 *          carries what the catalogue knows and nothing it does not. Also the
 *          rules the u8g2gl.xml editor applies around it: which bus fields a
 *          family uses, and how a rotation reads in degrees.
 * Description: Pure functions over `DisplayRecord`s, so the picker's grouping,
 *              filtering and the bus-field rules are unit-tested without a
 *              browser. The search matches every word of the query inside the
 *              setup name, shortest names first; with no such match it falls
 *              back to the CLI's own `u8g2gl find` (`identifyDisplay`), which
 *              also gives its variant notes.
 *
 * Exports:
 * - U8G2_SETUP_WIKI:      U8G2's page of setup constructors, which a controller links to
 * - ControllerOption:     One controller and how many setups it has
 * - VariantOption:        One size and variant of a controller
 * - controllerOptions():  Every controller, by name
 * - variantOptions():     A controller's sizes and variants, smallest first
 * - wiringOptions():      A variant's setups, one per bus wiring
 * - searchSetups():       Setups whose name matches a query
 * - variantKey():         The key a setup's variant is grouped by
 * - familyLabel():        A bus family as people write it
 * - busFieldApplies():    Whether a bus attribute applies to a family
 * - rotationLabel():      A rotation with its angle
 */

import { identifyDisplay } from '@u8g2gl/core/catalogue/index.js';
import type { BusFamily, DisplayRecord } from '@u8g2gl/core/schema/display-record.js';
import { ROTATION_DEGREES, type VocabularyAttribute } from '@u8g2gl/core/schema/index.js';

/**
 * U8G2's wiki page listing every setup constructor. No anchor: its format
 * could not be confirmed without fetching the page, which the designer never
 * does.
 */
export const U8G2_SETUP_WIKI = 'https://github.com/olikraus/u8g2/wiki/u8g2setupcpp';

/** One controller, and how many catalogued setups it has. */
export interface ControllerOption {
  readonly controller: string;
  readonly setups: number;
}

/** One size and variant of a controller: the setups that differ only in bus wiring. */
export interface VariantOption {
  /** The variant tokens joined, which identify it within the controller. */
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly framebufferBytes: number;
  readonly tiles: { readonly width: number; readonly height: number };
  /** Its setups, one per wiring. */
  readonly setups: readonly DisplayRecord[];
}

/** @brief The key a setup's variant is grouped by: its variant tokens, joined. */
export function variantKey(record: DisplayRecord): string {
  return record.variant.join(' ');
}

/** @brief Every controller in the catalogue, by name, with its count of setups. */
export function controllerOptions(catalogue: readonly DisplayRecord[]): ControllerOption[] {
  const counts = new Map<string, number>();
  for (const record of catalogue) counts.set(record.controller, (counts.get(record.controller) ?? 0) + 1);
  return [...counts].map(([controller, setups]) => ({ controller, setups })).sort((a, b) => a.controller.localeCompare(b.controller, 'en'));
}

/**
 * @brief A controller's sizes and variants: smallest display first, then by
 *        variant name, each with the setups that share it.
 */
export function variantOptions(catalogue: readonly DisplayRecord[], controller: string): VariantOption[] {
  const groups = new Map<string, DisplayRecord[]>();
  for (const record of catalogue) {
    if (record.controller !== controller) continue;
    const key = variantKey(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups]
    .map(([key, setups]): VariantOption => {
      const first = setups[0] as DisplayRecord;
      return { key, width: first.width, height: first.height, framebufferBytes: first.framebufferBytes, tiles: first.tiles, setups };
    })
    .sort((a, b) => a.width * a.height - b.width * b.height || a.key.localeCompare(b.key, 'en'));
}

/** Families in the order the picker lists wirings. */
const FAMILY_ORDER: readonly BusFamily[] = ['spi', 'i2c', 'parallel'];

/** @brief A variant's setups, one per bus wiring: SPI, then I²C, then parallel, each by name. */
export function wiringOptions(catalogue: readonly DisplayRecord[], controller: string, variant: string): DisplayRecord[] {
  return catalogue
    .filter((record) => record.controller === controller && variantKey(record) === variant)
    .sort((a, b) => FAMILY_ORDER.indexOf(a.bus.family) - FAMILY_ORDER.indexOf(b.bus.family) || a.bus.raw.localeCompare(b.bus.raw, 'en'));
}

/**
 * @brief The setups a query finds: every word of it inside the setup name
 *        (`ssd1306 128x64 i2c`), shortest names first; failing that, what the
 *        CLI's `u8g2gl find` identifies, with its notes on variants.
 *
 * @param limit The most matches returned.
 */
export function searchSetups(catalogue: readonly DisplayRecord[], query: string, limit = 40): { readonly matches: readonly DisplayRecord[]; readonly notes: readonly string[] } {
  const words = query
    .toUpperCase()
    .split(/[\s_]+/)
    .filter((word) => word !== '');
  if (words.length === 0) return { matches: [], notes: [] };
  const direct = catalogue
    .filter((record) => words.every((word) => record.setup.includes(word)))
    .sort((a, b) => a.setup.length - b.setup.length || a.setup.localeCompare(b.setup, 'en'));
  if (direct.length > 0) return { matches: direct.slice(0, limit), notes: [] };
  const found = identifyDisplay(catalogue, query);
  return { matches: found.matches.slice(0, limit), notes: [...found.notes, ...(found.message !== undefined ? [found.message] : [])] };
}

/** @brief A bus family as people write it. */
export function familyLabel(family: BusFamily): string {
  return family === 'i2c' ? 'I²C' : family === 'spi' ? 'SPI' : 'parallel';
}

/**
 * @brief Whether a bus attribute applies to a display's bus: the vocabulary's
 *        `busFamilies` says which families (address for I²C; reset for every
 *        bus; cs and dc for SPI and parallel), and `busWiringsWithout` which of
 *        their wirings lack the pin (3-wire SPI has no dc). Any attribute that
 *        is not a bus attribute applies.
 * @param attribute  The attribute.
 * @param family     The display's bus family; undefined when not known.
 * @param wiring     The display's wiring (the catalogue's `bus.wiring`), if known.
 */
export function busFieldApplies(attribute: VocabularyAttribute, family: BusFamily | undefined, wiring?: string): boolean {
  if (attribute.busFamilies === undefined || family === undefined) return true;
  if (!attribute.busFamilies.includes(family)) return false;
  return wiring === undefined || !(attribute.busWiringsWithout ?? []).includes(wiring);
}

/** @brief A rotation as written, with its angle: `R1 · 90°`. */
export function rotationLabel(rotation: string): string {
  const degrees = ROTATION_DEGREES[rotation];
  return degrees === undefined || String(degrees) === rotation ? `${rotation}°` : `${rotation} · ${degrees}°`;
}
