/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette-entries.ts
 * Purpose: What the Palette lists (ui_spec §6): every element a screen may
 *          use, by tag, in three groups — the framework's widgets, the
 *          project's own `<widget>` manifests, and the drawing elements. The
 *          list is generated from the manifest registry, the same one the
 *          validator reads, so an element the project adds appears the moment
 *          its manifest parses and nothing is ever listed by hand ([D-17]).
 * Description: A tag's group is decided from its manifest: a drawing element
 *              (`isDrawingElement`, [D-18]) is *Drawing* whoever declared it;
 *              any other is *Framework* or *Project* by the registry's origin.
 *              Within a group tags keep registry order — framework first, then
 *              project, each in the order it was declared. No icon, category
 *              or description is invented: palette metadata is not part of the
 *              schema (EDITOR-DESIGN §8). The filter narrows by a
 *              case-insensitive substring of the tag; a group left empty is
 *              dropped.
 *
 * Exports:
 * - PALETTE_DRAG_TYPE:  The drag data type a Palette tag carries
 * - PaletteGroupTitle:  The three group headings
 * - PaletteGroup:       One heading and its tags
 * - paletteGroups():    The registry's tags, grouped
 * - filterPalette():    The groups narrowed by a filter string
 */

import { isDrawingElement, type ManifestRegistry } from '@u8g2gl/core/manifest/index.js';

/** The drag data type a Palette tag carries from the sidebar to the canvas: its value is the tag. */
export const PALETTE_DRAG_TYPE = 'application/x-u8g2gl-tag';

/** The Palette's group headings, in the order they are shown. */
export type PaletteGroupTitle = 'Framework' | 'Project' | 'Drawing';

/** One Palette group: a heading and the tags under it, in registry order. */
export interface PaletteGroup {
  readonly title: PaletteGroupTitle;
  readonly tags: readonly string[];
}

/** The groups in display order. */
const GROUP_ORDER: readonly PaletteGroupTitle[] = ['Framework', 'Project', 'Drawing'];

/**
 * @brief Every tag the registry knows, grouped for the Palette.
 *
 * @param registry The project's manifest registry.
 * @return Framework, Project and Drawing, in that order, empty groups omitted.
 */
export function paletteGroups(registry: ManifestRegistry): PaletteGroup[] {
  const byGroup = new Map<PaletteGroupTitle, string[]>(GROUP_ORDER.map((title) => [title, []]));
  for (const tag of registry.tags) {
    const manifest = registry.get(tag);
    if (manifest === undefined) continue;
    // A drawing element is classified by what it is, not who declared it: a
    // project may declare one too, and it behaves as the framework's do.
    const title: PaletteGroupTitle = isDrawingElement(manifest.declared) ? 'Drawing' : manifest.origin === 'framework' ? 'Framework' : 'Project';
    byGroup.get(title)?.push(tag);
  }
  return GROUP_ORDER.map((title) => ({ title, tags: byGroup.get(title) ?? [] })).filter((group) => group.tags.length > 0);
}

/**
 * @brief The groups with only the tags that contain `filter`.
 *
 * @param groups The full groups.
 * @param filter What the user typed; blank keeps everything.
 * @return The narrowed groups, empty ones omitted.
 */
export function filterPalette(groups: readonly PaletteGroup[], filter: string): PaletteGroup[] {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return [...groups];
  return groups
    .map((group) => ({ title: group.title, tags: group.tags.filter((tag) => tag.toLowerCase().includes(needle)) }))
    .filter((group) => group.tags.length > 0);
}
