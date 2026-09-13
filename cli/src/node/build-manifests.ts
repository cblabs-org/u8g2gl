#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-manifests.ts
 * Purpose: Bundles the framework's own element manifests
 *          (include/u8g2gl/manifests/*.xml) into src/data/manifests.json so the
 *          CLI — installed from npm, or running in the designer's browser, where
 *          neither can see include/ — knows every built-in element ([D-17]).
 *          Before this existed the framework manifests never reached the CLI at
 *          all, and a project using <u8g2gl_label> validated only if the author
 *          had copied the manifest in by hand.
 * Description: Reads every .xml file in the manifest directory in code-unit
 *              sorted order and writes each one's filename and raw XML text.
 *              Raw text, not a parsed model, so parseWidgetManifestFile stays
 *              the one manifest parser; the bundle is data, and the drift guard
 *              in test/manifests/manifest-bundle.test.ts fails if it lags the
 *              headers. Follows the build-catalogue.ts precedent.
 *
 * Usage:
 *   npm run build:manifests
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestText } from '../core/manifest/framework-manifests.js';

/**
 * @brief Builds manifests.json from the framework manifest directory.
 *
 * @throws Error if the manifest directory holds no .xml files — writing an
 *         empty bundle would silently strip every built-in element from the CLI.
 */
function main(): void {
  // --- Step 1: Locate the framework manifests relative to this script ---
  // src/node/ -> cli/ -> repository root. Resolved from import.meta.url rather
  // than process.cwd() so the script works from any working directory.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const manifestsDir = resolve(scriptDir, '..', '..', '..', 'include', 'u8g2gl', 'manifests');
  const outputPath = resolve(scriptDir, '..', 'data', 'manifests.json');

  // --- Step 2: Enumerate in a deterministic order ---
  // Default sort compares UTF-16 code units — locale-independent, so the bundle
  // is byte-identical on every machine (§13.9).
  const filenames = readdirSync(manifestsDir)
    .filter((f) => f.endsWith('.xml'))
    .sort();
  if (filenames.length === 0) {
    throw new Error(`No manifests found in ${manifestsDir}; refusing to write an empty bundle.`);
  }

  // --- Step 3: Read raw text and write the bundle ---
  const bundle: ManifestText[] = filenames.map((filename) => ({
    filename,
    xml: readFileSync(resolve(manifestsDir, filename), 'utf8'),
  }));
  writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

  console.log(`[u8g2gl] Bundled ${bundle.length} framework manifests from ${manifestsDir}`);
  console.log(`  - ${outputPath}`);
}

main();
