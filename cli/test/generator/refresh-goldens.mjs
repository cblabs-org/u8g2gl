/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/refresh-goldens.mjs
 * Purpose: Rewrites every committed generator expectation: the WO9 golden files
 *          from the `emit-project` fixture, and the WO10 compile-layer fixture's
 *          `generated/` directory, which the C++ test suite builds. A golden is
 *          only worth having if refreshing it is deliberate, so this is a script
 *          to run and review rather than a flag on the test run — an `--update`
 *          mode that rewrites expectations on failure is how a golden stops
 *          catching anything.
 * Description: Generates through the built `dist/`, with the same fixed version
 *              the tests use, and writes each fixture's expectations in place.
 *              Run `npx tsc` first, then review every line of the diff — and,
 *              for the compile fixture, rebuild and run the C++ suite, because
 *              its output is compiled and executed there.
 *
 *              Usage, from `cli/`:
 *                node test/generator/refresh-goldens.mjs
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../../dist/node/load-project.js';
import { generate } from '../../dist/core/generator/index.js';
import { writeGenerated } from '../../dist/node/write-generated.js';

/** Must match GOLDEN_GENERATOR_VERSION in emit-golden.test.ts and compile-fixture.test.ts. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

// `fileURLToPath(new URL('.', …))` rather than `import.meta.dirname`, which
// needs Node 20.11 while package.json supports 18.
const here = fileURLToPath(new URL('.', import.meta.url));

/** Each fixture, and the directory its expectations live in. */
const FIXTURES = [
  { project: resolve(here, 'fixtures/emit-project'), expected: resolve(here, 'fixtures/emit-project/expected') },
  { project: resolve(here, '../../../test/generated_fixture'), expected: resolve(here, '../../../test/generated_fixture/generated') },
];

for (const { project, expected } of FIXTURES) {
  const loaded = loadProject(project);
  const result = generate({
    ...loaded.model,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    assets: loaded.assets,
  });

  if (result.errors > 0) {
    console.error(`${project} does not generate cleanly; its expectations were not touched:`);
    console.error(JSON.stringify(result.diagnostics, null, 2));
    process.exit(1);
  }

  const changes = writeGenerated(expected, result);
  for (const change of changes) {
    console.log(`  ${change.action}: ${change.path}`);
  }
  console.log(`${changes.length} file(s) in ${expected}. Review the diff before committing.\n`);
}
