/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette-icons.ts
 * Purpose: Which icon a Palette tile shows. An element's own icon, its
 *          `<api icon>` (schema 0.6), comes first, then its category's, then a
 *          generic one, so every tile has an icon and an author's widget with
 *          none, or a new category, still gets one. The element's icon is data
 *          in its manifest, framework and project alike, so no element is
 *          named here ([D-17]).
 * Description: `paletteIcon()` walks the lookup order and returns the first
 *              name the vendored set has (`resolveIcon`), so an unknown name,
 *              which the validator reports, falls through to the next step
 *              rather than drawing nothing.
 *
 * Exports:
 * - CATEGORY_ICONS:       Each framework category's icon
 * - FALLBACK_ICON:        The icon of last resort (`icon-names.ts`'s, re-exported)
 * - paletteIcon():        A tile's icon, by the lookup order
 */

import { FALLBACK_ICON, resolveIcon } from '../icons/icon-names';

export { FALLBACK_ICON };

/**
 * The framework's categories' icons. A category is data an author can
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

/**
 * @brief The icon a Palette tile shows.
 *
 * The order: the element's own icon, then its category's, then
 * {@link FALLBACK_ICON}. Each step counts only if the vendored set has the
 * name; an alias counts, and resolves to its canonical name.
 *
 * @param icon     The element's `<api icon>`, if it declares one.
 * @param category Its `<api category>`, if it declares one.
 * @return A canonical icon name.
 */
export function paletteIcon(icon: string | undefined, category: string | undefined): string {
  const candidates = [icon, category === undefined ? undefined : CATEGORY_ICONS.get(category)];
  for (const candidate of candidates) {
    const resolved = candidate === undefined ? undefined : resolveIcon(candidate);
    if (resolved !== undefined) return resolved;
  }
  return FALLBACK_ICON;
}
