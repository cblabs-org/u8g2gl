/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/icon-rules.ts
 * Purpose: The one rule for what an `<api icon>` (schema 0.6) may name. The
 *          Palette draws the icon from the vendored Lucide sprite, so a name
 *          the sprite does not have would draw the fallback silently; the
 *          validator says so instead, against the same name list the designer
 *          resolves icons with (`data/icons.json`), so the two cannot disagree.
 * Description: A value is checked for shape first (empty, then lowercase
 *              kebab-case within 48 characters), then for existence, where a
 *              Lucide alias counts: aliases are the names of renamed icons, and
 *              keeping them valid means a Lucide update never breaks a manifest
 *              written against an older name. An unknown name is offered the
 *              one close canonical name when exactly one exists.
 *
 * Exports:
 * - ICON_MAX_LENGTH:     The longest icon name accepted, in characters
 * - IconProblem:         What is wrong with a value, and the fix to offer
 * - iconValueProblem():  Check one `icon` value
 */

import ICONS from '../../data/icons.json' with { type: 'json' };
import { findClosest } from '../catalogue/edit-distance.js';

/** The longest icon name accepted, in characters. Lucide's longest is 38. */
export const ICON_MAX_LENGTH = 48;

/**
 * How far a misspelling may be from a name and still be called close. Two
 * edits covers a slip or a transposed pair; three, `findClosest`'s default,
 * finds several neighbours for most names in a set of nearly two thousand,
 * which by ruling means no suggestion at all.
 */
const CLOSE_DISTANCE = 2;

/** Lowercase kebab-case: words of `a-z` and `0-9`, joined by single hyphens. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CANONICAL_NAMES: readonly string[] = ICONS.names;
const KNOWN_NAMES: ReadonlySet<string> = new Set([...ICONS.names, ...Object.keys(ICONS.aliases)]);

/** What is wrong with an `icon` value: a clause for the message, and any suggestion. */
export interface IconProblem {
  /** Completes "Widget 'x' <api icon> …", e.g. "is empty; …". */
  readonly problem: string;
  /** The one close canonical name, for an unknown name that has exactly one. */
  readonly suggestions: readonly string[];
}

/**
 * @brief Check one `<api icon>` value against the vendored icon set.
 *
 * @param value The value as parsed, already trimmed.
 * @return undefined when the value names an icon (a canonical name or an
 *         alias); otherwise what is wrong with it. A malformed value is never
 *         also reported as unknown: the shape is the thing to fix first.
 */
export function iconValueProblem(value: string): IconProblem | undefined {
  // --- Step 1: shape — empty, length, then case and hyphenation ---
  if (value === '') {
    return { problem: 'is empty; name an icon, or remove the attribute', suggestions: [] };
  }
  const length = Array.from(value).length;
  if (length > ICON_MAX_LENGTH) {
    return { problem: `is ${length} characters, over the limit of ${ICON_MAX_LENGTH}`, suggestions: [] };
  }
  if (!KEBAB_CASE.test(value)) {
    return { problem: `'${value}' is not lowercase kebab-case, as icon names are`, suggestions: [] };
  }

  // --- Step 2: existence, with one suggestion only when it is unambiguous ---
  if (KNOWN_NAMES.has(value)) return undefined;
  const close = findClosest(value, CANONICAL_NAMES, CLOSE_DISTANCE);
  return {
    problem: `'${value}' is not an icon in the vendored Lucide set (${ICONS.version})`,
    suggestions: close.length === 1 ? close : [],
  };
}
