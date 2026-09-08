#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-catalogue.ts
 * Purpose: CLI script entry point to parse U8G2 source code and build the
 *          display catalogue and page-mode replacement map data files (§5.2).
 * Description: Accepts `--u8g2-path` pointing to a U8G2 source tree, invokes
 *              the catalogue builder, writes catalogue.json and page-mode-map.json
 *              to src/data/, and logs the extraction metrics.
 *
 * Usage:
 *   npx tsx src/node/build-catalogue.ts --u8g2-path /path/to/U8g2
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from './catalogue-builder.js';

/**
 * @brief Resolves a path string, expanding `~` to the user's home directory.
 *
 * @param inputPath Raw path input from command line or environment.
 * @return Fully resolved absolute filesystem path.
 */
function expandHome(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return resolve(homedir(), inputPath.slice(inputPath === '~' ? 1 : 2));
  }
  return resolve(inputPath);
}

/**
 * @brief Main execution function for the build-catalogue CLI script.
 */
function main(): void {
  // --- Step 1: Parse arguments ---
  const args = process.argv.slice(2);
  let u8g2Path: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--u8g2-path' && i + 1 < args.length) {
      u8g2Path = args[i + 1];
      i++;
    } else if (arg?.startsWith('--u8g2-path=')) {
      u8g2Path = arg.slice('--u8g2-path='.length);
    }
  }

  // Fall back to environment variable or standard reference location
  if (!u8g2Path) {
    u8g2Path =
      process.env['U8G2_PATH'] ??
      '~/Documents/Projects/departures-board/.pio/libdeps/esp32dev/U8g2';
  }

  const resolvedPath = expandHome(u8g2Path);

  console.log(`[u8g2gl] Building catalogue from U8G2 source: ${resolvedPath}`);

  // --- Step 2: Invoke builder ---
  const result = buildCatalogue(resolvedPath);

  // --- Step 3: Determine output target directory ---
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const dataDir = resolve(scriptDir, '..', 'data');
  mkdirSync(dataDir, { recursive: true });

  const cataloguePath = resolve(dataDir, 'catalogue.json');
  const pageModeMapPath = resolve(dataDir, 'page-mode-map.json');

  // --- Step 4: Write JSON data files ---
  writeFileSync(cataloguePath, JSON.stringify(result.catalogue, null, 2) + '\n', 'utf8');
  writeFileSync(pageModeMapPath, JSON.stringify(result.pageModeMap, null, 2) + '\n', 'utf8');

  // --- Step 5: Report extraction metrics ---
  console.log(`[u8g2gl] Parsed ${result.structCount} display_info structs`);
  console.log(`[u8g2gl] Resolved ${result.driverCount} driver functions`);
  console.log(`[u8g2gl] Compiled ${result.fullBufferCount} full-buffer display records`);
  console.log(`[u8g2gl] Mapped ${result.pageModeCount} page-mode constructors to full-buffer equivalents`);
  console.log(`[u8g2gl] Output written to:`);
  console.log(`  - ${cataloguePath}`);
  console.log(`  - ${pageModeMapPath}`);
}

main();
