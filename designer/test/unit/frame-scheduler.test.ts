/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/frame-scheduler.test.ts
 * Purpose: The edit loop's one scheduling rule: however
 *          many requests arrive, at most one run per animation frame, on the
 *          next frame, and none lost.
 * Description: A hand-cranked frame source stands in for requestAnimationFrame.
 */

import { expect, test } from '@playwright/test';
import { FrameScheduler, type FrameSource } from '../../src/pipeline/frame-scheduler';

// manualFrames
// A frame source whose frames happen only when the test calls `frame()`.
function manualFrames(): FrameSource & { frame(time?: number): void; readonly booked: number } {
  let next = 1;
  const callbacks = new Map<number, (time: number) => void>();
  return {
    request(callback) {
      const handle = next++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      callbacks.delete(handle);
    },
    frame(time = 0) {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback(time);
    },
    get booked() {
      return callbacks.size;
    },
  };
}

test('many requests before a frame make one run, on that frame', () => {
  const frames = manualFrames();
  const runs: number[] = [];
  const scheduler = new FrameScheduler((time) => runs.push(time), frames);
  for (let i = 0; i < 50; i++) scheduler.request();
  expect(runs).toEqual([]);
  expect(frames.booked).toBe(1);
  expect(scheduler.pending).toBe(true);
  frames.frame(16);
  expect(runs).toEqual([16]);
  expect(scheduler.pending).toBe(false);
  frames.frame(32);
  expect(runs).toEqual([16]);
});

test('a request in a later frame runs in the frame after it', () => {
  const frames = manualFrames();
  let runs = 0;
  const scheduler = new FrameScheduler(() => runs++, frames);
  scheduler.request();
  frames.frame();
  scheduler.request();
  scheduler.request();
  frames.frame();
  expect(runs).toBe(2);
  expect(scheduler.runs).toBe(2);
});

test('a request made during a run books the next frame rather than being lost', () => {
  const frames = manualFrames();
  let runs = 0;
  let again = true;
  const scheduler: FrameScheduler = new FrameScheduler(() => {
    runs++;
    if (again) {
      again = false;
      scheduler.request();
    }
  }, frames);
  scheduler.request();
  frames.frame();
  expect(runs).toBe(1);
  expect(scheduler.pending).toBe(true);
  frames.frame();
  expect(runs).toBe(2);
});

test('dispose cancels a booked frame and ignores later requests', () => {
  const frames = manualFrames();
  let runs = 0;
  const scheduler = new FrameScheduler(() => runs++, frames);
  scheduler.request();
  scheduler.dispose();
  expect(frames.booked).toBe(0);
  scheduler.request();
  frames.frame();
  expect(runs).toBe(0);
});
