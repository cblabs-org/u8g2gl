/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/keystroke-probe.ts
 * Purpose: Measures what EDITOR-DESIGN's 16 ms budget is about: the time from a
 *          key event to the canvas blit that shows its effect (E1 e2,
 *          checkpoint C3). It is always installed, because a budget measured
 *          only in a special build measures that build, and it costs one
 *          timestamp per key and one record per drawn frame.
 * Description: A capturing `keydown` listener on the window stamps the first
 *              key since the last drawn frame. The edit loop reports each run's
 *              stage timings; the first run that draws after a stamped key
 *              closes the sample: key to blit, split into Monaco's handling of
 *              the key (key to the text changing), the wait for the frame
 *              (that change to the run's start), and each stage. Samples are kept
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

  // --- Step 1: Stamp the first key since the last drawn frame ---
  window.addEventListener(
    'keydown',
    (event) => {
      if (pendingKey === undefined) {
        pendingKey = event.timeStamp > 0 ? event.timeStamp : performance.now();
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
    const edit = edited ?? runStart;
    samples.push({
      keyToBlit: end - pendingKey,
      wait: runStart - pendingKey,
      keyToEdit: edit - pendingKey,
      editToFrame: runStart - edit,
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
