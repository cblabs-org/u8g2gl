/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette-entries.ts
 * Purpose: What the Palette lists (ui_spec §6): every element a screen may
 *          use, in three groups — the framework's widgets, the project's own
 *          `<widget>` manifests, and the drawing elements — each filed under
 *          the category its manifest gives it, and shown by its label. The
 *          list is generated from the manifest registry, the same one the
 *          validator reads, so an element the project adds appears the moment
 *          its manifest parses and nothing is ever listed by hand ([D-17]).
 * Description: A tag's group is decided from its manifest: a drawing element
 *              (`isDrawingElement`, [D-18]) is *Drawing* whoever declared it;
 *              any other is *Framework* or *Project* by the registry's origin.
 *
 *              Schema 0.5's palette metadata does the rest. Within a group,
 *              entries are arranged by their `<api category>`, the categories
 *              in the order each first appears in the registry as a whole, so
 *              a heading keeps its place across the three groups; entries with
 *              no category come last, under no heading. Within a category,
 *              entries keep registry order — framework first, then project,
 *              each in the order it was declared. Each entry carries the
 *              element's `label` and `description` when its manifest declares
 *              them; nothing is invented for one that does not, and the
 *              metadata is the element's own, never inherited ([D-17]).
 *
 *              The filter narrows by a case-insensitive substring of the
 *              label, the tag or the description; a category or group left
 *              empty is dropped.
 *
 * Exports:
 * - PALETTE_DRAG_TYPE:  The drag data type a Palette entry carries
 * - PaletteGroupTitle:  The three group headings
 * - PaletteEntry:       One element: its tag, and its label and description if any
 * - PaletteSection:     One category's entries, or the uncategorised ones
 * - PaletteGroup:       One heading and its sections
 * - paletteGroups():    The registry's elements, grouped and categorised
 * - filterPalette():    The groups narrowed by a filter string
 */

import { isDrawingElement, type ManifestRegistry } from '@u8g2gl/core/manifest/index.js';

/** The drag data type a Palette entry carries from the sidebar to the canvas: its value is the tag. */
export const PALETTE_DRAG_TYPE = 'application/x-u8g2gl-tag';

/** The Palette's group headings, in the order they are shown. */
export type PaletteGroupTitle = 'Framework' | 'Project' | 'Drawing';

/** One element in the Palette. */
export interface PaletteEntry {
  /** The element's tag, what a drop inserts. */
  readonly tag: string;
  /** Its `<api label>`, shown in place of the tag; absent when it declares none. */
  readonly label?: string;
  /** Its `<api description>`, shown beneath; absent when it declares none. */
  readonly description?: string;
}

/** One category's entries within a group, in registry order. */
export interface PaletteSection {
  /** The `<api category>` heading; absent for the entries that declare none, which come last. */
  readonly category?: string;
  readonly entries: readonly PaletteEntry[];
}

/** One Palette group: a heading and its sections, in display order. */
export interface PaletteGroup {
  readonly title: PaletteGroupTitle;
  readonly sections: readonly PaletteSection[];
}

/** The groups in display order. */
const GROUP_ORDER: readonly PaletteGroupTitle[] = ['Framework', 'Project', 'Drawing'];

/** One element placed: its group, its category, and what the Palette shows for it. */
interface Placed {
  readonly title: PaletteGroupTitle;
  readonly category: string | undefined;
  readonly entry: PaletteEntry;
}

// shown
// A metadata value worth showing: the schema pass refuses an empty one, but
// the registry is built from whatever parsed, so the Palette must not show a
// blank label or heading while that diagnostic stands.
//   value — a trimmed `<api>` attribute, or undefined
function shown(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * @brief Every element the registry knows, grouped and categorised for the Palette.
 *
 * @param registry The project's manifest registry.
 * @return Framework, Project and Drawing, in that order, empty groups omitted;
 *         within each, its categories in registry first-appearance order, then
 *         its uncategorised entries.
 */
export function paletteGroups(registry: ManifestRegistry): PaletteGroup[] {
  // --- Step 1: Each element's group, category and entry, in registry order ---
  const rank = new Map<string, number>();
  const placed: Placed[] = [];
  for (const tag of registry.tags) {
    const manifest = registry.get(tag);
    if (manifest === undefined) continue;
    // A drawing element is classified by what it is, not who declared it: a
    // project may declare one too, and it behaves as the framework's do.
    const title: PaletteGroupTitle = isDrawingElement(manifest.declared) ? 'Drawing' : manifest.origin === 'framework' ? 'Framework' : 'Project';
    // The declared `<api>`: the metadata describes the element that wrote it.
    const { api } = manifest.declared;
    const category = shown(api.category);
    if (category !== undefined && !rank.has(category)) rank.set(category, rank.size);
    const label = shown(api.label);
    const description = shown(api.description);
    const entry: PaletteEntry = { tag, ...(label !== undefined ? { label } : {}), ...(description !== undefined ? { description } : {}) };
    placed.push({ title, category, entry });
  }

  // --- Step 2: Sections per group, categories by first appearance, the rest last ---
  const order = (category: string | undefined): number => (category === undefined ? rank.size : (rank.get(category) ?? rank.size));
  return GROUP_ORDER.map((title): PaletteGroup => {
    const byCategory = new Map<string | undefined, PaletteEntry[]>();
    for (const item of placed) {
      if (item.title !== title) continue;
      const entries = byCategory.get(item.category) ?? [];
      entries.push(item.entry);
      byCategory.set(item.category, entries);
    }
    // A stable sort over first-insertion order, so equal ranks cannot reorder.
    const sections = [...byCategory.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([category, entries]): PaletteSection => (category === undefined ? { entries } : { category, entries }));
    return { title, sections };
  }).filter((group) => group.sections.length > 0);
}

/**
 * @brief The groups with only the entries whose label, tag or description contains `filter`.
 *
 * @param groups The full groups.
 * @param filter What the user typed; blank keeps everything.
 * @return The narrowed groups, empty sections and groups omitted.
 */
export function filterPalette(groups: readonly PaletteGroup[], filter: string): PaletteGroup[] {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return [...groups];
  const matches = (entry: PaletteEntry): boolean =>
    [entry.label, entry.tag, entry.description].some((text) => text !== undefined && text.toLowerCase().includes(needle));
  return groups
    .map((group) => ({
      title: group.title,
      sections: group.sections
        .map((section) => ({ ...section, entries: section.entries.filter(matches) }))
        .filter((section) => section.entries.length > 0),
    }))
    .filter((group) => group.sections.length > 0);
}
