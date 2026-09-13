#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/cli.ts
 * Purpose: Command-line interface entry point for U8G2GL. Dispatches subcommands
 *          for XML validation, display queries, and display catalogue enumeration.
 * Description: Command parser and subcommand router supporting global flags
 *              (--json, --no-color, --version, --help) and subcommands (validate, find, catalogue),
 *              including validate's --fix-names write-back of generated element names.
 *              Wires the isomorphic display catalogue query engine and schema validator
 *              into human-readable compiler-style diagnostics (§15.1) and JSON output (§15.3, [D-16]).
 *
 * Exports:
 * - runCli(args): Main entry point for command-line execution
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../data/catalogue.js';
import {
  parseProjectFile,
  parseGlobalsFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../core/parser/index.js';
import { validate } from '../core/validator/index.js';
import type { Diagnostic } from '../core/schema/diagnostic.js';
import type { U8g2glProject } from '../core/schema/project.js';
import type { Globals } from '../core/schema/globals.js';
import type { Screen } from '../core/schema/screen.js';
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
import { formatDiagnostics } from './format-diagnostic.js';
import {
  formatIdentifyResult,
  formatSourceResult,
  formatCompareResult,
  formatCatalogueSummary,
} from './format-display.js';
import { readProjectFiles, getProjectFileMap } from './read-project.js';
import { fixMissingNames, type NameFixRecord } from './fix-names.js';

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
  validate   Validate a U8G2GL XML project or file against the schema
  find       Query the display catalogue for matching displays
  catalogue  Display summary from the display catalogue

Global Options:
  --json      Format output as JSON
  --no-color  Disable ANSI colour output
  --version   Show version number
  --help      Show help

Validate Options:
  u8g2gl validate [path]                       Validate a project directory or single XML file
    --fix-names   Generate names for unnamed elements, write them into the
                  source files, then re-validate. Without it, an unnamed
                  element is an error: the build never invents identity.

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
 * @param useColor Whether ANSI colouring is enabled.
 */
function handleCatalogueCommand(json: boolean, useColor: boolean): void {
  const displays = enumerateDisplays(CATALOGUE);

  if (json) {
    console.log(JSON.stringify(displays, null, 2));
    return;
  }

  console.log(formatCatalogueSummary(displays, { color: useColor }));
}

/**
 * @brief Handles the `find` subcommand across identify, source, and compare modes.
 *
 * @param args Subcommand argument array.
 * @param json Whether to output JSON.
 * @param useColor Whether ANSI colouring is enabled.
 */
function handleFindCommand(args: readonly string[], json: boolean, useColor: boolean): void {
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

    console.log(formatCompareResult(compareResult, { color: useColor }));
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
      // Machine-readable contract: array of matched DisplayRecord entries (§15.3)
      console.log(JSON.stringify(sourceResult.matches.map((m) => m.record), null, 2));
      return;
    }

    console.log(formatSourceResult(sourceResult, { color: useColor }));
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
    // Machine-readable contract: array of matched DisplayRecord entries (§15.3, [D-16])
    console.log(JSON.stringify(result.matches, null, 2));
    return;
  }

  console.log(formatIdentifyResult(result, { color: useColor }));
}

/**
 * @brief Executes the `validate` subcommand across a project directory or single XML file.
 *
 * Implements §15.1 and §15.3:
 * - `--json` emits `{ "diagnostics": Diagnostic[], "errors": N, "warnings": N }` to stdout,
 *   plus `"fixedNames": [{ "file": string, "names": string[] }]` when `--fix-names` is given.
 * - Default human-readable output renders compiler-style diagnostics with source lines and carets.
 * - Exits 0 on clean (no errors), 1 on errors.
 *
 * Parsing uses the default `'error'` missing-name policy: an unnamed element is
 * an error and no identity is invented. `--fix-names` runs a `'generate'` pass
 * first, writes the names into the source files, and then validates the
 * rewritten files through this same path — so the fixed project is genuinely
 * re-validated rather than assumed clean.
 *
 * @param args Subcommand arguments.
 * @param json Whether to output JSON.
 * @param useColor Whether ANSI colouring is enabled.
 */
function handleValidateCommand(args: readonly string[], json: boolean, useColor: boolean): void {
  const fixNames = args.includes('--fix-names');
  // Only positional arguments name a target; a flag must never be mistaken for
  // a path, or `validate --fix-names` alone would look for a file called
  // '--fix-names'.
  const targetArg = args.find((a) => !a.startsWith('-')) ?? '.';
  const targetPath = resolve(process.cwd(), targetArg);

  if (!existsSync(targetPath)) {
    const notFoundMsg = `Path does not exist: ${targetArg}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            diagnostics: [
              {
                code: 'U8G2GL_MISSING_FILE',
                severity: 'error',
                file: targetArg,
                line: 1,
                column: 1,
                message: notFoundMsg,
              },
            ],
            errors: 1,
            warnings: 0,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    console.error(`Error: ${notFoundMsg}`);
    process.exit(1);
  }

  // --- Step 1b: Optional write-back pass, before anything is loaded ---
  // The fix runs first and writes to disk, so the load below reads the
  // rewritten files and the validation that follows is a genuine re-validation.
  let fixedNames: readonly NameFixRecord[] = [];
  if (fixNames) {
    try {
      fixedNames = fixMissingNames(targetPath, targetArg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (json) {
        console.log(
          JSON.stringify(
            {
              diagnostics: [
                {
                  code: 'U8G2GL_MISSING_FILE',
                  severity: 'error',
                  file: targetArg,
                  line: 1,
                  column: 1,
                  message: errMsg,
                },
              ],
              errors: 1,
              warnings: 0,
              fixedNames: [],
            },
            null,
            2,
          ),
        );
        process.exit(1);
      }
      console.error(`Error: ${errMsg}`);
      process.exit(1);
    }
  }

  const stat = statSync(targetPath);
  const allDiagnostics: Diagnostic[] = [];
  const fileContentMap = new Map<string, string>();

  let parsedProject: U8g2glProject = {
    // Not a version literal: an unparsed project has no schema to name, and
    // hardcoding one of our own only rots the next time the schema bumps
    // (PR-3R WO9 removed a stale '0.3' default for exactly this reason).
    schema: '',
    name: 'unnamed',
    version: '1.0.0',
    targets: [],
  };
  let parsedGlobals: Globals = {
    consts: [],
    subjects: [],
    styles: [],
    fonts: [],
    images: [],
  };
  const parsedScreens: Screen[] = [];
  const parsedComponents: WidgetManifest[] = [];
  const parsedWidgets: WidgetManifest[] = [];

  // [D-18]: one element vocabulary — a composite is a WidgetManifest whose
  // `<api>` carries a `<view>` (PR-3R WO9). `parseWidgetManifestFile` parses
  // both shapes through the one `<widget>` root; this is the single place
  // that sorts a parsed manifest into the `components` or `widgetManifests`
  // bucket `validate()` still expects, matching pre-WO9 discovery
  // (`components/` vs `widgets/`) without reviving a second parse path.
  function bucketWidgetManifest(manifest: WidgetManifest): void {
    if (manifest.view) {
      parsedComponents.push(manifest);
    } else {
      parsedWidgets.push(manifest);
    }
  }

  if (stat.isDirectory()) {
    // --- Directory: Load standard project structure via readProjectFiles ---
    let projectFiles;
    try {
      projectFiles = readProjectFiles(targetPath);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (json) {
        console.log(
          JSON.stringify(
            {
              diagnostics: [
                {
                  code: 'U8G2GL_MISSING_FILE',
                  severity: 'error',
                  file: 'u8g2gl.xml',
                  line: 1,
                  column: 1,
                  message: errMsg,
                },
              ],
              errors: 1,
              warnings: 0,
            },
            null,
            2,
          ),
        );
        process.exit(1);
      }
      console.error(`error: u8g2gl.xml:1:1\n   ${errMsg}`);
      process.exit(1);
    }

    const loadedMap = getProjectFileMap(projectFiles);
    for (const [k, v] of loadedMap.entries()) {
      fileContentMap.set(k, v);
    }

    // 1. Parse project manifest
    const projRes = parseProjectFile(projectFiles.projectXml, 'u8g2gl.xml');
    allDiagnostics.push(...projRes.diagnostics);
    if (projRes.value) {
      parsedProject = projRes.value;
    }

    // 2. Parse globals
    if (projectFiles.globalsXml) {
      const globRes = parseGlobalsFile(projectFiles.globalsXml, 'globals.xml');
      allDiagnostics.push(...globRes.diagnostics);
      if (globRes.value) {
        parsedGlobals = globRes.value;
      }
    }

    // 3. Parse screens
    for (const screen of projectFiles.screenXmls) {
      const scrRes = parseScreenFile(screen.content, screen.filename);
      allDiagnostics.push(...scrRes.diagnostics);
      if (scrRes.value) {
        parsedScreens.push(scrRes.value);
      }
    }

    // 4. Parse widget manifests — plain widgets and composites alike ([D-18])
    for (const widget of projectFiles.widgetManifestXmls) {
      const widRes = parseWidgetManifestFile(widget.content, widget.filename);
      allDiagnostics.push(...widRes.diagnostics);
      if (widRes.value) {
        bucketWidgetManifest(widRes.value);
      }
    }
  } else {
    // --- Single file validation ---
    const fileXml = readFileSync(targetPath, 'utf-8');
    fileContentMap.set(targetArg, fileXml);

    const match = fileXml.match(/<([a-zA-Z0-9_]+)/);
    const rootTag = match ? match[1] : '';

    if (rootTag === 'u8g2gl') {
      const res = parseProjectFile(fileXml, targetArg);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedProject = res.value;
      }
    } else if (rootTag === 'globals') {
      const res = parseGlobalsFile(fileXml, targetArg);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedGlobals = res.value;
      }
    } else if (rootTag === 'screen') {
      const res = parseScreenFile(fileXml, targetArg);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        parsedScreens.push(res.value);
      }
    } else if (rootTag === 'widget' || rootTag === 'component') {
      // A '<component>' root is a hard error, not a dead end: dispatching it
      // here (rather than silently matching nothing) lets
      // parseWidgetManifestFile raise its named [D-18] migration diagnostic
      // the same way the directory-mode path does.
      const res = parseWidgetManifestFile(fileXml, targetArg);
      allDiagnostics.push(...res.diagnostics);
      if (res.value) {
        bucketWidgetManifest(res.value);
      }
    }
  }

  // --- Step 2: Execute Schema & Semantic Validation ---
  const valResult = validate({
    project: parsedProject,
    globals: parsedGlobals,
    screens: parsedScreens,
    components: parsedComponents,
    widgetManifests: parsedWidgets,
    catalogue: CATALOGUE,
  });
  allDiagnostics.push(...valResult.diagnostics);

  // --- Step 3: Deduplicate and sort deterministically ---
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

  // --- Step 4: Emit JSON or Human-Readable Output ---
  if (json) {
    // Machine-readable contract (§15.3, [D-16]). `fixedNames` is present only
    // when --fix-names was requested, so the existing contract is unchanged for
    // every caller that does not ask for the fix.
    console.log(
      JSON.stringify(
        {
          diagnostics: uniqueDiagnostics,
          errors: errorCount,
          warnings: warningCount,
          ...(fixNames ? { fixedNames } : {}),
        },
        null,
        2,
      ),
    );
    process.exit(errorCount > 0 ? 1 : 0);
  }

  if (fixNames) {
    const total = fixedNames.reduce((sum, record) => sum + record.names.length, 0);
    if (total === 0) {
      console.log('No missing element names: nothing written.');
    } else {
      console.log(`Wrote ${total} generated name(s) into ${fixedNames.length} file(s):`);
      for (const record of fixedNames) {
        console.log(`  ${record.file}: ${record.names.join(', ')}`);
      }
      console.log('');
    }
  }

  if (errorCount > 0) {
    const formatted = formatDiagnostics(
      uniqueDiagnostics,
      (f) => fileContentMap.get(f),
      { color: useColor },
    );
    console.error(formatted);
    console.error(`\nValidation failed: ${errorCount} error(s), ${warningCount} warning(s).`);
    process.exit(1);
  }

  if (warningCount > 0) {
    const formatted = formatDiagnostics(
      uniqueDiagnostics,
      (f) => fileContentMap.get(f),
      { color: useColor },
    );
    console.log(formatted);
    console.log(`\nValidation passed: 0 errors, ${warningCount} warning(s).`);
    process.exit(0);
  }

  console.log('Validation passed: 0 errors, 0 warnings.');
  process.exit(0);
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
  let noColor = false;
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
    } else if (arg === '--no-color') {
      noColor = true;
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

  // Determine whether terminal colour output should be enabled
  const useColor =
    !noColor &&
    !json &&
    process.stdout?.isTTY === true &&
    process.env.NO_COLOR === undefined;

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
    handleFindCommand(subcommandArgs, json, useColor);
    return;
  }

  if (subcommand === 'catalogue') {
    handleCatalogueCommand(json, useColor);
    return;
  }

  if (subcommand === 'validate') {
    handleValidateCommand(subcommandArgs, json, useColor);
    return;
  }

  // --- Step 5: Handle unknown subcommand ---
  console.error(`Unknown command: ${subcommand}`);
  console.error(`Available commands: ${KNOWN_COMMANDS.join(', ')}`);
  process.exit(1);
}

// Execute immediately when invoked from CLI
runCli(process.argv.slice(2));
