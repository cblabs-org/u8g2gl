/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/test-run/verdict.ts
 * Purpose: The decisions a test run makes that need no page, no Wasm and no
 *          server, so they are tested on their own: whether two frames match
 *          and where they differ, what the canvas toolbar says about a run
 *          (EDITOR-DESIGN §2.2, §4.1–4.3), and whether Run can be pressed now,
 *          must wait, or is unavailable and why.
 * Description: A verdict compares frames in time order and reports the first
 *              that differs, with its pixel count and the differing pixels,
 *              because the first divergence is the one that explains the rest.
 *              The toolbar text appends `· N edits since` once the text moves
 *              on, so a tick never vouches for text it did not check.
 *
 * Exports:
 * - TEST_RUN_TIMES:       The frame times every run renders
 * - Pixel:                One device pixel
 * - FrameComparison:      Parity, or the first differing frame
 * - differingPixels():    Where two frames differ
 * - compareFrames():      Compare a run's frames, in order
 * - TestRunView:          What the toolbar shows about the last run
 * - verdictText():        The toolbar's text for it
 * - formatAgo():          "2 s ago", "3 min ago"
 * - RunInputs, RunAvailability, runAvailability(): Whether Run can be pressed
 */

/**
 * The frame times every run renders, in ms: boot, the first frame after it,
 * then points spread over five seconds, so an animation's start, its motion
 * and its steady state are all compared. The server renders whichever times
 * it is sent; these are sent, because the live frames are rendered here, at
 * press time, before the server's arrive.
 */
export const TEST_RUN_TIMES: readonly number[] = [0, 16, 100, 250, 500, 1000, 2000, 5000];

/** One device pixel. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/** A run's frames compared: all equal, or the first that is not. */
export type FrameComparison =
  | { readonly kind: 'parity' }
  | {
      readonly kind: 'mismatch';
      /** Index into the times of the first differing frame. */
      readonly index: number;
      readonly time: number;
      /** Its differing pixels, in row order. */
      readonly pixels: readonly Pixel[];
    };

/**
 * @brief Where two frames differ, in row order.
 *
 * @param a, b  U8G2 tile buffers of one display: byte (y / 8) * width + x, bit y % 8.
 */
export function differingPixels(a: Uint8Array, b: Uint8Array, width: number, height: number): Pixel[] {
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y++) {
    const row = (y >> 3) * width;
    const bit = 1 << (y & 7);
    for (let x = 0; x < width; x++) {
      if (((a[row + x] ?? 0) & bit) !== ((b[row + x] ?? 0) & bit)) pixels.push({ x, y });
    }
  }
  return pixels;
}

/**
 * @brief Compares the live frames with the harness's, time by time.
 *
 * Frames of different lengths differ everywhere the shorter one ends, which
 * differingPixels() reports as unlit against lit, so a size disagreement is a
 * mismatch rather than a parity.
 *
 * @param times   The run's times, in order.
 * @param live    The canvas's frame at each time.
 * @param harness The firmware target's frame at each time.
 */
export function compareFrames(
  times: readonly number[],
  live: readonly Uint8Array[],
  harness: readonly Uint8Array[],
  width: number,
  height: number,
): FrameComparison {
  for (let index = 0; index < times.length; index++) {
    const a = live[index] ?? new Uint8Array(0);
    const b = harness[index] ?? new Uint8Array(0);
    const pixels = differingPixels(a, b, width, height);
    if (pixels.length > 0 || a.length !== b.length) {
      return { kind: 'mismatch', index, time: times[index] ?? 0, pixels };
    }
  }
  return { kind: 'parity' };
}

/** What the toolbar shows about the last run. */
export type TestRunView =
  | { readonly kind: 'none' }
  | { readonly kind: 'waiting'; readonly reason: string }
  | { readonly kind: 'running' }
  | { readonly kind: 'parity'; readonly finishedAt: number; readonly editsSince: number }
  | { readonly kind: 'mismatch'; readonly finishedAt: number; readonly editsSince: number; readonly pixels: number; readonly time: number }
  | { readonly kind: 'failed'; readonly finishedAt: number; readonly editsSince: number };

/**
 * @brief The canvas toolbar's text for the last run (EDITOR-DESIGN §2.2, §4.2).
 *
 * @param view The run's state.
 * @param now  The page clock, in the same units as `finishedAt` (ms).
 */
export function verdictText(view: TestRunView, now: number): string {
  const since = (edits: number): string => (edits > 0 ? ` · ${edits} edit${edits === 1 ? '' : 's'} since` : '');
  switch (view.kind) {
    case 'none':
      return '';
    case 'waiting':
      return `waiting: ${view.reason}`;
    case 'running':
      return 'running…';
    case 'parity':
      return `✓ parity · ${formatAgo(now - view.finishedAt)}${since(view.editsSince)}`;
    case 'mismatch':
      return `≠ ${view.pixels} px differ at ${view.time} ms${since(view.editsSince)}`;
    case 'failed':
      return `✕ test run failed${since(view.editsSince)}`;
  }
}

/** @brief An age as the toolbar says it: `2 s ago`, `3 min ago`, `1 h ago`. */
export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/** What decides whether Run can be pressed. */
export interface RunInputs {
  /**
   * Why this machine cannot build, from the editor-Wasm build's failure code:
   * `no-emscripten`, `no-source-tree`, or undefined when it can.
   */
  readonly cannotBuild: string | undefined;
  /** The editor-Wasm indicator's state (EditorWasmController). */
  readonly wasm: 'loading' | 'building' | 'current' | 'stale' | 'none' | 'failed';
  /** Elements the canvas draws as placeholders. */
  readonly placeholders: number;
  /** False while a project document is not well-formed. */
  readonly wellFormed: boolean;
  /** Whether the canvas is drawing the current text (false: the last good frame). */
  readonly live: boolean;
}

/** Whether Run can be pressed: now, after a rebuild, or not, and why. */
export type RunAvailability =
  | { readonly state: 'ready' }
  | { readonly state: 'wait'; readonly reason: string }
  | { readonly state: 'unavailable'; readonly reason: string };

/**
 * @brief Whether Run can be pressed now (EDITOR-DESIGN §4, ruling 7).
 *
 * In order of what the user must fix first: a machine that cannot build at
 * all, then the editor Wasm (which Run waits for when it is being rebuilt,
 * rather than refusing), then the text and the canvas.
 */
export function runAvailability(inputs: RunInputs): RunAvailability {
  if (inputs.cannotBuild === 'no-source-tree') {
    return { state: 'unavailable', reason: 'no U8G2GL source tree beside this CLI (an npm install): the test run cannot be built' };
  }
  if (inputs.cannotBuild !== undefined || inputs.wasm === 'none') {
    return { state: 'unavailable', reason: "no toolchain: run 'u8g2gl toolchain install'" };
  }
  if (inputs.wasm === 'loading' || inputs.wasm === 'building' || inputs.wasm === 'stale') {
    return { state: 'wait', reason: 'the editor Wasm is being rebuilt' };
  }
  if (inputs.wasm === 'failed') {
    return { state: 'unavailable', reason: 'the editor Wasm is not current: its build failed (see Problems)' };
  }
  if (!inputs.wellFormed) {
    return { state: 'unavailable', reason: 'the document is not well-formed' };
  }
  if (inputs.placeholders > 0) {
    return { state: 'unavailable', reason: 'the canvas shows placeholders: the frames are not comparable' };
  }
  if (!inputs.live) {
    return { state: 'unavailable', reason: 'the canvas shows the last good frame: fix the errors first' };
  }
  return { state: 'ready' };
}
