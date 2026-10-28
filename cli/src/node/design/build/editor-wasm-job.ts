/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/editor-wasm-job.ts
 * Purpose: Puts the project editor Wasm build on the design server's build
 *          queue, as the `editor-wasm` job. The queue keeps builds serial and
 *          out of the per-edit loop; this module only translates between its
 *          contract (JSON params in, a JSON result or a thrown message out)
 *          and buildEditorWasm()'s.
 * Description: Params `{ "testRun": true }` link at `-O3`; anything else at
 *              `-O1`. The toolchain is detected at each run, so installing one
 *              while the server runs is picked up by the next build. A failed
 *              build throws, its diagnostics formatted compiler-style one per
 *              line (`file:line:column: error: message [code]`), which the
 *              queue records as the job's error. The two failures that mean
 *              "this machine cannot build", not "this project is wrong", also
 *              carry a code (EDITOR_WASM_FAILURE), so the designer can show
 *              the no-toolchain state without parsing the message.
 *
 * Exports:
 * - EDITOR_WASM_FAILURE:      The failure codes the job's record can carry
 * - EditorWasmFailureCode:    One of them
 * - EditorWasmJobOptions:     Where the job builds, and with what
 * - parseEditorWasmParams():  The optimisation level a request asks for
 * - registerEditorWasmJob():  Register the job on a build queue
 */

import { BuildJobFailure, type BuildQueue } from '../build-queue.js';
import { formatDiagnostics } from '../../format-diagnostic.js';
import { detectToolchain } from '../../toolchain/detect-toolchain.js';
import { nodeToolchainHost, type ToolchainHost } from '../../toolchain/toolchain-host.js';
import { EMSCRIPTEN_VERSION, toolchainCacheRoot } from '../../toolchain/toolchain-paths.js';
import { buildEditorWasm, EDITOR_WASM_JOB, editorBuildCacheRoot, type OptimisationLevel } from './editor-wasm-build.js';
import { locateFrameworkRoot } from './framework-sources.js';

/**
 * The codes a failed `editor-wasm` record can carry. Part of the server's
 * protocol: the designer matches these strings, so they never change meaning.
 * - `no-emscripten`:  no usable Emscripten of the pinned version
 * - `no-source-tree`: no U8G2GL runtime sources beside the CLI (an npm install)
 */
export const EDITOR_WASM_FAILURE = {
  noEmscripten: 'no-emscripten',
  noSourceTree: 'no-source-tree',
} as const;

/** One of EDITOR_WASM_FAILURE's codes. */
export type EditorWasmFailureCode = (typeof EDITOR_WASM_FAILURE)[keyof typeof EDITOR_WASM_FAILURE];

/** Where the job builds, and with what. Every field has a real-machine default. */
export interface EditorWasmJobOptions {
  readonly host?: ToolchainHost;
  /** The toolchain cache (detection's managed install lives beneath it). */
  readonly toolchainCacheRoot?: string;
  /** The editor build cache. */
  readonly buildCacheRoot?: string;
  /** The U8G2GL source tree; `null` for none, as an npm install has. */
  readonly frameworkRoot?: string | null;
}

/**
 * @brief The optimisation level a job's params ask for: `-O3` for a test run, else `-O1`.
 */
export function parseEditorWasmParams(params: unknown): OptimisationLevel {
  const testRun = typeof params === 'object' && params !== null && (params as { testRun?: unknown }).testRun === true;
  return testRun ? 'O3' : 'O1';
}

/**
 * @brief Registers the `editor-wasm` job on a design server's build queue.
 *
 * @param queue   `server.builds`.
 * @param options Overrides for tests; the real machine's otherwise.
 */
export function registerEditorWasmJob(queue: BuildQueue, options: EditorWasmJobOptions = {}): void {
  queue.register(EDITOR_WASM_JOB, async ({ projectRoot, params }) => {
    // --- Step 1: What to build with: the framework tree and a toolchain ---
    const host = options.host ?? nodeToolchainHost();
    const cacheRoot = options.toolchainCacheRoot ?? toolchainCacheRoot(host.platform, host.env, host.home);
    const frameworkRoot = options.frameworkRoot === null ? undefined : (options.frameworkRoot ?? locateFrameworkRoot());
    if (frameworkRoot === undefined) {
      throw new BuildJobFailure(
        EDITOR_WASM_FAILURE.noSourceTree,
        'no U8G2GL source tree beside this CLI, so the project editor Wasm cannot be built',
      );
    }
    const { selected } = await detectToolchain(host, cacheRoot);
    if (selected === undefined) {
      throw new BuildJobFailure(EDITOR_WASM_FAILURE.noEmscripten, `no Emscripten ${EMSCRIPTEN_VERSION}: run 'u8g2gl toolchain install'`);
    }

    // --- Step 2: Build, and turn a failure into the queue's error ---
    const build = await buildEditorWasm({
      projectRoot,
      cacheRoot: options.buildCacheRoot ?? editorBuildCacheRoot(cacheRoot),
      frameworkRoot,
      toolchain: selected,
      host,
      optimisation: parseEditorWasmParams(params),
    });
    if (build.status === 'failed') {
      throw new Error(formatDiagnostics(build.diagnostics, undefined, { color: false }).trimEnd());
    }
    return build;
  });
}
