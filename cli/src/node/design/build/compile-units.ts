/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/compile-units.ts
 * Purpose: What the design server's two Emscripten builds share, so they
 *          compile alike and cache alike: the project editor Wasm (the live
 *          canvas, editor-wasm-build.ts) and the test-run harness (the
 *          firmware target, test-run/test-run-build.ts). A test run checks
 *          that the two draw the same pixels, which is only a check of the
 *          framework if everything else about the two builds is the same: the
 *          compiler flags, the U8G2 and runtime objects, and how a compiler
 *          error is reported.
 * Description: `frameworkBuildSetup()` derives the flags and the framework's
 *              object caches from the framework sources and the project's
 *              generated configuration. The caches are keyed by what their
 *              objects depend on:
 *              - **U8G2** (`u8g2/<toolchain key>`): its C sources;
 *              - **runtime** (`runtime/<toolchain key>-<config hash>`): the
 *                runtime library and the memory display, which both builds
 *                link, sized by the project's configuration;
 *              - **editor host** (`editor-host/…`, same key): the bridge and
 *                its scene parser, which only the editor Wasm links;
 *              - **harness** (`harness/…`, same key): the test-run harness,
 *                which only the test run links.
 *              `compileOne()` compiles a unit unless its keyed object exists;
 *              `parseCompilerOutput()` locates clang's diagnostics in the
 *              project's files.
 *
 * Exports:
 * - COMPILE_CODE:              The code a compiler diagnostic carries
 * - FrameworkBuildSetup:       Flags and cache directories for one configuration
 * - frameworkBuildSetup():     Derive them
 * - CompileJob, CompileResult: One unit to compile, and its outcome
 * - compileOne():              Compile a unit unless its keyed object exists
 * - runPool():                 Run tasks with bounded concurrency
 * - parseCompilerOutput():     Clang's diagnostics, located
 * - compileFailure():          A diagnostic for a failure that printed nothing parseable
 * - hashFiles(), sha256(), readText(): Hashing and reading helpers
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { RUNTIME_VERSION } from '../../../data/runtime-version.js';
import type { Diagnostic } from '../../../core/schema/diagnostic.js';
import type { SelectedToolchain } from '../../toolchain/detect-toolchain.js';
import type { ToolchainHost } from '../../toolchain/toolchain-host.js';
import type { FrameworkSources } from './framework-sources.js';

/** The stable code a compiler diagnostic from a project unit carries. */
export const COMPILE_CODE = 'U8G2GL_EDITOR_COMPILE';

/** The flags and framework object caches for one project configuration. */
export interface FrameworkBuildSetup {
  /** The U8G2 C objects. */
  readonly u8g2Dir: string;
  /** The runtime library's and the memory display's objects. */
  readonly runtimeDir: string;
  /** The bridge's and scene parser's objects: the editor Wasm's only. */
  readonly editorHostDir: string;
  /** The test-run harness's objects: the test run's only. */
  readonly harnessDir: string;
  /** U8G2's C sources' flags. */
  readonly cFlags: readonly string[];
  /** Every framework C++ unit's flags. */
  readonly runtimeFlags: readonly string[];
  /**
   * @brief A project unit's flags.
   *
   * @param editor Whether the unit is the editor target's: `U8G2GL_EDITOR` is
   *               defined for those only, so a firmware unit compiles exactly
   *               as the device's build compiles it.
   * @param includes The generated directory and each widget's.
   */
  projectFlags(editor: boolean, includes: readonly string[]): string[];
}

/**
 * @brief The flags and framework caches for a project's generated configuration.
 *
 * Writes the cache's own copy of the configuration when it differs, so the
 * path compiled into the runtime's objects is the same for every project that
 * shares them.
 *
 * @param framework   readFrameworkSources()'s result.
 * @param toolchain   The Emscripten in use; its version is part of every key.
 * @param cacheRoot   The editor build cache.
 * @param configFile  The project's generated `u8g2gl_generated_config.h`.
 */
export function frameworkBuildSetup(
  framework: FrameworkSources,
  toolchain: SelectedToolchain,
  cacheRoot: string,
  configFile: string,
): FrameworkBuildSetup {
  // --- Step 1: The keys: the runtime version, the compiler, the sources, the configuration ---
  const configText = readFileSync(configFile, 'utf8');
  const configHash = sha256(configText).slice(0, 16);
  const frameworkHash = hashFiles(frameworkFiles(framework)).slice(0, 16);
  const toolchainKey = `${RUNTIME_VERSION.major}.${RUNTIME_VERSION.minor}.${RUNTIME_VERSION.patch}-em${toolchain.version}-${frameworkHash}`;
  const configKey = `${toolchainKey}-${configHash}`;
  const runtimeDir = join(cacheRoot, 'runtime', configKey);
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeConfig = join(runtimeDir, 'u8g2gl_generated_config.h');
  if (readText(runtimeConfig) !== configText) {
    writeFileSync(runtimeConfig, configText);
  }

  // --- Step 2: The flags wasm/CMakeLists.txt compiles the framework editor Wasm with ---
  // So every build renders alike:
  // - -O3 on every object: objects are compiled once and shared by the -O1
  //   and -O3 links, and the link is where the optimiser's time goes;
  // - ARDUINO=10819 makes U8g2lib.h take its Arduino C++ wrapper (the U8G2
  //   class), built against test/real_u8g2's minimal Arduino.h and Print.h;
  // - -Wno-macro-redefined is carried over from wasm/CMakeLists.txt so the
  //   builds stay identical. It silences nothing today: no framework unit, and
  //   none of the departures fixture's, warns without it (checked with em++
  //   5.0.3). It costs a widget author the warning, so it is a candidate to
  //   drop from every build together.
  // The framework's units define U8G2GL_EDITOR, which adds the editor API's
  // declarations and src/u8g2gl_editor.cpp's definitions and changes nothing
  // else: no other runtime header tests it, so the runtime objects the editor
  // links are the ones a firmware build would compile, plus that unit.
  const cxxBase = (config: string, editor: boolean, extraIncludes: readonly string[]): string[] => [
    '-std=c++17',
    '-O3',
    '-DARDUINO=10819',
    ...(editor ? ['-DU8G2GL_EDITOR'] : []),
    `-DU8G2GL_GENERATED_CONFIG="${config}"`,
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-Wno-macro-redefined',
    ...[...framework.includes, ...extraIncludes].flatMap((dir) => ['-I', dir]),
    ...framework.systemIncludes.flatMap((dir) => ['-isystem', dir]),
  ];
  // U8G2's C sources compile with -w: their warnings are upstream's, not ours,
  // as the C++ units reach its headers through -isystem for the same reason.
  const cFlags = [
    '-O3',
    '-w',
    '-DARDUINO=10819',
    '-I',
    join(framework.root, 'test', 'real_u8g2'),
    ...framework.systemIncludes.flatMap((dir) => ['-I', dir]),
  ];

  return {
    u8g2Dir: join(cacheRoot, 'u8g2', toolchainKey),
    runtimeDir,
    editorHostDir: join(cacheRoot, 'editor-host', configKey),
    harnessDir: join(cacheRoot, 'harness', configKey),
    cFlags,
    runtimeFlags: cxxBase(runtimeConfig, true, []),
    projectFlags: (editor, includes) => cxxBase(configFile, editor, includes),
  };
}

/** One translation unit to compile into a keyed object directory. */
export interface CompileJob {
  readonly source: string;
  readonly driver: string;
  readonly flags: readonly string[];
  readonly dir: string;
  /** Anything else the object depends on, already hashed. */
  readonly extra: string;
}

/** One unit's outcome. */
export interface CompileResult {
  readonly source: string;
  readonly object: string;
  readonly ok: boolean;
  /** Whether it was compiled now, rather than found in the cache. */
  readonly compiled: boolean;
  readonly output: string;
}

/**
 * @brief Compiles one unit unless its keyed object already exists.
 *
 * The key covers the driver, the flags, the source path and text and the
 * job's extra dependencies, so an object is reused only when compiling again
 * would produce the same one. Older objects of the same unit are removed once
 * the new one exists.
 */
export async function compileOne(job: CompileJob, host: ToolchainHost, env: NodeJS.ProcessEnv): Promise<CompileResult> {
  const text = readFileSync(job.source);
  const key = createHash('sha256')
    .update(`${job.driver}\0${job.flags.join('\0')}\0${job.source}\0${job.extra}\0`)
    .update(text)
    .digest('hex')
    .slice(0, 16);
  const stem = basename(job.source).replace(/\.[^.]+$/, '');
  const object = join(job.dir, `${stem}-${sha256(job.source).slice(0, 8)}-${key}.o`);
  if (existsSync(object)) {
    return { source: job.source, object, ok: true, compiled: false, output: '' };
  }
  mkdirSync(job.dir, { recursive: true });
  const result = await host.run(job.driver, [...job.flags, '-c', job.source, '-o', object], { env });
  if (result.code !== 0) {
    rmSync(object, { force: true });
    return { source: job.source, object, ok: false, compiled: true, output: result.stderr + result.stdout };
  }
  const prefix = `${stem}-${sha256(job.source).slice(0, 8)}-`;
  for (const name of readdirSync(job.dir)) {
    if (name.startsWith(prefix) && name !== basename(object)) {
      rmSync(join(job.dir, name), { force: true });
    }
  }
  return { source: job.source, object, ok: true, compiled: true, output: result.stderr };
}

/** @brief Runs tasks with at most `limit` at once; results in task order. */
export async function runPool<T>(tasks: ReadonlyArray<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < tasks.length; index = next++) {
      const task = tasks[index];
      if (task !== undefined) {
        results[index] = await task();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}

/**
 * @brief Clang's `file:line:col: error: message` lines as diagnostics.
 *
 * A file in the project is named project-relative; a generated file in the
 * build cache is named by its place there (`generated/ui_fonts.cpp`);
 * anything else keeps its path. Notes are dropped: they elaborate the line
 * before them.
 *
 * @param projectRoot The project the user sees; a staged copy's root names
 *                    its files the same way, since the copy keeps the layout.
 * @param cacheDir    The project's build cache directory.
 */
export function parseCompilerOutput(output: string, projectRoot: string, cacheDir: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):(\d+): (fatal error|error|warning): (.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const [, file = '', row = '1', column = '1', severity = 'error', message = ''] = match;
    diagnostics.push({
      code: COMPILE_CODE,
      severity: severity === 'warning' ? 'warning' : 'error',
      file: displayPath(file, projectRoot, cacheDir),
      line: Number(row),
      column: Number(column),
      message,
    });
  }
  return diagnostics;
}

/**
 * @brief A diagnostic for a failure that printed nothing parseable: its last line.
 *
 * @param what  The unit that failed, or `link`.
 * @param linking What the link builds, for its message (`the editor Wasm`).
 */
export function compileFailure(projectRoot: string, what: string, output: string, linking: string): Diagnostic {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  return {
    code: COMPILE_CODE,
    severity: 'error',
    file: what === 'link' ? '' : displayPath(what, projectRoot, projectRoot),
    line: 1,
    column: 1,
    message: `${what === 'link' ? `linking ${linking}` : `compiling ${basename(what)}`} failed: ${lines[lines.length - 1] ?? 'no output'}`,
  };
}

// displayPath
// A path as a diagnostic should name it (see parseCompilerOutput).
function displayPath(file: string, projectRoot: string, cacheDir: string): string {
  for (const base of [projectRoot, cacheDir]) {
    const rel = relative(base, file);
    if (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== file) {
      return rel.split(sep).join('/');
    }
  }
  return file;
}

// frameworkFiles
// Every framework file an object can depend on: sources, the editor host,
// the harness, the headers they include, and U8G2's. In a release these
// change only with the version; in a working tree they change without one,
// and an object compiled from an older source must not be reused.
function frameworkFiles(framework: FrameworkSources): string[] {
  const headers = (dir: string): string[] =>
    existsSync(dir) ? readdirSync(dir).filter((name) => /\.(h|hpp)$/.test(name)).map((name) => join(dir, name)) : [];
  return [
    ...framework.runtime,
    ...framework.display,
    ...framework.bridge,
    ...framework.harness,
    ...framework.u8g2,
    ...framework.includes.flatMap(headers),
    ...headers(join(framework.root, 'include', 'u8g2gl')),
    ...framework.systemIncludes.flatMap(headers),
  ];
}

/** @brief SHA-256 hex over files' paths and contents, in sorted order. */
export function hashFiles(files: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    const bytes = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest('hex');
}

/** @brief SHA-256 hex of a string or bytes. */
export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** @brief A file's text, or undefined if it cannot be read. */
export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}
