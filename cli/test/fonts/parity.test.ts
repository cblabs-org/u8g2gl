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
 * Description: Bundles `src/core/fonts/index.ts` and runs it in a bare vm sandbox through the
 *              shared harness (`test/helpers/browser-bundle.ts`, moved there by PR-04b WO4
 *              so the image parity test reuses it). The sandbox carries only what this code
 *              needs and a browser has (`WebAssembly`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`,
 *              `console`, `URL`) — no `require`, `process`, `Buffer` or `global`, since
 *              nothing adds them to the sandbox and a fresh V8 context does not inherit
 *              Node's own globals. For several fonts and one failing input, the vm result
 *              is compared against a direct Node call: identical bytes, identical glyph
 *              counts, identical failure reasons. A global the vm context needs that a
 *              browser lacks is treated as a defect in the code, not a reason to widen the
 *              sandbox (WORKORDER: "fix the code, don't add the global").
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileBdf as nodeCompileBdf, type CompileBdfInput, type CompileBdfResult } from '../../src/core/fonts/compile-bdf.js';
import { loadBrowserBundle, type BrowserBundle } from '../helpers/browser-bundle.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const bdfDir = resolve(repoRoot, 'extern', 'u8g2', 'tools', 'font', 'bdf');
const entryPath = resolve(cliDir, 'src', 'core', 'fonts', 'index.ts');

interface BrowserFontsApi {
  compileBdf(input: CompileBdfInput): Promise<CompileBdfResult>;
}

let bundle: BrowserBundle<BrowserFontsApi>;
let vmCompileBdf: (input: CompileBdfInput) => Promise<CompileBdfResult>;

beforeAll(() => {
  // The bundle-and-sandbox harness is shared with the image parity test
  // (test/helpers/browser-bundle.ts): a sandbox with only what a browser has and
  // this code needs, and no require, process, Buffer or global.
  bundle = loadBrowserBundle<BrowserFontsApi>(entryPath, 'U8G2GLFonts', 'fonts-parity-bundle.js', {
    WebAssembly,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    console,
    URL,
  });

  vmCompileBdf = async (input) => {
    // Rebuild the Uint8Array inside the sandbox's own realm — constructing it there
    // rather than passing the host realm's instance across avoids any cross-realm
    // identity assumption the bundled code might make.
    const bdf = new bundle.Uint8Array(input.bdf);
    return bundle.api.compileBdf({ bdf, identifier: input.identifier, range: input.range }) as Promise<CompileBdfResult>;
  };
}, 30000);

afterAll(() => {
  bundle.cleanup();
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
