/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/check-project.ts
 * Purpose: The one validation both journeys run. `validate` and `generate` must
 *          agree about a document exactly — the same diagnostics, the same order,
 *          the same counts — differing only in the not-yet-supported severity
 *          they ask for. Before PR-04 WO5b that merge-and-sort lived inline in
 *          the CLI's validate handler, where a second command could only have
 *          copied it.
 * Description: Takes a loaded project model (parsed documents, the parser's own
 *              diagnostics, the manifest registry) and returns validator results
 *              with the loader's diagnostics merged in, duplicates removed, and
 *              everything sorted by file, line, column, code (§13.9). Isomorphic:
 *              the Node loader builds the model from disk, the designer from
 *              editor buffers.
 *
 * Exports:
 * - ProjectModel:     A loaded project, ready to validate or generate
 * - checkProject():   Validate a model under a not-yet-supported policy
 * - finaliseDiagnostics(): Deduplicate, sort and count a diagnostic list
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Target } from '../schema/project.js';
import { validate, type ValidateInput, type ValidateResult } from '../validator/validate.js';
import type { NotYetSupportedPolicy } from '../validator/validate-not-yet-supported.js';

/**
 * A project as loaded, before validation: the validator's input without a
 * policy, plus what loading itself found.
 */
export interface ProjectModel extends Omit<ValidateInput, 'notYetSupported' | 'target'> {
  /**
   * Diagnostics raised while loading — XML and parser diagnostics, including
   * [U-1] missing names, and any from the bundled framework manifests. Merged
   * with the validator's by {@link checkProject}.
   */
  readonly loadDiagnostics: readonly Diagnostic[];
  /**
   * Whether a `u8g2gl.xml` document was read. False when a single screen,
   * globals or widget file was loaded on its own: `project` is then a
   * placeholder with no schema to check.
   */
  readonly hasProjectManifest: boolean;
}

/**
 * @brief Validates a loaded project, merging load and validation diagnostics.
 *
 * With no project manifest loaded, the placeholder project's empty schema is not
 * reported: a single screen, globals or widget file declares no schema, so
 * `U8G2GL_UNKNOWN_SCHEMA_VERSION ''` described nothing the author wrote (PR-04
 * WO5a finding 6).
 *
 * @param model  The loaded project.
 * @param policy Severity for not-yet-supported constructs — `'warning'` for
 *               `validate`, `'error'` for `generate`.
 * @param target The target to check geometry against — `generate`'s build
 *               target. Omitted, the project's first target is checked.
 * @return Deduplicated diagnostics sorted by file, line, column and code, with
 *         error and warning counts, and the target geometry was checked against.
 */
export function checkProject(model: ProjectModel, policy: NotYetSupportedPolicy, target?: Target): ValidateResult {
  // --- Step 1: Run the validator under the caller's policy, for the caller's target ---
  const validation = validate({
    project: model.project,
    globals: model.globals,
    screens: model.screens,
    manifests: model.manifests,
    catalogue: model.catalogue,
    notYetSupported: policy,
    ...(target !== undefined ? { target } : {}),
  });

  // --- Step 2: Merge, dropping the placeholder project's schema diagnostic ---
  const merged = [...model.loadDiagnostics, ...validation.diagnostics].filter(
    (d) => model.hasProjectManifest || d.code !== DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
  );

  // --- Step 3: Deduplicate, sort and count ---
  const finalised = finaliseDiagnostics(merged);
  return validation.checkedTarget !== undefined ? { ...finalised, checkedTarget: validation.checkedTarget } : finalised;
}

/**
 * @brief Deduplicates, sorts and counts diagnostics — the one ordering both
 *        journeys report in.
 *
 * Exported so `generate()` can add what it raises after validation (resolution
 * against a non-first target) without a second copy of the comparator.
 *
 * @param diagnostics Diagnostics in any order, possibly repeated.
 * @return Unique diagnostics sorted by file, line, column and code (§13.9), with
 *         error and warning counts.
 */
export function finaliseDiagnostics(diagnostics: readonly Diagnostic[]): ValidateResult {
  // --- Step 1: Deduplicate — a parser and a pass may report the same fact ---
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const d of diagnostics) {
    const key = `${d.file}:${d.line}:${d.column}:${d.code}:${d.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(d);
    }
  }

  // --- Step 2: Sort deterministically (§13.9) and count ---
  // The same comparator validate() uses, so a merged list orders as it would.
  unique.sort((a, b) => {
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
  for (const d of unique) {
    if (d.severity === 'error') {
      errors++;
    } else if (d.severity === 'warning') {
      warnings++;
    }
  }

  return { diagnostics: unique, errors, warnings };
}
