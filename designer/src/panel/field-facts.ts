/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/field-facts.ts
 * Purpose: The facts line of a property's tooltip (ui_spec §9.2): what the
 *          manifest says of an attribute beyond its help — its type, what it
 *          may be, and its default — in one quiet line beneath the help, so
 *          the help can stay the author's prose.
 * Description: Built from the `FieldSpec` alone, so a custom widget's fields
 *              get the same line a framework one does ([D-17]). The parts are
 *              joined by ` · `: the type; an enum's members, or a binding's
 *              subject types, joined by ` | `; and `default <value>` when the
 *              manifest gives one. Pure: no React, no DOM.
 *
 * Exports:
 * - FACT_SEPARATOR:    Between the line's parts
 * - CHOICE_SEPARATOR:  Between an enum's members, or a binding's subject types
 * - fieldFacts():      The line for a field
 */

import type { FieldSpec } from './panel-layout';

/** Between the facts line's parts. */
export const FACT_SEPARATOR = ' · ';

/** Between an enum's members, or a binding's subject types. */
export const CHOICE_SEPARATOR = ' | ';

/**
 * @brief The facts line for a field: its type, then an enum's members or a
 *        binding's subject types, then its default.
 *
 * `enum · clip | dots | scroll | scroll_circular · default clip`, say, or
 * `int · default 16`, or `subject · string | int` for a binding. Only an enum
 * lists its members: a colour's are the draw colours every colour field has,
 * and the control already offers them.
 *
 * @param spec The field.
 * @return The line; never empty, since every field has a type.
 */
export function fieldFacts(spec: FieldSpec): string {
  const parts: string[] = [spec.type];
  const choices = spec.kind === 'binding' ? spec.subjectTypes : spec.type === 'enum' ? spec.options : [];
  if (choices.length > 0) parts.push(choices.join(CHOICE_SEPARATOR));
  // An empty default is a real one, the empty string, and is shown quoted so
  // the line does not end in a bare "default".
  if (spec.default !== undefined) parts.push(`default ${spec.default === '' ? '""' : spec.default}`);
  return parts.join(FACT_SEPARATOR);
}
