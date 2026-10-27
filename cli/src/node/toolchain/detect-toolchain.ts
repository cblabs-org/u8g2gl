/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/toolchain/detect-toolchain.ts
 * Purpose: Decides which Emscripten the project editor Wasm is built with, and
 *          says why. Two sources are acceptable — an `em++` already on `PATH`
 *          at exactly the pinned version, or the managed install in the cache
 *          directory — and anything else is reported but never used, because a
 *          different compiler version is a different renderer. `toolchain
 *          status`, `toolchain path`, `toolchain install` and the build job all
 *          ask this one function, so they always agree.
 * Description: Reads `PATH` for the first `em++` (the one a shell would run),
 *              learns its version from the `emscripten-version.txt` Emscripten
 *              ships beside it, falling back to `em++ --version`, and checks the
 *              managed checkout's completion marker. `PATH` wins over the
 *              managed install when both are usable: it is what the user set up
 *              deliberately, and it is the same version.
 *
 * Exports:
 * - ToolchainSource:      'path' | 'managed'
 * - SelectedToolchain:    The Emscripten to use and how to run it
 * - PathCandidate:        The `em++` found on PATH, usable or not
 * - ToolchainStatus:      Everything detection found
 * - detectToolchain():    Find the toolchain to use
 * - parseEmscriptenVersion(): A version from `emscripten-version.txt` or `--version` text
 */

import { dirname, join } from 'node:path';
import type { ToolchainHost } from './toolchain-host.js';
import { EMSCRIPTEN_VERSION, managedLayout, type ManagedLayout } from './toolchain-paths.js';

/** Where a usable toolchain came from. */
export type ToolchainSource = 'path' | 'managed';

/** The Emscripten to build with. */
export interface SelectedToolchain {
  readonly source: ToolchainSource;
  readonly version: string;
  /** The C++ driver, absolute. */
  readonly emxx: string;
  /** The C driver beside it. */
  readonly emcc: string;
  /** For the managed install, the script a shell sources to use it. */
  readonly envScript?: string;
  /** The environment to run `emxx` and `emcc` in. */
  readonly env: NodeJS.ProcessEnv;
}

/** The first `em++` on PATH. */
export interface PathCandidate {
  readonly emxx: string;
  /** Undefined when no version could be read. */
  readonly version?: string;
}

/** What detection found. */
export interface ToolchainStatus {
  /** The toolchain to use, or undefined if there is none. */
  readonly selected?: SelectedToolchain;
  /** The first `em++` on PATH, if any. */
  readonly onPath?: PathCandidate;
  /** The managed install's location and state. */
  readonly managed: {
    readonly layout: ManagedLayout;
    readonly installed: boolean;
    /** A checkout with no completion marker: an interrupted install. */
    readonly incomplete: boolean;
  };
  /** One line per reason a candidate was not used. */
  readonly notes: readonly string[];
}

/**
 * @brief A semantic version from `emscripten-version.txt` (`"5.0.3"`) or the
 *        first line of `em++ --version` (`emcc (...) 5.0.3 (hash)`).
 *
 * @return The version, or undefined if the text has none.
 */
export function parseEmscriptenVersion(text: string): string | undefined {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  return /\b(\d+\.\d+\.\d+)\b/.exec(firstLine)?.[1];
}

/**
 * @brief Finds the Emscripten to build with.
 *
 * @param host      The machine (PATH, filesystem, processes).
 * @param cacheRoot The cache directory the managed install lives under.
 * @return What was found, with `selected` set when one is usable.
 */
export async function detectToolchain(host: ToolchainHost, cacheRoot: string): Promise<ToolchainStatus> {
  const notes: string[] = [];
  const layout = managedLayout(cacheRoot, host.platform);

  // --- Step 1: The first em++ on PATH, and its version ---
  const onPath = await findOnPath(host);
  let selected: SelectedToolchain | undefined;
  if (onPath !== undefined) {
    if (onPath.version === EMSCRIPTEN_VERSION) {
      selected = {
        source: 'path',
        version: onPath.version,
        emxx: onPath.emxx,
        emcc: siblingDriver(onPath.emxx, 'emcc'),
        env: host.env,
      };
    } else {
      notes.push(
        `em++ on PATH (${onPath.emxx}) is ${onPath.version ?? 'an unknown version'}, not ${EMSCRIPTEN_VERSION}; ` +
          'it is not used, because the designer must compile with exactly the pinned version.',
      );
    }
  }

  // --- Step 2: The managed install, complete only with its marker ---
  const checkout = host.exists(layout.root);
  const installed = checkout && host.exists(layout.marker) && host.exists(layout.emxx);
  const incomplete = checkout && !installed;
  if (incomplete) {
    notes.push(`${layout.root} is an incomplete install; 'u8g2gl toolchain install' replaces it.`);
  }
  if (selected === undefined && installed) {
    selected = {
      source: 'managed',
      version: EMSCRIPTEN_VERSION,
      emxx: layout.emxx,
      emcc: siblingDriver(layout.emxx, 'emcc'),
      envScript: layout.envScript,
      env: managedEnv(host, layout),
    };
  }

  return { selected, onPath, managed: { layout, installed, incomplete }, notes };
}

// findOnPath
// The first em++ in PATH order, as a shell would resolve it, and its version.
// The version file is read from beside the real path, because PATH often holds
// a symlink (a package manager's bin directory) to the emscripten directory.
//   host — the machine
async function findOnPath(host: ToolchainHost): Promise<PathCandidate | undefined> {
  const windows = host.platform === 'win32';
  const separator = windows ? ';' : ':';
  const name = windows ? 'em++.bat' : 'em++';
  for (const dir of (host.env.PATH ?? host.env.Path ?? '').split(separator)) {
    if (dir === '') {
      continue;
    }
    const emxx = join(dir, name);
    if (!host.exists(emxx)) {
      continue;
    }
    const versionFile = host.readText(join(dirname(host.realPath(emxx)), 'emscripten-version.txt'));
    let version = versionFile === undefined ? undefined : parseEmscriptenVersion(versionFile);
    if (version === undefined) {
      const result = await host.run(emxx, ['--version']);
      version = result.code === 0 ? parseEmscriptenVersion(result.stdout) : undefined;
    }
    return { emxx, version };
  }
  return undefined;
}

// siblingDriver
// The other compiler driver in the same directory: emcc beside em++.
function siblingDriver(emxx: string, driver: string): string {
  return join(dirname(emxx), emxx.endsWith('.bat') ? `${driver}.bat` : driver);
}

// managedEnv
// The environment emsdk_env.sh would set up, without sourcing it: the checkout
// and its Emscripten first on PATH, and EMSDK naming the checkout, so the
// drivers find the configuration `emsdk activate` wrote there. Any EMSDK the
// user's shell exported is overridden, so their install is never consulted.
function managedEnv(host: ToolchainHost, layout: ManagedLayout): NodeJS.ProcessEnv {
  const separator = host.platform === 'win32' ? ';' : ':';
  const path = [layout.root, layout.emscriptenDir, host.env.PATH ?? ''].filter((part) => part !== '').join(separator);
  const env: NodeJS.ProcessEnv = { ...host.env, PATH: path, EMSDK: layout.root };
  delete env.EM_CONFIG;
  delete env.EMSDK_NODE;
  delete env.EMSDK_PYTHON;
  return env;
}
