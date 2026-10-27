/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/toolchain/toolchain-paths.ts
 * Purpose: The one place the managed Emscripten's pin and location are
 *          spelled. The project editor Wasm is built with exactly one
 *          Emscripten version, because a different compiler is a different
 *          renderer and the designer's pixels must match the firmware's ([D-9]).
 *          Detection, installation and the build job all read the version,
 *          the commit and the directory layout from here, so they cannot
 *          disagree about what "the toolchain" is.
 * Description: Constants for the pinned release (version, emsdk repository,
 *              the commit its tag must resolve to, the installed size quoted
 *              to the user), the per-platform cache directory, and the paths
 *              inside a managed emsdk checkout.
 *
 * Exports:
 * - EMSCRIPTEN_VERSION:      The pinned Emscripten release
 * - EMSDK_REPOSITORY:        Where emsdk is cloned from
 * - EMSDK_COMMIT:            The commit the pinned tag must resolve to
 * - INSTALLED_SIZE:          The installed size, as told to the user
 * - INSTALL_MARKER:          File written last, on a complete install
 * - toolchainCacheRoot():    The per-user cache directory for this platform
 * - managedLayout():         Paths inside the managed emsdk checkout
 * - ManagedLayout:           What managedLayout() returns
 */

import { join, win32, posix } from 'node:path';

/** The pinned Emscripten release. A widget compiled by any other is not the same renderer. */
export const EMSCRIPTEN_VERSION = '5.0.3';

/** The emsdk repository the managed install clones. */
export const EMSDK_REPOSITORY = 'https://github.com/emscripten-core/emsdk.git';

/**
 * The commit emsdk's `5.0.3` tag points at. A tag can be moved; a commit
 * cannot, so a clone whose HEAD differs is refused rather than trusted. emsdk
 * then verifies the checksums of the archives it downloads itself.
 */
export const EMSDK_COMMIT = 'a620cf1d71c62dfdfbb0c01fe0a371e2af2dda6c';

/** The installed size, as quoted when asking for consent. */
export const INSTALLED_SIZE = 'about 1.6 GB';

/**
 * Written into the managed checkout only after every step succeeded. A
 * directory without it is an interrupted install: never used, and replaced by
 * the next `install`.
 */
export const INSTALL_MARKER = 'u8g2gl-toolchain.json';

/**
 * @brief The per-user cache directory U8G2GL keeps its toolchain in.
 *
 * macOS `~/Library/Caches/u8g2gl`, Linux `$XDG_CACHE_HOME/u8g2gl` or
 * `~/.cache/u8g2gl`, Windows `%LOCALAPPDATA%\u8g2gl`. A cache, not a config
 * directory: deleting it loses nothing but a download.
 *
 * @param platform `process.platform`.
 * @param env      The environment to read `XDG_CACHE_HOME` / `LOCALAPPDATA` from.
 * @param home     The user's home directory.
 */
export function toolchainCacheRoot(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === 'win32') {
    return win32.join(env.LOCALAPPDATA ?? win32.join(home, 'AppData', 'Local'), 'u8g2gl');
  }
  if (platform === 'darwin') {
    return posix.join(home, 'Library', 'Caches', 'u8g2gl');
  }
  const xdg = env.XDG_CACHE_HOME;
  // The XDG specification says a relative value is invalid and must be ignored.
  return posix.join(xdg !== undefined && xdg.startsWith('/') ? xdg : posix.join(home, '.cache'), 'u8g2gl');
}

/** Paths inside a managed emsdk checkout. */
export interface ManagedLayout {
  /** The emsdk checkout. Versioned, so a later pin installs beside it rather than over it. */
  readonly root: string;
  /** emsdk's own driver script. */
  readonly emsdk: string;
  /** The environment script a shell sources to use this toolchain. */
  readonly envScript: string;
  /** The Emscripten directory emsdk activates. */
  readonly emscriptenDir: string;
  /** The C++ compiler driver. */
  readonly emxx: string;
  /** The completion marker (see INSTALL_MARKER). */
  readonly marker: string;
}

/**
 * @brief Paths inside the managed emsdk checkout under `cacheRoot`.
 *
 * @param cacheRoot From toolchainCacheRoot(), or a test's temp directory.
 * @param platform  Selects the Windows `.bat` spellings.
 */
export function managedLayout(cacheRoot: string, platform: NodeJS.Platform): ManagedLayout {
  const windows = platform === 'win32';
  const root = join(cacheRoot, `emsdk-${EMSCRIPTEN_VERSION}`);
  const emscriptenDir = join(root, 'upstream', 'emscripten');
  return {
    root,
    emsdk: join(root, windows ? 'emsdk.bat' : 'emsdk'),
    envScript: join(root, windows ? 'emsdk_env.bat' : 'emsdk_env.sh'),
    emscriptenDir,
    emxx: join(emscriptenDir, windows ? 'em++.bat' : 'em++'),
    marker: join(root, INSTALL_MARKER),
  };
}
