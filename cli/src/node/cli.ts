#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/cli.ts
 * Purpose: Command-line interface entry point for U8G2GL. Dispatches subcommands
 *          for XML validation, code generation, display queries, and display
 *          catalogue enumeration.
 * Description: Command parser and subcommand router supporting global flags
 *              (--json, --no-color, --version, --help) and subcommands (validate,
 *              generate, find, catalogue). `validate` and `generate` share one load
 *              path (load-project.ts) and one validation (checkProject), differing
 *              only in the not-yet-supported severity: `validate` warns, `generate`
 *              refuses (PR-04 decision 1). `validate --fix-names` writes generated
 *              element names back; `generate` never invents identity (ui_spec §16.1).
 *              Output is compiler-style diagnostics (§15.1) or JSON (§15.3, [D-16]).
 *
 * Exports:
 * - runCli(args): Main entry point for command-line execution
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../data/catalogue.js';
import { checkProject, generate } from '../core/generator/index.js';
import type { Diagnostic } from '../core/schema/diagnostic.js';
import type { CheckedTarget } from '../core/validator/index.js';
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
import { fixMissingNames, type NameFixRecord } from './fix-names.js';
import { loadProject, type LoadedProject } from './load-project.js';
import { planGeneratedWrite, writeGenerated, type FileChange } from './write-generated.js';

/** List of recognized subcommands for U8G2GL CLI. */
const KNOWN_COMMANDS = ['validate', 'find', 'catalogue', 'generate'] as const;

/** Output directory `generate` uses when neither `--out` nor `<output dir>` names one. */
const DEFAULT_OUTPUT_DIR = 'generated';

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
  generate   Validate a project and write its generated C++ files
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
  Constructs 'generate' does not build yet are reported as warnings.
  --json: { "diagnostics": [...], "errors": N, "warnings": N }
          (+ "fixedNames": [{ "file", "names" }] with --fix-names)

Generate Options:
  u8g2gl generate [path]                       Generate from a project directory (default: .)
    --target <name>  Target to generate for (default: the first <target>)
    --out <dir>      Output directory (default: the project's <output dir>,
                     else generated/ in the project)
    --check          Write nothing; exit 1 if any file would change (CI check)
  Runs the same validation as 'validate', but constructs not built yet are
  errors, and any error means nothing is written. Only files inside the output
  directory are written, and only files carrying the GENERATED header are
  deleted. An unnamed element is an error: use 'validate --fix-names'.
  --json: { "files": [{ "path", "action" }], "diagnostics": [...], "errors": N, "warnings": N }
          action is created | updated | unchanged | deleted — what was done,
          or with --check what would be done. "files" is [] when refused.

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

// exitWithFatal
// Reports a failure that stops a command before any diagnostics exist — a
// missing path, a project the loader cannot read — in the command's own JSON
// shape or as one error line, then exits 1.
//   json      — whether --json was given
//   file      — the path the failure concerns, as the user typed it
//   message   — what went wrong
//   jsonExtra — command-specific fields the JSON contract always carries
function exitWithFatal(
  json: boolean,
  file: string,
  message: string,
  jsonExtra: Record<string, unknown> = {},
): never {
  if (json) {
    const diagnostic: Diagnostic = { code: 'U8G2GL_MISSING_FILE', severity: 'error', file, line: 1, column: 1, message };
    console.log(
      JSON.stringify({ ...jsonExtra, diagnostics: [diagnostic], errors: 1, warnings: 0 }, null, 2),
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

// loadOrExit
// Loads a project through the shared load path, or reports why it cannot be
// loaded and exits. `validate` and `generate` both come through here, so they
// read the same files the same way.
//   targetArg — path as the user typed it
//   json      — whether --json was given
//   jsonExtra — command-specific JSON fields for a failure report
function loadOrExit(targetArg: string, json: boolean, jsonExtra: Record<string, unknown>): LoadedProject {
  const targetPath = resolve(process.cwd(), targetArg);
  if (!existsSync(targetPath)) {
    exitWithFatal(json, targetArg, `Path does not exist: ${targetArg}`, jsonExtra);
  }
  try {
    return loadProject(targetPath, { label: targetArg });
  } catch (err) {
    exitWithFatal(json, 'u8g2gl.xml', err instanceof Error ? err.message : String(err), jsonExtra);
  }
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
 * Loading uses the default `'error'` missing-name policy: an unnamed element is
 * an error and no identity is invented. `--fix-names` runs a `'generate'` pass
 * first, writes the names into the source files, and then validates the
 * rewritten files through this same path — so the fixed project is genuinely
 * re-validated rather than assumed clean. Constructs `generate` does not build
 * yet are warnings here (`U8G2GL_NOT_YET_SUPPORTED`), and errors under `generate`.
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
  const failureExtra = fixNames ? { fixedNames: [] } : {};

  if (!existsSync(resolve(process.cwd(), targetArg))) {
    exitWithFatal(json, targetArg, `Path does not exist: ${targetArg}`);
  }

  // --- Step 1: Optional write-back pass, before anything is loaded ---
  // The fix runs first and writes to disk, so the load below reads the
  // rewritten files and the validation that follows is a genuine re-validation.
  let fixedNames: readonly NameFixRecord[] = [];
  if (fixNames) {
    try {
      fixedNames = fixMissingNames(resolve(process.cwd(), targetArg), targetArg);
    } catch (err) {
      exitWithFatal(json, targetArg, err instanceof Error ? err.message : String(err), failureExtra);
    }
  }

  // --- Step 2: Load and validate through the path `generate` shares ---
  const loaded = loadOrExit(targetArg, json, failureExtra);
  const { diagnostics, errors, warnings, checkedTarget } = checkProject(loaded.model, 'warning');

  // --- Step 3: Emit JSON or human-readable output ---
  if (json) {
    // Machine-readable contract (§15.3, [D-16]). `fixedNames` is present only
    // when --fix-names was requested, so the existing contract is unchanged for
    // every caller that does not ask for the fix. `target` — the target geometry
    // was checked against (PR-04 WO7b) — is present when the project declares one.
    console.log(
      JSON.stringify(
        {
          diagnostics,
          errors,
          warnings,
          ...(checkedTarget ? { target: checkedTarget } : {}),
          ...(fixNames ? { fixedNames } : {}),
        },
        null,
        2,
      ),
    );
    process.exit(errors > 0 ? 1 : 0);
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

  const formatted = formatDiagnostics(diagnostics, (f) => loaded.fileContents.get(f), { color: useColor });
  const targetLine = describeCheckedTarget(checkedTarget, loaded.model.hasProjectManifest);
  const withTarget = (summary: string): string => (targetLine ? `${targetLine}\n${summary}` : summary);
  if (errors > 0) {
    console.error(formatted);
    console.error(`\n${withTarget(`Validation failed: ${errors} error(s), ${warnings} warning(s).`)}`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(formatted);
    console.log(`\n${withTarget(`Validation passed: 0 errors, ${warnings} warning(s).`)}`);
    process.exit(0);
  }
  console.log(withTarget('Validation passed: 0 errors, 0 warnings.'));
  process.exit(0);
}

// describeCheckedTarget
// The line `validate` prints naming the target geometry was checked against
// (PR-04 WO7b): `generate --target` checks another, so the author must be able
// to see which one `validate` meant. Undefined for a lone file, which has no target.
//   target              — from checkProject
//   hasProjectManifest  — whether a u8g2gl.xml was loaded
function describeCheckedTarget(target: CheckedTarget | undefined, hasProjectManifest: boolean): string | undefined {
  if (target === undefined) {
    return hasProjectManifest ? 'No <target> declared: geometry bounds were not checked.' : undefined;
  }
  if (target.display === undefined) {
    return `Target '${target.name}' (${target.setup}) has no display in the catalogue: geometry bounds were not checked.`;
  }
  return (
    `Geometry checked against target '${target.name}' (${target.setup}, ` +
    `${target.display.width}x${target.display.height}); 'generate --target' checks the target it builds.`
  );
}

/** Parsed `generate` arguments. */
interface GenerateArgs {
  readonly path: string;
  readonly target?: string;
  readonly out?: string;
  readonly check: boolean;
}

// parseGenerateArgs
// Parses `generate [path] --target <name> --out <dir> --check`, or reports a
// usage error and exits 2. Strict, unlike `validate`: a mistyped flag on a
// command that writes files must not be silently ignored.
//   args — subcommand arguments, global flags already removed
function parseGenerateArgs(args: readonly string[]): GenerateArgs {
  let path: string | undefined;
  let target: string | undefined;
  let out: string | undefined;
  let check = false;

  const usageError = (message: string): never => {
    console.error(`Error: ${message}`);
    console.error("Run 'u8g2gl --help' for generate's options.");
    process.exit(2);
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--check') {
      check = true;
    } else if (arg === '--target' || arg === '--out') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        usageError(`${arg} requires a value.`);
      }
      i++;
      if (arg === '--target') {
        target = value;
      } else {
        out = value;
      }
    } else if (arg.startsWith('-')) {
      usageError(`Unknown option for generate: ${arg}`);
    } else if (path === undefined) {
      path = arg;
    } else {
      usageError(`generate takes one path; got '${path}' and '${arg}'.`);
    }
  }

  return { path: path ?? '.', ...(target !== undefined ? { target } : {}), ...(out !== undefined ? { out } : {}), check };
}

/** Output-relative change list as the user reads it, one line per file. */
function formatChanges(changes: readonly FileChange[], check: boolean): string {
  const verb: Record<FileChange['action'], string> = check
    ? { created: 'would create', updated: 'would update', unchanged: 'unchanged', deleted: 'would delete' }
    : { created: 'created', updated: 'updated', unchanged: 'unchanged', deleted: 'deleted' };
  return changes.map((c) => `  ${verb[c.action]}: ${c.path}`).join('\n');
}

/**
 * @brief Executes the `generate` subcommand.
 *
 * Loads the project through the path `validate` uses and validates it the same
 * way, but with not-yet-supported constructs as errors. Any error refuses the
 * build: nothing is written.
 *
 * `--json` contract (§15.3, [D-16]), on stdout:
 * `{ "files": FileChange[], "diagnostics": Diagnostic[], "errors": N, "warnings": N }`,
 * where each `FileChange` is `{ "path", "action" }`, `path` is relative to the
 * output directory, and `action` is `created | updated | unchanged | deleted` —
 * what was done or, under `--check`, what would be done. `files` is `[]` when
 * the build is refused. The §18 budget joins this object in PR-04 WO12.
 *
 * Exit status: 0 on success (under `--check`, only if nothing would change);
 * 1 if refused, or under `--check` if any file would change; 2 on a usage error.
 *
 * @param args Subcommand arguments.
 * @param json Whether to output JSON.
 * @param useColor Whether ANSI colouring is enabled.
 */
function handleGenerateCommand(args: readonly string[], json: boolean, useColor: boolean): void {
  const options = parseGenerateArgs(args);

  // --- Step 1: Load, validate and lay out — all or nothing ---
  const loaded = loadOrExit(options.path, json, { files: [] });
  const result = generate({
    ...loaded.model,
    ...(options.target !== undefined ? { target: options.target } : {}),
    generatorVersion: getPackageVersion(),
  });
  const { diagnostics, errors, warnings } = result;
  const formatted = formatDiagnostics(diagnostics, (f) => loaded.fileContents.get(f), { color: useColor });

  if (errors > 0 || loaded.projectRoot === undefined) {
    if (json) {
      console.log(JSON.stringify({ files: [], diagnostics, errors, warnings }, null, 2));
    } else {
      console.error(formatted);
      console.error(`\nGeneration refused: ${errors} error(s), ${warnings} warning(s). Nothing was written.`);
    }
    process.exit(1);
  }

  // --- Step 2: Decide the output directory ---
  // --out is relative to where the command runs; <output dir> is relative to
  // the project, because the project file is what declares it.
  const outDir = options.out !== undefined
    ? resolve(process.cwd(), options.out)
    : resolve(loaded.projectRoot, loaded.model.project.output?.dir ?? DEFAULT_OUTPUT_DIR);
  const outLabel = relative(process.cwd(), outDir).split(sep).join('/') || '.';

  // --- Step 3: Check or write ---
  let changes: readonly FileChange[];
  try {
    changes = options.check ? planGeneratedWrite(outDir, result.files) : writeGenerated(outDir, result);
  } catch (err) {
    exitWithFatal(json, outLabel, err instanceof Error ? err.message : String(err), { files: [] });
  }
  const drift = changes.filter((c) => c.action !== 'unchanged');

  // --- Step 4: Report ---
  if (json) {
    console.log(JSON.stringify({ files: changes, diagnostics, errors, warnings }, null, 2));
  } else {
    if (warnings > 0) {
      console.log(`${formatted}\n`);
    }
    if (options.check) {
      console.log(
        drift.length === 0
          ? `Generated files in ${outLabel} are up to date (target '${result.target}').`
          : `Generated files in ${outLabel} are out of date (target '${result.target}'):\n${formatChanges(drift, true)}`,
      );
    } else {
      console.log(
        `Generated ${result.files.length} file(s) in ${outLabel} for target '${result.target}':\n` +
          formatChanges(changes, false),
      );
    }
  }
  process.exit(options.check && drift.length > 0 ? 1 : 0);
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

  if (subcommand === 'generate') {
    handleGenerateCommand(subcommandArgs, json, useColor);
    return;
  }

  // --- Step 5: Handle unknown subcommand ---
  console.error(`Unknown command: ${subcommand}`);
  console.error(`Available commands: ${KNOWN_COMMANDS.join(', ')}`);
  process.exit(1);
}

// Execute immediately when invoked from CLI
runCli(process.argv.slice(2));
