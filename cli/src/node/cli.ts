#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/cli.ts
 * Purpose: Command-line interface entry point for U8G2GL. Dispatches subcommands
 *          for XML validation, display queries, and code generation.
 * Description: Command parser and subcommand router supporting global flags
 *              (--json, --version, --help) and subcommands (validate, find, catalogue).
 *              Wires the isomorphic display catalogue query engine into the CLI (§5.2).
 *
 * Exports:
 * - runCli(args): Main entry point for command-line execution
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../data/catalogue.js';
import {
  parseProjectFile,
  parseGlobalsFile,
  parseScreenFile,
  parseComponentFile,
  parseWidgetManifestFile,
} from '../core/parser/index.js';
import { validate } from '../core/validator/index.js';
import type { Diagnostic } from '../core/schema/diagnostic.js';
import type { U8g2glProject } from '../core/schema/project.js';
import type { Globals } from '../core/schema/globals.js';
import type { Screen } from '../core/schema/screen.js';
import type { Component } from '../core/schema/component.js';
import type { WidgetManifest } from '../core/schema/widget-manifest.js';
import {
  identifyDisplay,
  sourceDisplay,
  compareDisplays,
  enumerateDisplays,
  type SourceConstraints,
  type FitsTarget,
} from '../core/catalogue/query.js';
import type { BusFamily } from '../core/schema/display-record.js';

/** List of recognized subcommands for U8G2GL CLI. */
const KNOWN_COMMANDS = ['validate', 'find', 'catalogue'] as const;

/**
 * Standard microcontroller internal SRAM budgets in bytes (§5.2, §18).
 */
const KNOWN_TARGET_RAM: Record<string, number> = {
  esp32dev: 520 * 1024,
  esp32: 520 * 1024,
  esp8266: 80 * 1024,
  uno: 2048,
  atmega328p: 2048,
  mega: 8192,
  atmega2560: 8192,
  rp2040: 264 * 1024,
  pico: 264 * 1024,
  stm32f103: 20 * 1024,
  bluepill: 20 * 1024,
};

/**
 * @brief Reads the package version from package.json.
 *
 * Resolves package.json relative to import.meta.url so it functions
 * correctly in both transpiled dist and local test environments.
 *
 * @return Semantic version string, or fallback '0.3.0' if unreadable.
 */
function getPackageVersion(): string {
  try {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const content = readFileSync(fileURLToPath(pkgUrl), 'utf8');
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? '0.3.0';
  } catch {
    return '0.3.0';
  }
}

/**
 * @brief Prints CLI usage help to stdout.
 */
function printUsage(): void {
  console.log(`Usage: u8g2gl [options] <command> [command-options]

Commands:
  validate   Validate a U8G2GL XML file against the schema
  find       Query the display catalogue for matching displays
  catalogue  Display information from the display catalogue

Global Options:
  --json     Format output as JSON
  --version  Show version number
  --help     Show help

Find Options:
  u8g2gl find <query>                          Free-text search (identify mode)
  u8g2gl find --compare <setup1> <setup2>...  Compare differing fields across displays
  u8g2gl find [constraints...]                 Constraint-driven search (source mode):
    --min-width <pixels>       Minimum width in pixels
    --max-width <pixels>       Maximum width in pixels
    --height <pixels>          Exact height in pixels
    --bus <i2c|spi|parallel>   Normalized bus family
    --max-framebuffer <bytes>  Maximum static framebuffer size in bytes
    --controller-family <name> Controller prefix (e.g. SSD13)
    --fits <board|bytes>       Evaluate SRAM headroom (e.g. esp32dev, 520kb)
`);
}

/**
 * @brief Parses a RAM capacity string into bytes.
 *
 * Accepts board names (e.g. "esp32dev"), byte counts ("532480"), or suffixed strings ("520kb").
 *
 * @param fitsArg Raw string argument for --fits.
 * @return Number of RAM bytes, or undefined if unparseable.
 */
function parseFitsRam(fitsArg: string): number | undefined {
  const normalized = fitsArg.toLowerCase().trim();
  const known = KNOWN_TARGET_RAM[normalized];
  if (known !== undefined) {
    return known;
  }

  if (normalized.endsWith('kb') || normalized.endsWith('k')) {
    const num = parseFloat(normalized);
    if (!Number.isNaN(num)) {
      return Math.round(num * 1024);
    }
  }

  if (normalized.endsWith('mb') || normalized.endsWith('m')) {
    const num = parseFloat(normalized);
    if (!Number.isNaN(num)) {
      return Math.round(num * 1024 * 1024);
    }
  }

  const numeric = parseInt(normalized, 10);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return numeric;
  }

  return undefined;
}

/**
 * @brief Handles the `catalogue` subcommand (enumerate mode).
 *
 * @param json Whether to output JSON.
 */
function handleCatalogueCommand(json: boolean): void {
  const displays = enumerateDisplays(CATALOGUE);

  if (json) {
    console.log(JSON.stringify(displays, null, 2));
    return;
  }

  // Human-readable summary
  const controllers = new Map<string, { geometries: Set<string>; buses: Set<string>; count: number }>();

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

  console.log(`U8G2 Display Catalogue (${displays.length} displays across ${controllers.size} controllers)\n`);
  console.log(`${'CONTROLLER'.padEnd(16)} ${'GEOMETRIES'.padEnd(28)} ${'BUSES'.padEnd(20)} TOTAL`);
  console.log('-'.repeat(74));

  const sortedControllers = Array.from(controllers.keys()).sort();
  for (const ctrl of sortedControllers) {
    const entry = controllers.get(ctrl);
    if (!entry) {
      continue;
    }
    const geoms = Array.from(entry.geometries).sort().join(', ');
    const buses = Array.from(entry.buses).sort().join(', ');
    console.log(
      `${ctrl.padEnd(16)} ${geoms.slice(0, 26).padEnd(28)} ${buses.padEnd(20)} ${entry.count}`
    );
  }
}

/**
 * @brief Handles the `find` subcommand across identify, source, and compare modes.
 *
 * @param args Subcommand argument array.
 * @param json Whether to output JSON.
 */
function handleFindCommand(args: readonly string[], json: boolean): void {
  // --- Step 1: Detect mode flags and arguments ---
  let isCompare = false;
  const compareSetups: string[] = [];

  let minWidth: number | undefined;
  let maxWidth: number | undefined;
  let height: number | undefined;
  let bus: BusFamily | undefined;
  let maxFramebuffer: number | undefined;
  let controllerFamily: string | undefined;
  let fitsTarget: FitsTarget | undefined;
  let hasSourceFlags = false;

  const queryTokens: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === '--compare') {
      isCompare = true;
    } else if (arg === '--min-width' && i + 1 < args.length) {
      minWidth = parseInt(args[++i] ?? '', 10);
      hasSourceFlags = true;
    } else if (arg === '--max-width' && i + 1 < args.length) {
      maxWidth = parseInt(args[++i] ?? '', 10);
      hasSourceFlags = true;
    } else if (arg === '--height' && i + 1 < args.length) {
      height = parseInt(args[++i] ?? '', 10);
      hasSourceFlags = true;
    } else if (arg === '--bus' && i + 1 < args.length) {
      const b = (args[++i] ?? '').toLowerCase();
      if (b === 'i2c' || b === 'spi' || b === 'parallel') {
        bus = b as BusFamily;
      }
      hasSourceFlags = true;
    } else if (arg === '--max-framebuffer' && i + 1 < args.length) {
      maxFramebuffer = parseInt(args[++i] ?? '', 10);
      hasSourceFlags = true;
    } else if (arg === '--controller-family' && i + 1 < args.length) {
      controllerFamily = args[++i];
      hasSourceFlags = true;
    } else if (arg === '--fits' && i + 1 < args.length) {
      const ram = parseFitsRam(args[++i] ?? '');
      if (ram !== undefined) {
        fitsTarget = { boardRam: ram };
      }
      hasSourceFlags = true;
    } else if (!arg.startsWith('-')) {
      if (isCompare) {
        compareSetups.push(arg);
      } else {
        queryTokens.push(arg);
      }
    }
  }

  // --- Step 2: Dispatch to Compare Mode ---
  if (isCompare) {
    if (compareSetups.length < 2) {
      console.error('Error: --compare requires at least two setup names.');
      process.exit(2);
    }

    const compareResult = compareDisplays(CATALOGUE, compareSetups);

    if (json) {
      console.log(JSON.stringify(compareResult, null, 2));
      return;
    }

    if (compareResult.notFound.length > 0) {
      console.warn(`Warning: Setups not found: ${compareResult.notFound.join(', ')}`);
    }

    const diffKeys = Object.keys(compareResult.differences);
    if (diffKeys.length === 0) {
      console.log('Selected displays have identical catalogued attributes.');
      return;
    }

    console.log(`Comparison of ${compareResult.records.length} displays (showing differing fields):\n`);
    console.log(`${'FIELD'.padEnd(20)} ${compareResult.records.map((r) => r.setup.slice(0, 30).padEnd(32)).join(' ')}`);
    console.log('-'.repeat(20 + compareResult.records.length * 33));

    for (const key of diffKeys) {
      const values = compareResult.differences[key] ?? [];
      const valStrings = values.map((v) => String(v).slice(0, 30).padEnd(32)).join(' ');
      console.log(`${key.padEnd(20)} ${valStrings}`);
    }
    return;
  }

  // --- Step 3: Dispatch to Source Mode ---
  if (hasSourceFlags) {
    const constraints: SourceConstraints = {
      ...(minWidth !== undefined ? { minWidth } : {}),
      ...(maxWidth !== undefined ? { maxWidth } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(bus !== undefined ? { bus } : {}),
      ...(maxFramebuffer !== undefined ? { maxFramebuffer } : {}),
      ...(controllerFamily !== undefined ? { controllerFamily } : {}),
      ...(fitsTarget !== undefined ? { fitsTarget } : {}),
    };

    const sourceResult = sourceDisplay(CATALOGUE, constraints);

    if (json) {
      console.log(JSON.stringify(sourceResult, null, 2));
      return;
    }

    if (sourceResult.matches.length === 0) {
      console.log('No displays match the specified constraints.');
      return;
    }

    console.log(`Found ${sourceResult.matches.length} matching displays:\n`);
    const hasFits = constraints.fitsTarget !== undefined;
    const header = hasFits
      ? `${'SETUP'.padEnd(42)} ${'GEOMETRY'.padEnd(10)} ${'RAM'.padEnd(10)} HEADROOM`
      : `${'SETUP'.padEnd(42)} ${'GEOMETRY'.padEnd(10)} ${'BUS'.padEnd(12)} RAM`;
    console.log(header);
    console.log('-'.repeat(header.length + 10));

    for (const item of sourceResult.matches.slice(0, 30)) {
      const d = item.record;
      const geom = `${d.width}x${d.height}`;
      const ramKb = `${(d.framebufferBytes / 1024).toFixed(1)} KB`;

      if (hasFits) {
        const tag = item.classification === 'check' ? 'check headroom' : (item.classification ?? '');
        console.log(`${d.setup.padEnd(42)} ${geom.padEnd(10)} ${ramKb.padEnd(10)} ${tag}`);
      } else {
        console.log(`${d.setup.padEnd(42)} ${geom.padEnd(10)} ${d.bus.family.padEnd(12)} ${ramKb}`);
      }
    }

    if (hasFits) {
      console.log('\nClassification is framebuffer vs internal SRAM headroom (§5.2, §18).');
      console.log('Note: The framebuffer must live in internal SRAM; PSRAM does not increase display headroom.');
    }
    return;
  }

  // --- Step 4: Dispatch to Identify Mode (Default) ---
  const queryString = queryTokens.join(' ').trim();
  if (!queryString) {
    console.error('Error: Please provide a search query for find (e.g. u8g2gl find "SSD1306 128x64 i2c").');
    printUsage();
    process.exit(2);
  }

  const result = identifyDisplay(CATALOGUE, queryString);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.matches.length === 0) {
    console.log(result.message ?? `No matching displays found for "${queryString}".`);
    if (result.suggestions.length > 0) {
      console.log(`Suggestions: ${result.suggestions.join(', ')}`);
    }
    return;
  }

  console.log(`Found ${result.matches.length} matching displays:\n`);
  for (const d of result.matches.slice(0, 10)) {
    const geom = `${d.width}x${d.height}`;
    const busDesc = `${d.bus.family.toUpperCase()} (${d.bus.wiring})`;
    console.log(`  ${d.setup.padEnd(46)} ${geom.padEnd(10)} ${busDesc}`);
  }

  const topMatch = result.matches[0];
  if (topMatch) {
    console.log(`\n  framebuffer: ${topMatch.framebufferBytes} bytes (${topMatch.tiles.width}x${topMatch.tiles.height} tiles)`);
  }

  for (const note of result.notes) {
    console.log(`\n  note: ${note}`);
  }

  return;
}

/**
 * @brief Main execution entry point for the CLI.
 *
 * Parses raw argument vector, handles global flags, and dispatches
 * to known subcommands. Exits the process with an appropriate status code:
 * - 0: Success
 * - 1: Execution error or unknown command
 * - 2: Usage error (missing arguments or invalid flags)
 *
 * @param rawArgs Command-line arguments (excluding node binary and script path).
 */
export function runCli(rawArgs: readonly string[]): void {
  // --- Step 1: Scan for global flags and isolate subcommand ---
  let json = false;
  let showHelp = false;
  let showVersion = false;
  let subcommand: string | undefined;
  const subcommandArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (!arg) {
      continue;
    }

    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--version' || arg === '-v') {
      showVersion = true;
    } else if (!subcommand && !arg.startsWith('-')) {
      subcommand = arg;
    } else {
      subcommandArgs.push(arg);
    }
  }

  // --- Step 2: Handle global informational flags ---
  if (showHelp) {
    printUsage();
    return;
  }

  if (showVersion) {
    console.log(getPackageVersion());
    return;
  }

  // --- Step 3: Validate presence of a subcommand ---
  if (!subcommand) {
    printUsage();
    process.exit(2);
  }

  // --- Step 4: Dispatch subcommand ---
  if (subcommand === 'find') {
    handleFindCommand(subcommandArgs, json);
    return;
  }

  if (subcommand === 'catalogue') {
    handleCatalogueCommand(json);
    return;
  }

/**
 * Recursively discovers all XML files within a directory tree.
 */
function findXmlFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findXmlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.xml')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Return collected entries on error
  }
  return results;
}

/**
 * Executes the 'validate' subcommand across a project directory or single XML file.
 */
function handleValidateCommand(args: readonly string[], json: boolean): void {
  const targetArg = args[0] ?? '.';
  const targetPath = resolve(process.cwd(), targetArg);

  if (!existsSync(targetPath)) {
    console.error(`Error: Path does not exist: ${targetArg}`);
    process.exit(1);
  }

  const stat = statSync(targetPath);
  const xmlFiles: string[] = [];

  if (stat.isFile()) {
    xmlFiles.push(targetPath);
  } else if (stat.isDirectory()) {
    xmlFiles.push(...findXmlFiles(targetPath));
  }

  if (xmlFiles.length === 0) {
    console.error(`No XML files found in: ${targetArg}`);
    process.exit(1);
  }

  const parsedProjects: { file: string; project: U8g2glProject }[] = [];
  const parsedGlobalsList: Globals[] = [];
  const parsedScreens: Screen[] = [];
  const parsedComponents: Component[] = [];
  const parsedWidgetManifests: WidgetManifest[] = [];
  const allDiagnostics: Diagnostic[] = [];

  for (const file of xmlFiles) {
    let xml: string;
    try {
      xml = readFileSync(file, 'utf-8');
    } catch (err) {
      console.error(`Error reading ${file}: ${String(err)}`);
      continue;
    }

    const match = xml.match(/<([a-zA-Z0-9_]+)/);
    const rootTag = match ? match[1] : '';

    if (rootTag === 'u8g2gl') {
      const res = parseProjectFile(xml, file);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedProjects.push({ file, project: res.value });
      }
    } else if (rootTag === 'globals') {
      const res = parseGlobalsFile(xml, file);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedGlobalsList.push(res.value);
      }
    } else if (rootTag === 'screen') {
      const res = parseScreenFile(xml, file);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedScreens.push(res.value);
      }
    } else if (rootTag === 'component') {
      const res = parseComponentFile(xml, file);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedComponents.push(res.value);
      }
    } else if (rootTag === 'widget') {
      const res = parseWidgetManifestFile(xml, file);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedWidgetManifests.push(res.value);
      }
    }
  }

  const mergedGlobals: Globals = {
    consts: parsedGlobalsList.flatMap((g) => g.consts ?? []),
    subjects: parsedGlobalsList.flatMap((g) => g.subjects ?? []),
    styles: parsedGlobalsList.flatMap((g) => g.styles ?? []),
    fonts: parsedGlobalsList.flatMap((g) => g.fonts ?? []),
    images: parsedGlobalsList.flatMap((g) => g.images ?? []),
  };

  if (parsedProjects.length > 0) {
    for (const p of parsedProjects) {
      const res = validate({
        project: p.project,
        globals: mergedGlobals,
        screens: parsedScreens,
        components: parsedComponents,
        widgetManifests: parsedWidgetManifests,
        catalogue: CATALOGUE,
      });
      allDiagnostics.push(...res.diagnostics);
    }
  } else {
    const dummyProject: U8g2glProject = {
      schema: '0.3',
      name: 'unnamed',
      version: '1.0.0',
      targets: [],
    };
    const res = validate({
      project: dummyProject,
      globals: mergedGlobals,
      screens: parsedScreens,
      components: parsedComponents,
      widgetManifests: parsedWidgetManifests,
      catalogue: CATALOGUE,
    });
    allDiagnostics.push(...res.diagnostics);
  }

  // Deduplicate diagnostics by file:line:column:code:message
  const seen = new Set<string>();
  const uniqueDiagnostics: Diagnostic[] = [];
  for (const d of allDiagnostics) {
    const key = `${d.file}:${d.line}:${d.column}:${d.code}:${d.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDiagnostics.push(d);
    }
  }

  uniqueDiagnostics.sort((a, b) => {
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

  let errorCount = 0;
  let warningCount = 0;
  for (const d of uniqueDiagnostics) {
    if (d.severity === 'error') {
      errorCount++;
    } else if (d.severity === 'warning') {
      warningCount++;
    }
  }

  if (json) {
    console.log(JSON.stringify(uniqueDiagnostics, null, 2));
  } else {
    for (const d of uniqueDiagnostics) {
      const prefix = `${d.file}:${d.line}:${d.column}`;
      console.log(`${prefix} [${d.severity}] ${d.code}: ${d.message}`);
      if (d.suggestions && d.suggestions.length > 0) {
        console.log(`  did you mean: ${d.suggestions.join(', ')}?`);
      }
    }
    if (errorCount === 0) {
      console.log(`Validation passed: 0 errors, ${warningCount} warnings.`);
    } else {
      console.error(`Validation failed: ${errorCount} error(s), ${warningCount} warning(s).`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

  if (subcommand === 'validate') {
    handleValidateCommand(subcommandArgs, json);
    return;
  }

  // --- Step 5: Handle unknown subcommand ---
  console.error(`Unknown command: ${subcommand}`);
  console.error(`Available commands: ${KNOWN_COMMANDS.join(', ')}`);
  process.exit(1);
}

// Execute immediately when invoked from CLI
runCli(process.argv.slice(2));
