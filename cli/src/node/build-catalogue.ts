#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-catalogue.ts
 * Purpose: CLI script entry point to parse U8G2 source code and build the
 *          display catalogue and page-mode replacement map data files (§5.2),
 *          the list of fonts U8G2 bundles (§14.1) and each one's
 *          pixel height (so the designer can show it), and to record
 *          which U8G2 commit they were built from, so each can be reproduced and
 *          diffed across a U8G2 upgrade (Q-11).
 * Description: Reads U8G2 from the pinned submodule (extern/u8g2) unless
 *              `--u8g2-path` or U8G2_PATH names another tree, invokes the
 *              catalogue builder, the font-symbol builder and the font-height
 *              builder, writes catalogue.json, page-mode-map.json,
 *              u8g2-fonts.json, u8g2-font-heights.json and
 *              catalogue-source.json to src/data/, and logs the extraction
 *              metrics and the source commit. One run, one U8G2 tree, one
 *              source record: the fonts and the displays cannot come from two
 *              different U8G2 commits.
 *
 * Usage:
 *   npm run build:catalogue                                  # extern/u8g2
 *   npx tsx src/node/build-catalogue.ts --u8g2-path /path/to/U8g2
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue, readU8g2Source, resolveU8g2Layout } from './catalogue-builder.js';
import { parseFontHeights } from './font-height-builder.js';
import { parseFontSymbols } from './font-symbol-builder.js';

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

  // --- Step 2: Default to the pinned U8G2 submodule ---
  // The script lives in cli/src/node (or cli/dist/node), so the repository root
  // is three levels up. The submodule is the default because it is the U8G2 the
  // runtime's host tests compile against, and the only tree whose commit is
  // pinned by this repository — so the recorded commit means something.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const submodulePath = resolve(scriptDir, '..', '..', '..', 'extern', 'u8g2');
  if (!u8g2Path) {
    u8g2Path = process.env['U8G2_PATH'] || submodulePath;
  }

  const resolvedPath = expandHome(u8g2Path);

  console.log(`[u8g2gl] Building catalogue from U8G2 source: ${resolvedPath}`);

  // --- Step 3: Identify the source commit (Q-11) ---
  const source = readU8g2Source(resolvedPath);
  if (source.commit === null) {
    console.warn(
      `[u8g2gl] Warning: ${resolvedPath} is not the top of a git checkout, so no ` +
        'U8G2 commit can be recorded and this catalogue cannot be reproduced. ' +
        'Build from extern/u8g2 for a catalogue that is committed.'
    );
  }

  // --- Step 4: Invoke the builders ---
  const result = buildCatalogue(resolvedPath);
  const clibDir = resolveU8g2Layout(resolvedPath).clibDir;
  const fonts = parseFontSymbols(clibDir);
  const fontHeights = parseFontHeights(clibDir, fonts);

  // --- Step 5: Determine output target directory ---
  const dataDir = resolve(scriptDir, '..', 'data');
  mkdirSync(dataDir, { recursive: true });

  const cataloguePath = resolve(dataDir, 'catalogue.json');
  const pageModeMapPath = resolve(dataDir, 'page-mode-map.json');
  const sourcePath = resolve(dataDir, 'catalogue-source.json');
  const fontsPath = resolve(dataDir, 'u8g2-fonts.json');
  // Beside the font list, not inside it: u8g2-fonts.json is the array the
  // validator imports, and a table of heights is what only the designer reads.
  const fontHeightsPath = resolve(dataDir, 'u8g2-font-heights.json');

  // --- Step 6: Write JSON data files ---
  // The source is recorded in a sibling file rather than inside catalogue.json:
  // catalogue.json is the CATALOGUE array itself (src/data/catalogue.ts casts
  // the parsed JSON directly), so a metadata field would change that export's
  // shape. No path and no timestamp are written, so an unchanged U8G2 commit
  // rebuilds to byte-identical files.
  writeFileSync(cataloguePath, JSON.stringify(result.catalogue, null, 2) + '\n', 'utf8');
  writeFileSync(pageModeMapPath, JSON.stringify(result.pageModeMap, null, 2) + '\n', 'utf8');
  writeFileSync(fontsPath, JSON.stringify(fonts, null, 2) + '\n', 'utf8');
  writeFileSync(fontHeightsPath, JSON.stringify(fontHeights, null, 2) + '\n', 'utf8');
  const sourceRecord = { u8g2: { tag: source.tag, commit: source.commit } };
  writeFileSync(sourcePath, JSON.stringify(sourceRecord, null, 2) + '\n', 'utf8');

  // --- Step 7: Report extraction metrics ---
  console.log(`[u8g2gl] U8G2 tag ${source.tag ?? '(none)'}, commit ${source.commit ?? '(unknown)'}`);
  console.log(`[u8g2gl] Parsed ${result.structCount} display_info structs`);
  console.log(`[u8g2gl] Resolved ${result.driverCount} driver functions`);
  console.log(`[u8g2gl] Compiled ${result.fullBufferCount} full-buffer display records`);
  console.log(`[u8g2gl] Mapped ${result.pageModeCount} page-mode constructors to full-buffer equivalents`);
  console.log(`[u8g2gl] Listed ${fonts.length} bundled fonts, declared in u8g2.h and defined in u8g2_fonts.c`);
  console.log(`[u8g2gl] Output written to:`);
  console.log(`  - ${cataloguePath}`);
  console.log(`  - ${pageModeMapPath}`);
  console.log(`  - ${fontsPath}`);
  console.log(`  - ${fontHeightsPath}`);
  console.log(`  - ${sourcePath}`);
}

main();
