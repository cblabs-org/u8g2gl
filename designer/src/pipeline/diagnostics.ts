/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/pipeline/diagnostics.ts
 * Purpose: Turns the validator's [D-16] diagnostics into the two places the
 *          designer shows them — Monaco markers on the file's text and rows in
 *          the Problems panel — so both always say the same thing about the
 *          same place (ui_spec §10, F4). Diagnostic quality is the product
 *          (design_spec §1.2): the row keeps the stable code and the
 *          structured suggestions rather than flattening them into prose.
 * Description: Pure functions, with no Monaco import, so the mapping is tested
 *              without a browser: Monaco's severity numbers are restated here
 *              (`MARKER_SEVERITY`) and the caller passes the result to
 *              `monaco.editor.setModelMarkers` unchanged. A marker spans the
 *              diagnostic's own range when it has one, otherwise the word at
 *              its start, which the caller measures. `parseBuildFailure` reads
 *              the compiler-style text a failed editor Wasm build reports.
 *
 * Exports:
 * - MARKER_SEVERITY:        Monaco's MarkerSeverity values
 * - MarkerData:             The subset of Monaco's IMarkerData this produces
 * - ProblemRow:             One row of the Problems panel
 * - toProblemRows():        Diagnostics as sorted, keyed rows
 * - markersByFile():        Diagnostics grouped into markers per file
 * - parseBuildFailure():    A failed build's text as diagnostics
 * - sameProblems():         Whether two row lists show the same thing
 */

import type { Diagnostic, Severity } from '@u8g2gl/core/schema/diagnostic.js';

/** Monaco's `MarkerSeverity` values (`monaco.d.ts`). */
export const MARKER_SEVERITY: Readonly<Record<Severity, number>> = { error: 8, warning: 4, info: 2 };

/** The fields of Monaco's `IMarkerData` the designer sets. */
export interface MarkerData {
  readonly severity: number;
  readonly message: string;
  readonly code: string;
  readonly source: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

/** One row of the Problems panel. */
export interface ProblemRow {
  /** Stable across runs while the diagnostic is unchanged: React's key. */
  readonly key: string;
  readonly severity: Severity;
  readonly code: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly suggestions: readonly string[];
}

/** Sort rank: errors first, as the CLI prints them. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 };

/**
 * @brief Diagnostics as Problems rows: errors first, then by file, line and column.
 *
 * @param diagnostics Already deduplicated (`checkProject` does).
 */
export function toProblemRows(diagnostics: readonly Diagnostic[]): ProblemRow[] {
  return diagnostics
    .map((d) => ({
      key: `${d.file}:${d.line}:${d.column}:${d.code}:${d.message}`,
      severity: d.severity,
      code: d.code,
      file: d.file,
      line: Math.max(1, d.line),
      column: Math.max(1, d.column),
      message: d.message,
      suggestions: d.suggestions ?? [],
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
        a.line - b.line ||
        a.column - b.column,
    );
}

/**
 * @brief Diagnostics as Monaco markers, grouped by the file they are in.
 *
 * @param diagnostics The run's diagnostics.
 * @param wordEnd     The column just past the word at a position in a file, or
 *                    undefined if that file is not open; used when a
 *                    diagnostic has no end of its own, so the squiggle covers
 *                    the offending token rather than one character.
 * @return Markers per file; a file with none is absent (the caller clears it).
 */
export function markersByFile(
  diagnostics: readonly Diagnostic[],
  wordEnd: (file: string, line: number, column: number) => number | undefined,
): Map<string, MarkerData[]> {
  const byFile = new Map<string, MarkerData[]>();
  for (const d of diagnostics) {
    const line = Math.max(1, d.line);
    const column = Math.max(1, d.column);
    const endLine = d.endLine ?? line;
    const endColumn = d.endColumn ?? Math.max(column + 1, wordEnd(d.file, line, column) ?? column + 1);
    const suggestions = d.suggestions !== undefined && d.suggestions.length > 0 ? `\nDid you mean: ${d.suggestions.join(', ')}?` : '';
    const markers = byFile.get(d.file) ?? [];
    markers.push({
      severity: MARKER_SEVERITY[d.severity],
      message: `${d.message}${suggestions}`,
      code: d.code,
      source: 'u8g2gl',
      startLineNumber: line,
      startColumn: column,
      endLineNumber: endLine,
      endColumn,
    });
    byFile.set(d.file, markers);
  }
  return byFile;
}

/** A header line of the CLI's compiler-style block: `error: file:line:column`. */
const BLOCK_HEADER = /^(error|warning|info): (.+):(\d+):(\d+)$/;

/**
 * @brief Reads a failed build's error text back into diagnostics.
 *
 * The build job reports its diagnostics in the CLI's compiler-style blocks
 * (`format-diagnostic.ts`): a `severity: file:line:column` line, then the
 * message indented. Each block becomes a diagnostic coded
 * `U8G2GL_EDITOR_BUILD`, since the block does not carry the original code.
 * Text that is not in that shape (no toolchain, say) yields nothing, and the
 * caller shows it as it came.
 *
 * @param text The failed build record's `error`.
 */
export function parseBuildFailure(text: string): Diagnostic[] {
  const lines = text.split('\n');
  const found: Diagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = BLOCK_HEADER.exec(lines[i] ?? '');
    if (match === null) {
      continue;
    }
    const [, severity = 'error', file = '', line = '1', column = '1'] = match;
    found.push({
      code: 'U8G2GL_EDITOR_BUILD',
      severity: severity as Severity,
      file,
      line: Number(line),
      column: Number(column),
      message: (lines[i + 1] ?? '').trim() || 'the editor Wasm build failed here',
    });
  }
  return found;
}

/** @brief Whether two row lists are the same rows in the same order (by key). */
export function sameProblems(a: readonly ProblemRow[], b: readonly ProblemRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.key === b[i]?.key);
}
