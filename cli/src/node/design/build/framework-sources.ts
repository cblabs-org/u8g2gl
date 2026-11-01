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
 *          host units (display, bridge, harness) are named here. The same
 *          parse names what the npm package carries of the framework, so the
 *          package can neither miss a file a build reads nor carry one it
 *          does not.
 * Description: `locateFrameworkRoot()` finds the framework: the package's
 *              staged `framework/` when its stamp is this CLI's version
 *              (package-copy.ts), else the U8G2GL source tree beside this CLI
 *              (`locateSourceTree()`). `readFrameworkSources()` parses
 *              `CMakeLists.txt`'s `U8G2GL_RUNTIME_SOURCES`,
 *              `wasm/CMakeLists.txt`'s `WASM_U8G2_C_SOURCES` and its
 *              Emscripten link flags, and names the include directories every
 *              unit compiles with. `frameworkFiles()` is every file a build
 *              reads from the framework, and `stageFramework()` copies exactly
 *              those, with U8G2's licence, into the package.
 *
 * Exports:
 * - FrameworkSources:        The framework's sources, include paths and link flags
 * - FrameworkLookup:         Where locateFrameworkRoot() looks (tests override it)
 * - locateSourceTree():      The U8G2GL source tree beside this CLI, or undefined
 * - locateFrameworkRoot():   The staged framework or the source tree, or undefined
 * - readFrameworkSources():  Parse it
 * - frameworkFiles():        Every framework file a build reads
 * - stageFramework():        Copy those files into a package directory
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateStagedCopy, type StagedCopyLookup } from '../package-copy.js';

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

/** Where locateFrameworkRoot() looks. Every field defaults to this CLI's own. */
export interface FrameworkLookup extends StagedCopyLookup {
  /** Directory the source-tree search starts from; this module's own by default. */
  readonly start?: string;
}

/**
 * @brief The U8G2GL source tree this CLI was built from.
 *
 * The CLI lives in the tree's `cli/` directory, and this module in
 * `dist/node/design/build/` (or `src/…` under a TypeScript runner), so the
 * tree is five directories up. An installed CLI has no tree above it.
 *
 * @param start Directory to search from; this module's own by default.
 * @return The tree's root, or undefined.
 */
export function locateSourceTree(start: string = dirname(fileURLToPath(import.meta.url))): string | undefined {
  for (let dir = resolve(start), i = 0; i < 8; i++, dir = dirname(dir)) {
    if (existsSync(join(dir, MARKER)) && existsSync(join(dir, 'include', 'u8g2gl'))) {
      return dir;
    }
  }
  return undefined;
}

/**
 * @brief The framework a project's Wasm builds compile against.
 *
 * The package's staged `framework/` comes first, when its stamp names this
 * CLI's version: that is what an installed CLI has. Otherwise the source tree
 * beside the CLI, exactly as a checkout with nothing staged has always found
 * it. A staged copy for another version is passed over, not trusted, so a
 * copy left in a checkout by an older pack cannot shadow the live sources.
 *
 * @param lookup Overrides for tests; this CLI's package, version and location otherwise.
 * @return The framework's root (its layout is the source tree's), or undefined
 *         when there is neither, which a build reports as `no-source-tree`.
 */
export function locateFrameworkRoot(lookup: FrameworkLookup = {}): string | undefined {
  const staged = locateStagedCopy('framework', MARKER, lookup);
  return staged.kind === 'staged' ? staged.dir : locateSourceTree(lookup.start);
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

/**
 * @brief Every file a framework build reads: what the package must carry.
 *
 * The two CMake files this module parses; every source it names; and every
 * header a unit can include, which is any header in an include directory it
 * names (searched recursively, as `<u8g2gl/…>` reaches a subdirectory) or
 * beside a source (a quoted include, such as `src/`'s internal header). A
 * header nothing includes is still listed, because the set is defined by
 * where a compiler looks, not by a parse of the includes, and so cannot miss
 * one a later edit adds.
 *
 * @param framework readFrameworkSources()'s result.
 * @return Absolute paths, sorted and without duplicates.
 */
export function frameworkFiles(framework: FrameworkSources): string[] {
  const sources = [...framework.runtime, ...framework.display, ...framework.bridge, ...framework.harness, ...framework.u8g2];
  const headerDirs = [...framework.includes, ...framework.systemIncludes];
  return [
    ...new Set([
      join(framework.root, 'CMakeLists.txt'),
      join(framework.root, 'wasm', 'CMakeLists.txt'),
      ...sources,
      ...headerDirs.flatMap((dir) => headersIn(dir, true)),
      ...sources.flatMap((source) => headersIn(dirname(source), false)),
    ]),
  ].sort();
}

/**
 * @brief Copies the framework a build reads into a package directory.
 *
 * The copy keeps the source tree's layout, so readFrameworkSources() parses it
 * unchanged and every path it yields is inside the copy. U8G2's licence goes
 * with its sources (`extern/u8g2/LICENSE`), as its terms require. The
 * directory should not exist yet: the caller removes an earlier copy, so
 * nothing stale survives into a pack.
 *
 * @param sourceRoot The U8G2GL source tree.
 * @param dest       The directory to create (the package's `framework/`).
 * @return The files copied, relative to `dest`, with `/` separators, sorted.
 */
export function stageFramework(sourceRoot: string, dest: string): string[] {
  const files = [...frameworkFiles(readFrameworkSources(sourceRoot)), join(sourceRoot, 'extern', 'u8g2', 'LICENSE')];
  const copied = files.map((file) => {
    const rel = relative(sourceRoot, file);
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    return rel.split(sep).join('/');
  });
  return copied.sort();
}

// headersIn
// The C and C++ headers in a directory, optionally in its subdirectories too.
// A directory that does not exist has none: U8G2's are absent until its
// submodule is checked out, and the build then fails on its sources instead.
//   dir       — the directory
//   recursive — whether to descend
function headersIn(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return recursive ? headersIn(path, true) : [];
    }
    return /\.(h|hpp)$/.test(entry.name) ? [path] : [];
  });
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
