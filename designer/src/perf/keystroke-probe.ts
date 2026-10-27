/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/keystroke-probe.ts
 * Purpose: Measures E1 e2 as checkpoint C3 defines it (PA ruling 8): that every
 *          key's edit is on the canvas in the first animation frame after the
 *          key, and how long the work in that frame takes, from the start of
 *          the pipeline run to the end of the blit. It also reports the time
 *          from the key event to the blit, which includes the wait for the
 *          frame. It is always installed, because a budget measured
 *          only in a special build measures that build, and it costs one
 *          timestamp per key and one record per drawn frame.
 * Description: A capturing `keydown` listener on the window stamps the first
 *              key since the last drawn frame. The edit loop reports each run's
 *              stage timings; the first run that draws after a stamped key
 *              closes the sample: key to blit, split into Monaco's handling of
 *              the key (key to the text changing), the wait for the frame
 *              (that change to the run's start), and each stage. A frame
 *              counter, advanced once per animation frame by its timestamp,
 *              gives the frame the key arrived after and the frame the blit was
 *              in. Samples are kept
 *              in memory, at most `LIMIT`, and read through
 *              `window.__u8g2glPerf` by the end-to-end test or a developer's
 *              console. Each sample is also a `performance.measure`, so it
 *              shows in a browser's performance profile.
 *
 * Exports:
 * - KeystrokeSample:        One key's journey to the canvas
 * - installKeystrokeProbe(): Start measuring
 */

import type { EditLoop, FrameTimings } from '../pipeline/edit-loop';
import type { ProjectDocuments } from '../documents/project-documents';

/** One key's journey to the canvas, in milliseconds. */
export interface KeystrokeSample {
  /** From the key event to the end of the blit: the e2 number. */
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
   * Animation frames from the key to the blit: 1 when the edit is drawn in the
   * first frame after the key, more when a frame was skipped.
   */
  readonly frames: number;
  /** Each stage of that run. */
  readonly stages: Readonly<Record<string, number>>;
}

/** Samples kept; older ones are dropped. */
const LIMIT = 5000;

/**
 * @brief Starts measuring key-to-blit for every key typed in the page.
 *
 * @param loop      The edit loop whose runs draw the canvas.
 * @param documents The documents, whose first change after a key splits the wait.
 */
export function installKeystrokeProbe(loop: EditLoop, documents: ProjectDocuments): void {
  const samples: KeystrokeSample[] = [];
  let pendingKey: number | undefined;
  let edited: number | undefined;
  let keyFrame = 0;

  // --- Step 0: A frame counter. Every callback of one animation frame shares
  // its timestamp, so a new timestamp is a new frame, whichever callback of
  // that frame runs first. ---
  let frameCount = 0;
  let lastFrameTime = -1;
  const countFrame = (time: number): void => {
    if (time !== lastFrameTime) {
      lastFrameTime = time;
      frameCount += 1;
    }
    requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);
  // frameOf
  // The number of the frame whose callbacks carry `time`: the counted one, or
  // the next if this frame's counter callback has not run yet.
  const frameOf = (time: number): number => (time === lastFrameTime ? frameCount : frameCount + 1);

  // --- Step 1: Stamp the first key since the last drawn frame ---
  window.addEventListener(
    'keydown',
    (event) => {
      if (pendingKey === undefined) {
        pendingKey = event.timeStamp > 0 ? event.timeStamp : performance.now();
        keyFrame = frameCount;
        performance.mark('u8g2gl:key');
      }
    },
    { capture: true },
  );

  // --- Step 2: Note when the key became an edit ---
  documents.onDidChangeContent(() => {
    if (pendingKey !== undefined && edited === undefined) {
      edited = performance.now();
      performance.mark('u8g2gl:edit');
    }
  });

  // --- Step 3: Close the sample at the blit of the next run that draws ---
  loop.onFrame((timings: FrameTimings) => {
    if (pendingKey === undefined || !timings.drawn) return;
    const end = performance.now();
    const { frameStart: _frame, runStart, drawn: _drawn, ...stages } = timings;
    void _frame;
    void _drawn;
    const edit = edited ?? runStart;
    samples.push({
      keyToBlit: end - pendingKey,
      wait: runStart - pendingKey,
      keyToEdit: edit - pendingKey,
      editToFrame: runStart - edit,
      runToBlit: end - runStart,
      frames: frameOf(timings.frameStart) - keyFrame,
      stages,
    });
    performance.measure('u8g2gl:key-to-blit', { start: pendingKey, end });
    if (samples.length > LIMIT) samples.shift();
    pendingKey = undefined;
    edited = undefined;
  });

  (window as unknown as { __u8g2glPerf?: unknown }).__u8g2glPerf = {
    samples,
    reset: () => {
      samples.length = 0;
      pendingKey = undefined;
      edited = undefined;
    },
  };
}
