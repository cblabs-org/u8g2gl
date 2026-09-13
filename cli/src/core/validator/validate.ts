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
 * Exports:
 * - ValidateInput: Complete project input model passed to the validator
 * - ValidateResult: Deterministically ordered diagnostics and error counts
 * - validate(input): Run all validation passes and return aggregated results
 */

import type { U8g2glProject } from '../schema/project.js';
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
import { validateGeometry } from './validate-geometry.js';
import { validateIdentifiers } from './validate-identifiers.js';

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
}

/**
 * Aggregated outcome of a complete validation run.
 */
export interface ValidateResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly errors: number;
  readonly warnings: number;
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

  return {
    diagnostics: allDiagnostics,
    errors,
    warnings,
  };
}
