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
 *          rules the u8g2gl.xml editor applies around it: which rotations a
 *          project's schema offers, how a rotation reads, and what a rotation
 *          does to the size the layout is drawn at.
 * Description: Pure functions over `DisplayRecord`s, so the picker's grouping,
 *              filtering and the rotation rules are unit-tested without a
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
 * - MIRRORS_SINCE:        The schema version the mirror rotations arrived in
 * - rotationOptions():    The rotations the select offers at a schema version
 * - rotationLabel():      A rotation with its angle, or a mirror with its axis
 * - orientedNote():       The size a rotation shows a panel at, when it differs
 * - rotationResizes():    Whether changing a rotation changes the layout's size
 */

import { identifyDisplay } from '@u8g2gl/core/catalogue/index.js';
import type { BusFamily, DisplayRecord } from '@u8g2gl/core/schema/display-record.js';
import { orientedDisplay } from '@u8g2gl/core/resolver/index.js';
import { MIRROR_ROTATIONS, ROTATION_DEGREES, ROTATION_VALUES } from '@u8g2gl/core/schema/index.js';

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
 * @brief The size a rotation shows a panel at, beside its own: `shown 64×256 at R1`.
 *
 * The picker lists every panel at the size the catalogue records, because that
 * is the part being chosen; this says what the canvas will be drawn at instead
 * when the target's rotation turns it a quarter (design_spec §5.1).
 *
 * @param record   The panel.
 * @param rotation The target's rotation as written, or undefined when absent.
 * @return The note, or undefined when the rotation leaves the size alone (R0,
 *         R2, unset or invalid).
 */
export function orientedNote(record: DisplayRecord, rotation: string | undefined): string | undefined {
  const oriented = orientedDisplay(record, rotation);
  if (oriented.width === record.width && oriented.height === record.height) return undefined;
  return `shown ${oriented.width}×${oriented.height} at ${oriented.rotation}`;
}

/**
 * @brief Whether changing a target's rotation changes the size its layout is
 *        resolved at, so the change should go through the impact preview.
 *
 * R0↔R2, R1↔R3 and the two mirrors keep the size, and apply directly; a
 * quarter turn swaps it, which can push elements off the panel (ui_spec §6.4).
 *
 * @param record The target's panel; undefined when the catalogue has none, and
 *               then nothing can be previewed, so the change applies directly.
 * @param from   The rotation as written now.
 * @param to     The candidate.
 */
export function rotationResizes(record: DisplayRecord | undefined, from: string | undefined, to: string | undefined): boolean {
  if (record === undefined) return false;
  const before = orientedDisplay(record, from);
  const after = orientedDisplay(record, to);
  return before.width !== after.width || before.height !== after.height;
}

/**
 * The schema version whose `rotation` may be a mirror (design_spec §15.4). The
 * validator refuses one in an older project, so the select does not offer it.
 */
export const MIRRORS_SINCE = { major: 0, minor: 7 } as const;

// schemaHasMirrors
// Whether a project's declared schema has the mirrors: 0.7 or later, compared
// as numbers so 0.10 is later than 0.7. An unreadable version offers them, as
// the validator has already said what is wrong with it.
//   schema — the project's `schema` attribute
function schemaHasMirrors(schema: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)$/.exec(schema ?? '');
  if (match === null) return true;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > MIRRORS_SINCE.major || (major === MIRRORS_SINCE.major && minor >= MIRRORS_SINCE.minor);
}

/**
 * @brief The rotations the rotation select offers, in the vocabulary's order.
 *
 * Every turning rotation, and the mirrors only where the project's schema has
 * them; a value already written is always offered, so it is shown rather than
 * silently replaced, whatever it is.
 *
 * @param schema  The project's declared schema version.
 * @param written The target's rotation as written, or undefined.
 */
export function rotationOptions(schema: string | undefined, written: string | undefined): readonly string[] {
  const offered = schemaHasMirrors(schema) ? ROTATION_VALUES : ROTATION_VALUES.filter((value) => !MIRROR_ROTATIONS.includes(value));
  return written === undefined || offered.includes(written) ? offered : [...offered, written];
}

/** Each mirror's axis, as the select names it. */
const MIRROR_LABELS: Readonly<Record<string, string>> = {
  MIRROR: 'mirrored left–right',
  MIRROR_VERTICAL: 'mirrored top–bottom',
};

/** @brief A rotation as written, with its angle (`R1 · 90°`), or a mirror with its axis (`MIRROR · mirrored left–right`). */
export function rotationLabel(rotation: string): string {
  const mirror = MIRROR_LABELS[rotation];
  if (mirror !== undefined) return `${rotation} · ${mirror}`;
  const degrees = ROTATION_DEGREES[rotation];
  return degrees === undefined || String(degrees) === rotation ? `${rotation}°` : `${rotation} · ${degrees}°`;
}
