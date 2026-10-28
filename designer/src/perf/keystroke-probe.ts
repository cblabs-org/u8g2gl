/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/keystroke-probe.ts
 * Purpose: Measures keystroke latency the way the user sees it: that each
 *          key's edit is on the canvas in the first animation frame after the
 *          key, and how long the work in that frame takes, from the start of
 *          the pipeline run to the end of the blit. It also measures the time
 *          from the key event to the blit, which includes the wait for the
 *          frame. The end-to-end performance test gates on the first two and
 *          reports the third.
 * Description: Installed only in the end-to-end test build (`test-hooks.ts`).
 *              What it costs while installed:
 *              - one animation-frame callback on every display frame for the
 *                life of the page, idle or not (the frame counter);
 *              - per key: a `keydown` listener call, two `performance` marks
 *                and a measure, all cleared when the key's sample closes, so
 *                the browser's performance entry buffer stays bounded;
 *              - per drawn frame: one listener call;
 *              - memory: at most `LIMIT` samples.
 *
 *              A capturing `keydown` listener stamps the first key since the
 *              last drawn frame. The edit loop reports each run's stage
 *              timings; the first run that draws after a stamped key closes
 *              the sample: key to blit, split into Monaco's handling of the key
 *              (key to the text changing), the wait for the frame (that change
 *              to the run's start), and each stage. A frame counter numbers the
 *              display's frame intervals from the animation frames'
 *              timestamps, and gives the interval the key arrived in and the
 *              one the blit ended in.
 *
 * Exports:
 * - KeystrokeSample:         One key's journey to the canvas
 * - KeystrokeProbe:          The samples, and a reset
 * - installKeystrokeProbe(): Start measuring
 */

import type { EditLoop, FrameTimings } from '../pipeline/edit-loop';
import type { ProjectDocuments } from '../documents/project-documents';

/** One key's journey to the canvas, in milliseconds. */
export interface KeystrokeSample {
  /** From the key event to the end of the blit: reported, not gated. */
  readonly keyToBlit: number;
  /** From the key event to the start of the run that drew it. */
  readonly wait: number;
  /** Of that wait, the part before the editor changed the text: Monaco handling the key. */
  readonly keyToEdit: number;
  /** And the part after: the edit waiting for the next animation frame. */
  readonly editToFrame: number;
  /** From the start of the pipeline run to the end of its blit: the work in the frame. */
  readonly runToBlit: number;
  /**
   * Frame intervals from the key event to the end of the blit. 1 when the edit
   * is on the canvas in the first frame after the key; 0 when that frame had
   * begun (its timestamp) just before the key was dispatched, so both fall in
   * one interval; 2 or more when it missed a frame, whether its run came late
   * or ran past its frame's end.
   */
  readonly frames: number;
  /** Each stage of that run. */
  readonly stages: Readonly<Record<string, number>>;
}

/** The samples taken, and a way to start again. */
export interface KeystrokeProbe {
  /** Every closed sample, oldest first, at most `LIMIT`. */
  readonly samples: readonly KeystrokeSample[];
  /** @brief Drops every sample and any key awaiting its frame. */
  reset(): void;
}

/** The `performance` entry names the probe creates, cleared per sample. */
const MARKS = ['u8g2gl:key', 'u8g2gl:edit'] as const;
const MEASURE = 'u8g2gl:key-to-blit';

/** Samples kept; older ones are dropped. */
const LIMIT = 5000;

/**
 * @brief Starts measuring key-to-blit for every key typed in the page.
 *
 * @param loop      The edit loop whose runs draw the canvas.
 * @param documents The documents, whose first change after a key splits the wait.
 * @return The probe, for the test hooks to publish.
 */
export function installKeystrokeProbe(loop: EditLoop, documents: ProjectDocuments): KeystrokeProbe {
  const samples: KeystrokeSample[] = [];
  let pendingKey: number | undefined;
  let edited: number | undefined;
  let keyFrame = 0;

  // --- Step 1: A frame counter, by the display's frame intervals ---
  // Frame k is the interval [T_k, T_k + period) that begins at an animation
  // frame's timestamp T_k. Any moment, a key event's or the end of a blit, is
  // numbered by the interval it falls in, counted on from the latest frame
  // seen. Counting intervals rather than callbacks is what lets the counter
  // see a late frame: a run blocked past its frame's end does not delay its
  // own callback's timestamp, but its blit ends in a later interval.
  // `frameIndex` is the latest frame's interval number on one grid anchored at
  // the first frame, advanced by the elapsed periods rather than by one per
  // callback, so a stall (no callbacks for several periods) moves it as far as
  // it moves a moment numbered across the stall.
  let frameIndex = 0;
  let lastFrameTime = -1;
  const periods: number[] = [];
  const countFrame = (time: number): void => {
    if (time !== lastFrameTime) {
      const period = time - lastFrameTime;
      // Only plausible display periods (a 20-200 Hz display) teach the
      // estimate: the gap after a stall, or the first frame, is not one.
      if (lastFrameTime >= 0 && period >= 5 && period <= 50) {
        periods.push(period);
        if (periods.length > 30) periods.shift();
      }
      frameIndex += lastFrameTime < 0 ? 0 : Math.max(1, Math.round(period / framePeriod()));
      lastFrameTime = time;
    }
    requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);
  // framePeriod
  // The display's frame period: the median of recent periods, or 60 Hz's.
  const framePeriod = (): number => {
    if (periods.length === 0) return 1000 / 60;
    const sorted = [...periods].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)] ?? 1000 / 60;
  };
  // frameAt
  // The number of the frame interval a moment falls in.
  const frameAt = (time: number): number => frameIndex + Math.floor((time - lastFrameTime) / framePeriod());

  // --- Step 2: Stamp the first key since the last drawn frame ---
  window.addEventListener(
    'keydown',
    (event) => {
      if (pendingKey === undefined) {
        pendingKey = event.timeStamp > 0 ? event.timeStamp : performance.now();
        keyFrame = frameAt(pendingKey);
        performance.mark('u8g2gl:key');
      }
    },
    { capture: true },
  );

  // --- Step 3: Note when the key became an edit ---
  documents.onDidChangeContent(() => {
    if (pendingKey !== undefined && edited === undefined) {
      edited = performance.now();
      performance.mark('u8g2gl:edit');
    }
  });

  // --- Step 4: Close the sample at the blit of the next run that draws ---
  loop.onFrame((timings: FrameTimings) => {
    if (pendingKey === undefined || !timings.drawn) return;
    const end = performance.now();
    // Everything in the timings but these three is a stage duration.
    const { frameStart: _frameStart, runStart, drawn: _drawn, ...stages } = timings;
    void _frameStart;
    void _drawn;
    const edit = edited ?? runStart;
    samples.push({
      keyToBlit: end - pendingKey,
      wait: runStart - pendingKey,
      keyToEdit: edit - pendingKey,
      editToFrame: runStart - edit,
      runToBlit: end - runStart,
      frames: frameAt(end) - keyFrame,
      stages,
    });
    // Measured so it shows in a profile recorded meanwhile, then cleared with
    // the key's marks: the entry buffer would otherwise grow for the page's life.
    performance.measure(MEASURE, { start: pendingKey, end });
    for (const mark of MARKS) performance.clearMarks(mark);
    performance.clearMeasures(MEASURE);
    if (samples.length > LIMIT) samples.shift();
    pendingKey = undefined;
    edited = undefined;
  });

  return {
    samples,
    reset: () => {
      samples.length = 0;
      pendingKey = undefined;
      edited = undefined;
    },
  };
}
