/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/browser-bundle.ts
 * Purpose: The one harness the Node/browser parity tests share (fonts and images): bundle a `src/core/` entry for a
 *          browser and run it in a place that has only what a browser has. Shared by
 *          `test/fonts/parity.test.ts` and `test/images/parity.test.ts`, so there
 *          is one harness and no second copy that could drift.
 * Description: Bundles the entry with esbuild, `platform: 'browser'`,
 *              `format: 'iife'` — nothing is marked external, so a `node:`
 *              built-in anywhere in the dependency graph fails the build here
 *              instead of surfacing later as a runtime ReferenceError. Runs the
 *              bundle in a fresh `node:vm` context whose sandbox holds *only*
 *              the globals the caller names, so `require`, `process`, `Buffer`
 *              and `global` are absent by construction (a fresh V8 context does
 *              not inherit Node's own). A global the code needs that a browser
 *              lacks is a defect in the code, not a reason to widen the sandbox.
 *
 * Exports:
 * - BrowserBundle:        The loaded API and the sandbox realm's Uint8Array
 * - loadBrowserBundle():  Bundle an entry and run it in a browser-like sandbox
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const helpersDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(helpersDir, '..', '..');
const repoRoot = resolve(cliDir, '..');

/** A bundle loaded into a browser-like sandbox. */
export interface BrowserBundle<Api> {
  /** What the bundle's IIFE assigned to its global name. */
  readonly api: Api;
  /** The sandbox realm's `Uint8Array`, for building inputs inside the same realm the code runs in. */
  readonly Uint8Array: Uint8ArrayConstructor;
  /** Deletes the bundle file. */
  readonly cleanup: () => void;
}

/**
 * @brief Bundles `entry` for a browser and loads it into a bare sandbox.
 *
 * @param entry      Absolute path of the entry module.
 * @param globalName The IIFE's global name.
 * @param bundleName File name (under `tmp/` at the repo root) for the bundle.
 * @param globals    Exactly the globals the sandbox holds — what a browser has
 *                   and this code needs. Nothing else is added.
 */
export function loadBrowserBundle<Api>(
  entry: string,
  globalName: string,
  bundleName: string,
  globals: Readonly<Record<string, unknown>>,
): BrowserBundle<Api> {
  const bundlePath = resolve(repoRoot, 'tmp', bundleName);

  // --- Step 1: Bundle the entry for a browser ---
  execFileSync(
    'npx',
    ['esbuild', entry, '--bundle', '--platform=browser', '--format=iife', `--global-name=${globalName}`, `--outfile=${bundlePath}`],
    { cwd: cliDir, stdio: 'pipe' },
  );
  const bundleCode = readFileSync(bundlePath, 'utf8');

  // --- Step 2: Run it in a sandbox holding only the named globals ---
  const sandbox: Record<string, unknown> = { ...globals };
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox, { filename: bundleName });

  // Built-ins like Uint8Array are visible to code running inside the new context
  // but are not own properties of the sandbox object — fetch it as the completion
  // value of a tiny script evaluated in that context.
  const SandboxUint8Array = vm.runInContext('Uint8Array', sandbox) as Uint8ArrayConstructor;
  return {
    api: sandbox[globalName] as Api,
    Uint8Array: SandboxUint8Array,
    cleanup: () => rmSync(bundlePath, { force: true }),
  };
}
