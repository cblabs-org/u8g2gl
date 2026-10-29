/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/drag-stamp.ts
 * Purpose: Decides which pointer move a drawn frame of a drag is measured
 *          from. A pointer reports several moves per frame and the pipeline
 *          draws only the latest text, so the frame shows where the gesture
 *          had put the element after the **latest move it processed** — the
 *          move that wrote the edit, or a later one that snapped to (or rounded
 *          to) where the element already was, which has nothing new to write
 *          but is just as much on the canvas. Measuring from the last move that
 *          *edited* instead would date a frame from an older move whenever
 *          snapping holds the element still, and the snap window is 3 screen
 *          pixels (ui_spec §8), so at 1× zoom it holds a run of 1-pixel moves.
 * Description: The canvas gesture reports each move it processed
 *              (`signalDragMove`); the drag probe feeds them to a
 *              `DragStamper` with the moment each was handled, notes each drag
 *              edit, and at each drawn run takes the stamp: the latest move
 *              handled before the run began, if the text changed since the last
 *              drawn run. A move handled after the run began waits for the next.
 *              The rule is pure, so it is unit-tested without a browser.
 *
 *              `signalDragMove` is the gesture's side of it: a no-op outside
 *              the end-to-end test build (`__U8G2GL_TEST_HOOKS__`), and a call
 *              to the probe's listener inside it, so the production gesture
 *              carries no measurement.
 *
 * Exports:
 * - DragStamp:             A move: when it happened and when it was handled
 * - DragStamper:           The rule: which move a drawn run is measured from
 * - signalDragMove():      The gesture processed a move
 * - onDragMove():          The probe's subscription to those signals
 */

/// <reference path="../build-flags.d.ts" />

/** One processed pointer move. */
export interface DragStamp {
  /** The pointer event's time, `event.timeStamp`. */
  readonly input: number;
  /** When the gesture had finished with it: its edit written, or its position found unchanged. */
  readonly handled: number;
}

/** Which processed move each drawn run of a drag is measured from. */
export class DragStamper {
  /** Moves processed since the last stamp was taken, oldest first. */
  private moves: DragStamp[] = [];
  /** Whether a drag edit has landed since the last stamp was taken. */
  private edited = false;

  /** @brief The gesture processed a move, whether it wrote an edit or not. */
  moveProcessed(stamp: DragStamp): void {
    this.moves.push(stamp);
  }

  /** @brief A drag edit landed in the text: the next drawn run has something new to show. */
  editLanded(): void {
    this.edited = true;
  }

  /**
   * @brief The move a drawn run is measured from: the latest handled before
   *        the run began, if the text changed since the last stamp.
   *
   * Moves handled after `runStart` are kept for the next run; the rest are
   * consumed. A run with no drag edit since the last stamp yields nothing (the
   * frame shows nothing a move asked for), and keeps the moves for later.
   *
   * @param runStart When the drawn run began (`performance.now()` clock).
   * @return The stamp, or undefined when this run measures no move.
   */
  take(runStart: number): DragStamp | undefined {
    if (!this.edited) return undefined;
    let latest: DragStamp | undefined;
    const later: DragStamp[] = [];
    for (const move of this.moves) {
      if (move.handled <= runStart) latest = move;
      else later.push(move);
    }
    if (latest === undefined) return undefined;
    this.moves = later;
    this.edited = false;
    return latest;
  }

  /** @brief Forgets every move and edit. */
  reset(): void {
    this.moves = [];
    this.edited = false;
  }
}

/** The probe's listener, in the test build. */
let listener: ((input: number) => void) | undefined;

/**
 * @brief The gesture processed a pointer move of a drag (it wrote the edit, or
 *        the element was already where the move puts it). Nothing outside the
 *        end-to-end test build.
 *
 * @param input The pointer event's `timeStamp`.
 */
export function signalDragMove(input: number): void {
  if (__U8G2GL_TEST_HOOKS__) listener?.(input);
}

/** @brief Subscribes the drag probe to processed moves (test build only). */
export function onDragMove(next: (input: number) => void): void {
  if (__U8G2GL_TEST_HOOKS__) listener = next;
}
