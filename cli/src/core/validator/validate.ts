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
 * Exports:
 * - ValidateInput: Complete project input model passed to the validator
 * - CheckedTarget: The target geometry was checked against, and its display
 * - ValidateResult: Deterministically ordered diagnostics and error counts
 * - validate(input): Run all validation passes and return aggregated results
 */

import type { Target, U8g2glProject } from '../schema/project.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import type { DisplayRecord } from '../schema/display-record.js';
import type { Diagnostic } from '../schema/diagnostic.js';

import { validateSchema } from './validate-schema.js';
import { validateReferences } from './validate-references.js';
import { validateDisplay } from './validate-display.js';
import { validateWidgetProps } from './validate-widget-props.js';
import { validateTypes } from './validate-types.js';
import { checkedTarget, validateGeometry } from './validate-geometry.js';
import { findTargetDisplay } from '../resolver/index.js';
import { validateIdentifiers } from './validate-identifiers.js';
import {
  validateNotYetSupported,
  type NotYetSupportedPolicy,
} from './validate-not-yet-supported.js';

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
   * Severity of `U8G2GL_NOT_YET_SUPPORTED` (Pass 8): `'warning'` for authoring,
   * `'error'` for the build. A parameter rather than a branch, like the [U-1]
   * missing-name policy, so both journeys run this one validator. Defaults to
   * `DEFAULT_NOT_YET_SUPPORTED_POLICY` (`'warning'`); `generate()` always passes
   * `'error'`.
   */
  readonly notYetSupported?: NotYetSupportedPolicy;
  /**
   * The target whose display geometry is resolved and bounds-checked against.
   * `generate` passes the target it builds, because a screen that fits one
   * display can overflow another (§7.2, §7.3). Defaults to the project's first
   * declared target — `validate`'s behaviour.
   */
  readonly target?: Target;
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
 * 8. Constructs not yet generated, at `input.notYetSupported` (validateNotYetSupported)
 *
 * @param input The parsed project AST models and display catalogue.
 * @return Ordered diagnostics with error and warning totals.
 */
export function validate(input: ValidateInput): ValidateResult {
  const allDiagnostics: Diagnostic[] = [];

  // Pass 0: The registry's own diagnostics. Reported here rather than left to
  // each caller, so the CLI and the designer cannot disagree about whether a
  // shadowing manifest is an error.
  allDiagnostics.push(...input.manifests.diagnostics);

  // Pass 1: Schema structure & versions
  allDiagnostics.push(...validateSchema(input));

  // Pass 2: Cross-file symbol references
  allDiagnostics.push(...validateReferences(input));

  // Pass 3: Display catalogue & page mode checks
  allDiagnostics.push(...validateDisplay(input));

  // Pass 4: Widget properties against manifests
  allDiagnostics.push(...validateWidgetProps(input));

  // Pass 5: Type checking & binding compatibility
  allDiagnostics.push(...validateTypes(input));

  // Pass 6: Geometry constraints & display bounds
  allDiagnostics.push(...validateGeometry(input));

  // Pass 7: Identifier rules & inlining collisions
  allDiagnostics.push(...validateIdentifiers(input));

  // Pass 8: Constructs the generator does not build yet, at the caller's policy
  allDiagnostics.push(...validateNotYetSupported(input));

  // Sort deterministically by file, then line, then column, then code (§13.9)
  allDiagnostics.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    return a.code.localeCompare(b.code);
  });

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
