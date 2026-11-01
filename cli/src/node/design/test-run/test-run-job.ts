/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/test-run-job.ts
 * Purpose: Puts the test run on the design server's build queue, as the
 *          `test-run` job: serial with the editor-Wasm builds and never in the
 *          edit loop. A run takes the text the canvas showed, builds the
 *          firmware-target harness from it, runs the frame loop at fixed
 *          times, and returns the frames for the designer to compare with its
 *          own. The designer, not the server, compares: the live frames come
 *          from the module the canvas has loaded, so a verdict is about the
 *          canvas the user is looking at.
 * Description: Params (JSON):
 *              - `screen`: the screen the canvas shows;
 *              - `documents`: every buffer differing from disk,
 *                `{ path, content, version }` (stage-project.ts);
 *              - `times` (optional): frame times in ms, non-decreasing;
 *                TEST_RUN_TIMES when absent.
 *              The result carries each frame's bytes (base64) and SHA-256,
 *              the timings, and the versions tested: each posted document's,
 *              the generator's, the runtime's and the compiler's. A failure
 *              throws as `editor-wasm`'s does: the no-toolchain and
 *              no-source-tree codes are the same strings, and compiler
 *              diagnostics are formatted one per line, compiler-style, which
 *              the designer turns into Problems.
 *
 * Exports:
 * - TEST_RUN_JOB:            The build queue job name
 * - TEST_RUN_TIMES:          The fixed frame times
 * - TestRunParams:           What a request asks for
 * - TestRunFrame:            One frame of the result
 * - TestRunResult:           A succeeded run
 * - parseTestRunParams():    Validate a request's params
 * - TestRunJobOptions:       Where the job builds, and with what
 * - runTestRun():            One run, end to end
 * - testRunBuildCacheRoot(): The build cache a job with these options uses
 * - registerTestRunJob():    Register the job on a build queue
 */

import { BuildJobFailure, type BuildQueue } from '../build-queue.js';
import { formatDiagnostics } from '../../format-diagnostic.js';
import { getGeneratorVersion } from '../../generator-version.js';
import { detectToolchain, type SelectedToolchain } from '../../toolchain/detect-toolchain.js';
import { nodeToolchainHost, type ToolchainHost } from '../../toolchain/toolchain-host.js';
import { EMSCRIPTEN_VERSION, toolchainCacheRoot } from '../../toolchain/toolchain-paths.js';
import { RUNTIME_VERSION } from '../../../data/runtime-version.js';
import type { Diagnostic } from '../../../core/schema/diagnostic.js';
import { sha256 } from '../build/compile-units.js';
import { EDITOR_WASM_FAILURE } from '../build/editor-wasm-job.js';
import { editorBuildCacheRoot } from '../build/editor-wasm-build.js';
import { locateFrameworkRoot } from '../build/framework-sources.js';
import { loadHarness } from './harness-runner.js';
import { checkStagedDocuments, stageProject, type StagedDocument } from './stage-project.js';
import { buildTestRunHarness } from './test-run-build.js';

/** The job name clients post to: `POST /api/build/test-run`. */
export const TEST_RUN_JOB = 'test-run';

/**
 * The frame times every run renders, in ms. Boot, the first frame after it,
 * then points spread over five seconds, so an animation's start, its motion
 * and its steady state are all compared.
 */
export const TEST_RUN_TIMES: readonly number[] = [0, 16, 100, 250, 500, 1000, 2000, 5000];

/** The most frame times one run may ask for. */
const MAX_TIMES = 64;

/** A request's params, validated. */
export interface TestRunParams {
  readonly screen: string;
  readonly documents: readonly StagedDocument[];
  readonly times: readonly number[];
}

/** One frame of a run. */
export interface TestRunFrame {
  readonly time: number;
  /** SHA-256 hex of the buffer. */
  readonly sha256: string;
  /** The buffer, base64: U8G2's vertical_top_lsb layout, width × height / 8 bytes. */
  readonly bytes: string;
}

/** A succeeded run, as the job's record serves it. */
export interface TestRunResult {
  readonly screen: string;
  readonly display: { readonly width: number; readonly height: number };
  readonly frames: readonly TestRunFrame[];
  /** Whether the harness was linked for this run, or found current. */
  readonly build: 'built' | 'current';
  readonly harnessHash: string;
  readonly versions: {
    /** Each posted document's version, as the designer sent it. */
    readonly documents: ReadonlyArray<{ readonly path: string; readonly version: string }>;
    readonly generator: string;
    readonly runtime: string;
    readonly emscripten: string;
  };
  readonly timings: {
    readonly stageMs: number;
    readonly prepareMs: number;
    readonly compileMs: number;
    readonly linkMs: number;
    readonly runMs: number;
    readonly totalMs: number;
  };
  /** Generator and compiler warnings. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * @brief Validates a request's params.
 *
 * @return The params, or a sentence saying what is wrong with them.
 */
export function parseTestRunParams(params: unknown): TestRunParams | string {
  // --- Step 1: The shape ---
  if (typeof params !== 'object' || params === null) {
    return 'a test run needs { "screen", "documents" }';
  }
  const { screen, documents, times } = params as { screen?: unknown; documents?: unknown; times?: unknown };
  if (typeof screen !== 'string' || screen === '') {
    return 'a test run needs the screen the canvas shows';
  }
  if (!Array.isArray(documents)) {
    return 'a test run needs the documents that differ from disk (an empty list when none do)';
  }
  const parsed: StagedDocument[] = [];
  for (const document of documents as unknown[]) {
    const { path, content, version } = (typeof document === 'object' && document !== null ? document : {}) as Partial<
      Record<'path' | 'content' | 'version', unknown>
    >;
    if (typeof path !== 'string' || typeof content !== 'string' || typeof version !== 'string') {
      return 'each document needs a string path, content and version';
    }
    parsed.push({ path, content, version });
  }

  // --- Step 2: The documents' paths, and the times ---
  const refused = checkStagedDocuments(parsed);
  if (refused !== undefined) {
    return refused;
  }
  const wanted = times === undefined ? TEST_RUN_TIMES : times;
  if (
    !Array.isArray(wanted) ||
    wanted.length === 0 ||
    wanted.length > MAX_TIMES ||
    !wanted.every((t, i) => Number.isInteger(t) && t >= 0 && t <= 0xffffffff && (i === 0 || t >= (wanted[i - 1] as number)))
  ) {
    return `times must be 1 to ${MAX_TIMES} non-decreasing whole milliseconds`;
  }
  return { screen, documents: parsed, times: wanted as number[] };
}

/** Where the job builds, and with what. Every field has a real-machine default. */
export interface TestRunJobOptions {
  readonly host?: ToolchainHost;
  /** The toolchain cache (detection's managed install lives beneath it). */
  readonly toolchainCacheRoot?: string;
  /** The editor build cache, shared with `editor-wasm`. */
  readonly buildCacheRoot?: string;
  /** The U8G2GL source tree; `null` for none, as an npm install has. */
  readonly frameworkRoot?: string | null;
}

/** What runTestRun() needs, resolved. */
interface RunContext {
  readonly projectRoot: string;
  readonly cacheRoot: string;
  readonly frameworkRoot: string;
  readonly toolchain: SelectedToolchain;
  readonly host: ToolchainHost;
}

/**
 * @brief One test run: stage the text, build the harness, run the frame loop.
 *
 * @return The result, or the diagnostics that stopped the build.
 */
export async function runTestRun(
  context: RunContext,
  params: TestRunParams,
): Promise<{ readonly ok: true; readonly result: TestRunResult } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }> {
  const started = Date.now();

  // --- Step 1: The text the canvas showed, staged in the cache ---
  const staged = stageProject(context.projectRoot, context.cacheRoot, params.documents);
  const stageMs = Date.now() - started;

  // --- Step 2: The harness, from the staged copy ---
  const build = await buildTestRunHarness({
    projectRoot: staged.root,
    cacheRoot: context.cacheRoot,
    frameworkRoot: context.frameworkRoot,
    toolchain: context.toolchain,
    host: context.host,
  });
  if (build.status === 'failed') {
    return { ok: false, diagnostics: build.diagnostics };
  }
  if (!build.layout.screens.includes(params.screen)) {
    return {
      ok: false,
      diagnostics: [
        { code: 'U8G2GL_TEST_RUN_SCREEN', severity: 'error', file: '', line: 1, column: 1, message: `the project has no screen '${params.screen}'` },
      ],
    };
  }

  // --- Step 3: The frame loop, on a freshly booted harness ---
  const runStarted = Date.now();
  const harness = await loadHarness(build.harnessDir);
  const run = await harness.run(params.screen, params.times);
  const runMs = Date.now() - runStarted;

  return {
    ok: true,
    result: {
      screen: params.screen,
      display: harness.display,
      frames: run.frames.map((frame, i) => ({
        time: params.times[i] ?? 0,
        sha256: sha256(frame),
        bytes: Buffer.from(frame).toString('base64'),
      })),
      build: build.status,
      harnessHash: build.harnessHash,
      versions: {
        documents: params.documents.map(({ path, version }) => ({ path, version })),
        generator: getGeneratorVersion(),
        runtime: `${RUNTIME_VERSION.major}.${RUNTIME_VERSION.minor}.${RUNTIME_VERSION.patch}`,
        emscripten: context.toolchain.version,
      },
      timings: {
        stageMs,
        prepareMs: build.timings.prepareMs,
        compileMs: build.timings.compileMs,
        linkMs: build.timings.linkMs,
        runMs,
        totalMs: Date.now() - started,
      },
      diagnostics: build.diagnostics,
    },
  };
}

/**
 * @brief The build cache the job uses with these options: the editor build's.
 */
export function testRunBuildCacheRoot(options: TestRunJobOptions): string {
  if (options.buildCacheRoot !== undefined) {
    return options.buildCacheRoot;
  }
  const host = options.host ?? nodeToolchainHost();
  return editorBuildCacheRoot(options.toolchainCacheRoot ?? toolchainCacheRoot(host.platform, host.env, host.home));
}

/**
 * @brief Registers the `test-run` job on a design server's build queue.
 *
 * @param queue   `server.builds`.
 * @param options Overrides for tests; the real machine's otherwise.
 */
export function registerTestRunJob(queue: BuildQueue, options: TestRunJobOptions = {}): void {
  queue.register(TEST_RUN_JOB, async ({ projectRoot, params }) => {
    // --- Step 1: The request, then what to build with ---
    const parsed = parseTestRunParams(params);
    if (typeof parsed === 'string') {
      throw new Error(parsed);
    }
    const host = options.host ?? nodeToolchainHost();
    const cacheRoot = options.toolchainCacheRoot ?? toolchainCacheRoot(host.platform, host.env, host.home);
    const frameworkRoot = options.frameworkRoot === null ? undefined : (options.frameworkRoot ?? locateFrameworkRoot());
    if (frameworkRoot === undefined) {
      throw new BuildJobFailure(
        EDITOR_WASM_FAILURE.noSourceTree,
        'no U8G2GL source tree beside this CLI, so the test-run harness cannot be built',
      );
    }
    const { selected } = await detectToolchain(host, cacheRoot);
    if (selected === undefined) {
      throw new BuildJobFailure(EDITOR_WASM_FAILURE.noEmscripten, `no Emscripten ${EMSCRIPTEN_VERSION}: run 'u8g2gl toolchain install'`);
    }

    // --- Step 2: Run, and turn a failed build into the queue's error ---
    const outcome = await runTestRun(
      { projectRoot, cacheRoot: testRunBuildCacheRoot({ ...options, host, toolchainCacheRoot: cacheRoot }), frameworkRoot, toolchain: selected, host },
      parsed,
    );
    if (!outcome.ok) {
      throw new Error(formatDiagnostics(outcome.diagnostics, undefined, { color: false }).trimEnd());
    }
    return outcome.result;
  });
}
