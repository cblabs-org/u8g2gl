/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/icons/icon.tsx
 * Purpose: Draws one Lucide icon by name, wherever the designer's chrome shows
 *          one (the Palette's tiles first). The whole set is one sprite file
 *          the page fetches once and the browser caches, referenced by
 *          `<use>`, so ~1,900 icons cost the bundle nothing until drawn and
 *          the CLI carries no SVG at all.
 * Description: The sprite is a Vite asset, emitted beside the bundle and served
 *              by the design server under the token path like every other
 *              designer file. Its symbols carry geometry only; Lucide's stroke
 *              style is set here, on the `<svg>`, and inherited through
 *              `<use>`, so an icon takes the text colour around it. An unknown
 *              name draws Lucide's `puzzle`, the generic fallback, and is
 *              marked `data-icon-missing` so it can be found.
 *
 * Exports:
 * - Icon:  The component
 */

import SPRITE_URL from './lucide-sprite.svg?url';
import { resolveIcon } from './icon-names';

/** The {@link Icon}'s properties. */
interface IconProps {
  /** A Lucide name or alias. */
  readonly name: string;
  /** Width and height in CSS pixels. */
  readonly size?: number;
  readonly className?: string;
}

/** The fallback for a name the set does not have. */
const FALLBACK = 'puzzle';

/** @brief One icon. Decorative: the label beside it carries the meaning. */
export function Icon({ name, size = 24, className }: IconProps): React.JSX.Element {
  const symbol = resolveIcon(name);
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={symbol ?? FALLBACK}
      data-icon-missing={symbol === undefined ? name : undefined}
    >
      <use href={`${SPRITE_URL}#${symbol ?? FALLBACK}`} />
    </svg>
  );
}
