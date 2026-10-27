/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/pipeline/frame-scheduler.ts
 * Purpose: The edit loop's only scheduling rule (EDITOR-DESIGN §3.2): however
 *          many edits arrive, **at most one pipeline run per animation frame**,
 *          on the latest text. A keyboard repeats and a mouse reports at up to
 *          1000 Hz; rendering each intermediate text would spend the frame on
 *          pixels nobody sees. There is deliberately no debounce: a run costs
 *          a few milliseconds, and a debounce would make the canvas trail the
 *          text it shows.
 * Description: `request()` marks the pipeline wanted and, if no frame is
 *              already booked, books one. The frame callback runs the pipeline
 *              once, passing the frame's timestamp. Requests made during the run
 *              book the next frame. The frame source is injected so tests drive
 *              it by hand.
 *
 * Exports:
 * - FrameSource:      requestAnimationFrame and its cancel, as a pair
 * - FrameScheduler:   One run per frame
 *
 *     Use:
 *     - request():    Ask for a run on the next frame
 *     - dispose():    Cancel any booked frame and stop
 *
 *     Inspection:
 *     - pending:      Whether a frame is booked
 *     - runs:         How many runs have happened
 */

/** `requestAnimationFrame` and `cancelAnimationFrame`, or a test's stand-in. */
export interface FrameSource {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

/** The browser's frame source. */
export const BROWSER_FRAMES: FrameSource = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Runs a task at most once per animation frame, however often it is requested. */
export class FrameScheduler {
  private readonly task: (frameTime: number) => void;
  private readonly frames: FrameSource;
  private handle: number | undefined;
  private disposed = false;
  private runCount = 0;

  /**
   * @param task   What to run; it reads the latest state itself, so a request
   *               carries nothing.
   * @param frames The frame source; the browser's by default.
   */
  constructor(task: (frameTime: number) => void, frames: FrameSource = BROWSER_FRAMES) {
    this.task = task;
    this.frames = frames;
  }

  /** Whether a frame is booked and the task has not yet run in it. */
  get pending(): boolean {
    return this.handle !== undefined;
  }

  /** How many times the task has run. */
  get runs(): number {
    return this.runCount;
  }

  /**
   * @brief Asks for one run on the next animation frame.
   *
   * Any number of calls before that frame coalesce into the one run.
   */
  request(): void {
    if (this.disposed || this.handle !== undefined) {
      return;
    }
    this.handle = this.frames.request((frameTime) => {
      // Cleared before the task runs, so a request the task itself makes (an
      // edit applied while rendering) books the next frame rather than being
      // swallowed by this one.
      this.handle = undefined;
      this.runCount += 1;
      this.task(frameTime);
    });
  }

  /** @brief Cancels a booked frame; later requests are ignored. */
  dispose(): void {
    this.disposed = true;
    if (this.handle !== undefined) {
      this.frames.cancel(this.handle);
      this.handle = undefined;
    }
  }
}
