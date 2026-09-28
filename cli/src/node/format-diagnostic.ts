/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/format-diagnostic.ts
 * Purpose: Formats structured diagnostics into human-readable compiler-style output
 *          matching design_spec §15.1, including source context lines, line number
 *          gutters, underline carets, and machine-actionable suggestions.
 * Description: Implements the diagnostic rendering contract defined in design_spec §15.1.
 *              Formats severity headers (error/warning/info), source line context with
 *              padded line number gutters, caret underlines pinpointing offending tokens,
 *              and near-match suggestions. Supports ANSI colour when stdout is a TTY and
 *              disables colour when piped or when --no-color is specified.
 *
 * Exports:
 * - FormatDiagnosticOptions: Configuration options for diagnostic formatting
 * - formatDiagnostic(diagnostic, fileContent?, options?): Formats a single diagnostic
 * - formatDiagnostics(diagnostics, fileLookup?, options?): Formats a list of diagnostics
 */

import type { Diagnostic, Severity } from '../core/schema/diagnostic.js';
import { compareDiagnostics } from '../core/validator/index.js';

/**
 * Configuration options for human-readable diagnostic formatting.
 */
export interface FormatDiagnosticOptions {
  /** Whether to use ANSI terminal escape codes for colours. Defaults to TTY detection. */
  readonly color?: boolean;
}

/** ANSI escape codes for terminal colouring. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  boldRed: '\x1b[1;31m',
  boldYellow: '\x1b[1;33m',
  boldCyan: '\x1b[1;36m',
} as const;

/**
 * @brief Returns the appropriate ANSI prefix for a given severity level.
 *
 * @param severity Diagnostic severity level ('error' | 'warning' | 'info').
 * @param useColor Whether colour output is enabled.
 * @return Formatted severity label string.
 */
function formatSeverityHeader(severity: Severity, useColor: boolean): string {
  if (!useColor) {
    return severity;
  }
  switch (severity) {
    case 'error':
      return `${ANSI.boldRed}error${ANSI.reset}`;
    case 'warning':
      return `${ANSI.boldYellow}warning${ANSI.reset}`;
    case 'info':
      return `${ANSI.boldCyan}info${ANSI.reset}`;
  }
}

/**
 * @brief Returns the ANSI colour code for underlining carets matching severity.
 *
 * @param severity Diagnostic severity level.
 * @return ANSI colour escape code string.
 */
function getSeverityCaretColor(severity: Severity): string {
  switch (severity) {
    case 'error':
      return ANSI.boldRed;
    case 'warning':
      return ANSI.boldYellow;
    case 'info':
      return ANSI.boldCyan;
  }
}

/**
 * @brief Formats a single diagnostic into a compiler-style human-readable block (§15.1).
 *
 * Follows the exact format required by design_spec §15.1:
 * ```
 * error: screens/screen_home.xml:14:32
 *    unknown font 'small_9'
 *    |
 * 14 |     <u8g2gl_label font="small_9" ... />
 *    |                       ^^^^^^^
 *    = did you mean 'small_09'?
 * ```
 *
 * @param diagnostic The structured Diagnostic to format.
 * @param fileContent Optional complete text content of the source file for context lines.
 * @param options Formatting configuration (colour enable/disable).
 * @return Formatted multi-line string.
 */
export function formatDiagnostic(
  diagnostic: Diagnostic,
  fileContent?: string,
  options?: FormatDiagnosticOptions,
): string {
  // --- Step 1: Resolve colouring and compute gutter geometry ---
  const useColor = options?.color ?? false;
  const lineNumStr = String(diagnostic.line);
  const gutterWidth = Math.max(lineNumStr.length, 2);
  const gutterIndent = ' '.repeat(gutterWidth + 1);

  const lines: string[] = [];

  // --- Step 2: Format severity and location header ---
  const severityLabel = formatSeverityHeader(diagnostic.severity, useColor);
  const locationLabel = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
  lines.push(`${severityLabel}: ${locationLabel}`);

  // --- Step 3: Format primary diagnostic message ---
  lines.push(`${gutterIndent}${diagnostic.message}`);

  // --- Step 4: Extract and format source context lines if content available ---
  if (fileContent !== undefined) {
    const fileLines = fileContent.split(/\r?\n/);
    const lineIndex = diagnostic.line - 1;

    if (lineIndex >= 0 && lineIndex < fileLines.length) {
      const rawSourceLine = fileLines[lineIndex] ?? '';
      const pipeSymbol = useColor ? `${ANSI.blue}|${ANSI.reset}` : '|';

      // Empty gutter separator
      lines.push(`${gutterIndent}${pipeSymbol}`);

      // Padded line number gutter and source line
      const paddedNum = lineNumStr.padStart(gutterWidth, ' ');
      const numGutter = useColor ? `${ANSI.blue}${paddedNum} |${ANSI.reset}` : `${paddedNum} |`;
      lines.push(`${numGutter} ${rawSourceLine}`);

      // Underline carets pointing to the offending token
      const col = Math.max(diagnostic.column, 1);
      let caretPadding = '';
      for (let i = 0; i < col - 1; i++) {
        if (i < rawSourceLine.length && rawSourceLine[i] === '\t') {
          caretPadding += '\t';
        } else {
          caretPadding += ' ';
        }
      }

      let caretCount = 1;
      if (diagnostic.offendingText && diagnostic.offendingText.length > 0) {
        caretCount = diagnostic.offendingText.length;
      } else if (diagnostic.endColumn && diagnostic.endColumn > diagnostic.column) {
        caretCount = diagnostic.endColumn - diagnostic.column;
      }

      const carets = '^'.repeat(Math.max(caretCount, 1));
      const coloredCarets = useColor
        ? `${getSeverityCaretColor(diagnostic.severity)}${carets}${ANSI.reset}`
        : carets;

      lines.push(`${gutterIndent}${pipeSymbol} ${caretPadding}${coloredCarets}`);
    }
  }

  // --- Step 5: Format structured suggestions ---
  if (diagnostic.suggestions && diagnostic.suggestions.length > 0) {
    const eqSymbol = useColor ? `${ANSI.cyan}=${ANSI.reset}` : '=';

    // Handle suggestions that already carry pre-formatted notes
    const hasPreformatted = diagnostic.suggestions.some((s) => s.startsWith('='));
    if (hasPreformatted) {
      for (const sug of diagnostic.suggestions) {
        if (sug.startsWith('=')) {
          const text = sug.replace(/^=\s*/, '');
          lines.push(`${gutterIndent}${eqSymbol} ${text}`);
        } else {
          lines.push(`${gutterIndent}${eqSymbol} did you mean '${sug}'?`);
        }
      }
    } else if (diagnostic.suggestions.length === 1) {
      lines.push(`${gutterIndent}${eqSymbol} did you mean '${diagnostic.suggestions[0]}'?`);
    } else {
      const list = diagnostic.suggestions.map((s) => `'${s}'`).join(', ');
      lines.push(`${gutterIndent}${eqSymbol} did you mean one of: ${list}?`);
    }
  }

  return lines.join('\n');
}

/**
 * @brief Formats an array of diagnostics into human-readable compiler-style output.
 *
 * Sorts diagnostics deterministically by file, line, and column before rendering.
 *
 * @param diagnostics Array of Diagnostic objects.
 * @param fileLookup Optional function resolving a file path to its string contents.
 * @param options Formatting configuration.
 * @return Joined formatted diagnostics separated by blank lines.
 */
export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  fileLookup?: (filename: string) => string | undefined,
  options?: FormatDiagnosticOptions,
): string {
  // Sort deterministically (§13.9), through the validator's own comparator
  // rather than a third copy of it: the human output and the --json array must
  // list the same diagnostics in the same order, or a reader comparing the two
  // sees a disagreement the tool invented (PR-04 WO12).
  const sorted = [...diagnostics].sort(compareDiagnostics);

  return sorted
    .map((d) => formatDiagnostic(d, fileLookup?.(d.file), options))
    .join('\n\n');
}
