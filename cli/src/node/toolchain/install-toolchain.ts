/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/toolchain/install-toolchain.ts
 * Purpose: Installs the pinned Emscripten into U8G2GL's own cache directory,
 *          so a designer whose machine has no Emscripten, or the wrong one,
 *          can build the project editor Wasm. It is a 1.6 GB download, so it
 *          asks first and states the size; it pins by commit, not by tag, so a
 *          moved tag cannot change the compiler; and it only ever writes inside
 *          its own versioned directory, so an emsdk the user installed
 *          themselves is never modified, wherever it is.
 * Description: Detection first: a usable toolchain means nothing to do. Then
 *              consent, a shallow clone of emsdk at the pinned tag, a check that
 *              the checkout's HEAD is the pinned commit, `emsdk install` and
 *              `emsdk activate` (emsdk verifies its archives' checksums), and
 *              last a completion marker. Any failure deletes the partial
 *              checkout, so a later run starts clean. Every effect goes through
 *              the injected ToolchainHost.
 *
 * Exports:
 * - InstallOptions:       Cache directory, consent and progress callbacks
 * - InstallOutcome:       What happened
 * - installToolchain():   Install unless a usable toolchain exists
 * - consentQuestion():    The question asked before downloading
 */

import { detectToolchain, type SelectedToolchain } from './detect-toolchain.js';
import type { ToolchainHost } from './toolchain-host.js';
import {
  EMSCRIPTEN_VERSION,
  EMSDK_COMMIT,
  EMSDK_REPOSITORY,
  INSTALLED_SIZE,
  type ManagedLayout,
} from './toolchain-paths.js';

/** How to install. */
export interface InstallOptions {
  /** The cache directory; the managed checkout goes beneath it. */
  readonly cacheRoot: string;
  /** Skip the consent question (`--yes`). */
  readonly assumeYes: boolean;
  /** Asks the user; resolves true to proceed. Not called with `assumeYes`. */
  readonly confirm: (question: string) => Promise<boolean>;
  /** Progress, one line per step. */
  readonly log: (line: string) => void;
  /** Let emsdk's own progress reach the terminal. Off in tests. */
  readonly showProgress?: boolean;
}

/** What installToolchain() did. */
export type InstallOutcome =
  | { readonly kind: 'already'; readonly toolchain: SelectedToolchain }
  | { readonly kind: 'declined' }
  | { readonly kind: 'installed'; readonly toolchain: SelectedToolchain }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * @brief The consent question: what is installed, where, and how large it is.
 */
export function consentQuestion(layout: ManagedLayout): string {
  return `Install Emscripten ${EMSCRIPTEN_VERSION} (${INSTALLED_SIZE} installed) into ${layout.root}?`;
}

/**
 * @brief Installs the pinned Emscripten, unless a usable one already exists.
 *
 * Writes only beneath `options.cacheRoot`, and only after consent.
 *
 * @return `already` if PATH or the managed install is usable; `declined` if
 *         consent was refused (nothing written); `installed`; or `failed` with
 *         the reason, the partial checkout removed.
 */
export async function installToolchain(host: ToolchainHost, options: InstallOptions): Promise<InstallOutcome> {
  // --- Step 1: Nothing to do if a usable toolchain exists ---
  const status = await detectToolchain(host, options.cacheRoot);
  if (status.selected !== undefined) {
    return { kind: 'already', toolchain: status.selected };
  }
  const layout = status.managed.layout;

  // --- Step 2: Consent, before anything is written ---
  if (!options.assumeYes && !(await options.confirm(consentQuestion(layout)))) {
    return { kind: 'declined' };
  }

  // --- Step 3: Clone emsdk at the pinned tag, into a clean directory ---
  // A checkout here without a marker is ours and interrupted (the directory
  // name is versioned and under U8G2GL's cache), so it is safe to replace.
  host.remove(layout.root);
  host.makeDir(options.cacheRoot);
  const env = childEnv(host.env);
  const progress = options.showProgress === true;
  options.log(`Cloning emsdk ${EMSCRIPTEN_VERSION} from ${EMSDK_REPOSITORY}`);
  const clone = await host.run(
    'git',
    ['-c', 'advice.detachedHead=false', 'clone', '--depth', '1', '--branch', EMSCRIPTEN_VERSION, EMSDK_REPOSITORY, layout.root],
    { env, inherit: progress },
  );
  if (clone.code !== 0) {
    return fail(host, layout, `git clone failed: ${lastLine(clone.stderr)}`);
  }

  // --- Step 4: The tag must resolve to the pinned commit ---
  const head = await host.run('git', ['-C', layout.root, 'rev-parse', 'HEAD'], { env });
  const commit = head.stdout.trim();
  if (head.code !== 0 || commit !== EMSDK_COMMIT) {
    return fail(
      host,
      layout,
      `emsdk tag ${EMSCRIPTEN_VERSION} resolved to ${commit === '' ? 'nothing' : commit}, not the pinned ` +
        `${EMSDK_COMMIT}; refusing to install a toolchain that is not the one U8G2GL was built against.`,
    );
  }

  // --- Step 5: emsdk installs (verifying its archives) and activates ---
  for (const verb of ['install', 'activate'] as const) {
    options.log(`emsdk ${verb} ${EMSCRIPTEN_VERSION}`);
    const result = await host.run(layout.emsdk, [verb, EMSCRIPTEN_VERSION], { cwd: layout.root, env, inherit: progress });
    if (result.code !== 0) {
      return fail(host, layout, `emsdk ${verb} failed: ${lastLine(result.stderr || result.stdout)}`);
    }
  }
  if (!host.exists(layout.emxx)) {
    return fail(host, layout, `emsdk reported success, but ${layout.emxx} does not exist.`);
  }

  // --- Step 6: Mark the install complete, last ---
  host.writeText(layout.marker, `${JSON.stringify({ version: EMSCRIPTEN_VERSION, commit: EMSDK_COMMIT }, null, 2)}\n`);
  const installed = await detectToolchain(host, options.cacheRoot);
  if (installed.selected === undefined) {
    return fail(host, layout, 'the install completed but is not detected as usable.');
  }
  return { kind: 'installed', toolchain: installed.selected };
}

// fail
// Removes the partial checkout and reports why.
function fail(host: ToolchainHost, layout: ManagedLayout, message: string): InstallOutcome {
  host.remove(layout.root);
  return { kind: 'failed', message };
}

// childEnv
// The environment for git and emsdk, without the variables a user's own emsdk
// exports. emsdk reads EMSDK and EM_CONFIG to find "its" installation, so
// leaving them set could make the managed emsdk act on the user's.
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = { ...env };
  for (const name of ['EMSDK', 'EM_CONFIG', 'EMSDK_NODE', 'EMSDK_PYTHON', 'EM_CACHE']) {
    delete clean[name];
  }
  return clean;
}

// lastLine
// The last non-empty line of a process's output: usually the error.
function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines[lines.length - 1] ?? 'no output';
}
