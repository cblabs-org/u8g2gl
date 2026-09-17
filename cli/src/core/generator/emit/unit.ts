/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/unit.ts
 * Purpose: The shapes every project-level emitter shares, and the two spelling
 *          conventions they must all obey. It exists so the units cannot drift
 *          apart in the small ways that show up in a review diff — a different
 *          section banner, a different number of bytes per line, one unit
 *          reporting a bad asset by throwing while another reports a diagnostic.
 * Description: An emitter takes what the whole project declares and returns one
 *              file's text plus any diagnostics it raised. It returns diagnostics
 *              rather than throwing because some defects only emission can see:
 *              a subject's `value` is never type-checked by the validator, and an
 *              `.xbm` asset is not read until here, so both are **author**
 *              errors that must become diagnostics (typescript.md §4). A value
 *              the validator *should* have caught is different, and the value
 *              helper throws for that.
 *
 *              Every unit opens with its header stamp and carries no timestamp,
 *              lists its declarations in document order, and sorts its includes
 *              (§13.9), so an unchanged project regenerates byte-identically.
 *
 * Exports:
 * - EmittedUnit:      One emitted file's text and diagnostics
 * - ProjectEmitInput: What every project-level emitter reads
 * - section():        A section banner, spelled one way
 * - includeBlock():   A sorted, deduplicated include block (§13.9)
 * - declarationError(): A diagnostic for a declaration emission cannot spell
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../../schema/diagnostic.js';
import type { Globals } from '../../schema/globals.js';
import type { U8g2glProject } from '../../schema/project.js';
import type { Screen } from '../../schema/screen.js';
import type { SourceLocation } from '../../schema/source-location.js';
import type { Capacities } from '../realise/index.js';

/** One emitted file. */
export interface EmittedUnit {
  /** The complete file text, LF line endings, ending with a newline. */
  readonly content: string;
  /**
   * What emitting it found. An error here refuses the build exactly as a
   * validation error does — `generate()` produces no files at all.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** Everything a project-level emitter reads. */
export interface ProjectEmitInput {
  readonly project: U8g2glProject;
  readonly globals: Globals;
  /** Screens in load order, for the per-screen declarations `ui.hpp` carries. */
  readonly screens: readonly Screen[];
  /**
   * The [D-21] capacities counted by WO8b — emitted, never recounted. Its
   * `subjects` carry each subject's observer count, which sizes the `_n<N>`
   * types.
   */
  readonly capacities: Capacities;
  /**
   * Asset file text by the `src` path each declaration names, supplied by
   * `src/node/` because `src/core/` may not read files (typescript.md §1). An
   * absent entry is a missing asset, reported as a diagnostic.
   */
  readonly assets: ReadonlyMap<string, string>;
  /** This file's header stamp, already rendered (`header.ts`). */
  readonly stamp: string;
}

/**
 * @brief A section banner, so every unit divides itself the same way.
 *
 * @param title What the section holds, with its spec reference.
 */
export function section(title: string): string {
  return `// --- ${title} ---`;
}

/**
 * @brief A sorted, deduplicated include block (§13.9).
 *
 * Sorted by code unit rather than by locale, because a locale-dependent order
 * would make the same project generate different bytes on different machines —
 * the defect §13.9 exists to prevent, and one this repository has already met in
 * its diagnostic ordering (PR-04 WO5b finding 5).
 *
 * @param includes Include lines, exactly as they should appear.
 * @return The block, one per line, or `''` when there are none.
 */
export function includeBlock(includes: readonly string[]): string {
  const unique = [...new Set(includes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return unique.join('\n');
}

/**
 * @brief A diagnostic for a declaration emission cannot turn into C++.
 *
 * For the defects only emission sees — an unreadable asset, or a declared value
 * the validator never type-checked. `U8G2GL_TYPE_MISMATCH`, because in every
 * case the declared value is not one of the type it claims.
 *
 * @param message What is wrong, and what the author should write instead.
 * @param loc     The declaration's own location.
 * @param offendingText The value at fault.
 */
export function declarationError(
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.TYPE_MISMATCH,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
  };
}
