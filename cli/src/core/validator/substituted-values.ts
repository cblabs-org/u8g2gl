/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/substituted-values.ts
 * Purpose: A value passed into a composite must be checked exactly as if it had
 *          been written where the template uses it (PR-04 WO7 F4/F5): a font
 *          name, image, style or enum member reaching a `$prop` in a `<view>` is
 *          unknowable in the template and was never checked. The passes that
 *          check such values as written (Pass 2, Pass 4) check the substituted
 *          ones too — and this module is the single rule for where, and how
 *          often, those diagnostics are reported, so the two passes cannot
 *          disagree about it.
 * Description: One diagnostic per defect. A diagnostic about a substituted value
 *              is located at the element that uses it (in the composite's file).
 *              When the argument is fixed by the template — a declared default,
 *              or a literal written inside another composite's `<view>` — the
 *              defect is the template's, so it is reported once, naming the prop
 *              and no instance. Otherwise it names its instance. When the pass
 *              already reported the same code at the argument itself (Pass 2
 *              checks any `font` attribute, on a composite instance too), it is
 *              not said again at the use. Isomorphic.
 *
 * Exports:
 * - SubstitutedReporter:  Records one diagnostic about a substituted value
 * - reportSubstituted():  A reporter appending to a pass's diagnostics
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { withInstantiation, type ExpandedElement, type Substitution } from '../resolver/index.js';

/** A `$prop` reference anywhere in a value — expansion's placeholder grammar. */
const PROP_REFERENCE = /\$[A-Za-z_][A-Za-z0-9_]*/;

/**
 * @brief The first `$prop` reference in a value, spelled with its `$`.
 *
 * @param value An attribute value as parsed; a boolean or absent value has none.
 * @return The reference, e.g. `'$face'`, or undefined.
 */
export function propReferenceIn(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? (PROP_REFERENCE.exec(value)?.[0] ?? undefined) : undefined;
}

/**
 * @brief The diagnostic for a `$prop` written outside any composite `<view>`.
 *
 * A `$name` is a template parameter (§8.3), so it has a value only where a
 * composite's `<api>` declares it and an instance binds it. Written in a screen
 * there is nothing to substitute, and before PR-04 WO8a the passes that check a
 * value simply skipped it — so `font="$f"` in a screen validated and would have
 * reached output as the literal text `$f`.
 *
 * The one spelling of this rule, so Pass 2 and Pass 4 cannot word it differently.
 *
 * @param reference The reference as written, e.g. `'$face'`.
 * @param where     Prose naming the value: `'font' on <u8g2gl_label> 'title'`.
 * @param loc       The attribute's own location.
 * @return The `U8G2GL_UNSUBSTITUTED_PROP` diagnostic.
 */
export function unsubstitutedPlaceholder(
  reference: string,
  where: string,
  loc: SourceLocation | undefined,
): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message:
      `'${reference}' in ${where} is written outside any composite's <view>, where there are no ` +
      `props to substitute, so it would reach output literally. A $prop has a value only inside ` +
      `the <view> of a composite that declares it in its <api> (§8.3, §13.6).`,
    offendingText: reference,
  };
}

/**
 * Records one diagnostic about a value expansion substituted.
 *
 * @param diagnostic   The diagnostic as the check produced it for the expanded node.
 * @param substitution The substitution that supplied the value.
 * @param element      The expanded element using it.
 */
export type SubstitutedReporter = (diagnostic: Diagnostic, substitution: Substitution, element: ExpandedElement) => void;

// locationKey
// A code at a place — "this pass already said this kind of thing here".
function locationKey(file: string, line: number, column: number, code: string): string {
  return `${file}:${line}:${column}:${code}`;
}

// fullKey
// A diagnostic's identity: the fields finaliseDiagnostics deduplicates on.
function fullKey(diagnostic: Diagnostic): string {
  return `${locationKey(diagnostic.file, diagnostic.line, diagnostic.column, diagnostic.code)}:${diagnostic.message}`;
}

/**
 * @brief A reporter that appends diagnostics about substituted values to `diagnostics`.
 *
 * Create it after the pass has checked every value as written, so a fact already
 * reported at an argument is recognised.
 *
 * @param diagnostics The pass's output; read for what is already reported, and appended to.
 * @return The reporter.
 */
export function reportSubstituted(diagnostics: Diagnostic[]): SubstitutedReporter {
  const reportedAt = new Set(diagnostics.map((d) => locationKey(d.file, d.line, d.column, d.code)));
  const reported = new Set(diagnostics.map(fullKey));

  return (diagnostic, substitution, element) => {
    const { argument } = substitution;

    // --- Step 1: Already said at the argument, where the author wrote the value ---
    const at = argument.loc;
    if (argument.from === 'argument' && at && reportedAt.has(locationKey(at.file, at.line, at.column, diagnostic.code))) {
      return;
    }

    // --- Step 2: A fixed value is the template's fact; any other names its instance ---
    const placed = argument.fixed
      ? {
          ...diagnostic,
          message:
            `${diagnostic.message} (the ${argument.from === 'default' ? 'declared default' : 'value'} ` +
            `of prop '${argument.prop}')`,
        }
      : withInstantiation(diagnostic, element.instantiation);

    // --- Step 3: Once ---
    const key = fullKey(placed);
    if (reported.has(key)) {
      return;
    }
    reported.add(key);
    reportedAt.add(locationKey(placed.file, placed.line, placed.column, placed.code));
    diagnostics.push(placed);
  };
}
