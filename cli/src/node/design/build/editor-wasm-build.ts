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
 * Description: Objects are cached by what they depend on (compile-units.ts):
 *              - **U8G2** — its C sources, keyed by the U8G2GL runtime
 *                version, the compiler version and the framework sources;
 *              - **runtime** — the runtime library and the memory display,
 *                keyed additionally by a hash of the project's
 *                `u8g2gl_generated_config.h`, because the runtime's binding
 *                pool is sized by it. Projects with the same configuration
 *                share one runtime build, and so does the test-run harness;
 *              - **editor host** — the bridge and its scene parser, with the
 *                runtime's key, kept apart so the harness links the runtime
 *                without them;
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

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, join } from 'node:path';
import type { Diagnostic } from '../../../core/schema/diagnostic.js';
import type { SelectedToolchain } from '../../toolchain/detect-toolchain.js';
import type { ToolchainHost } from '../../toolchain/toolchain-host.js';
import {
  compileFailure,
  compileOne,
  frameworkBuildSetup,
  hashFiles,
  parseCompilerOutput,
  readText,
  runPool,
  type CompileJob,
} from './compile-units.js';
import { readFrameworkSources } from './framework-sources.js';
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

/** What the link builds, as a link failure's message names it. */
const LINKING = 'the editor Wasm';

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

  // --- Step 2: Flags and framework caches, shared with the test run (compile-units.ts) ---
  const framework = readFrameworkSources(options.frameworkRoot);
  const setup = frameworkBuildSetup(framework, toolchain, cacheRoot, join(prepared.generatedDir, 'u8g2gl_generated_config.h'));
  const projectFlags = setup.projectFlags(true, [prepared.generatedDir, ...prepared.widgetDirs]);

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
    ...framework.u8g2.map((source) => ({ source, driver: toolchain.emcc, flags: setup.cFlags, dir: setup.u8g2Dir, extra: '' })),
    ...[...framework.runtime, ...framework.display].map((source) => ({
      source,
      driver: toolchain.emxx,
      flags: setup.runtimeFlags,
      dir: setup.runtimeDir,
      extra: '',
    })),
    ...framework.bridge.map((source) => ({
      source,
      driver: toolchain.emxx,
      flags: setup.runtimeFlags,
      dir: setup.editorHostDir,
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
          : failed.map((result) => compileFailure(projectRoot, result.source, result.output, LINKING)),
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
    return { status: 'failed', diagnostics: [compileFailure(projectRoot, 'link', link.stderr || link.stdout, LINKING)] };
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
