/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/drag-edit.ts
 * Purpose: One drag of the selection or of a handle, from the pointer's delta
 *          to the text: snapped to guides, rounded to integers, clamped so a
 *          resize never collapses its element, planned by the placement rules
 *          and written through one {@link EditGesture} — one undo stop. The
 *          canvas gestures decide that a drag happens; this decides what it
 *          writes, so that can be tested without a pointer.
 * Description: Everything a drag depends on is taken when it begins: the
 *              rectangles drawn then (the box being dragged and the guides of
 *              everything else), the placements, and — at its first write —
 *              the plans, from the text then. Each `to()` turns the pointer's
 *              unrounded device delta into an integer delta per axis
 *              (`snapping.ts`), and writes only when that differs from the last
 *              one written, so the many pointer events of one frame cost one
 *              edit. A resize with Shift keeps the box's ratio: the axis that
 *              changed more leads, and the other follows; a side handle grows
 *              the other axis from its end edge.
 *
 *              An Alt-drag duplicates: its first write inserts a copy of each
 *              selected element after it (`structure-edits.ts`), and every
 *              write then moves the copies, planned from their originals'
 *              attributes, which they share — so the originals stay, a copy's
 *              axis refuses where its original's would, and the whole gesture,
 *              copies and moves, is the one undo stop.
 *
 *              A resize is planned by `planHandleResize()`, which writes a box's
 *              attributes as before and scales a line's or triangle's points,
 *              or changes a circle's or ellipse's radii, as its box's edge
 *              moves (`shape-resize-rules.ts`). A vertex drag moves one point
 *              of a line or triangle, snapped as a move is, by a box one pixel
 *              square at the vertex. An end drag moves one end of a span, an
 *              hline or a vline (`line-ends.ts`): a resize by that edge of its
 *              own axis alone, snapped and clamped as a resize is, and never
 *              given Shift's ratio, since a line has no other axis to keep.
 *
 * Exports:
 * - DragKind:       A move of the selection, a resize by one handle, one vertex, or one end
 * - DragFrame:      What one pointer position shows: guides and refusals
 * - DragStart:      What a drag reads when it begins
 * - DragEdit:       One drag
 *
 *     - to():         Write the drag at a pointer delta
 *     - copies():     A duplicate's copies' names, once written
 *     - end():        Close its undo stop
 */

import { parseCst, type CstDocument } from '@u8g2gl/core/cst/index.js';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import type { GuideLine } from '../canvas/canvas-view';
import type { Rect } from '../pipeline/live-pipeline';
import type { CanvasEditor, EditGesture } from './canvas-editor';
import { moveEdits, planMove, refusals, type MovePlan } from './placement-rules';
import { lineShape, planLineEnd } from './line-ends';
import { clampResize, type Edge, type Handle } from './resize-rules';
import { planHandleResize, planVertex, resizeEdits, resizeRefusals, vertexPoints, type ResizePlan } from './shape-resize-rules';
import { guidesFor, snapAxis, type Guides } from './snapping';
import { duplicateEdits } from './structure-edits';

/**
 * What is dragged: the selection; a copy of it (an Alt-drag), given the names
 * the project already uses; one element's handle; one vertex of a line or
 * triangle, by its index in `vertexPoints()` order; or one end of a span (an
 * hline or vline), `start` or `end` along its axis.
 */
export type DragKind =
  | { readonly kind: 'move' }
  | { readonly kind: 'duplicate'; readonly taken: () => ReadonlySet<string> }
  | { readonly kind: 'resize'; readonly name: string; readonly handle: Handle }
  | { readonly kind: 'vertex'; readonly name: string; readonly index: number }
  | { readonly kind: 'end'; readonly name: string; readonly end: 'start' | 'end' };

/** What one pointer position shows besides the text: the guides it lies on and why an axis does not follow. */
export interface DragFrame {
  readonly guides: readonly GuideLine[];
  readonly refusals: readonly string[];
}

/** Everything a drag reads when it begins. */
export interface DragStart {
  /** The document the selection is in. */
  readonly file: string;
  /** The selected names; a resize's element is one of them. */
  readonly names: readonly string[];
  /** The drawn rectangles by name. */
  readonly bounds: ReadonlyMap<string, Rect>;
  /** The drawn elements' placements by name. */
  readonly placements: ReadonlyMap<string, Placement>;
  /** The display's size, for its edge and centre guides. */
  readonly display: { readonly width: number; readonly height: number } | undefined;
}

/** No guides and no refusals: a frame that shows nothing extra. */
const NOTHING: DragFrame = { guides: [], refusals: [] };

// union
// The box around every one of `rects`; undefined for none.
function union(rects: readonly Rect[]): Rect | undefined {
  const [first, ...rest] = rects;
  if (first === undefined) return undefined;
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const rect of rest) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// edgeLines
// The lines of `box` on one axis that a drag offers to the guides: all three
// for a move, the moving edge alone for a resize, none for an axis it leaves.
//   start, size — the box's start and size on the axis
//   edge        — 'move', or the resize's edge on this axis
function edgeLines(start: number, size: number, edge: 'move' | Edge): number[] {
  if (edge === 'move') return [start, start + size / 2, start + size];
  if (edge === 'start') return [start];
  if (edge === 'end') return [start + size];
  return [];
}

/** One drag: from pointer deltas to edits, as one undo stop. */
export class DragEdit {
  private readonly editor: CanvasEditor;
  private readonly start: DragStart;
  private readonly kind: DragKind;
  /** The box dragged: the selection's, or the resized element's. */
  private readonly box: Rect | undefined;
  private readonly guides: Guides;
  private gesture: EditGesture | undefined;
  private plans: readonly MovePlan[] | undefined;
  /** A resize's plan, once its first write made it. */
  private resize: ResizePlan | undefined;
  /** A duplicate's copies by original name, once its first write made them. */
  private copied: ReadonlyMap<string, string> | undefined;
  private written: { dx: number; dy: number } | undefined;
  private frame: DragFrame = NOTHING;

  /**
   * @param editor The edit path.
   * @param start  What the drag reads when it begins.
   * @param kind   A move, or a resize by a handle.
   */
  constructor(editor: CanvasEditor, start: DragStart, kind: DragKind) {
    this.editor = editor;
    this.start = start;
    this.kind = kind;
    const dragged = kind.kind === 'resize' || kind.kind === 'vertex' || kind.kind === 'end' ? [kind.name] : start.names;
    if (kind.kind === 'vertex') {
      // A vertex snaps as a move of a one-pixel box at the vertex.
      const vertex = vertexPoints(start.placements.get(kind.name))[kind.index];
      this.box = vertex === undefined ? undefined : { x: vertex.x, y: vertex.y, width: 1, height: 1 };
    } else {
      this.box = union(dragged.map((name) => start.bounds.get(name)).filter((rect): rect is Rect => rect !== undefined));
    }
    this.guides = guidesFor(start.bounds, dragged, start.display);
  }

  /**
   * @brief Writes the drag at a pointer delta.
   *
   * @param rawX, rawY The pointer's delta since the press, in device pixels, unrounded.
   * @param zoom       Screen pixels per device pixel, for the snap threshold.
   * @param shift      Shift held: a resize keeps its ratio.
   * @return The guides and refusals to show for this position.
   */
  to(rawX: number, rawY: number, zoom: number, shift: boolean): DragFrame {
    // --- Step 1: Integer deltas, snapped, and the guides they lie on ---
    const { dx, dy, guides } = this.deltas(rawX, rawY, zoom, shift);
    if (this.written !== undefined && this.written.dx === dx && this.written.dy === dy) return this.frame;

    // --- Step 2: The first write opens the undo stop (and makes a duplicate's copies) and plans the drag ---
    this.gesture ??= this.editor.begin(this.start.file);
    const kind = this.kind;
    if (kind.kind === 'duplicate' && this.copied === undefined) {
      this.gesture?.update((text) => {
        const duplication = duplicateEdits(parseCst(text, this.start.file).cst, this.start.names, new Set(kind.taken()));
        this.copied = duplication.copies;
        return duplication.edits;
      });
    }
    this.gesture?.update((text) => {
      const cst = parseCst(text, this.start.file).cst;
      if (kind.kind === 'resize') {
        this.resize ??= this.planResize(cst, kind.name, kind.handle);
        return this.resize === undefined ? [] : resizeEdits(cst, this.resize, dx, dy);
      }
      if (kind.kind === 'end') {
        if (this.resize === undefined) {
          const plan = planLineEnd(cst, kind.name, kind.end, this.start.placements.get(kind.name));
          this.resize = plan === undefined ? undefined : { kind: 'box', plan };
        }
        return this.resize === undefined ? [] : resizeEdits(cst, this.resize, dx, dy);
      }
      this.plans ??= this.plan(cst);
      return moveEdits(cst, this.plans, dx, dy);
    });
    this.written = { dx, dy };

    // --- Step 3: What the canvas shows beside the text ---
    const reasons = this.resize !== undefined ? resizeRefusals(this.resize, dx, dy) : refusals(this.plans ?? [], dx, dy);
    this.frame = { guides, refusals: reasons };
    return this.frame;
  }

  /** @brief A duplicate's copies' names, in the selection's document order; empty until written, or for a move or resize. */
  copies(): string[] {
    return [...(this.copied?.values() ?? [])];
  }

  /** @brief Closes the drag's undo stop. */
  end(): void {
    this.gesture?.end();
  }

  // deltas
  // The integer delta per axis for a pointer delta: snapped to the nearest
  // guide in reach, a resize's clamped to keep its element, and with Shift
  // its ratio kept.
  private deltas(rawX: number, rawY: number, zoom: number, shift: boolean): { dx: number; dy: number; guides: GuideLine[] } {
    const box = this.box;
    if (box === undefined) return { dx: Math.round(rawX), dy: Math.round(rawY), guides: [] };
    const kind = this.kind;

    // --- Step 1: An end of a span: its own axis's edge, snapped and clamped; the other axis stays ---
    if (kind.kind === 'end') return this.endDeltas(box, kind.name, kind.end, rawX, rawY, zoom);

    // --- Step 2: A move, a duplicate or a vertex: each axis snapped on its own, and that is all ---
    if (kind.kind !== 'resize') {
      const x = snapAxis(edgeLines(box.x, box.width, 'move'), rawX, this.guides.vertical, zoom);
      const y = snapAxis(edgeLines(box.y, box.height, 'move'), rawY, this.guides.horizontal, zoom);
      return { dx: x.delta, dy: y.delta, guides: lines(x.lines, y.lines) };
    }

    // --- Step 3: A resize: the moving edges snapped, then kept at least a pixel ---
    const edgeX = kind.handle.horizontal;
    const edgeY = kind.handle.vertical;
    const x = snapAxis(edgeLines(box.x, box.width, edgeX), rawX, this.guides.vertical, zoom);
    const y = snapAxis(edgeLines(box.y, box.height, edgeY), rawY, this.guides.horizontal, zoom);
    let dx = edgeX === undefined ? 0 : x.delta;
    let dy = edgeY === undefined ? 0 : y.delta;
    dx = clampResize(dx, edgeX, box.width);
    dy = clampResize(dy, edgeY, box.height);
    // A clamped edge no longer lies on the guide it snapped to.
    if (!shift) return { dx, dy, guides: lines(edgeX !== undefined && dx === x.delta ? x.lines : [], edgeY !== undefined && dy === y.delta ? y.lines : []) };

    // --- Step 4: With Shift, the axis that changed more leads and the other follows ---
    const grow = (delta: number, edge: Edge): number => (edge === 'start' ? -delta : edge === 'end' ? delta : 0);
    let width = box.width + grow(dx, edgeX);
    let height = box.height + grow(dy, edgeY);
    const leadsX = edgeY === undefined || (edgeX !== undefined && Math.abs(width / box.width - 1) >= Math.abs(height / box.height - 1));
    if (leadsX) height = Math.max(1, Math.round((width * box.height) / box.width));
    else width = Math.max(1, Math.round((height * box.width) / box.height));
    // A side handle grows the other axis from its end edge.
    const ratioX: Edge = edgeX ?? 'end';
    const ratioY: Edge = edgeY ?? 'end';
    dx = ratioX === 'start' ? box.width - width : width - box.width;
    dy = ratioY === 'start' ? box.height - height : height - box.height;
    return { dx, dy, guides: [] };
  }

  // endDeltas
  // An end drag's delta: the end's edge on the span's own axis, snapped to a
  // guide and clamped so the span keeps at least one pixel, which also keeps
  // the end from passing the other one. The other axis is always 0.
  //   box        — the span's drawn box
  //   name, end  — the span and the end dragged
  //   rawX, rawY — the pointer's delta; zoom — for the snap threshold
  private endDeltas(box: Rect, name: string, end: 'start' | 'end', rawX: number, rawY: number, zoom: number): { dx: number; dy: number; guides: GuideLine[] } {
    const shape = lineShape(this.start.placements.get(name));
    if (shape?.kind !== 'span') return { dx: 0, dy: 0, guides: [] };
    if (shape.axis === 'horizontal') {
      const x = snapAxis(edgeLines(box.x, box.width, end), rawX, this.guides.vertical, zoom);
      const dx = clampResize(x.delta, end, box.width);
      return { dx, dy: 0, guides: lines(dx === x.delta ? x.lines : [], []) };
    }
    const y = snapAxis(edgeLines(box.y, box.height, end), rawY, this.guides.horizontal, zoom);
    const dy = clampResize(y.delta, end, box.height);
    return { dx: 0, dy, guides: lines([], dy === y.delta ? y.lines : []) };
  }

  // plan
  // A move's, a duplicate's or a vertex's plans from the text it starts from
  // (a duplicate's, from the text with its copies).
  private plan(cst: CstDocument): MovePlan[] {
    const placements = this.start.placements;
    const kind = this.kind;
    if (kind.kind === 'move') {
      return this.start.names.map((name) => planMove(cst, name, placements.get(name))).filter((plan): plan is MovePlan => plan !== undefined);
    }
    if (kind.kind === 'duplicate') {
      // A copy is not drawn yet; it shares its original's attributes, so its
      // original's placement says where a default puts it.
      return [...(this.copied ?? new Map<string, string>())]
        .map(([original, copy]) => planMove(cst, copy, placements.get(original)))
        .filter((plan): plan is MovePlan => plan !== undefined);
    }
    if (kind.kind === 'vertex') {
      const plan = planVertex(cst, kind.name, kind.index, placements.get(kind.name));
      return plan === undefined ? [] : [plan];
    }
    return [];
  }

  // planResize
  // A resize's plan from the text it starts from. A side handle also plans the
  // other axis's end edge, which only Shift's ratio moves.
  //   cst    — the text the gesture starts from
  //   name   — the resized element
  //   handle — the handle dragged
  private planResize(cst: CstDocument, name: string, handle: Handle): ResizePlan | undefined {
    const both: Handle = {
      horizontal: handle.horizontal ?? (handle.vertical === undefined ? undefined : 'end'),
      vertical: handle.vertical ?? (handle.horizontal === undefined ? undefined : 'end'),
    };
    return planHandleResize(cst, name, both, this.start.placements.get(name));
  }
}

// lines
// Guide positions on each axis as the lines the overlay draws.
function lines(vertical: readonly number[], horizontal: readonly number[]): GuideLine[] {
  return [...vertical.map((at) => ({ axis: 'vertical' as const, at })), ...horizontal.map((at) => ({ axis: 'horizontal' as const, at }))];
}
