/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-realisation.ts
 * Purpose: Pass 9 — judges the document against what it will actually become.
 *          Realisation (§13.5, §13.3) is the only thing that knows how many C++
 *          objects a screen produces, so it is the only thing that can enforce
 *          §13.3's 254-object ceiling; and the refusals it raises must reach the
 *          authoring journey as warnings rather than surfacing for the first
 *          time when `generate` refuses the build (PR-04 decision 1).
 * Description: Two checks, both reading one realisation of the run's shared
 *              model — never a second analysis of its own.
 *
 *              **The object ceiling.** `parent_index_` is a `uint8_t` and
 *              `U8G2GL_NO_PARENT` consumes one of its values ([A-3], [D-21]), so
 *              a screen holds at most `MAX_OBJECTS_PER_SCREEN` objects. Pass 1
 *              used to count this structurally, before [D-18]: it skipped
 *              composite containers and counted `draw=`-only elements, both of
 *              which that decision inverted, so the count could come out
 *              **lower** than the truth and a 256-object screen validated and
 *              generated with no diagnostic at all (PR-04 WO8b finding 1,
 *              reproduced end to end). The exact count replaces it, and there is
 *              now exactly one object count in the codebase.
 *
 *              **The refusal severity.** Realisation raises
 *              `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` for an element with no
 *              class that something requires an object of. Raised inside
 *              `generate()` alone, it made `validate` pass a document `generate`
 *              refuses — the journey split decision 1 exists to prevent. The
 *              diagnostics are re-stamped here at the run's policy, using the
 *              same `'warning'`/`'error'` mechanism Pass 8 takes, so both
 *              journeys report the same code at the same location and differ
 *              only in severity. Realisation's own analysis is untouched: it
 *              states the fact, this pass states what the fact costs the caller.
 *
 * Exports:
 * - validateRealisation(input): Runs Pass 9
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import { MAX_OBJECTS_PER_SCREEN } from '../generator/realise/index.js';
import type { ValidateInput } from './validate.js';
import { realisationOf } from './shared-model.js';
import { DEFAULT_REFUSAL_POLICY } from './validate-not-yet-supported.js';

/**
 * Reports the object ceiling and realisation's refusals (Pass 9).
 *
 * @param input Validator input. `input.refusalPolicy` sets the severity of
 *              realisation's refusals, defaulting to
 *              {@link DEFAULT_REFUSAL_POLICY}; the ceiling is always an
 *              error, because it is a property of the object model rather than
 *              something a later PR delivers.
 * @return One `U8G2GL_TOO_MANY_OBJECTS` per overflowing screen, in document
 *         order, followed by realisation's own diagnostics at the run's policy.
 */
export function validateRealisation(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const realisation = realisationOf(input);

  // --- Step 1: The structural object ceiling, counted exactly (§13.3) ---
  // The count is the length of the object array realisation built, which is
  // precisely what emission writes a parent table for — so the check cannot
  // disagree with the thing it is protecting.
  for (const screen of realisation.screens) {
    const objectCount = screen.objects.length;
    if (objectCount <= MAX_OBJECTS_PER_SCREEN) {
      continue;
    }
    const loc = screen.screen.loc;
    diagnostics.push({
      code: DIAGNOSTIC_CODES.TOO_MANY_OBJECTS,
      severity: 'error',
      file: loc?.file ?? '',
      line: loc?.line ?? 1,
      column: loc?.column ?? 1,
      message:
        `Screen '${screen.screen.name}' has ${objectCount} objects, exceeding the structural ` +
        `ceiling of ${MAX_OBJECTS_PER_SCREEN} (parent_index_ is a uint8_t and ` +
        `U8G2GL_NO_PARENT consumes one value).`,
      offendingText: screen.screen.name,
    });
  }

  // --- Step 2: Realisation's refusals, at the caller's policy (decision 1) ---
  // Re-stamped rather than re-raised: realisation decides *that* an element
  // cannot be built, and the journey decides what that costs — a warning while
  // authoring, an error in the build that would otherwise emit code for an
  // element it has no class to instantiate.
  const severity = input.refusalPolicy ?? DEFAULT_REFUSAL_POLICY;
  for (const diagnostic of realisation.diagnostics) {
    diagnostics.push({ ...diagnostic, severity });
  }

  return diagnostics;
}
