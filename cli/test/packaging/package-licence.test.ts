/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/packaging/package-licence.test.ts
 * Purpose: Proves the published npm package carries its licence (PR-04b WO5
 *          item 3). npm includes a LICENSE only from the package directory,
 *          so `cli/LICENSE` is a committed copy of the repository's; this
 *          test fails the moment the two differ, and again if the package
 *          list stops naming a file that no longer exists.
 * Description: Reads the real `npm pack --dry-run --json` file list rather than
 *              trusting the `files` field, so what is asserted is what would
 *              actually be published.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoLicence = resolve(cliDir, '../LICENSE');

/** Runs `npm pack --dry-run --json` and returns the paths it would publish. */
function packedPaths(): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: cliDir, encoding: 'utf8' });
  const [pack] = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>;
  return (pack?.files ?? []).map((f) => f.path);
}

describe('the npm package carries its licence', () => {
  it('cli/LICENSE is byte-identical to the repository LICENSE', () => {
    expect(Buffer.compare(readFileSync(resolve(cliDir, 'LICENSE')), readFileSync(repoLicence))).toBe(0);
  });

  it('would publish LICENSE and the third-party licence texts', () => {
    const paths = packedPaths();
    expect(paths).toContain('LICENSE');
    expect(paths.filter((p) => p.startsWith('LICENSES/')).length).toBeGreaterThanOrEqual(2);
  });

  it('lists no file in `files` that does not exist', () => {
    const pkg = JSON.parse(readFileSync(resolve(cliDir, 'package.json'), 'utf8')) as { files: string[] };
    const missing = pkg.files.filter((f) => !existsSync(resolve(cliDir, f)));
    expect(missing).toEqual([]);
  });
});
