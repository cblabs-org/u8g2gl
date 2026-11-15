#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-font-samples.ts
 * Purpose: CLI script entry point that renders a sample of every built-in
 *          U8G2 font, natively and through U8G2 itself, and writes
 *          `u8g2-font-samples.json` for the designer's font picker (§14.1).
 *          It follows build-catalogue.ts's pattern ([D-14]): derived from the
 *          pinned U8G2, committed, and rebuilt only when U8G2 moves.
 * Description: Generates the renderer's font table from u8g2-fonts.json
 *              (font-sample-builder.ts), configures and builds
 *              tools/font-samples/ with CMake under build/font-samples/, runs
 *              it, checks its output against the font list, and writes the
 *              JSON beside u8g2-fonts.json. The file's size is reported, with
 *              the largest samples, because the picker fetches it whole.
 *
 * Usage:
 *   npm run build:font-samples
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontSampleTable, parseSampleOutput, serialiseSamples } from './font-sample-builder.js';

/**
 * @brief Main execution function for the build-font-samples script.
 */
function main(): void {
  // --- Step 1: Locate the tool, its build directory and the data ---
  // The script lives in cli/src/node, so the repository root is three levels up.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..', '..', '..');
  const toolDir = resolve(repoRoot, 'tools', 'font-samples');
  const buildDir = resolve(repoRoot, 'build', 'font-samples');
  const dataDir = resolve(scriptDir, '..', 'data');
  const fonts = JSON.parse(readFileSync(resolve(dataDir, 'u8g2-fonts.json'), 'utf8')) as string[];

  // --- Step 2: Generate the font table the renderer links ---
  mkdirSync(buildDir, { recursive: true });
  const tablePath = resolve(buildDir, 'font_sample_table.c');
  writeFileSync(tablePath, fontSampleTable(fonts), 'utf8');

  // --- Step 3: Configure, build and run the renderer ---
  console.log(`[u8g2gl] Building the font-sample renderer in ${buildDir}`);
  execFileSync('cmake', ['-S', toolDir, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release', `-DFONT_SAMPLES_TABLE=${tablePath}`], { stdio: 'inherit' });
  execFileSync('cmake', ['--build', buildDir, '-j8'], { stdio: 'inherit' });
  const output = execFileSync(resolve(buildDir, 'font_samples'), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  // --- Step 4: Check the output and write the JSON ---
  const samples = parseSampleOutput(output, fonts);
  const outPath = resolve(dataDir, 'u8g2-font-samples.json');
  writeFileSync(outPath, serialiseSamples(samples), 'utf8');

  // --- Step 5: Report the size, which the picker pays on first open ---
  const bytes = statSync(outPath).size;
  const largest = [...samples].sort((a, b) => b[1].bits.length - a[1].bits.length).slice(0, 5);
  console.log(`[u8g2gl] Rendered ${samples.size} font samples`);
  console.log(`[u8g2gl] ${outPath}: ${bytes} bytes (${(bytes / (1024 * 1024)).toFixed(2)} MiB)`);
  for (const [name, s] of largest) console.log(`  ${name}: ${s.w}x${s.h}, ${s.bits.length} base64 characters`);
}

main();
