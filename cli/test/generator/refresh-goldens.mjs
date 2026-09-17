/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/refresh-goldens.mjs
 * Purpose: Rewrites the WO9 golden files from the `emit-project` fixture. A
 *          golden is only worth having if refreshing it is deliberate, so this
 *          is a script to run and review rather than a flag on the test run —
 *          an `--update` mode that rewrites expectations on failure is how a
 *          golden stops catching anything.
 * Description: Generates through the built `dist/`, with the same fixed version
 *              the test uses, and writes into `fixtures/emit-project/expected/`.
 *              Run `npx tsc` first, then review every line of the diff.
 *
 *              Usage, from `cli/`:
 *                node test/generator/refresh-goldens.mjs
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../../dist/node/load-project.js';
import { generate } from '../../dist/core/generator/index.js';
import { writeGenerated } from '../../dist/node/write-generated.js';

/** Must match GOLDEN_GENERATOR_VERSION in emit-golden.test.ts. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

// `fileURLToPath(new URL('.', …))` rather than `import.meta.dirname`, which
// needs Node 20.11 while package.json supports 18.
const here = fileURLToPath(new URL('.', import.meta.url));
const fixtureDir = resolve(here, 'fixtures/emit-project');
const expectedDir = resolve(fixtureDir, 'expected');

const loaded = loadProject(fixtureDir);
const result = generate({
  ...loaded.model,
  generatorVersion: GOLDEN_GENERATOR_VERSION,
  assets: loaded.assets,
});

if (result.errors > 0) {
  console.error('The fixture does not generate cleanly; the goldens were not touched:');
  console.error(JSON.stringify(result.diagnostics, null, 2));
  process.exit(1);
}

const changes = writeGenerated(expectedDir, result);
for (const change of changes) {
  console.log(`  ${change.action}: ${change.path}`);
}
console.log(`\n${changes.length} golden file(s) in ${expectedDir}. Review the diff before committing.`);
