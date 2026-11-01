/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/framework-sources.ts
 * Purpose: Where the framework half of the design server's Wasm builds comes
 *          from: the runtime library, U8G2's C sources, the memory display
 *          both builds draw on, the editor's Wasm bridge and its scene parser,
 *          the test run's harness, and the editor's link settings. The
 *          runtime and U8G2 lists and the link settings are read from the
 *          CMake files that build the framework editor Wasm, rather than
 *          listed a second time here, so a source added to the runtime or a
 *          function exported from the bridge reaches every build or none. The
 *          host units (display, bridge, harness) are named here.
 * Description: `locateFrameworkRoot()` finds the U8G2GL source tree beside this
 *              CLI. `readFrameworkSources()` parses `CMakeLists.txt`'s
 *              `U8G2GL_RUNTIME_SOURCES`, `wasm/CMakeLists.txt`'s
 *              `WASM_U8G2_C_SOURCES` and its Emscripten link flags, and names
 *              the include directories every unit compiles with.
 *
 * Exports:
 * - FrameworkSources:        The framework's sources, include paths and link flags
 * - locateFrameworkRoot():   The U8G2GL source tree, or undefined
 * - readFrameworkSources():  Parse it
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The framework half of an editor Wasm build. */
export interface FrameworkSources {
  /** The U8G2GL source tree. */
  readonly root: string;
  /** The runtime library's C++ sources (U8G2GL_RUNTIME_SOURCES). */
  readonly runtime: readonly string[];
  /** The memory display (wasm/memory_display.cpp): the panel both the editor and the harness draw on. */
  readonly display: readonly string[];
  /** The bridge and the scene parser it uses: the editor Wasm's host. */
  readonly bridge: readonly string[];
  /** The test-run harness (wasm/harness.cpp): the firmware target's host. */
  readonly harness: readonly string[];
  /** U8G2's C sources (WASM_U8G2_C_SOURCES). */
  readonly u8g2: readonly string[];
  /** Include directories for C++ units, before the project's own. */
  readonly includes: readonly string[];
  /** System include directories (U8G2's), so its warnings are not ours. */
  readonly systemIncludes: readonly string[];
  /** Emscripten link settings, without the optimisation level. */
  readonly linkFlags: readonly string[];
}

/** A file that only the U8G2GL source tree has, used to recognise it. */
const MARKER = join('wasm', 'bridge.cpp');

/**
 * @brief The U8G2GL source tree this CLI was built from.
 *
 * The CLI lives in the tree's `cli/` directory, and this module in
 * `dist/node/design/build/` (or `src/…` under a TypeScript runner), so the
 * tree is five directories up. A CLI installed from npm carries no runtime
 * sources, so there is none, and the caller reports that.
 *
 * @param start Directory to search from; this module's own by default.
 * @return The tree's root, or undefined.
 */
export function locateFrameworkRoot(start: string = dirname(fileURLToPath(import.meta.url))): string | undefined {
  for (let dir = resolve(start), i = 0; i < 8; i++, dir = dirname(dir)) {
    if (existsSync(join(dir, MARKER)) && existsSync(join(dir, 'include', 'u8g2gl'))) {
      return dir;
    }
  }
  return undefined;
}

/**
 * @brief Parses the framework's CMake files for its sources and link flags.
 *
 * @param root From locateFrameworkRoot().
 * @throws Error if a list the build needs cannot be found: the CMake files and
 *         this parser have drifted apart, which is a defect to fix, not a
 *         project error to report.
 */
export function readFrameworkSources(root: string): FrameworkSources {
  // --- Step 1: The source lists, from the CMake files that build them ---
  const top = readFileSync(join(root, 'CMakeLists.txt'), 'utf8');
  const wasm = readFileSync(join(root, 'wasm', 'CMakeLists.txt'), 'utf8');
  const runtime = cmakeList(top, 'U8G2GL_RUNTIME_SOURCES').map((path) =>
    join(root, path.replace('${CMAKE_CURRENT_SOURCE_DIR}/', '')),
  );
  const u8g2Dir = join(root, 'extern', 'u8g2');
  const u8g2 = cmakeList(wasm, 'WASM_U8G2_C_SOURCES').map((path) => join(u8g2Dir, path.replace('${U8G2GL_U8G2_DIR}/', '')));

  // --- Step 2: The link settings, the optimisation level left to the job ---
  // CMake passes LINK_FLAGS through a shell, which removes the quotes around
  // a value such as -sEXPORT_NAME='createU8g2glEditor'; this build spawns
  // em++ directly, so it removes them itself.
  const linkFlags = cmakeList(wasm, 'EMSCRIPTEN_LINK_FLAGS')
    .map((flag) => flag.replace(/^"|"$/g, ''))
    .filter((flag) => !/^-O\d$/.test(flag))
    .map((flag) => flag.replace(/=('([^']*)')$/, (_, __, value: string) => `=${value}`));

  return {
    root,
    runtime,
    display: [join(root, 'wasm', 'memory_display.cpp')],
    bridge: [join(root, 'wasm', 'bridge.cpp'), join(root, 'test', 'editor_host', 'scene_json.cpp')],
    harness: [join(root, 'wasm', 'harness.cpp')],
    u8g2,
    includes: [join(root, 'wasm'), join(root, 'include'), join(root, 'test', 'real_u8g2'), join(root, 'test', 'editor_host')],
    systemIncludes: [join(u8g2Dir, 'cppsrc'), join(u8g2Dir, 'csrc')],
    linkFlags,
  };
}

// cmakeList
// The items of `set(<name> …)`: whitespace-separated, comments dropped.
// Quoted items keep their quotes; the caller decides what they mean.
//   text — a CMakeLists.txt
//   name — the variable
function cmakeList(text: string, name: string): string[] {
  const start = text.indexOf(`set(${name}`);
  if (start < 0) {
    throw new Error(`set(${name} …) not found; the editor build cannot read the framework's sources`);
  }
  const body = text.slice(start + `set(${name}`.length, text.indexOf('\n)', start));
  const items = body
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line !== '');
  if (items.length === 0) {
    throw new Error(`set(${name} …) is empty`);
  }
  return items;
}
