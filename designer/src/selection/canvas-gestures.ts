/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/selection/canvas-gestures.ts
 * Purpose: The canvas's selection gestures (ui_spec §8): click selects, repeated
 *          clicks cycle down through overlaps, a drag draws a marquee that
 *          selects what it touches, Esc clears. Pointer events arrive far
 *          faster than frames and must never pass through React, so this is a
 *          plain class the canvas panel attaches to its frame element.
 * Description: Pointer positions become device pixels through the frame
 *              canvas's on-screen box, so the answer is right at every zoom.
 *              A press that moves less than {@link MARQUEE_THRESHOLD} screen
 *              pixels before release is a click; one that moves further is a
 *              marquee, shown while it is dragged. Shift adds to the selection:
 *              a Shift-click toggles one element, a Shift-marquee adds what it
 *              touches. Hits come from the drawn frame's targets, so a click
 *              selects what the user sees.
 *
 *              Every gesture only selects. Nothing here writes text.
 *
 * Exports:
 * - MARQUEE_THRESHOLD:  Screen pixels a press must move to become a marquee
 * - MarqueeSink:        Where the marquee is shown while it is dragged
 * - CanvasGestures:     The gestures on one canvas
 *
 *     - dispose():        Remove the listeners
 */

import type { DrawnTargets } from '../pipeline/edit-loop';
import type { Observable } from '../state/observable';
import type { Rect } from '../pipeline/live-pipeline';
import { ClickCycler, marqueeHits } from './hit-test';
import type { SelectionModel } from './selection-model';

/**
 * Screen pixels a press must travel before it is a marquee rather than a click.
 * Screen pixels, not device pixels, so a click at 8× is not mistaken for a drag
 * by a hand that moved one device pixel's worth (ui_spec §8 measures its snap
 * threshold the same way).
 */
export const MARQUEE_THRESHOLD = 3;

/** Where the marquee is drawn while a drag is in progress; undefined hides it. */
export type MarqueeSink = (rect: Rect | undefined) => void;

/** A press in progress. */
interface Press {
  readonly pointer: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly shift: boolean;
  marquee: boolean;
}

/** The selection gestures on one canvas. */
export class CanvasGestures {
  private readonly element: HTMLElement;
  private readonly frame: HTMLCanvasElement;
  private readonly targets: Observable<DrawnTargets>;
  private readonly selection: SelectionModel;
  private readonly showMarquee: MarqueeSink;
  private readonly cycler = new ClickCycler();
  private press: Press | undefined;
  private readonly listeners: Array<[keyof HTMLElementEventMap, (event: never) => void]>;

  /**
   * @param element     The element that receives the pointer and key events;
   *                    it is made focusable so Esc reaches it.
   * @param frame       The frame canvas, whose on-screen box maps pointers to device pixels.
   * @param targets     The drawn frame's hit targets.
   * @param selection   The selection the gestures set.
   * @param showMarquee Draws the marquee while it is dragged.
   */
  constructor(
    element: HTMLElement,
    frame: HTMLCanvasElement,
    targets: Observable<DrawnTargets>,
    selection: SelectionModel,
    showMarquee: MarqueeSink,
  ) {
    this.element = element;
    this.frame = frame;
    this.targets = targets;
    this.selection = selection;
    this.showMarquee = showMarquee;
    element.tabIndex = 0;
    this.listeners = [
      ['pointerdown', (event: PointerEvent) => this.down(event)],
      ['pointermove', (event: PointerEvent) => this.move(event)],
      ['pointerup', (event: PointerEvent) => this.up(event)],
      ['pointercancel', () => this.cancel()],
      ['keydown', (event: KeyboardEvent) => this.key(event)],
    ];
    for (const [type, listener] of this.listeners) element.addEventListener(type, listener as EventListener);
  }

  /** @brief Removes every listener. */
  dispose(): void {
    for (const [type, listener] of this.listeners) this.element.removeEventListener(type, listener as EventListener);
    this.showMarquee(undefined);
  }

  // down
  // A press with the primary button starts a click or a marquee. The pointer is
  // captured so a marquee dragged off the canvas still ends here.
  private down(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.press = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, shift: event.shiftKey, marquee: false };
    this.element.setPointerCapture?.(event.pointerId);
    this.element.focus({ preventScroll: true });
  }

  // move
  // Past the threshold the press is a marquee; it is shown, never applied, until release.
  private move(event: PointerEvent): void {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointer) return;
    if (!press.marquee && Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) >= MARQUEE_THRESHOLD) {
      press.marquee = true;
    }
    if (press.marquee) this.showMarquee(this.area(press, event));
  }

  // up
  // The release applies the gesture: a marquee selects what it touches, a click
  // the next element down at that pixel.
  private up(event: PointerEvent): void {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointer) return;
    this.press = undefined;
    this.element.releasePointerCapture?.(event.pointerId);
    const { file, targets } = this.targets.get();
    if (file === undefined) return;

    // --- Step 1: A marquee selects what it touches; Shift adds it ---
    if (press.marquee) {
      this.showMarquee(undefined);
      this.cycler.reset();
      const names = marqueeHits(targets, this.area(press, event));
      this.selection.select(file, press.shift ? [...this.current(file), ...names] : names, 'canvas');
      return;
    }
    // --- Step 2: A click names the next element down at its pixel ---
    const { x, y } = this.toDevice(event.clientX, event.clientY);
    const name = this.cycler.click(targets, x, y);

    // --- Step 3: Shift toggles it in the selection; a plain click replaces it ---
    if (press.shift) {
      const current = this.current(file);
      if (name !== undefined) {
        this.selection.select(file, current.includes(name) ? current.filter((n) => n !== name) : [...current, name], 'canvas');
      }
    } else if (name === undefined) {
      this.selection.clear();
    } else {
      this.selection.select(file, [name], 'canvas');
    }
  }

  // cancel
  // The browser took the pointer (a touch scroll, say): nothing is applied.
  private cancel(): void {
    this.press = undefined;
    this.showMarquee(undefined);
  }

  // key
  // Esc clears the selection, and any marquee in progress.
  private key(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.cancel();
    this.cycler.reset();
    this.selection.clear();
  }

  // current
  // The selected names, if they are in `file`; Shift adds only within one file.
  private current(file: string): readonly string[] {
    const selection = this.selection.current.get();
    return selection.file === file ? selection.names : [];
  }

  // area
  // The device pixels between a press and the pointer now, both included.
  private area(press: Press, event: PointerEvent): Rect {
    const a = this.toDevice(press.clientX, press.clientY);
    const b = this.toDevice(event.clientX, event.clientY);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
  }

  // toDevice
  // The device pixel under a client position, from the frame canvas's
  // on-screen box: right at any zoom, and negative or past the edge outside it.
  private toDevice(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.frame.getBoundingClientRect();
    const scaleX = box.width / (this.frame.width || 1);
    const scaleY = box.height / (this.frame.height || 1);
    return { x: Math.floor((clientX - box.left) / scaleX), y: Math.floor((clientY - box.top) / scaleY) };
  }
}
