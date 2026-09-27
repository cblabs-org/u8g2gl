/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate.ts
 * Purpose: Main validation orchestrator running multi-pass validation (§15.1, §15.2).
 * Description: Reports the manifest registry's own diagnostics, then coordinates 7
 *              sequential validation passes across project configuration, globals,
 *              screen views and element manifests — every pass reading elements from
 *              the one registry ([D-17], [D-18]). Deterministically sorts all
 *              diagnostics by file, line, and column.
 *
 *              Geometry is checked for one target — the one `generate` builds, or
 *              the project's first — and the result says which (§7.2, PR-04 WO7b).
 *
 *              §13.9's diagnostic order lives here, as {@link compareDiagnostics},
 *              because this is the pass that first establishes it. Every other
 *              path that orders diagnostics — `check-project.ts`'s merge and the
 *              CLI's formatter — sorts through this one function, so the order a
 *              consumer reads can never depend on which path produced the list
 *              (PR-04 WO5b carry, WO12).
 *
 * Exports:
 * - ValidateInput: Complete project input model passed to the validator
 * - CheckedTarget: The target geometry was checked against, and its display
 * - ValidateResult: Deterministically ordered diagnostics and error counts
 * - compareDiagnostics(): §13.9's order — file, line, column, code, by code unit
 * - validate(input): Run all validation passes and return aggregated results
 */

import type { Target, U8g2glProject } from '../schema/project.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import type { DisplayRecord } from '../schema/display-record.js';
import type { Diagnostic } from '../schema/diagnostic.js';
import { compareCodeUnits } from '../order.js';

import type { ScreenPipeline } from '../resolver/index.js';
import type { RealisationResult } from '../generator/realise/index.js';
import { checkedTarget, pipelineOf } from './shared-model.js';
import { validateSchema } from './validate-schema.js';
import { validateReferences } from './validate-references.js';
import { validateDisplay } from './validate-display.js';
import { validateWidgetProps } from './validate-widget-props.js';
import { validateTypes } from './validate-types.js';
import { validateGeometry } from './validate-geometry.js';
import { findTargetDisplay } from '../resolver/index.js';
import { validateIdentifiers } from './validate-identifiers.js';
import {
  validateNotYetSupported,
  type RefusalPolicy,
} from './validate-not-yet-supported.js';
import { validateRealisation } from './validate-realisation.js';

/**
 * Full project and asset input structure supplied to the validator.
 */
export interface ValidateInput {
  readonly project: U8g2glProject;
  readonly globals: Globals;
  readonly screens: readonly Screen[];
  /**
   * Every element the document may instantiate — framework and project
   * manifests, plain widgets and composites alike, `extends` resolved — built
   * once by `buildManifestRegistry` ([D-17], [D-18]). One registry rather than
   * separate widget and composite lists: [D-18] leaves one element vocabulary,
   * and a split here only splits it back into two at the door. `validate()`
   * reports the registry's own diagnostics; the individual passes do not.
   */
  readonly manifests: ManifestRegistry;
  readonly catalogue: readonly DisplayRecord[];
  /**
   * Severity of a build refusal — `U8G2GL_NOT_YET_SUPPORTED` (Pass 8) and
   * realisation's `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` (Pass 9): `'warning'`
   * for authoring, `'error'` for the build. Named `notYetSupported` before
   * PR-04 WO11b. A parameter rather than a branch, like the [U-1]
   * missing-name policy, so both journeys run this one validator. Defaults to
   * `DEFAULT_REFUSAL_POLICY` (`'warning'`); `generate()` always passes
   * `'error'`.
   */
  readonly refusalPolicy?: RefusalPolicy;
  /**
   * The target whose display geometry is resolved and bounds-checked against.
   * `generate` passes the target it builds, because a screen that fits one
   * display can overflow another (§7.2, §7.3). Defaults to the project's first
   * declared target — `validate`'s behaviour.
   */
  readonly target?: Target;
  /**
   * The expansion and resolution every pass in this run shares (§13.11 step 3).
   * `validate()` builds one and threads it through, so a run expands the
   * document exactly once however many passes need the expanded tree, and
   * `generate` judges and emits from the very same model (PR-04 WO8a).
   *
   * Optional so a pass can still be called on its own in a unit test, which
   * then gets a pipeline of its own. A supplied pipeline must have been built
   * for {@link ValidateInput.target}'s display, or the run would bounds-check
   * one display and emit for another.
   */
  readonly pipeline?: ScreenPipeline;
  /**
   * What every element of that expansion becomes (§13.5, §13.3), for Pass 9.
   * `generate` realises once and supplies it, so a build realises the document
   * exactly once and the objects counted against §13.3's ceiling are the very
   * ones it will emit a parent table for.
   *
   * Optional for the same reason as {@link ValidateInput.pipeline}: a pass
   * called on its own in a unit test gets its own. A supplied realisation must
   * be of {@link ValidateInput.pipeline}'s expansion.
   */
  readonly realisation?: RealisationResult;
}

/**
 * The target a validation run checked geometry against.
 */
export interface CheckedTarget {
  readonly name: string;
  readonly setup: string;
  /** The display's size, when the catalogue has a record for `setup`; bounds were checked only then. */
  readonly display?: { readonly width: number; readonly height: number };
}

/**
 * Aggregated outcome of a complete validation run.
 */
export interface ValidateResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly errors: number;
  readonly warnings: number;
  /** The target geometry was checked against; absent when the project declares none. */
  readonly checkedTarget?: CheckedTarget;
}

/**
 * @brief §13.9's diagnostic order: file, then line, then column, then code.
 *
 * Strings are compared **by UTF-16 code unit**, never with `localeCompare`.
 * `localeCompare` consults the host's collation, which case-folds and reorders
 * punctuation — `'a'.localeCompare('B')` is negative on an ICU build and
 * positive by code unit — so the same project reported its diagnostics in
 * different orders on different machines, and a `--json` consumer comparing two
 * CI runs saw a diff that was not there. §13.9 requires one order for one input;
 * a code-unit comparison is the only one that is a property of the data
 * (PR-04 WO5b carry, closed in WO12).
 *
 * The comparator is total for a diagnostic list: two diagnostics agreeing on all
 * four keys are the same report, which {@link finaliseDiagnostics}
 * deduplicates, so no tie needs breaking here and `Array.sort`'s stability is
 * never relied on.
 *
 * @param a First diagnostic.
 * @param b Second diagnostic.
 * @return Negative if `a` sorts first, positive if `b` does, 0 if they tie.
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.file !== b.file) {
    return compareCodeUnits(a.file, b.file);
  }
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  if (a.column !== b.column) {
    return a.column - b.column;
  }
  return compareCodeUnits(a.code, b.code);
}

/**
 * Runs all validation passes in order and produces sorted diagnostics.
 *
 * Execution sequence:
 * 0. Manifest registry diagnostics — shadowing, unknown `extends`, cycles
 * 1. Schema structure & required attributes (validateSchema)
 * 2. Cross-file & symbol references (validateReferences)
 * 3. Display setup & catalogue verification (validateDisplay)
 * 4. Widget property manifests & enum values (validateWidgetProps)
 * 5. Data binding type compatibility (validateTypes)
 * 6. Layout geometry & display bounds (validateGeometry)
 * 7. Identifier naming rules & collisions (validateIdentifiers)
 * 8. Constructs not yet generated, at `input.refusalPolicy` (validateNotYetSupported)
 * 9. The exact object ceiling, and realisation's refusals (validateRealisation)
 *
 * @param input The parsed project AST models and display catalogue.
 * @return Ordered diagnostics with error and warning totals.
 */
export function validate(input: ValidateInput): ValidateResult {
  const allDiagnostics: Diagnostic[] = [];

  // Expand once, resolve once, and let every pass below read the same model
  // (§13.11 step 3, PR-04 WO8a). Built here rather than inside each pass so the
  // passes cannot drift into judging different trees; `generate` supplies its
  // own, for the target it is building.
  const passInput: ValidateInput = { ...input, pipeline: pipelineOf(input) };

  // Pass 0: The registry's own diagnostics. Reported here rather than left to
  // each caller, so the CLI and the designer cannot disagree about whether a
  // shadowing manifest is an error.
  allDiagnostics.push(...input.manifests.diagnostics);

  // Pass 1: Schema structure & versions
  allDiagnostics.push(...validateSchema(passInput));

  // Pass 2: Cross-file symbol references
  allDiagnostics.push(...validateReferences(passInput));

  // Pass 3: Display catalogue & page mode checks
  allDiagnostics.push(...validateDisplay(passInput));

  // Pass 4: Widget properties against manifests
  allDiagnostics.push(...validateWidgetProps(passInput));

  // Pass 5: Type checking & binding compatibility
  allDiagnostics.push(...validateTypes(passInput));

  // Pass 6: Geometry constraints & display bounds
  allDiagnostics.push(...validateGeometry(passInput));

  // Pass 7: Identifier rules & inlining collisions
  allDiagnostics.push(...validateIdentifiers(passInput));

  // Pass 8: Constructs the generator does not build yet, at the caller's policy
  allDiagnostics.push(...validateNotYetSupported(passInput));

  // Pass 9: What the document actually becomes — the exact object count against
  // §13.3's ceiling, and realisation's refusals at the caller's policy. Last,
  // because it is the only pass that judges the realised model rather than the
  // authored one.
  allDiagnostics.push(...validateRealisation(passInput));

  // Sort deterministically by file, then line, then column, then code (§13.9)
  allDiagnostics.sort(compareDiagnostics);

  let errors = 0;
  let warnings = 0;
  for (const d of allDiagnostics) {
    if (d.severity === 'error') {
      errors++;
    } else if (d.severity === 'warning') {
      warnings++;
    }
  }

  // Say which target geometry was checked against, so a caller can report it.
  const target = checkedTarget(input);
  const display = findTargetDisplay(target, input.catalogue ?? []);
  return {
    diagnostics: allDiagnostics,
    errors,
    warnings,
    ...(target !== undefined
      ? {
          checkedTarget: {
            name: target.name,
            setup: target.setup,
            ...(display ? { display: { width: display.width, height: display.height } } : {}),
          },
        }
      : {}),
  };
}
