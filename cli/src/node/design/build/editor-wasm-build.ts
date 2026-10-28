/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/editor-wasm-build.ts
 * Purpose: Builds the **project editor Wasm**: the canvas's renderer, built
 *          from this project's registry, its widgets' real C++, its fonts and
 *          images, and its generated capacities, so what the designer draws is
 *          what the project's firmware would. It runs on the design server's
 *          build queue, outside the per-edit loop, and is shaped so a widget
 *          edit costs about a second: only what changed recompiles, the
 *          framework half is compiled once and shared, and the editing link is
 *          `-O1` because `-O3`'s optimiser is most of a link's time and changes
 *          no pixel (`-O3` is kept for a test run).
 * Description: Three object caches, each keyed by what its objects depend on:
 *              - **U8G2** — its C sources, keyed by the U8G2GL runtime
 *                version, the compiler version and the framework sources;
 *              - **runtime** — the runtime library, the bridge and its scene
 *                parser, keyed additionally by a hash of the project's
 *                `u8g2gl_generated_config.h`, because the runtime's binding
 *                pool is sized by it. Projects with the same configuration
 *                share one runtime build;
 *              - **project** — the registry, the widgets, the fonts and images
 *                units, and the build-hash unit, each object keyed by its own
 *                source, the project's headers and the flags.
 *              A key that already has its object is not recompiled. The link
 *              writes `u8g2gl_editor.js`/`.wasm` per optimisation level, and is
 *              skipped when that level's output already carries this build
 *              hash. The build hash is compiled in and read back with
 *              `getBuildHash()`.
 *
 * Exports:
 * - EDITOR_WASM_JOB:          The build queue job name
 * - OptimisationLevel:        'O1' | 'O3'
 * - EditorWasmBuildOptions:   Where and how to build
 * - EditorWasmBuild:          What a build produced
 * - buildEditorWasm():        Build (or find current) a project's editor Wasm
 * - editorBuildCacheRoot():   The default build cache directory
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { RUNTIME_VERSION } from '../../../data/runtime-version.js';
import type { Diagnostic } from '../../../core/schema/diagnostic.js';
import type { SelectedToolchain } from '../../toolchain/detect-toolchain.js';
import type { ToolchainHost } from '../../toolchain/toolchain-host.js';
import { readFrameworkSources, type FrameworkSources } from './framework-sources.js';
import { prepareBuild } from './prepare-build.js';

/** The job name clients post to: `POST /api/build/editor-wasm`. */
export const EDITOR_WASM_JOB = 'editor-wasm';

/** The link's optimisation level: `-O1` while designing, `-O3` for a test run. */
export type OptimisationLevel = 'O1' | 'O3';

/** Where and how to build. */
export interface EditorWasmBuildOptions {
  readonly projectRoot: string;
  /** The editor build cache (see editorBuildCacheRoot()). */
  readonly cacheRoot: string;
  /** The U8G2GL source tree (framework-sources.ts). */
  readonly frameworkRoot: string;
  /** The Emscripten to build with. */
  readonly toolchain: SelectedToolchain;
  /** Runs the compiler. */
  readonly host: ToolchainHost;
  readonly optimisation: OptimisationLevel;
}

/** What a build produced. */
export type EditorWasmBuild =
  | {
      readonly status: 'built' | 'current';
      readonly buildHash: string;
      /** Directory holding `u8g2gl_editor.js` and `.wasm`. */
      readonly wasmDir: string;
      /** The project's scene description, to apply to it. */
      readonly sceneFile: string;
      readonly optimisation: OptimisationLevel;
      /** Units compiled by this build, by file name; empty when all were cached. */
      readonly compiled: readonly string[];
      readonly timings: { readonly prepareMs: number; readonly compileMs: number; readonly linkMs: number; readonly totalMs: number };
      /** Generator and compiler warnings. */
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly status: 'failed'; readonly diagnostics: readonly Diagnostic[] };

/** The stable code a compiler diagnostic from a project unit carries. */
const COMPILE_CODE = 'U8G2GL_EDITOR_COMPILE';

/**
 * @brief The default editor build cache: `editor-builds/` in the toolchain's cache directory.
 */
export function editorBuildCacheRoot(toolchainCacheRoot: string): string {
  return join(toolchainCacheRoot, 'editor-builds');
}

/**
 * @brief Builds the project's editor Wasm, or finds the current one.
 *
 * @return `built` or `current` with the output, or `failed` with diagnostics:
 *         the project's own, the platform-header rule's, or the compiler's,
 *         located in the project's files where they can be.
 */
export async function buildEditorWasm(options: EditorWasmBuildOptions): Promise<EditorWasmBuild> {
  const started = Date.now();
  const { projectRoot, cacheRoot, toolchain, host } = options;

  // --- Step 1: Generate, check and hash (prepare-build.ts) ---
  const prepared = await prepareBuild(projectRoot, cacheRoot);
  if (!prepared.ok) {
    return { status: 'failed', diagnostics: prepared.diagnostics };
  }
  const prepareMs = Date.now() - started;
  const wasmDir = join(prepared.dir, `wasm-${options.optimisation}`);
  const sceneFile = join(prepared.editorDir, 'ui_scene.json');
  const stampFile = join(wasmDir, 'build-hash.txt');
  if (existsSync(join(wasmDir, 'u8g2gl_editor.wasm')) && readText(stampFile) === prepared.buildHash) {
    return {
      status: 'current',
      buildHash: prepared.buildHash,
      wasmDir,
      sceneFile,
      optimisation: options.optimisation,
      compiled: [],
      timings: { prepareMs, compileMs: 0, linkMs: 0, totalMs: Date.now() - started },
      diagnostics: prepared.diagnostics,
    };
  }

  // --- Step 2: Flags. Every C++ unit compiles as wasm/CMakeLists.txt's do ---
  const framework = readFrameworkSources(options.frameworkRoot);
  const configText = readFileSync(join(prepared.generatedDir, 'u8g2gl_generated_config.h'), 'utf8');
  const configHash = sha256(configText).slice(0, 16);
  const frameworkHash = hashFiles(frameworkFiles(framework)).slice(0, 16);
  const toolchainKey = `${RUNTIME_VERSION.major}.${RUNTIME_VERSION.minor}.${RUNTIME_VERSION.patch}-em${toolchain.version}-${frameworkHash}`;
  const u8g2Dir = join(cacheRoot, 'u8g2', toolchainKey);
  const runtimeDir = join(cacheRoot, 'runtime', `${toolchainKey}-${configHash}`);
  // The runtime cache keeps its own copy of the configuration, so the path
  // compiled into its objects is the same for every project that shares it.
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeConfig = join(runtimeDir, 'u8g2gl_generated_config.h');
  if (readText(runtimeConfig) !== configText) {
    writeFileSync(runtimeConfig, configText);
  }
  // The flags wasm/CMakeLists.txt compiles the framework editor Wasm with, so
  // both builds render alike:
  // - -O3 on every object: objects are compiled once and shared by the -O1 and
  //   -O3 links, and the link is where the optimiser's time goes (header);
  // - ARDUINO=10819 makes U8g2lib.h take its Arduino C++ wrapper (the U8G2
  //   class), built against test/real_u8g2's minimal Arduino.h and Print.h;
  // - -Wno-macro-redefined is carried over from wasm/CMakeLists.txt so the two
  //   builds stay identical. It silences nothing today: no framework unit, and
  //   none of the departures fixture's, warns without it (checked with em++
  //   5.0.3). It costs a widget author the warning, so it is a candidate to drop
  //   from both builds together.
  const cxxBase = (config: string, extraIncludes: readonly string[]): string[] => [
    '-std=c++17',
    '-O3',
    '-DARDUINO=10819',
    '-DU8G2GL_EDITOR',
    `-DU8G2GL_GENERATED_CONFIG="${config}"`,
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-Wno-macro-redefined',
    ...[...framework.includes, ...extraIncludes].flatMap((dir) => ['-I', dir]),
    ...framework.systemIncludes.flatMap((dir) => ['-isystem', dir]),
  ];
  const runtimeFlags = cxxBase(runtimeConfig, []);
  const projectFlags = cxxBase(join(prepared.generatedDir, 'u8g2gl_generated_config.h'), [
    prepared.generatedDir,
    ...prepared.widgetDirs,
  ]);
  // U8G2's C sources compile with -w: their warnings are upstream's, not ours,
  // as the C++ units reach its headers through -isystem for the same reason.
  const cFlags = ['-O3', '-w', '-DARDUINO=10819', '-I', join(options.frameworkRoot, 'test', 'real_u8g2'), ...framework.systemIncludes.flatMap((dir) => ['-I', dir])];

  // --- Step 3: The build-hash unit, so the Wasm can say which inputs it is ---
  const hashUnit = join(prepared.dir, 'ui_editor_build_hash.cpp');
  const hashSource = buildHashUnit(prepared.buildHash);
  if (readText(hashUnit) !== hashSource) {
    writeFileSync(hashUnit, hashSource);
  }

  // --- Step 4: Compile whatever has no object for its key, in parallel ---
  // A project unit's key includes every widget header and the generated
  // headers, since any of them can change what it compiles to.
  const projectHeaders = hashFiles([
    ...prepared.widgetHeaders,
    join(prepared.generatedDir, 'ui.hpp'),
    join(prepared.generatedDir, 'u8g2gl_generated_config.h'),
  ]);
  const jobs: CompileJob[] = [
    ...framework.u8g2.map((source) => ({ source, driver: toolchain.emcc, flags: cFlags, dir: u8g2Dir, extra: '' })),
    ...[...framework.runtime, ...framework.bridge].map((source) => ({
      source,
      driver: toolchain.emxx,
      flags: runtimeFlags,
      dir: runtimeDir,
      extra: '',
    })),
    ...[
      join(prepared.editorDir, 'ui_editor_registry.cpp'),
      join(prepared.generatedDir, 'ui_fonts.cpp'),
      join(prepared.generatedDir, 'ui_images.cpp'),
      ...prepared.widgetUnits,
      hashUnit,
    ].map((source) => ({ source, driver: toolchain.emxx, flags: projectFlags, dir: join(prepared.dir, 'obj'), extra: projectHeaders })),
  ];
  const compileStarted = Date.now();
  const compiled = await runPool(jobs.map((job) => () => compileOne(job, host, toolchain.env)), cpus().length);
  const compileMs = Date.now() - compileStarted;
  const diagnostics = [
    ...prepared.diagnostics,
    ...compiled.flatMap((result) => parseCompilerOutput(result.output, projectRoot, prepared.dir)),
  ];
  const failed = compiled.filter((result) => !result.ok);
  if (failed.length > 0) {
    const located = diagnostics.filter((d) => d.severity === 'error');
    return {
      status: 'failed',
      diagnostics:
        located.length > 0
          ? diagnostics
          : failed.map((result) => compileFailure(projectRoot, result.source, result.output)),
    };
  }

  // --- Step 5: Link at the requested level, then stamp the output ---
  const linkStarted = Date.now();
  mkdirSync(wasmDir, { recursive: true });
  const link = await host.run(
    toolchain.emxx,
    [
      `-${options.optimisation}`,
      ...compiled.map((result) => result.object),
      '-o',
      join(wasmDir, 'u8g2gl_editor.js'),
      // The framework's export list, plus the build hash: getBuildHash() is
      // defined only by a project build's generated unit, so wasm/CMakeLists.txt
      // cannot export it, and this build appends it to the list it parsed.
      ...framework.linkFlags.map((flag) => flag.replace(/^(-sEXPORTED_FUNCTIONS=\[.*)\]$/, "$1,'_getBuildHash']")),
    ],
    { env: toolchain.env },
  );
  const linkMs = Date.now() - linkStarted;
  if (link.code !== 0) {
    return { status: 'failed', diagnostics: [compileFailure(projectRoot, 'link', link.stderr || link.stdout)] };
  }
  // Emscripten's MODULARIZE output is a CommonJS script. Without this, a
  // cache directory beneath a `"type": "module"` package (a project inside a
  // Node package, say) would make Node load it as ESM, and it would export nothing.
  writeFileSync(join(wasmDir, 'package.json'), '{ "type": "commonjs" }\n');
  writeFileSync(stampFile, prepared.buildHash);

  return {
    status: 'built',
    buildHash: prepared.buildHash,
    wasmDir,
    sceneFile,
    optimisation: options.optimisation,
    compiled: compiled.filter((result) => result.compiled).map((result) => basename(result.source)),
    timings: { prepareMs, compileMs, linkMs, totalMs: Date.now() - started },
    diagnostics,
  };
}

/** One translation unit to compile into a keyed object directory. */
interface CompileJob {
  readonly source: string;
  readonly driver: string;
  readonly flags: readonly string[];
  readonly dir: string;
  /** Anything else the object depends on, already hashed. */
  readonly extra: string;
}

/** One unit's outcome. */
interface CompileResult {
  readonly source: string;
  readonly object: string;
  readonly ok: boolean;
  /** Whether it was compiled now, rather than found in the cache. */
  readonly compiled: boolean;
  readonly output: string;
}

// compileOne
// Compiles one unit unless its keyed object already exists. The key covers
// the driver, the flags, the source text and the job's extra dependencies, so
// an object is reused only when compiling again would produce the same one.
// Older objects of the same unit are removed once the new one exists.
async function compileOne(job: CompileJob, host: ToolchainHost, env: NodeJS.ProcessEnv): Promise<CompileResult> {
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

// runPool
// Runs tasks with at most `limit` at once, results in task order.
async function runPool<T>(tasks: ReadonlyArray<() => Promise<T>>, limit: number): Promise<T[]> {
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

// parseCompilerOutput
// Clang's `file:line:col: error: message` lines as diagnostics. A file in the
// project is named project-relative; a generated file in the build cache is
// named by its place there (`generated/ui_fonts.cpp`); anything else keeps
// its path. Notes are dropped: they elaborate the line before them.
function parseCompilerOutput(output: string, projectRoot: string, cacheDir: string): Diagnostic[] {
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

// compileFailure
// A diagnostic for a failure that printed nothing parseable: the last line.
function compileFailure(projectRoot: string, what: string, output: string): Diagnostic {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  return {
    code: COMPILE_CODE,
    severity: 'error',
    file: what === 'link' ? '' : displayPath(what, projectRoot, projectRoot),
    line: 1,
    column: 1,
    message: `${what === 'link' ? 'linking the editor Wasm' : `compiling ${basename(what)}`} failed: ${lines[lines.length - 1] ?? 'no output'}`,
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
// Every framework file an object can depend on: sources, the bridge, the
// headers it includes, and U8G2's. In a release these change only with the
// version; in a working tree they change without one, and an object compiled
// from an older source must not be reused.
function frameworkFiles(framework: FrameworkSources): string[] {
  const headers = (dir: string): string[] =>
    existsSync(dir) ? readdirSync(dir).filter((name) => /\.(h|hpp)$/.test(name)).map((name) => join(dir, name)) : [];
  return [
    ...framework.runtime,
    ...framework.bridge,
    ...framework.u8g2,
    ...framework.includes.flatMap(headers),
    ...headers(join(framework.root, 'include', 'u8g2gl')),
    ...framework.systemIncludes.flatMap(headers),
  ];
}

// hashFiles
// SHA-256 hex over files' paths and contents, in sorted order.
function hashFiles(files: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    const bytes = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest('hex');
}

// buildHashUnit
// The C++ unit that compiles the build hash into the Wasm, exported as
// getBuildHash() so the editor can tell, without asking the server, whether
// the Wasm it holds was built from the inputs it is looking at.
function buildHashUnit(buildHash: string): string {
  return [
    '// GENERATED by the u8g2gl design server: the editor Wasm\'s build hash.',
    '#ifdef __EMSCRIPTEN__',
    '#include <emscripten.h>',
    '#else',
    '#define EMSCRIPTEN_KEEPALIVE',
    '#endif',
    '',
    `extern "C" EMSCRIPTEN_KEEPALIVE const char* getBuildHash() { return "${buildHash}"; }`,
    '',
  ].join('\n');
}

// sha256, readText
// Small helpers: a hex digest, and a file's text or undefined.
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}
