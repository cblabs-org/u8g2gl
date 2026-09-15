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

import type { Diagnostic } from '../schema/diagnostic.js';
import { withInstantiation, type ExpandedElement, type Substitution } from '../resolver/index.js';

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
