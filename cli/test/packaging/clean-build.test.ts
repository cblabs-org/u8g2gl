/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/packaging/clean-build.test.ts
 * Purpose: Protects the rule that `npm run build` starts from an empty dist/, so
 *          a file whose source was removed can never be shipped stale.
 * Description: Runs scripts/clean-dist.mjs against a throwaway directory and
 *              checks that package.json's build script runs it before tsc.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const cliRoot = resolve(__dirname, '../..');
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('npm run build starts from an empty dist/', () => {
  it('cleans the named directory, nested stale files included', () => {
    mkdirSync(join(cliRoot, 'tmp'), { recursive: true });
    const dir = mkdtempSync(join(cliRoot, 'tmp/clean-dist-'));
    tempDirs.push(dir);
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'stale.json'), '{}');

    execFileSync(process.execPath, [join(cliRoot, 'scripts/clean-dist.mjs'), dir]);

    expect(existsSync(dir)).toBe(false);
  });

  it('succeeds when the directory is already absent', () => {
    expect(() =>
      execFileSync(process.execPath, [join(cliRoot, 'scripts/clean-dist.mjs'), join(cliRoot, 'tmp/never-existed')]),
    ).not.toThrow();
  });

  it('is run by the build script before tsc', () => {
    const pkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

    expect(pkg.scripts['build']).toBe('node scripts/clean-dist.mjs && tsc');
  });
});
