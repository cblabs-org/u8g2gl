/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/fonts/parity.test.ts
 * Purpose: Proves compileBdf() behaves identically in Node and in a browser (PR-04b WO2
 *          item 5, the Objective's central claim) — not by inspecting the source for
 *          Node-isms, but by actually bundling the public entry for a browser and running
 *          it somewhere that only has what a browser has.
 * Description: Bundles `src/core/fonts/index.ts` with esbuild, `platform: 'browser'`,
 *              `format: 'iife'` — a resolve failure on any `node:` built-in fails the
 *              build outright, since nothing is marked external. Runs the bundle in a
 *              fresh `node:vm` context whose sandbox carries only what this code needs and
 *              a browser has (`WebAssembly`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`,
 *              `console`, `URL`) — no `require`, `process`, `Buffer` or `global`, since
 *              nothing adds them to the sandbox and a fresh V8 context does not inherit
 *              Node's own globals. For several fonts and one failing input, the vm result
 *              is compared against a direct Node call: identical bytes, identical glyph
 *              counts, identical failure reasons. A global the vm context needs that a
 *              browser lacks is treated as a defect in the code, not a reason to widen the
 *              sandbox (WORKORDER: "fix the code, don't add the global").
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileBdf as nodeCompileBdf, type CompileBdfInput, type CompileBdfResult } from '../../src/core/fonts/compile-bdf.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');
const entryPath = resolve(cliDir, 'src', 'core', 'fonts', 'index.ts');
const bundlePath = resolve(repoRoot, 'tmp', 'fonts-parity-bundle.js');

interface BrowserFontsApi {
  compileBdf(input: CompileBdfInput): Promise<CompileBdfResult>;
}

let vmCompileBdf: (input: CompileBdfInput) => Promise<CompileBdfResult>;

beforeAll(async () => {
  // --- Step 1: bundle the public entry for a browser. No node builtin is marked
  //     external, so if anything in the dependency graph imports one, esbuild's resolver
  //     fails the build here rather than letting it surface later as a runtime ReferenceError. ---
  execFileSync(
    'npx',
    [
      'esbuild',
      entryPath,
      '--bundle',
      '--platform=browser',
      '--format=iife',
      '--global-name=U8G2GLFonts',
      `--outfile=${bundlePath}`,
    ],
    { cwd: cliDir, stdio: 'pipe' }
  );
  const bundleCode = readFileSync(bundlePath, 'utf8');

  // --- Step 2: a sandbox with only what a browser has and this code needs. Deliberately
  //     no require, process, Buffer or global — a fresh vm context does not inherit them
  //     from the host Node process, so simply not adding them here is the enforcement. ---
  const sandbox: Record<string, unknown> = {
    WebAssembly,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    console,
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox, { filename: 'u8g2gl-fonts-bundle.js' });

  const api = sandbox['U8G2GLFonts'] as BrowserFontsApi;
  // Built-ins like Uint8Array are visible to code *running inside* the new context, but
  // are not reflected as own properties on the sandbox object from the host side (proven
  // empirically — vm.createContext does not copy them onto the object it contextifies) —
  // fetch it as the completion value of a tiny script evaluated in that context instead.
  const SandboxUint8Array = vm.runInContext('Uint8Array', sandbox) as Uint8ArrayConstructor;

  vmCompileBdf = async (input) => {
    // Rebuild the Uint8Array inside the sandbox's own realm — V8 provides Uint8Array to
    // every context automatically (it is a language built-in, not a Node addition), and
    // constructing it there rather than passing the host realm's instance across avoids
    // any cross-realm identity assumption the bundled code might make.
    const bdf = new SandboxUint8Array(input.bdf);
    return api.compileBdf({ bdf, identifier: input.identifier, range: input.range }) as Promise<CompileBdfResult>;
  };
}, 30000);

afterAll(() => {
  rmSync(bundlePath, { force: true });
});

interface ParityCase {
  readonly bdfFile: string;
  readonly identifier: string;
  readonly range?: string;
}

const SUCCESS_CASES: readonly ParityCase[] = [
  { bdfFile: '4x6.bdf', identifier: 'parity_4x6', range: '0x20-0x7F' },
  { bdfFile: '6x13.bdf', identifier: 'parity_6x13' },
  { bdfFile: '5x8.bdf', identifier: 'parity_5x8', range: '32,42-58' },
];

describe('compileBdf() — Node/browser parity', () => {
  it.each(SUCCESS_CASES)('$identifier: identical bytes and glyph counts', async ({ bdfFile, identifier, range }) => {
    const bdf = readFileSync(resolve(bdfDir, bdfFile));
    const nodeResult = await nodeCompileBdf({ bdf, identifier, range });
    const vmResult = await vmCompileBdf({ bdf, identifier, range });

    expect(nodeResult.ok).toBe(true);
    expect(vmResult.ok).toBe(true);
    if (!nodeResult.ok || !vmResult.ok) {
      return;
    }
    expect(Buffer.from(vmResult.bytes)).toEqual(Buffer.from(nodeResult.bytes));
    expect(vmResult.declaredLength).toBe(nodeResult.declaredLength);
    expect(vmResult.selectedGlyphs).toBe(nodeResult.selectedGlyphs);
    expect(vmResult.totalGlyphs).toBe(nodeResult.totalGlyphs);
    expect(vmResult.fontName).toBe(nodeResult.fontName);
    expect(vmResult.copyright).toBe(nodeResult.copyright);
  });

  it('identical failure reason for a malformed BDF', async () => {
    const malformed = new TextEncoder().encode('this is not a BDF file\n');
    const nodeResult = await nodeCompileBdf({ bdf: malformed, identifier: 'parity_bad' });
    const vmResult = await vmCompileBdf({ bdf: malformed, identifier: 'parity_bad' });

    expect(nodeResult.ok).toBe(false);
    expect(vmResult.ok).toBe(false);
    if (nodeResult.ok || vmResult.ok) {
      return;
    }
    expect(vmResult.reason).toBe(nodeResult.reason);
  });

  it('identical failure reason for a malformed range', async () => {
    const bdf = readFileSync(resolve(bdfDir, '4x6.bdf'));
    const nodeResult = await nodeCompileBdf({ bdf, identifier: 'parity_bad_range', range: '0x20-*' });
    const vmResult = await vmCompileBdf({ bdf, identifier: 'parity_bad_range', range: '0x20-*' });

    expect(nodeResult.ok).toBe(false);
    expect(vmResult.ok).toBe(false);
    if (nodeResult.ok || vmResult.ok) {
      return;
    }
    expect(vmResult.reason).toBe(nodeResult.reason);
  });
});
