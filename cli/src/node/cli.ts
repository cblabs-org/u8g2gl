#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/cli.ts
 * Purpose: Command-line interface entry point for U8G2GL. Dispatches subcommands
 *          for XML validation, display queries, and code generation.
 * Description: Minimal argument parser and subcommand router. Supports global flags
 *              (--json, --version, --help) and dispatches to validate, find, and
 *              catalogue command stubs.
 *
 * Exports:
 * - runCli(args): Main entry point for command-line execution
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** List of recognized subcommands for U8G2GL CLI. */
const KNOWN_COMMANDS = ['validate', 'find', 'catalogue'] as const;
type KnownCommand = (typeof KNOWN_COMMANDS)[number];

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

Options:
  --json     Format output as JSON
  --version  Show version number
  --help     Show help
`);
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
  // --- Step 1: Parse flags and positional arguments ---
  let json = false;
  let showHelp = false;
  let showVersion = false;
  const positionalArgs: string[] = [];

  for (const arg of rawArgs) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--version' || arg === '-v') {
      showVersion = true;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(2);
    } else {
      positionalArgs.push(arg);
    }
  }

  // --- Step 2: Handle global informational flags ---
  if (showHelp) {
    printUsage();
    process.exit(0);
  }

  if (showVersion) {
    console.log(getPackageVersion());
    process.exit(0);
  }

  // --- Step 3: Validate presence of a subcommand ---
  if (positionalArgs.length === 0) {
    printUsage();
    process.exit(2);
  }

  const subcommand = positionalArgs[0];
  if (subcommand === undefined) {
    printUsage();
    process.exit(2);
  }

  // --- Step 4: Dispatch subcommand ---
  if (KNOWN_COMMANDS.includes(subcommand as KnownCommand)) {
    // Stored for future command implementations
    void json;
    console.log(`Not yet implemented: ${subcommand}`);
    process.exit(0);
  }

  // --- Step 5: Handle unknown subcommand ---
  console.error(`Unknown command: ${subcommand}`);
  console.error(`Available commands: ${KNOWN_COMMANDS.join(', ')}`);
  process.exit(1);
}

// Execute immediately when invoked from CLI
runCli(process.argv.slice(2));
