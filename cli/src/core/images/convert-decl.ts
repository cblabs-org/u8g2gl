/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/images/convert-decl.ts
 * Purpose: The one definition of what a well-formed `<convert>` declaration is
 *          (§14.2): `mode` is `threshold` or `dither`, `threshold` an integer
 *          0..255, `width` and `height` positive integers. `validate` reports
 *          these from it; the asset step consults it so that it never tries to
 *          convert a declaration the validator is about to reject. One
 *          definition means the two cannot disagree.
 * Description: Returns problems as data (attribute, message, offending text)
 *              rather than diagnostics, so `src/core/images/` stays free of the
 *              validator's conventions and the caller chooses the code and
 *              location. A `width` or `height` that is not a number at all
 *              (NaN) was already reported by the parser as a type mismatch, so
 *              it is not reported twice.
 *
 * Exports:
 * - CONVERT_MODES:       The two valid `mode` values
 * - ConvertDeclShape:    The attributes of a `<convert>` this module inspects
 * - ConvertDeclProblem:  One thing wrong with a declaration
 * - convertDeclProblems(): Every problem, in attribute order
 */

import { DEFAULT_THRESHOLD } from './png-to-xbm.js';

/** The valid `mode` values (§14.2), in the order suggestions are listed. */
export const CONVERT_MODES: readonly string[] = ['threshold', 'dither'];

/** The attributes of a `<convert>` this module reads. */
export interface ConvertDeclShape {
  readonly width: number;
  readonly height: number;
  readonly mode?: string | undefined;
  readonly threshold?: number | undefined;
}

/** One defect in a `<convert>` declaration. */
export interface ConvertDeclProblem {
  /** The attribute at fault. */
  readonly attribute: 'mode' | 'threshold' | 'width' | 'height';
  /** Prose for a diagnostic's message. */
  readonly message: string;
  /** The offending value, as written. */
  readonly offendingText: string;
  /** Valid values, for `mode` only. */
  readonly suggestions?: readonly string[];
}

/**
 * @brief Everything wrong with a `<convert>` declaration's own attributes.
 *
 * @param name The image's declared name, for the messages.
 * @param decl Its attributes.
 * @return Problems in `mode`, `threshold`, `width`, `height` order; empty when
 *         the declaration is well formed.
 */
export function convertDeclProblems(name: string, decl: ConvertDeclShape): readonly ConvertDeclProblem[] {
  const problems: ConvertDeclProblem[] = [];
  if (decl.mode !== undefined && !CONVERT_MODES.includes(decl.mode)) {
    problems.push({
      attribute: 'mode',
      message: `Invalid mode '${decl.mode}' on <convert> image '${name}'. Expected 'threshold' or 'dither'.`,
      offendingText: decl.mode,
      suggestions: CONVERT_MODES,
    });
  }
  if (decl.threshold !== undefined && (!Number.isInteger(decl.threshold) || decl.threshold < 0 || decl.threshold > 255)) {
    problems.push({
      attribute: 'threshold',
      message:
        `Invalid threshold ${decl.threshold} on <convert> image '${name}'. It must be an integer from 0 to 255 ` +
        `(default ${DEFAULT_THRESHOLD}).`,
      offendingText: String(decl.threshold),
    });
  }
  for (const attribute of ['width', 'height'] as const) {
    const value = decl[attribute];
    if (Number.isInteger(value) && value < 1) {
      problems.push({
        attribute,
        message: `Invalid ${attribute} ${value} on <convert> image '${name}'. It must be a positive integer.`,
        offendingText: String(value),
      });
    }
  }
  return problems;
}
