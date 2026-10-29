/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/selection/canvas-gestures.ts
 * Purpose: The canvas's gestures (ui_spec §8): which gesture a press starts,
 *          and what each one does. A press on a handle resizes; on an element
 *          it moves; on empty canvas it draws a marquee; a click selects,
 *          repeated clicks cycle down through overlaps, Esc clears, and the
 *          arrow keys nudge the selection. Pointer events arrive far faster
 *          than frames and must never pass through React, so this is a plain
 *          class the canvas panel attaches to its frame element.
 * Description: Gesture ownership, decided at pointer-down:
 *              - on a selected element's handle: a **resize** by that handle
 *                (Shift keeps the ratio);
 *              - with Shift elsewhere: a toggle on click and an adding marquee
 *                on drag; Shift never moves;
 *              - on an element that is selected, or in a stack that holds a
 *                selected element: a **move** of the selection;
 *              - on an unselected element: it is selected (the click cycle's
 *                next element there), and the press moves it;
 *              - on empty canvas: a **marquee**.
 *              A press is a click until it travels {@link MARQUEE_THRESHOLD}
 *              screen pixels; a click on a selected element cycles the
 *              selection down the stack, as plain clicks do.
 *
 *              A move or a resize is a {@link DragEdit}: snapped to guides,
 *              rounded to integers and written through the edit path as one
 *              undo stop. The guides it lies on are drawn on the overlay, and
 *              an axis that refuses (an expression, a binding) says why in a
 *              tip at the pointer while the other axis still follows. Arrow
 *              keys nudge (1 px, Shift 8 px), grouped by the editor. While the
 *              document is not well-formed (`canvasEditing` false, §3.8)
 *              nothing writes: the press still selects, and the cursor and the
 *              tip say why.
 *
 *              Pointer positions become device pixels through the frame
 *              canvas's on-screen box, so the answer is right at every zoom.
 *
 * Exports:
 * - MARQUEE_THRESHOLD:   Screen pixels a press must move to become a drag
 * - EDITING_OFF_REASON:  What the cursor's tip says while editing is off
 * - MarqueeSink:         Where the marquee is shown while it is dragged
 * - GestureHost:         What the gestures read and write
 * - CanvasGestures:      The gestures on one canvas
 *
 *     - dispose():          Remove the listeners
 */

import { parseCst } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { HANDLE_SIZE, type GuideLine } from '../canvas/canvas-view';
import type { CanvasEditor } from '../editing/canvas-editor';
import { DragEdit } from '../editing/drag-edit';
import { signalDragMove } from '../perf/drag-stamp';
import { moveEdits, planMove, refusals, type MovePlan } from '../editing/placement-rules';
import type { Handle } from '../editing/resize-rules';
import type { DrawnTargets } from '../pipeline/edit-loop';
import type { Rect } from '../pipeline/live-pipeline';
import type { Observable } from '../state/observable';
import { ClickCycler, hitsAt, marqueeHits } from './hit-test';
import type { SelectionModel } from './selection-model';

/**
 * Screen pixels a press must travel before it is a drag rather than a click.
 * Screen pixels, not device pixels, so a click at 8× is not mistaken for a drag
 * by a hand that moved one device pixel's worth (ui_spec §8 measures its snap
 * threshold the same way).
 */
export const MARQUEE_THRESHOLD = 3;

/** The tip at the cursor while canvas editing is off (EDITOR-DESIGN §3.8). */
export const EDITING_OFF_REASON = 'Canvas editing is off: the XML is not well-formed';

/** Where the marquee is drawn while a drag is in progress; undefined hides it. */
export type MarqueeSink = (rect: Rect | undefined) => void;

/** What the gestures read and write, all owned elsewhere. */
export interface GestureHost {
  /** The element that receives the pointer and key events; made focusable so keys reach it. */
  readonly element: HTMLElement;
  /** The frame canvas, whose on-screen box maps pointers to device pixels. */
  readonly frame: HTMLCanvasElement;
  /** The drawn frame's hit targets. */
  readonly targets: Observable<DrawnTargets>;
  /** The drawn elements' rectangles by name. */
  readonly bounds: Observable<ReadonlyMap<string, Rect>>;
  /** The drawn elements' placements by name, as of the frame on the canvas. */
  readonly placements: () => ReadonlyMap<string, Placement>;
  /** The display's size, for its guides. */
  readonly display: () => { readonly width: number; readonly height: number } | undefined;
  /** Whether the canvas may write the text (false while it is not well-formed). */
  readonly canvasEditing: Observable<boolean>;
  /** The selection the gestures set and move. */
  readonly selection: SelectionModel;
  /** The edit path every write goes through. */
  readonly editor: CanvasEditor;
  /** Draws the marquee while it is dragged. */
  readonly showMarquee: MarqueeSink;
  /** Draws the guides a drag lies on; empty hides them. */
  readonly showGuides: (lines: readonly GuideLine[]) => void;
}

/** What a press does if it becomes a drag, decided at pointer-down. */
type Owner = { readonly kind: 'move' } | { readonly kind: 'marquee' } | { readonly kind: 'resize'; readonly name: string; readonly handle: Handle };

/** A press in progress. */
interface Press {
  readonly pointer: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly shift: boolean;
  readonly owner: Owner;
  /** The file the press's names are in. */
  readonly file: string | undefined;
  /** True when a release without a drag should run the click cycle (the press selected nothing itself). */
  readonly clickOnRelease: boolean;
  /** Past the threshold: a drag. */
  dragging: boolean;
  /** The move or resize, once the drag has begun. */
  drag: DragEdit | undefined;
}

/** Arrow keys and the delta each nudges by, in device pixels, before Shift's ×8. */
const NUDGES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Shift's nudge: one 8-pixel tile (ui_spec §8). */
const SHIFT_NUDGE = 8;

/** Screen pixels around a handle's square that still grab it. */
const HANDLE_SLOP = 2;

/** The eight handles: each one's place along the box (0, ½, 1) and the edges it moves. */
const HANDLES: readonly { readonly fx: number; readonly fy: number; readonly handle: Handle; readonly cursor: string }[] = [
  { fx: 0, fy: 0, handle: { horizontal: 'start', vertical: 'start' }, cursor: 'nwse-resize' },
  { fx: 0.5, fy: 0, handle: { horizontal: undefined, vertical: 'start' }, cursor: 'ns-resize' },
  { fx: 1, fy: 0, handle: { horizontal: 'end', vertical: 'start' }, cursor: 'nesw-resize' },
  { fx: 1, fy: 0.5, handle: { horizontal: 'end', vertical: undefined }, cursor: 'ew-resize' },
  { fx: 1, fy: 1, handle: { horizontal: 'end', vertical: 'end' }, cursor: 'nwse-resize' },
  { fx: 0.5, fy: 1, handle: { horizontal: undefined, vertical: 'end' }, cursor: 'ns-resize' },
  { fx: 0, fy: 1, handle: { horizontal: 'start', vertical: 'end' }, cursor: 'nesw-resize' },
  { fx: 0, fy: 0.5, handle: { horizontal: 'start', vertical: undefined }, cursor: 'ew-resize' },
];

/** The gestures on one canvas. */
export class CanvasGestures {
  private readonly host: GestureHost;
  private readonly cycler = new ClickCycler();
  private readonly tip: HTMLDivElement;
  private press: Press | undefined;
  private readonly listeners: Array<[keyof HTMLElementEventMap, (event: never) => void]>;

  /** @param host What the gestures read and write. */
  constructor(host: GestureHost) {
    this.host = host;
    host.element.tabIndex = 0;
    this.tip = document.createElement('div');
    this.tip.className = 'canvas-tip';
    this.tip.hidden = true;
    host.element.append(this.tip);
    this.listeners = [
      ['pointerdown', (event: PointerEvent) => this.down(event)],
      ['pointermove', (event: PointerEvent) => this.move(event)],
      ['pointerup', (event: PointerEvent) => this.up(event)],
      ['pointercancel', () => this.cancel()],
      ['pointerleave', () => this.hover(undefined)],
      ['keydown', (event: KeyboardEvent) => this.key(event)],
      ['blur', () => host.editor.closeGroup()],
    ];
    for (const [type, listener] of this.listeners) host.element.addEventListener(type, listener as EventListener);
  }

  /** @brief Removes every listener and the tip, and ends any gesture. */
  dispose(): void {
    for (const [type, listener] of this.listeners) this.host.element.removeEventListener(type, listener as EventListener);
    this.cancel();
    this.tip.remove();
  }

  // down
  // A press with the primary button: decide which gesture it owns.
  // The pointer is captured so a drag off the canvas still ends here.
  private down(event: PointerEvent): void {
    if (event.button !== 0) return;
    const { file, targets } = this.host.targets.get();
    const { x, y } = this.toDevice(event.clientX, event.clientY);

    // --- Step 1: A selected element's handle resizes, Shift or not ---
    let owner: Owner = { kind: 'marquee' };
    let clickOnRelease = true;
    const handle = file === undefined ? undefined : this.handleAt(file, event.clientX, event.clientY);
    if (handle !== undefined) {
      owner = { kind: 'resize', name: handle.name, handle: handle.handle };
      clickOnRelease = false;
    } else if (!event.shiftKey && file !== undefined) {
      // --- Step 2: An element moves; an unselected one is selected first ---
      const stack = hitsAt(targets, x, y);
      if (stack.length > 0) {
        owner = { kind: 'move' };
        const selected = this.current(file);
        if (!stack.some((name) => selected.includes(name))) {
          const name = this.cycler.click(targets, x, y);
          if (name !== undefined) this.host.selection.select(file, [name], 'canvas');
          clickOnRelease = false;
        }
      }
    }

    // --- Step 3: Record the press (a marquee or a toggle is decided on release) and capture the pointer ---
    this.press = {
      pointer: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      shift: event.shiftKey,
      owner,
      file,
      clickOnRelease,
      dragging: false,
      drag: undefined,
    };
    this.host.element.setPointerCapture?.(event.pointerId);
    this.host.element.focus({ preventScroll: true });
  }

  // move
  // Past the threshold the press is a drag: a marquee is shown, a move or a
  // resize writes. With no press, the cursor says what a press here would do.
  private move(event: PointerEvent): void {
    const press = this.press;
    if (press === undefined) {
      this.hover(event);
      return;
    }
    if (event.pointerId !== press.pointer) return;
    if (!press.dragging && Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) >= MARQUEE_THRESHOLD) {
      press.dragging = true;
    }
    if (!press.dragging) return;
    if (press.owner.kind === 'marquee') {
      this.host.showMarquee(this.area(press, event));
      return;
    }
    this.drag(press, event);
  }

  // drag
  // One pointer event of a move or a resize: written through its DragEdit,
  // which writes only when the integer delta changes.
  //   press — the drag
  //   event — the pointer now
  private drag(press: Press, event: PointerEvent): void {
    // --- Step 1: Editing off — nothing writes, and the tip says why ---
    const file = press.file;
    if (!this.host.canvasEditing.get() || file === undefined) {
      this.host.element.style.cursor = 'not-allowed';
      this.showTip(EDITING_OFF_REASON, event);
      return;
    }

    // --- Step 2: The drag begins with what is drawn now ---
    const owner = press.owner;
    if (press.drag === undefined) {
      press.drag = new DragEdit(
        this.host.editor,
        { file, names: this.current(file), bounds: this.host.bounds.get(), placements: this.host.placements(), display: this.host.display() },
        owner.kind === 'resize' ? owner : { kind: 'move' },
      );
    }

    // --- Step 3: The pointer's delta, unrounded, in device pixels ---
    const scale = this.scale();
    const frame = press.drag.to((event.clientX - press.clientX) / scale.x, (event.clientY - press.clientY) / scale.y, scale.x, event.shiftKey);
    // Processed, whether it wrote or the element was already there: the drag
    // probe of the test build measures a frame from the latest such move.
    signalDragMove(event.timeStamp);

    // --- Step 4: The guides it lies on, and why an axis does not follow ---
    this.host.showGuides(frame.guides);
    this.showTip(frame.refusals.length === 0 ? undefined : frame.refusals.join('; '), event);
  }

  // up
  // The release ends the gesture: a drag's undo stop closes; a marquee
  // selects what it touches; a click runs the click cycle.
  private up(event: PointerEvent): void {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointer) return;
    this.press = undefined;
    this.host.element.releasePointerCapture?.(event.pointerId);
    this.showTip(undefined, event);
    this.host.showGuides([]);
    const { file, targets } = this.host.targets.get();

    // --- Step 1: A move or a resize: close its one undo stop ---
    if (press.owner.kind !== 'marquee' && press.dragging) {
      press.drag?.end();
      return;
    }
    if (file === undefined) return;

    // --- Step 2: A marquee selects what it touches; Shift adds it ---
    if (press.dragging) {
      this.host.showMarquee(undefined);
      this.cycler.reset();
      const names = marqueeHits(targets, this.area(press, event));
      this.host.selection.select(file, press.shift ? [...this.current(file), ...names] : names, 'canvas');
      return;
    }
    if (!press.clickOnRelease) return;

    // --- Step 3: A click names the next element down at its pixel ---
    const { x, y } = this.toDevice(event.clientX, event.clientY);
    const name = this.cycler.click(targets, x, y);

    // --- Step 4: Shift toggles it in the selection; a plain click replaces it ---
    if (press.shift) {
      const current = this.current(file);
      if (name !== undefined) {
        this.host.selection.select(file, current.includes(name) ? current.filter((n) => n !== name) : [...current, name], 'canvas');
      }
    } else if (name === undefined) {
      this.host.selection.clear();
    } else {
      this.host.selection.select(file, [name], 'canvas');
    }
  }

  // cancel
  // The browser took the pointer (a touch scroll, say): a drag keeps what it
  // wrote, as one stop the user can undo; a marquee is dropped.
  private cancel(): void {
    this.press?.drag?.end();
    this.press = undefined;
    this.host.showMarquee(undefined);
    this.host.showGuides([]);
    this.tip.hidden = true;
  }

  // key
  // Esc clears the selection, and any marquee in progress; an arrow nudges it.
  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      this.cycler.reset();
      this.host.selection.clear();
      return;
    }
    const step = NUDGES[event.key];
    if (step === undefined || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    const factor = event.shiftKey ? SHIFT_NUDGE : 1;
    this.nudge(step[0] * factor, step[1] * factor);
  }

  // nudge
  // Moves the selection by (dx, dy) device pixels from where the text has it
  // now, through the editor, which groups nudges into undo stops.
  //   dx, dy — the step
  private nudge(dx: number, dy: number): void {
    const { file, names } = this.host.selection.current.get();
    if (file === undefined || names.length === 0 || this.press !== undefined) return;
    if (!this.host.canvasEditing.get()) {
      this.host.element.title = EDITING_OFF_REASON;
      return;
    }
    let reasons: string[] = [];
    const placements = this.host.placements();
    this.host.editor.nudge(file, names.join('\n'), (text) => {
      const cst = parseCst(text, file).cst;
      const plans = names.map((name) => planMove(cst, name, placements.get(name))).filter((plan): plan is MovePlan => plan !== undefined);
      reasons = refusals(plans, dx, dy);
      return moveEdits(cst, plans, dx, dy);
    });
    // No pointer to put a tip at: the canvas's title says why an axis did not move.
    this.host.element.title = reasons.join('; ');
  }

  // hover
  // With no press, the cursor says what a press here would do: resize over a
  // handle, move over an element, and not-allowed (with the reason as its
  // title) while editing is off.
  //   event — the pointer, or undefined when it left the canvas
  private hover(event: PointerEvent | undefined): void {
    let cursor = '';
    let title = '';
    if (event !== undefined) {
      const { file, targets } = this.host.targets.get();
      const handle = file === undefined ? undefined : this.handleAt(file, event.clientX, event.clientY);
      const { x, y } = this.toDevice(event.clientX, event.clientY);
      const editing = this.host.canvasEditing.get();
      if (handle !== undefined || hitsAt(targets, x, y).length > 0) {
        cursor = !editing ? 'not-allowed' : (handle?.cursor ?? 'move');
        title = editing ? '' : EDITING_OFF_REASON;
      }
    }
    if (this.host.element.style.cursor !== cursor) this.host.element.style.cursor = cursor;
    if (this.host.element.title !== title) this.host.element.title = title;
  }

  // handleAt
  // The selected element's handle under a client position, if any: the
  // squares the overlay draws, in screen pixels, with a little slop.
  //   file             — the drawn screen's file
  //   clientX, clientY — the pointer
  private handleAt(file: string, clientX: number, clientY: number): { name: string; handle: Handle; cursor: string } | undefined {
    const names = this.current(file);
    if (names.length === 0) return undefined;
    const box = this.host.frame.getBoundingClientRect();
    const scale = this.scale();
    const px = clientX - box.left;
    const py = clientY - box.top;
    const reach = HANDLE_SIZE / 2 + HANDLE_SLOP;
    const bounds = this.host.bounds.get();
    for (let i = names.length - 1; i >= 0; i--) {
      const name = names[i];
      const rect = name === undefined ? undefined : bounds.get(name);
      if (name === undefined || rect === undefined) continue;
      // The outline's box: one screen pixel outside the element (canvas-view.ts).
      const left = rect.x * scale.x - 1;
      const top = rect.y * scale.y - 1;
      const width = rect.width * scale.x + 2;
      const height = rect.height * scale.y + 2;
      for (const { fx, fy, handle, cursor } of HANDLES) {
        if (Math.abs(px - (left + fx * width)) <= reach && Math.abs(py - (top + fy * height)) <= reach) return { name, handle, cursor };
      }
    }
    return undefined;
  }

  // showTip
  // Shows a sentence beside the pointer, or hides it (undefined).
  //   text  — what to say
  //   event — where the pointer is
  private showTip(text: string | undefined, event: PointerEvent): void {
    if (text === undefined) {
      if (!this.tip.hidden) this.tip.hidden = true;
      return;
    }
    const box = this.host.element.getBoundingClientRect();
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.style.left = `${Math.round(event.clientX - box.left + 14)}px`;
    this.tip.style.top = `${Math.round(event.clientY - box.top + 14)}px`;
    this.tip.hidden = false;
  }

  // current
  // The selected names, if they are in `file`; Shift adds only within one file.
  private current(file: string): readonly string[] {
    const selection = this.host.selection.current.get();
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

  // scale
  // Screen pixels per device pixel, from the frame canvas's on-screen box.
  private scale(): { x: number; y: number } {
    const frame = this.host.frame;
    const box = frame.getBoundingClientRect();
    return { x: box.width / (frame.width || 1) || 1, y: box.height / (frame.height || 1) || 1 };
  }

  // toDevice
  // The device pixel under a client position: right at any zoom, and negative
  // or past the edge outside the frame.
  private toDevice(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.host.frame.getBoundingClientRect();
    const scale = this.scale();
    return { x: Math.floor((clientX - box.left) / scale.x), y: Math.floor((clientY - box.top) / scale.y) };
  }
}
