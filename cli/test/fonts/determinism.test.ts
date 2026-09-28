/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fonts/determinism.test.ts
 * Purpose: Proves compileBdf() is deterministic across everything that legitimately
 *          differs between two build machines (typescript.md §5
 *          determinism) — working directory, timezone, TMPDIR and locale — and that
 *          nothing in a compiled result leaks the absolute path of the repository or the
 *          input file. bdfconv itself is deterministic across cwd and
 *          TZ (measured); this proves compileBdf()'s own layer (range translation,
 *          output parsing) adds no non-determinism of its own.
 * Description: Compiles the same fonts in two child Node processes that differ in
 *              `cwd`, `TZ` (UTC vs Pacific/Chatham — the two extremes measured),
 *              `TMPDIR` and `LANG`, each writing its result's sha256 (and the compiled
 *              bytes themselves) to a scratch file under tmp/ (rule 02) for this process to
 *              compare. A worker script (determinism-worker.mjs, generated into the same
 *              scratch directory) does the actual compileBdf() call in-process — it cannot
 *              import compile-bdf.ts directly since it runs against dist/ once built and
 *              against src/ under tsx otherwise, so it is written to import whichever this
 *              test resolves for it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');
const scratchDir = resolve(repoRoot, 'tmp', 'fonts-determinism');
const compileBdfModule = resolve(cliDir, 'src', 'core', 'fonts', 'compile-bdf.ts');

interface WorkerCase {
  readonly bdfFile: string;
  readonly identifier: string;
  readonly range?: string;
}

const CASES: readonly WorkerCase[] = [
  { bdfFile: '4x6.bdf', identifier: 'test_4x6', range: '0x20-0x7F' },
  { bdfFile: 'unifont.bdf', identifier: 'test_unifont', range: '0x20-0xFF' },
];

interface WorkerOutput {
  readonly identifier: string;
  readonly sha256: string;
  readonly declaredLength: number;
  readonly containsRepoRoot: boolean;
  readonly containsBdfPath: boolean;
}

// runWorker
// Spawns a child `tsx` process that compiles CASES with the given environment overrides
// and cwd, and returns each case's result hash plus two path-leak checks. A fresh process
// per run means each genuinely gets its own cwd/env/TZ, which an in-process
// `process.chdir()` + `process.env` mutation cannot fully guarantee (module-level caches,
// Date/Intl internals already initialised).
//   env — environment variable overrides layered onto the current process's own env
//   cwd — working directory for the child process
function runWorker(env: Record<string, string>, cwd: string): readonly WorkerOutput[] {
  const scriptPath = resolve(scratchDir, 'determinism-worker.mjs');
  const outPath = resolve(scratchDir, `out-${Math.random().toString(36).slice(2)}.json`);
  const script = `
import { compileBdf } from ${JSON.stringify(compileBdfModule)};
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const repoRoot = ${JSON.stringify(repoRoot)};
const bdfDir = ${JSON.stringify(bdfDir)};
const cases = ${JSON.stringify(CASES)};
const outPath = ${JSON.stringify(outPath)};

const results = [];
for (const c of cases) {
  const bdfPath = repoRoot + '/extern/u8g2/tools/font/bdf/' + c.bdfFile;
  const bdfBytes = readFileSync(bdfPath);
  const result = await compileBdf({ bdf: bdfBytes, identifier: c.identifier, range: c.range });
  if (!result.ok) {
    throw new Error('compileBdf failed for ' + c.identifier + ': ' + result.reason);
  }
  const hexBytes = Buffer.from(result.bytes).toString('hex');
  const sha256 = createHash('sha256').update(result.bytes).digest('hex');
  const haystack = JSON.stringify({ ...result, bytes: hexBytes, fontName: result.fontName, copyright: result.copyright });
  results.push({
    identifier: c.identifier,
    sha256,
    declaredLength: result.declaredLength,
    containsRepoRoot: haystack.includes(repoRoot),
    containsBdfPath: haystack.includes(bdfPath),
  });
}
writeFileSync(outPath, JSON.stringify(results));
`;
  writeFileSync(scriptPath, script, 'utf8');

  execFileSync('npx', ['tsx', scriptPath], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });

  return JSON.parse(readFileSync(outPath, 'utf8')) as readonly WorkerOutput[];
}

describe('compileBdf() — determinism', () => {
  beforeAll(() => {
    mkdirSync(scratchDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('produces identical output across cwd, TZ, TMPDIR and LANG', () => {
    const cwdA = resolve(scratchDir, 'cwd-a');
    const cwdB = resolve(scratchDir, 'cwd-b');
    mkdirSync(cwdA, { recursive: true });
    mkdirSync(cwdB, { recursive: true });

    const resultsA = runWorker({ TZ: 'UTC', TMPDIR: resolve(scratchDir, 'tmp-a'), LANG: 'en_US.UTF-8' }, cwdA);
    const resultsB = runWorker({ TZ: 'Pacific/Chatham', TMPDIR: resolve(scratchDir, 'tmp-b'), LANG: 'C' }, cwdB);

    expect(resultsA.length).toBe(CASES.length);
    for (let i = 0; i < CASES.length; i++) {
      const a = resultsA[i]!;
      const b = resultsB[i]!;
      expect(a.identifier).toBe(b.identifier);
      expect(a.declaredLength).toBe(b.declaredLength);
      expect(a.sha256).toBe(b.sha256);
      expect(a.containsRepoRoot).toBe(false);
      expect(a.containsBdfPath).toBe(false);
      expect(b.containsRepoRoot).toBe(false);
      expect(b.containsBdfPath).toBe(false);
    }
  }, 30000);
});
