/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/format-display.ts
 * Purpose: Formats U8G2 display catalogue query results (§5.2, [D-14]) into human-readable
 *          tables and actionable negative diagnostic messages.
 * Description: Renders tabular output for all four catalogue search modes: identify (free-text
 *              part search with electrical variant disambiguation), source (constraint filtering
 *              with MCU internal SRAM headroom classification), compare (side-by-side differing
 *              fields across constructors), and enumerate (catalogue summary by controller).
 *
 * Exports:
 * - FormatDisplayOptions: Configuration options for display formatting
 * - formatIdentifyResult(result, options?): Renders identify mode results and negative feedback
 * - formatSourceResult(result, options?): Renders source mode candidate table with RAM budgets
 * - formatCompareResult(result, options?): Renders compare mode difference table
 * - formatCatalogueSummary(displays, options?): Renders catalogue summary by controller family
 */

import type { DisplayRecord } from '../core/schema/display-record.js';
import type {
  IdentifyResult,
  SourceResult,
  CompareResult,
  RamClassification,
} from '../core/catalogue/query.js';

/**
 * Options for configuring display query formatting.
 */
export interface FormatDisplayOptions {
  /** Whether to enable ANSI colour codes in terminal output. Defaults to false. */
  readonly color?: boolean;
}

/** ANSI escape codes for terminal colouring. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  boldRed: '\x1b[1;31m',
} as const;

/**
 * @brief Formats a RAM headroom classification tag with optional colours.
 *
 * @param classification RAM classification ('comfortable' | 'significant' | 'check').
 * @param useColor Whether colour output is enabled.
 * @return Formatted tag string.
 */
function formatClassificationTag(
  classification: RamClassification | undefined,
  useColor: boolean,
): string {
  if (!classification) {
    return '';
  }
  if (!useColor) {
    return classification === 'check' ? 'check headroom' : classification;
  }
  switch (classification) {
    case 'comfortable':
      return `${ANSI.green}comfortable${ANSI.reset}`;
    case 'significant':
      return `${ANSI.yellow}significant${ANSI.reset}`;
    case 'check':
      return `${ANSI.boldRed}check headroom${ANSI.reset}`;
  }
}

/**
 * @brief Mode (a): Formats free-text display identification results (§5.2).
 *
 * If displays match, produces a tabular summary with setup name, geometry, and bus details,
 * followed by static framebuffer memory requirements and electrical variant notes.
 * If no displays match, emits actionable failure diagnostics with near-miss suggestions.
 *
 * @param result IdentifyResult from identifyDisplay.
 * @param options Display formatting options.
 * @return Formatted human-readable string.
 */
export function formatIdentifyResult(
  result: IdentifyResult,
  options?: FormatDisplayOptions,
): string {
  const useColor = options?.color ?? false;

  // --- Step 1: Handle negative results with actionable guidance (§5.2) ---
  if (result.matches.length === 0) {
    const lines: string[] = [];
    if (result.message) {
      lines.push(result.message);
    } else {
      lines.push(`No matching displays found for "${result.query}".`);
    }

    if (result.suggestions.length > 0 && (!result.message || !result.message.includes('Closest family:'))) {
      const formattedSuggestions = result.suggestions.join(', ');
      lines.push(`\nSuggestions: ${formattedSuggestions}`);
    }

    return lines.join('\n');
  }

  // --- Step 2: Format matching displays table ---
  const lines: string[] = [];
  const matchCount = result.matches.length;
  lines.push(`Found ${matchCount} matching display${matchCount === 1 ? '' : 's'}:\n`);

  for (const d of result.matches.slice(0, 15)) {
    const geom = `${d.width}x${d.height}`;
    const busDesc = `${d.bus.family.toUpperCase()} (${d.bus.wiring})`;
    const setupName = useColor ? `${ANSI.cyan}${d.setup.padEnd(46)}${ANSI.reset}` : d.setup.padEnd(46);
    lines.push(`  ${setupName} ${geom.padEnd(10)} ${busDesc}`);
  }

  // --- Step 3: Format framebuffer size and tile dimensions ---
  const topMatch = result.matches[0];
  if (topMatch) {
    lines.push(
      `\n  framebuffer: ${topMatch.framebufferBytes} bytes (${topMatch.tiles.width}x${topMatch.tiles.height} tiles)`,
    );
  }

  // --- Step 4: Format electrical variant disambiguation notes (§5.2) ---
  for (const note of result.notes) {
    lines.push(`\n  note: ${note}`);
  }

  return lines.join('\n');
}

/**
 * @brief Mode (b): Formats constraint-driven display sourcing results (§5.2).
 *
 * Outputs a table listing display setups, dimensions, communication interfaces, and
 * static framebuffer sizes. If fitsTarget was specified, evaluates RAM headroom
 * against internal SRAM constraints ([D-1], §18).
 *
 * @param result SourceResult from sourceDisplay.
 * @param options Display formatting options.
 * @return Formatted human-readable string.
 */
export function formatSourceResult(
  result: SourceResult,
  options?: FormatDisplayOptions,
): string {
  const useColor = options?.color ?? false;

  if (result.matches.length === 0) {
    return 'No displays match the specified constraints.';
  }

  const lines: string[] = [];
  const matchCount = result.matches.length;
  lines.push(`Found ${matchCount} matching display${matchCount === 1 ? '' : 's'}:\n`);

  const hasFits = result.constraints.fitsTarget !== undefined;
  const header = hasFits
    ? `${'SETUP'.padEnd(44)} ${'GEOMETRY'.padEnd(10)} ${'RAM'.padEnd(10)} HEADROOM`
    : `${'SETUP'.padEnd(44)} ${'GEOMETRY'.padEnd(10)} ${'BUS'.padEnd(12)} RAM`;

  lines.push(useColor ? `${ANSI.bold}${header}${ANSI.reset}` : header);
  lines.push('-'.repeat(header.length + 8));

  for (const item of result.matches.slice(0, 30)) {
    const d = item.record;
    const geom = `${d.width}x${d.height}`;
    const ramKb = `${(d.framebufferBytes / 1024).toFixed(1)} KB`;
    const setupName = d.setup.padEnd(44);

    if (hasFits) {
      const tag = formatClassificationTag(item.classification, useColor);
      lines.push(`${setupName} ${geom.padEnd(10)} ${ramKb.padEnd(10)} ${tag}`);
    } else {
      lines.push(`${setupName} ${geom.padEnd(10)} ${d.bus.family.padEnd(12)} ${ramKb}`);
    }
  }

  if (hasFits) {
    lines.push('\nClassification is framebuffer vs. what a bare ESP32 can spare alongside');
    lines.push('WiFi and TLS. Note that PSRAM does not help here — the framebuffer must');
    lines.push('stay in internal SRAM ([D-1]).');
  }

  return lines.join('\n');
}

/**
 * @brief Mode (c): Formats display setup comparison into a difference-only table (§5.2).
 *
 * Highlights only those attributes that differ between two or more displays
 * (e.g. electrical variant, bus wiring, driver symbol).
 *
 * @param result CompareResult from compareDisplays.
 * @param options Display formatting options.
 * @return Formatted human-readable string.
 */
export function formatCompareResult(
  result: CompareResult,
  options?: FormatDisplayOptions,
): string {
  const useColor = options?.color ?? false;
  const lines: string[] = [];

  // --- Step 1: Report missing setups ---
  if (result.notFound.length > 0) {
    const warnPrefix = useColor ? `${ANSI.yellow}Warning:${ANSI.reset}` : 'Warning:';
    lines.push(`${warnPrefix} Setups not found: ${result.notFound.join(', ')}`);
  }

  const diffKeys = Object.keys(result.differences);
  if (diffKeys.length === 0) {
    lines.push('Selected displays have identical catalogued attributes.');
    return lines.join('\n');
  }

  // --- Step 2: Tabulate differing fields ---
  const count = result.records.length;
  lines.push(`Comparison of ${count} displays (showing differing fields):\n`);

  const colWidth = 34;
  const fieldColWidth = 20;

  const headerTitles = result.records
    .map((r) => r.setup.slice(0, colWidth - 2).padEnd(colWidth))
    .join(' ');
  const headerLine = `${'FIELD'.padEnd(fieldColWidth)} ${headerTitles}`;

  lines.push(useColor ? `${ANSI.bold}${headerLine}${ANSI.reset}` : headerLine);
  lines.push('-'.repeat(fieldColWidth + count * (colWidth + 1)));

  for (const key of diffKeys.sort()) {
    const values = result.differences[key] ?? [];
    const valStrings = values
      .map((v) => String(v).slice(0, colWidth - 2).padEnd(colWidth))
      .join(' ');
    lines.push(`${key.padEnd(fieldColWidth)} ${valStrings}`);
  }

  return lines.join('\n');
}

/**
 * @brief Mode (d): Formats display catalogue summary by controller family (§5.2).
 *
 * Groups displays by controller and prints total counts, supported resolutions,
 * and supported bus interfaces.
 *
 * @param displays Array of catalogued DisplayRecord objects.
 * @param options Display formatting options.
 * @return Formatted summary table string.
 */
export function formatCatalogueSummary(
  displays: readonly DisplayRecord[],
  options?: FormatDisplayOptions,
): string {
  const useColor = options?.color ?? false;

  // --- Step 1: Aggregate by controller family ---
  const controllers = new Map<
    string,
    { geometries: Set<string>; buses: Set<string>; count: number }
  >();

  for (const d of displays) {
    let entry = controllers.get(d.controller);
    if (!entry) {
      entry = { geometries: new Set(), buses: new Set(), count: 0 };
      controllers.set(d.controller, entry);
    }
    entry.geometries.add(`${d.width}x${d.height}`);
    entry.buses.add(d.bus.family);
    entry.count++;
  }

  // --- Step 2: Build summary table ---
  const lines: string[] = [];
  lines.push(
    `U8G2 Display Catalogue (${displays.length} displays across ${controllers.size} controllers)\n`,
  );

  const header = `${'CONTROLLER'.padEnd(16)} ${'GEOMETRIES'.padEnd(30)} ${'BUSES'.padEnd(20)} TOTAL`;
  lines.push(useColor ? `${ANSI.bold}${header}${ANSI.reset}` : header);
  lines.push('-'.repeat(76));

  const sortedControllers = Array.from(controllers.keys()).sort();
  for (const ctrl of sortedControllers) {
    const entry = controllers.get(ctrl);
    if (!entry) {
      continue;
    }
    const geoms = Array.from(entry.geometries).sort().join(', ');
    const buses = Array.from(entry.buses).sort().join(', ');
    lines.push(
      `${ctrl.padEnd(16)} ${geoms.slice(0, 28).padEnd(30)} ${buses.padEnd(20)} ${entry.count}`,
    );
  }

  return lines.join('\n');
}
