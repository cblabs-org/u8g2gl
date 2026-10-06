#!/usr/bin/env node
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/build-runtime-version.ts
 * Purpose: Stamps the runtime version this CLI was built beside into
 *          src/data/runtime-version.json, so generated code can assert the
 *          floor it needs (§16). The CLI is installed from npm and runs in the
 *          designer's browser, where neither can see include/, and its own
 *          package.json version is independent of the runtime's — so the floor
 *          has to be copied from the header, never inferred.
 * Description: Reads include/u8g2gl/u8g2gl_version.h and writes the three
 *              numbers. The drift guard in test/data/runtime-version.test.ts
 *              fails if the stamp lags the header. Follows the
 *              build-manifests.ts precedent.
 *
 * Usage:
 *   npm run build:runtime-version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuntimeVersion } from './runtime-version-header.js';

/**
 * @brief Builds runtime-version.json from the runtime's version header.
 *
 * @throws Error if the header lacks a version macro.
 */
function main(): void {
  // --- Step 1: Locate the header relative to this script ---
  // src/node/ -> cli/ -> repository root. Resolved from import.meta.url rather
  // than process.cwd() so the script works from any working directory.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const headerPath = resolve(scriptDir, '..', '..', '..', 'include', 'u8g2gl', 'u8g2gl_version.h');
  const outputPath = resolve(scriptDir, '..', 'data', 'runtime-version.json');

  // --- Step 2: Read, then write the stamp ---
  const version = parseRuntimeVersion(readFileSync(headerPath, 'utf8'));
  writeFileSync(outputPath, JSON.stringify(version, null, 2) + '\n', 'utf8');

  console.log(
    `[u8g2gl] Stamped runtime ${version.major}.${version.minor}.${version.patch} from ${headerPath}`,
  );
  console.log(`  - ${outputPath}`);
}

main();
