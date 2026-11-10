/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/icons/icon-names.ts
 * Purpose: Which icon names the designer can draw, and what an alias draws
 *          as. The names are the CLI's own list (`cli/src/data/icons.json`,
 *          the one the validator reads), so the designer and the CLI can
 *          never disagree on whether an icon exists; only the drawing — the
 *          sprite — is the designer's. Kept apart from `<Icon>` so it is a
 *          pure lookup a unit test can call without a bundler.
 * Description: A name is the canonical Lucide name or one of Lucide's aliases
 *              for a renamed icon; an alias resolves to the canonical name,
 *              which is the sprite's symbol id.
 *
 * Exports:
 * - ICON_SET_VERSION:  The vendored Lucide version
 * - FALLBACK_ICON:     The generic icon, for anything with none of its own
 * - resolveIcon():     A name's sprite symbol, or undefined if unknown
 */

import ICONS from '@u8g2gl/data/icons.json' with { type: 'json' };

/** The vendored Lucide version. */
export const ICON_SET_VERSION: string = ICONS.version;

/** The generic icon: an unknown name draws it, and the Palette's lookup ends on it. */
export const FALLBACK_ICON = 'puzzle';

const CANONICAL: ReadonlySet<string> = new Set(ICONS.names);
const ALIASES: ReadonlyMap<string, string> = new Map(Object.entries(ICONS.aliases));

/**
 * @brief The sprite symbol an icon name draws as.
 *
 * @param name A canonical Lucide name or an alias.
 * @return The canonical name, or undefined for a name Lucide does not have.
 */
export function resolveIcon(name: string): string | undefined {
  return CANONICAL.has(name) ? name : ALIASES.get(name);
}
