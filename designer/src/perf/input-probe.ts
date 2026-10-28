/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/perf/input-probe.ts
 * Purpose: Measures input latency the way the user sees it, for the two
 *          inputs that edit the text at frame rate: a key typed in the editor
 *          (E-1e's keystroke gate) and a pointer dragging on the canvas (E-2's
 *          drag gate, EDITOR-DESIGN §3.4). For each input it measures whether
 *          its edit is on the canvas in the first animation frame after it, how
 *          long the work in that frame takes from the start of the pipeline
 *          run to the end of the blit, and the time from the input event to
 *          the blit. The end-to-end performance tests gate on these.
 * Description: Installed only in the end-to-end test build (`test-hooks.ts`).
 *              What it costs while installed:
 *              - one animation-frame callback on every display frame for the
 *                life of the page, idle or not (the frame counter, shared by
 *                both probes);
 *              - per input: a listener call, two `performance` marks and a
 *                measure, all cleared when the input's sample closes, so the
 *                browser's performance entry buffer stays bounded;
 *              - per drawn frame: one listener call per probe;
 *              - memory: at most `LIMIT` samples per probe.
 *
 *              A capturing listener stamps the input the next drawn frame
 *              shows: for keys, the first `keydown` since the last drawn
 *              frame; for a drag, which is a stream of several pointer moves
 *              per frame of which the pipeline draws only the latest, the last
 *              `pointermove` with the primary button held that edited the text
 *              before the run (a move that leaves the delta where it was has
 *              nothing to paint). The edit loop reports each run's stage
 *              timings; the first run that draws after a stamped input closes
 *              the sample: input to blit, split into the input's handling
 *              (the input to the text changing), the wait for the frame (that
 *              change to the run's start), and each stage. A frame counter
 *              numbers the display's frame intervals from the animation
 *              frames' timestamps, and gives the interval the input arrived in
 *              and the one the blit ended in.
 *
 * Exports:
 * - InputKind:            A key, or a drag's pointer move
 * - InputSample:          One input's journey to the canvas
 * - InputProbe:           The samples, and a reset
 * - InputProbes:          The keystroke probe and the drag probe
 * - installInputProbes(): Start measuring both
 */

import type { EditLoop, FrameTimings } from '../pipeline/edit-loop';
import type { ProjectDocuments } from '../documents/project-documents';

/** What a probe measures: keys typed, or a drag's pointer moves. */
export type InputKind = 'key' | 'drag';

/** One input's journey to the canvas, in milliseconds. */
export interface InputSample {
  /** From the input event to the end of the blit. */
  readonly inputToBlit: number;
  /** From the input event to the start of the run that drew it. */
  readonly wait: number;
  /** Of that wait, the part before the text changed: the input's handling. */
  readonly inputToEdit: number;
  /** And the part after: the edit waiting for the next animation frame. */
  readonly editToFrame: number;
  /** From the start of the pipeline run to the end of its blit: the work in the frame. */
  readonly runToBlit: number;
  /**
   * Frame intervals from the input event to the end of the blit. 1 when the
   * edit is on the canvas in the first frame after the input; 0 when that frame
   * had begun (its timestamp) just before the input was dispatched, so both
   * fall in one interval; 2 or more when it missed a frame, whether its run
   * came late or ran past its frame's end.
   */
  readonly frames: number;
  /** Each stage of that run. */
  readonly stages: Readonly<Record<string, number>>;
}

/** The samples taken, and a way to start again. */
export interface InputProbe {
  /** Every closed sample, oldest first, at most `LIMIT`. */
  readonly samples: readonly InputSample[];
  /** @brief Drops every sample and any input awaiting its frame. */
  reset(): void;
}

/** The two probes. */
export interface InputProbes {
  readonly keys: InputProbe;
  readonly drags: InputProbe;
}

/** The `performance` entry names each probe creates, cleared per sample. */
const ENTRIES: Readonly<Record<InputKind, { readonly input: string; readonly edit: string; readonly measure: string }>> = {
  key: { input: 'u8g2gl:key', edit: 'u8g2gl:edit', measure: 'u8g2gl:key-to-blit' },
  drag: { input: 'u8g2gl:drag', edit: 'u8g2gl:drag-edit', measure: 'u8g2gl:drag-to-blit' },
};

/** Samples kept per probe; older ones are dropped. */
const LIMIT = 5000;

/**
 * The display's frame intervals. Frame k is the interval [T_k, T_k + period)
 * that begins at an animation frame's timestamp T_k. Any moment, an input
 * event's or the end of a blit, is numbered by the interval it falls in,
 * counted on from the latest frame seen. Counting intervals rather than
 * callbacks is what lets the counter see a late frame: a run blocked past its
 * frame's end does not delay its own callback's timestamp, but its blit ends in
 * a later interval. The latest frame's number is on one grid anchored at the
 * first frame, advanced by the elapsed periods rather than by one per callback,
 * so a stall (no callbacks for several periods) moves it as far as it moves a
 * moment numbered across the stall.
 */
class FrameCounter {
  private frameIndex = 0;
  private lastFrameTime = -1;
  private readonly periods: number[] = [];

  constructor() {
    const count = (time: number): void => {
      if (time !== this.lastFrameTime) {
        const period = time - this.lastFrameTime;
        // Only plausible display periods (a 20-200 Hz display) teach the
        // estimate: the gap after a stall, or the first frame, is not one.
        if (this.lastFrameTime >= 0 && period >= 5 && period <= 50) {
          this.periods.push(period);
          if (this.periods.length > 30) this.periods.shift();
        }
        this.frameIndex += this.lastFrameTime < 0 ? 0 : Math.max(1, Math.round(period / this.period()));
        this.lastFrameTime = time;
      }
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }

  /** @brief The number of the frame interval a moment falls in. */
  frameAt(time: number): number {
    return this.frameIndex + Math.floor((time - this.lastFrameTime) / this.period());
  }

  // period
  // The display's frame period: the median of recent periods, or 60 Hz's.
  private period(): number {
    if (this.periods.length === 0) return 1000 / 60;
    const sorted = [...this.periods].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)] ?? 1000 / 60;
  }
}

// installProbe
// One probe: stamps its kind of input, and closes each sample at the blit of
// the next run that draws.
//   kind      — what it measures
//   frames    — the shared frame counter
//   loop      — the edit loop whose runs draw the canvas
//   documents — whose first change after an input splits the wait
function installProbe(kind: InputKind, frames: FrameCounter, loop: EditLoop, documents: ProjectDocuments): InputProbe {
  const samples: InputSample[] = [];
  const names = ENTRIES[kind];
  let pending: number | undefined;
  let edited: number | undefined;
  let inputFrame = 0;

  // --- Step 1: Stamp the input the next drawn frame shows ---
  // A key is stamped as it arrives: the first since the last drawn frame, so a
  // key that waits is measured from when it was pressed. A drag is a stream:
  // a pointer reports several moves per frame, the pipeline draws only the
  // latest text (EDITOR-DESIGN §3.2), and what the user sees lag is the
  // pointer's latest position against the canvas. So a drag's sample is the
  // latest move that edited the text before the run, and a move that edits
  // nothing (its delta unchanged) has nothing to paint and is not one.
  let move: number | undefined;
  const stamp = (time: number): void => {
    pending = time > 0 ? time : performance.now();
    inputFrame = frames.frameAt(pending);
    performance.mark(names.input);
  };
  if (kind === 'key') {
    window.addEventListener(
      'keydown',
      (event) => {
        if (pending === undefined) stamp(event.timeStamp);
      },
      { capture: true },
    );
  } else {
    window.addEventListener(
      'pointermove',
      (event) => {
        move = (event.buttons & 1) !== 0 ? event.timeStamp : undefined;
      },
      { capture: true },
    );
  }

  // --- Step 2: Note when the input became an edit ---
  documents.onDidChangeContent(() => {
    if (kind === 'drag' && move !== undefined) {
      stamp(move);
      move = undefined;
      edited = undefined;
    }
    if (pending !== undefined && edited === undefined) {
      edited = performance.now();
      performance.mark(names.edit);
    }
  });

  // --- Step 3: Close the sample at the blit of the next run that draws ---
  loop.onFrame((timings: FrameTimings) => {
    if (pending === undefined || !timings.drawn) return;
    const end = performance.now();
    // Everything in the timings but these three is a stage duration.
    const { frameStart: _frameStart, runStart, drawn: _drawn, ...stages } = timings;
    void _frameStart;
    void _drawn;
    const edit = edited ?? runStart;
    samples.push({
      inputToBlit: end - pending,
      wait: runStart - pending,
      inputToEdit: edit - pending,
      editToFrame: runStart - edit,
      runToBlit: end - runStart,
      frames: frames.frameAt(end) - inputFrame,
      stages,
    });
    // Measured so it shows in a profile recorded meanwhile, then cleared with
    // the input's marks: the entry buffer would otherwise grow for the page's life.
    performance.measure(names.measure, { start: pending, end });
    performance.clearMarks(names.input);
    performance.clearMarks(names.edit);
    performance.clearMeasures(names.measure);
    if (samples.length > LIMIT) samples.shift();
    pending = undefined;
    edited = undefined;
  });

  return {
    samples,
    reset: () => {
      samples.length = 0;
      pending = undefined;
      edited = undefined;
    },
  };
}

/**
 * @brief Starts measuring input-to-blit for keys typed and drags on the canvas.
 *
 * @param loop      The edit loop whose runs draw the canvas.
 * @param documents The documents, whose first change after an input splits the wait.
 * @return Both probes, for the test hooks to publish.
 */
export function installInputProbes(loop: EditLoop, documents: ProjectDocuments): InputProbes {
  const frames = new FrameCounter();
  return { keys: installProbe('key', frames, loop, documents), drags: installProbe('drag', frames, loop, documents) };
}
