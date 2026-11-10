/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette-icons.ts
 * Purpose: Which icon a Palette tile shows. An element's own icon comes
 *          first, then its category's, then a generic one, so every tile has
 *          an icon and an author's new category still gets one. For now the
 *          framework's elements get theirs from a map here, because their
 *          manifests cannot yet say (see the map's comment).
 * Description: `paletteIcon()` walks the lookup order and returns the first
 *              name the vendored set has (`resolveIcon`), so a typo in a table
 *              falls through to the next step rather than drawing nothing.
 *
 * Exports:
 * - FRAMEWORK_TAG_ICONS:  Each framework element's icon (temporary; see below)
 * - CATEGORY_ICONS:       Each framework category's icon
 * - FALLBACK_ICON:        The icon of last resort
 * - paletteIcon():        A tile's icon, by the lookup order
 */

import { resolveIcon } from '../icons/icon-names';

/**
 * Each framework element's icon, by tag.
 *
 * This is the one place designer code names framework elements, and so the
 * one exception to "element knowledge is data, never code" ([D-17]). It exists
 * because a manifest cannot carry an icon until schema 0.6 adds `icon=` to
 * `<api>`. **S-2 moves these icons into the framework's manifests and deletes
 * this map**; until then, a framework element added without an entry here
 * shows its category's icon, which a unit test catches.
 */
export const FRAMEWORK_TAG_ICONS: ReadonlyMap<string, string> = new Map([
  ['u8g2gl_box', 'square'],
  ['u8g2gl_button', 'square-mouse-pointer'],
  ['u8g2gl_circle', 'circle'],
  ['u8g2gl_clock', 'clock'],
  ['u8g2gl_ellipse', 'ellipse'],
  ['u8g2gl_glyph', 'case-sensitive'],
  ['u8g2gl_hline', 'separator-horizontal'],
  ['u8g2gl_label', 'text-cursor'],
  ['u8g2gl_line', 'slash'],
  ['u8g2gl_obj', 'square-dashed'],
  ['u8g2gl_pixel', 'dot'],
  ['u8g2gl_progress_bar', 'battery-medium'],
  ['u8g2gl_switch', 'toggle-right'],
  ['u8g2gl_triangle', 'triangle'],
  ['u8g2gl_vline', 'separator-vertical'],
  ['u8g2gl_xbm', 'file-image'],
]);

/**
 * The framework's six categories' icons. A category is data an author can
 * write too; one this table does not know falls to {@link FALLBACK_ICON}.
 */
export const CATEGORY_ICONS: ReadonlyMap<string, string> = new Map([
  ['Controls', 'toggle-left'],
  ['Drawing', 'shapes'],
  ['Images', 'image'],
  ['Indicators', 'gauge'],
  ['Layout', 'layout-template'],
  ['Text', 'type'],
]);

/** The icon of last resort: an element with no icon and no known category. */
export const FALLBACK_ICON = 'puzzle';

/**
 * @brief The icon a Palette tile shows.
 *
 * The order: the element's own icon, then its category's, then
 * {@link FALLBACK_ICON}. Each step counts only if the vendored set has the
 * name.
 *
 * @param tag      The element's tag.
 * @param category Its `<api category>`, if it declares one.
 * @return A canonical icon name.
 */
export function paletteIcon(tag: string, category: string | undefined): string {
  const candidates = [FRAMEWORK_TAG_ICONS.get(tag), category === undefined ? undefined : CATEGORY_ICONS.get(category)];
  for (const candidate of candidates) {
    const resolved = candidate === undefined ? undefined : resolveIcon(candidate);
    if (resolved !== undefined) return resolved;
  }
  return FALLBACK_ICON;
}
