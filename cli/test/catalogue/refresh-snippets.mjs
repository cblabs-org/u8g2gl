/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/catalogue/refresh-snippets.mjs
 * Purpose: Rewrites the committed constructor-snippet goldens, one per wiring
 *          family, that snippet.test.ts compares `constructorSnippet()` against
 *          and that the C++ suite compiles against the real U8G2 headers
 *          (test/snippet_compile/). As with the generator goldens, refreshing
 *          one is a script to run and review, never a flag on the test run.
 * Description: Reads the cases from snippets/cases.json, renders each through
 *              the built `dist/`, and writes it beside the list. Run `npx tsc`
 *              first, then review every line of the diff and rebuild the C++
 *              suite, because three of these files are compiled there.
 *
 *              Usage, from `cli/`:
 *                node test/catalogue/refresh-snippets.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constructorSnippet } from '../../dist/core/catalogue/index.js';
import { CATALOGUE } from '../../dist/data/catalogue.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const snippetsDir = resolve(here, 'snippets');
const cases = JSON.parse(readFileSync(resolve(snippetsDir, 'cases.json'), 'utf8'));

for (const { file, setup, rotation, target } of cases) {
  const record = CATALOGUE.find((r) => r.setup === setup);
  if (record === undefined) {
    throw new Error(`${file}: '${setup}' is not in the catalogue`);
  }
  writeFileSync(resolve(snippetsDir, file), constructorSnippet(record, rotation ?? undefined, target), 'utf8');
  console.log(`wrote snippets/${file}`);
}
