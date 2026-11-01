/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/test-run-build.ts
 * Purpose: Builds the **test-run harness**: a project's generated firmware
 *          target (what `generate` writes, unmodified), its widgets' C++, the
 *          runtime and U8G2, linked with wasm/harness.cpp at `-O3` into a Wasm
 *          that runs the project's real frame loop on a memory display. Its
 *          frames are compared with the live canvas's, which come from the
 *          project editor Wasm (../build/editor-wasm-build.ts), so the two
 *          builds share everything a parity check should not be testing: the
 *          flags, the U8G2 and runtime objects, the memory display, and how a
 *          compile error is reported (../build/compile-units.ts).
 * Description: Generation is prepareBuild()'s, into the build cache and never
 *              the project. The harness adds one unit, the screen table
 *              (screen-table.ts), read from the scene generated beside the
 *              firmware code. Objects:
 *              - U8G2 and the runtime (with the memory display): the editor
 *                build's caches, at the same flags and configuration hash, so
 *                a project that has built its editor Wasm compiles neither;
 *              - the harness: its own framework cache, with the runtime's key;
 *              - the firmware units, the widgets, and the screen table: the
 *                project's `obj-firmware/`, compiled without `U8G2GL_EDITOR`,
 *                as the device's build compiles them. The widgets therefore
 *                compile twice per project, once per target, and only when
 *                they change.
 *              The link is skipped when its output was linked from exactly
 *              these objects: each object's name carries its content key, so
 *              the list of names is the link's identity.
 *
 * Exports:
 * - HARNESS_FILES:          The files a harness build writes
 * - TestRunBuildOptions:    Where and how to build
 * - TestRunBuild:           What a build produced
 * - buildTestRunHarness():  Build (or find current) a project's harness
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
  sha256,
  type CompileJob,
} from '../build/compile-units.js';
import { readFrameworkSources } from '../build/framework-sources.js';
import { prepareBuild } from '../build/prepare-build.js';
import { readSceneLayout, SCREEN_TABLE_UNIT, screenTableUnit, type SceneLayout } from './screen-table.js';

/** The files a harness build writes: the Emscripten loader and its module. */
export const HARNESS_FILES = { loader: 'u8g2gl_harness.js', module: 'u8g2gl_harness.wasm' } as const;

/** What a link failure's message says was being linked. */
const LINKING = 'the test-run harness';

/**
 * The harness's link settings. Named here rather than read from
 * wasm/CMakeLists.txt, as the editor's are, because no CMake target links the
 * harness: it exists only per project, on the design server. `-O3` is the
 * test run's level, while the canvas's editor Wasm links at -O1 for speed:
 * the shipped build's optimiser runs, so a pixel it changed would show up as
 * a mismatch.
 */
const HARNESS_LINK_FLAGS: readonly string[] = [
  '-O3',
  '-sMODULARIZE=1',
  '-sEXPORT_NAME=createU8g2glHarness',
  '-sEXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPU32,UTF8ToString]',
  '-sEXPORTED_FUNCTIONS=[_malloc,_free,_getScreenCount,_getScreenName,_getDisplayWidth,_getDisplayHeight,_runScreen,_getFrameCount,_getFramePtr,_getBufferSize,_getLastError]',
  '-sALLOW_MEMORY_GROWTH=1',
];

/** Where and how to build. */
export interface TestRunBuildOptions {
  /** The project to generate from: the user's, or a staged copy of it. */
  readonly projectRoot: string;
  /** The editor build cache (editorBuildCacheRoot()); the harness shares it. */
  readonly cacheRoot: string;
  /** The U8G2GL source tree (framework-sources.ts). */
  readonly frameworkRoot: string;
  readonly toolchain: SelectedToolchain;
  readonly host: ToolchainHost;
}

/** What a build produced. */
export type TestRunBuild =
  | {
      readonly status: 'built' | 'current';
      /** Directory holding HARNESS_FILES. */
      readonly harnessDir: string;
      /** SHA-256 hex identifying the harness: the objects it was linked from. */
      readonly harnessHash: string;
      /** The screens it can run, in order, and its panel. */
      readonly layout: SceneLayout;
      /** The scene description generated beside the firmware code. */
      readonly sceneFile: string;
      /** The project's build cache directory. */
      readonly cacheDir: string;
      /** Units compiled by this build, by file name; empty when all were cached. */
      readonly compiled: readonly string[];
      readonly timings: { readonly prepareMs: number; readonly compileMs: number; readonly linkMs: number; readonly totalMs: number };
      /** Generator and compiler warnings. */
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly status: 'failed'; readonly diagnostics: readonly Diagnostic[] };

/**
 * @brief Builds a project's test-run harness, or finds the current one.
 *
 * @return `built` or `current` with the harness, or `failed` with the
 *         project's diagnostics or the compiler's, located at file, line and
 *         column in the project's files as an editor build's are.
 */
export async function buildTestRunHarness(options: TestRunBuildOptions): Promise<TestRunBuild> {
  const started = Date.now();
  const { projectRoot, cacheRoot, toolchain, host } = options;

  // --- Step 1: Generate both targets into the cache (prepare-build.ts) ---
  const prepared = await prepareBuild(projectRoot, cacheRoot);
  if (!prepared.ok) {
    return { status: 'failed', diagnostics: prepared.diagnostics };
  }
  const sceneFile = join(prepared.editorDir, 'ui_scene.json');
  const layout = readSceneLayout(readText(sceneFile) ?? '');
  if (layout === undefined) {
    throw new Error(`${sceneFile} is not a scene description; the generator and the test run disagree`);
  }
  const prepareMs = Date.now() - started;

  // --- Step 2: The screen table, the one unit the harness adds ---
  const tableDir = join(prepared.dir, 'test-run');
  mkdirSync(tableDir, { recursive: true });
  const tableUnit = join(tableDir, SCREEN_TABLE_UNIT);
  const tableSource = screenTableUnit(layout);
  if (readText(tableUnit) !== tableSource) {
    writeFileSync(tableUnit, tableSource);
  }

  // --- Step 3: Compile what has no object for its key, in parallel ---
  const framework = readFrameworkSources(options.frameworkRoot);
  const setup = frameworkBuildSetup(framework, toolchain, cacheRoot, join(prepared.generatedDir, 'u8g2gl_generated_config.h'));
  const firmwareFlags = setup.projectFlags(false, [prepared.generatedDir, ...prepared.widgetDirs]);
  // Every generated firmware unit: writeGenerated() deletes a unit the
  // project no longer generates, so the directory is the current set.
  const firmwareUnits = readdirSync(prepared.generatedDir)
    .filter((name) => name.endsWith('.cpp'))
    .sort()
    .map((name) => join(prepared.generatedDir, name));
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
    ...framework.harness.map((source) => ({
      source,
      driver: toolchain.emxx,
      flags: setup.runtimeFlags,
      dir: setup.harnessDir,
      extra: '',
    })),
    ...[...firmwareUnits, ...prepared.widgetUnits, tableUnit].map((source) => ({
      source,
      driver: toolchain.emxx,
      flags: firmwareFlags,
      dir: join(prepared.dir, 'obj-firmware'),
      extra: projectHeaders,
    })),
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
        located.length > 0 ? diagnostics : failed.map((result) => compileFailure(projectRoot, result.source, result.output, LINKING)),
    };
  }

  // --- Step 4: Link at -O3, unless the output was linked from these objects ---
  const harnessDir = join(prepared.dir, 'test-run-O3');
  const objects = compiled.map((result) => result.object);
  const harnessHash = sha256([...HARNESS_LINK_FLAGS, ...objects].join('\n'));
  const stampFile = join(harnessDir, 'harness-hash.txt');
  const base = {
    harnessDir,
    harnessHash,
    layout,
    sceneFile,
    cacheDir: prepared.dir,
    compiled: compiled.filter((result) => result.compiled).map((result) => basename(result.source)),
  };
  if (existsSync(join(harnessDir, HARNESS_FILES.module)) && readText(stampFile) === harnessHash) {
    return {
      status: 'current',
      ...base,
      timings: { prepareMs, compileMs, linkMs: 0, totalMs: Date.now() - started },
      diagnostics,
    };
  }
  const linkStarted = Date.now();
  mkdirSync(harnessDir, { recursive: true });
  const link = await host.run(toolchain.emxx, [...objects, '-o', join(harnessDir, HARNESS_FILES.loader), ...HARNESS_LINK_FLAGS], {
    env: toolchain.env,
  });
  const linkMs = Date.now() - linkStarted;
  if (link.code !== 0) {
    return { status: 'failed', diagnostics: [compileFailure(projectRoot, 'link', link.stderr || link.stdout, LINKING)] };
  }
  // A CommonJS script, as the editor Wasm's is: see editor-wasm-build.ts.
  writeFileSync(join(harnessDir, 'package.json'), '{ "type": "commonjs" }\n');
  writeFileSync(stampFile, harnessHash);

  return { status: 'built', ...base, timings: { prepareMs, compileMs, linkMs, totalMs: Date.now() - started }, diagnostics };
}
