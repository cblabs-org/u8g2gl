/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/value-rules.ts
 * Purpose: What a `bool` and an `enum` value may be, as one rule each. An
 *          element's attribute, an element's `style_*` override and a `<style>`'s
 *          own property all set the same nine §10 properties through the same
 *          `u8g2gl_obj` props, so they must accept exactly the same values and
 *          say the same thing when they do not. Before PR-04 WO11b's follow-up
 *          they did not: Pass 1 carried its own sets for a style's `draw_color`,
 *          `align`, `font_mode` and `bitmap_mode` and checked them only on
 *          global styles, and `invert="yes"` on a style parsed to `false` with
 *          nothing said at all (finding 12).
 * Description: Two functions, each returning the diagnostic an element's bad
 *              value gets — `U8G2GL_INVALID_ENUM_VALUE`, an error, with the
 *              members as suggestions — or undefined when the value is fine. The
 *              caller supplies the prose naming what it is checking, so one rule
 *              serves an attribute, an override and a style property. Isomorphic.
 *
 * Exports:
 * - BOOLEAN_VALUES:        The only values a boolean takes (§7.2)
 * - booleanValueError():   The diagnostic for a value that is not one of them
 * - enumValueError():      The diagnostic for a value outside a declared set
 */

import { findClosest } from '../catalogue/edit-distance.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';

/** The only values a boolean attribute or property may take (§7.2). */
export const BOOLEAN_VALUES: readonly string[] = ['true', 'false'];

// invalidValue
// The one shape of a bad-value diagnostic: the code and severity an element's
// attribute gets, with the members it could have been as suggestions.
function invalidValue(
  value: string,
  message: string,
  loc: SourceLocation | undefined,
  allowed: readonly string[],
): Diagnostic {
  const suggestions = findClosest(value, allowed);
  return {
    code: DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText: value,
    ...(suggestions.length > 0 ? { suggestions } : { suggestions: [...allowed] }),
  };
}

/**
 * @brief The diagnostic for a boolean that is neither `true` nor `false` (§7.2).
 *
 * @param value   The value as written; a `$`-reference is not yet a value.
 * @param subject Prose naming it: `'invert' on <style> 'note'`.
 * @param loc     Where it is written.
 * @return The diagnostic, or undefined when the value is a boolean.
 */
export function booleanValueError(value: string, subject: string, loc: SourceLocation | undefined): Diagnostic | undefined {
  if (value.startsWith('$') || BOOLEAN_VALUES.includes(value)) {
    return undefined;
  }
  return invalidValue(
    value,
    `Invalid value '${value}' for ${subject}: it is a boolean, 'true' or 'false' (§7.2).`,
    loc,
    BOOLEAN_VALUES,
  );
}

/**
 * @brief The diagnostic for a value outside an enum's declared members.
 *
 * @param value   The value as written; empty or a `$`-reference is not yet a value.
 * @param allowed The members, in declaration order.
 * @param name    The property's name, e.g. `align`.
 * @param owner   Prose naming what carries it: `<u8g2gl_label>`, `<style> 'note'`.
 * @param loc     Where it is written.
 * @return The diagnostic, or undefined when the value is a member.
 */
export function enumValueError(
  value: string,
  allowed: readonly string[],
  name: string,
  owner: string,
  loc: SourceLocation | undefined,
): Diagnostic | undefined {
  if (value === '' || value.startsWith('$') || allowed.includes(value)) {
    return undefined;
  }
  return invalidValue(
    value,
    `Invalid value '${value}' for enum property '${name}' on ${owner}. Expected one of: ${allowed.join(', ')}.`,
    loc,
    allowed,
  );
}
