/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/harness-runner.ts
 * Purpose: Runs a built test-run harness in Node and reads its frames back:
 *          the firmware target's half of a parity check. The harness boots
 *          the generated code once per instance, as firmware does, so this
 *          module owns the rule that each screen gets a fresh instance —
 *          a fresh `ui_init()` — compiled once and instantiated per screen.
 * Description: The Emscripten loader is a CommonJS factory
 *              (`createU8g2glHarness`); it is given the module's bytes, read
 *              once, so a second screen costs an instantiation and not a
 *              compile from disk. Frames are copied out of the Wasm heap, so
 *              they outlive the instance.
 *
 * Exports:
 * - HarnessRun:      The frames one screen produced
 * - LoadedHarness:   A harness ready to run screens
 * - loadHarness():   Load one from its build directory
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { HARNESS_FILES } from './test-run-build.js';

/** The frames one screen produced, one per requested time. */
export interface HarnessRun {
  readonly screen: string;
  readonly times: readonly number[];
  /** Each a copy of the display buffer, U8G2's vertical_top_lsb layout. */
  readonly frames: readonly Uint8Array[];
}

/** A harness ready to run screens. */
export interface LoadedHarness {
  /** Screen names in document order. */
  readonly screens: readonly string[];
  readonly display: { readonly width: number; readonly height: number };
  /**
   * @brief Boots a fresh instance and runs one screen at the given times.
   *
   * @param screen A name from `screens`.
   * @param times  Milliseconds, non-decreasing.
   * @throws Error naming the harness's reason, for an unknown screen or
   *         decreasing times: both are the caller's error, not the project's.
   */
  run(screen: string, times: readonly number[]): Promise<HarnessRun>;
}

/** The harness's exports, as this module uses them. */
interface HarnessModule {
  readonly HEAPU8: Uint8Array;
  readonly HEAPU32: Uint32Array;
  UTF8ToString(ptr: number): string;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _getScreenCount(): number;
  _getScreenName(index: number): number;
  _getDisplayWidth(): number;
  _getDisplayHeight(): number;
  _runScreen(index: number, times: number, count: number): number;
  _getFrameCount(): number;
  _getFramePtr(index: number): number;
  _getBufferSize(): number;
  _getLastError(): number;
}

type HarnessFactory = (overrides: { wasmBinary: Uint8Array }) => Promise<HarnessModule>;

/**
 * @brief Loads a built harness from its directory.
 *
 * @param harnessDir TestRunBuild's `harnessDir`.
 */
export async function loadHarness(harnessDir: string): Promise<LoadedHarness> {
  // --- Step 1: The loader and the module's bytes, read once ---
  const require = createRequire(join(harnessDir, HARNESS_FILES.loader));
  const factory = require(join(harnessDir, HARNESS_FILES.loader)) as HarnessFactory;
  const wasmBinary = new Uint8Array(readFileSync(join(harnessDir, HARNESS_FILES.module)));
  const instantiate = (): Promise<HarnessModule> => factory({ wasmBinary });

  // --- Step 2: What the project has, from a first instance ---
  const probe = await instantiate();
  const screens = Array.from({ length: probe._getScreenCount() }, (_, i) => probe.UTF8ToString(probe._getScreenName(i)));
  const display = { width: probe._getDisplayWidth(), height: probe._getDisplayHeight() };

  return {
    screens,
    display,
    async run(screen, times) {
      // --- Step 3: A fresh instance per screen: firmware boots once ---
      const index = screens.indexOf(screen);
      if (index < 0) {
        throw new Error(`the harness has no screen '${screen}'`);
      }
      const module = await instantiate();
      const timesPtr = module._malloc(Math.max(1, times.length) * 4);
      try {
        module.HEAPU32.set(times, timesPtr >>> 2);
        if (module._runScreen(index, timesPtr, times.length) !== 1) {
          throw new Error(`the harness refused the run: ${module.UTF8ToString(module._getLastError())}`);
        }
      } finally {
        module._free(timesPtr);
      }
      const size = module._getBufferSize();
      const frames = Array.from({ length: module._getFrameCount() }, (_, i) => {
        const ptr = module._getFramePtr(i);
        return module.HEAPU8.slice(ptr, ptr + size);
      });
      return { screen, times: [...times], frames };
    },
  };
}
