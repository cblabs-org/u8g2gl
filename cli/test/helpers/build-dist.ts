/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/build-dist.ts
 * Purpose: Keeps `npx vitest run` honest. The integration tests execute the
 *          built CLI (`dist/node/cli.js`) in a child process, so without a
 *          build step a stale `dist/` silently tests old code while the unit
 *          tests exercise the current source (PR-04 WO1 F10). A vitest
 *          globalSetup rather than an npm `pretest` script, because `pretest`
 *          runs only for `npm test`, not for `npx vitest run`.
 * Description: Runs the project's own TypeScript compiler once, before any test
 *              file loads, and fails the whole run if the build fails.
 *
 * Exports:
 * - default setup(): vitest globalSetup hook that compiles src/ into dist/
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Compiles the CLI into `dist/` with the locally installed `tsc`.
 *
 * Invoked through `process.execPath` rather than a shell or `npx`, so it uses
 * exactly the node running vitest and the pinned compiler in node_modules.
 */
export default function setup(): void {
  const cliRoot = fileURLToPath(new URL('../..', import.meta.url));
  const tsc = join(cliRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tsc, '-p', cliRoot], { cwd: cliRoot, stdio: 'inherit' });
}
