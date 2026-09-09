/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-display.ts
 * Purpose: Pass 3 — Validates hardware target display constructor setups against
 *          the U8G2 display catalogue and rejects page-mode drivers (§5.2, §15.1).
 * Description: Verifies that target `setup` values correspond to known full-buffer
 *              constructors. Detects page-mode constructors (`_1`, `_2`), reporting
 *              the corresponding `_F_` full-buffer equivalent from page-mode-map.json.
 *              Employs findClosest for unknown constructor suggestions.
 *
 * Exports:
 * - validateDisplay(input): Runs Pass 3 display setup validation
 */

import pageModeMapData from '../../data/page-mode-map.json' with { type: 'json' };
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { ValidateInput } from './validate.js';

const PAGE_MODE_MAP: Readonly<Record<string, string>> = pageModeMapData as Record<
  string,
  string
>;

function createDisplayDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
  suggestions: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

/**
 * Validates hardware target display setups against the catalogue and page-mode map.
 */
export function validateDisplay(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { project, catalogue } = input;

  if (!project?.targets) {
    return diagnostics;
  }

  const catalogueSetups = (catalogue ?? []).map((d) => d.setup);
  const catalogueSet = new Set(catalogueSetups);

  for (const target of project.targets) {
    if (!target.setup) {
      continue;
    }

    const setup = target.setup;

    // Check if target matches known page-mode map or pattern (_1_ / _2_ / ending with _1 / _2)
    const mappedPageMode = PAGE_MODE_MAP[setup];
    const isPageModePattern = /_([12])(_|$)/.test(setup);

    if (mappedPageMode !== undefined || isPageModePattern) {
      let replacement = mappedPageMode;
      if (!replacement) {
        // Compute synthetic _F_ replacement if not in map
        let derived = setup.replace(/_([12])_/g, '_F_');
        if (derived.endsWith('_1') || derived.endsWith('_2')) {
          derived = derived.slice(0, -2) + '_F';
        }
        replacement = derived;
      }

      diagnostics.push(
        createDisplayDiagnostic(
          DIAGNOSTIC_CODES.PAGE_MODE_DISPLAY,
          `Target '${target.name}' specifies page-mode display constructor '${setup}'. U8G2GL requires full-buffer mode ('_F_').`,
          target.loc,
          setup,
          replacement ? [replacement] : [],
        ),
      );
      continue;
    }

    // Check if setup exists in the full-buffer catalogue
    if (!catalogueSet.has(setup)) {
      diagnostics.push(
        createDisplayDiagnostic(
          DIAGNOSTIC_CODES.UNKNOWN_DISPLAY,
          `Unknown display setup constructor '${setup}'. Not found in U8G2 display catalogue.`,
          target.loc,
          setup,
          findClosest(setup, catalogueSetups),
        ),
      );
    }
  }

  return diagnostics;
}
