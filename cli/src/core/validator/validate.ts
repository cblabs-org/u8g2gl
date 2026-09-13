/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate.ts
 * Purpose: Main validation orchestrator running multi-pass validation (§15.1, §15.2).
 * Description: Coordinates 7 sequential validation passes across project configurations,
 *              globals, screen views, component definitions, and widget manifests.
 *              Deterministically sorts all diagnostics by file, line, and column.
 *
 * Exports:
 * - ValidateInput: Complete project input model passed to the validator
 * - ValidateResult: Deterministically ordered diagnostics and error counts
 * - validate(input): Run all validation passes and return aggregated results
 */

import type { U8g2glProject } from '../schema/project.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { WidgetManifest } from '../schema/widget-manifest.js';
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
   * Composite elements — a `WidgetManifest` whose `api` carries a `view`
   * ([D-18]). Retired as a separate `Component` type by WO5b; still a
   * distinct array from `widgetManifests` because the two are validated by
   * different passes (composite tag/prop rules here, real `<widget>` schema
   * rules there) — unifying that is WO6's, not this migration's, concern.
   */
  readonly components: readonly WidgetManifest[];
  readonly widgetManifests: readonly WidgetManifest[];
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
