/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/canvas-editor.ts
 * Purpose: The canvas's one way to write the text (EDITOR-DESIGN §3.2): an
 *          intent becomes `TextEdit[]` from the CST edit functions, computed
 *          against the document's **current** text, and lands on the document's
 *          Monaco model through `pushEditOperations`, on the one undo stack
 *          every source of edits shares ([UD-3]). This module owns how those
 *          edits are grouped into undo stops (§3.6), so every gesture gets the
 *          same rule and none can forget it.
 * Description: A drag or a resize is a {@link EditGesture}: `pushStackElement()`
 *              when it begins and when it ends, and every frame's edit in
 *              between joins the one stop, however many frames there are.
 *              Arrow-key nudges are grouped as Monaco groups typing: a nudge
 *              on the same selection within {@link NUDGE_GROUP_MS} of the last,
 *              with nothing else edited between, joins its stop; any other
 *              nudge starts a new one. A group is closed — its stop pushed —
 *              when that window passes, when the canvas loses the keyboard and
 *              when a gesture begins, so text typed in the editor afterwards
 *              never joins a nudge's stop.
 *
 *              The edits are computed by the caller's function from the text
 *              at the moment they apply, so an intent is always measured
 *              against what the document holds now, never against an older
 *              copy. Nothing here renders: the model's change schedules the
 *              pipeline as a keystroke does, at most once per frame.
 *
 *              It talks to the model through {@link EditableModel}, the four
 *              methods of Monaco's `ITextModel` it uses, so the grouping rules
 *              are tested without a browser.
 *
 * Exports:
 * - NUDGE_GROUP_MS:  How close two nudges must be to share an undo stop
 * - EditableModel:   What the editor needs of a Monaco model
 * - EditGesture:     One drag or resize: one undo stop
 *
 *     - update():      Replace the gesture's edit so far with a new one
 *     - end():         Close its undo stop
 *
 * - CanvasEditor:    The canvas's edit path
 *
 *     - begin():       Start a gesture on a document
 *     - nudge():       Apply one nudge, grouped with its neighbours
 *     - closeGroup():  End the nudge group now
 */

import type { TextEdit } from '@u8g2gl/core/cst/index.js';

/** Milliseconds within which nudges on one selection share an undo stop (§3.6). */
export const NUDGE_GROUP_MS = 750;

/** A position in a model, as Monaco numbers it (1-based). */
interface ModelPosition {
  readonly lineNumber: number;
  readonly column: number;
}

/** One replaced range, as `pushEditOperations` takes it. */
interface ModelOperation {
  readonly range: {
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
  };
  readonly text: string;
}

/**
 * The part of Monaco's `ITextModel` the canvas edits through. A real model is
 * one; a test supplies a small stand-in with the same undo semantics.
 */
export interface EditableModel {
  /** The document's text now. */
  getValue(): string;
  /** The 1-based position of an offset. */
  getPositionAt(offset: number): ModelPosition;
  /** Changes on every edit, and returns to an earlier value on undo. */
  getAlternativeVersionId(): number;
  /** Closes the open undo stop, so the next edit starts a new one. */
  pushStackElement(): void;
  /** Applies edits as one step of the open undo stop, opening one if none is. */
  pushEditOperations(beforeCursorState: null, operations: ModelOperation[], cursorStateComputer: () => null): unknown;
}

/** Options for {@link CanvasEditor}, for tests. */
export interface CanvasEditorOptions {
  /** The clock nudges are grouped by; `performance.now()` by default. */
  readonly now?: () => number;
  /** Runs `callback` after `ms`; returns a cancel. `setTimeout` by default. */
  readonly setTimer?: (callback: () => void, ms: number) => () => void;
}

// toOperations
// TextEdits, which are offsets into the text the model holds now, as Monaco's
// ranges. The edits are disjoint, as the CST edit functions make them, so
// Monaco applies them together against the text before any of them.
//   model — the document
//   edits — the edits
function toOperations(model: EditableModel, edits: readonly TextEdit[]): ModelOperation[] {
  return edits.map((edit) => {
    const start = model.getPositionAt(edit.start);
    const end = model.getPositionAt(edit.end);
    return {
      range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
      text: edit.text,
    };
  });
}

/**
 * One drag or resize: everything it writes, from pointer-down to pointer-up,
 * is one undo stop (§3.6). Each frame replaces the whole edit so far: the
 * caller computes the edit from the gesture's start and the pointer now, so
 * the text after any frame is what that frame's intent says, not a sum of
 * per-frame increments.
 */
export class EditGesture {
  private readonly model: EditableModel;
  private ended = false;

  /** @param model The document the gesture edits; its undo stop is already open. */
  constructor(model: EditableModel) {
    this.model = model;
  }

  /**
   * @brief Applies this frame's edit.
   *
   * @param compute The edits for the text as it is now; none leaves it alone.
   * @return True if the text changed.
   */
  update(compute: (text: string) => readonly TextEdit[]): boolean {
    if (this.ended) return false;
    const edits = compute(this.model.getValue());
    if (edits.length === 0) return false;
    this.model.pushEditOperations(null, toOperations(this.model, edits), () => null);
    return true;
  }

  /** @brief Closes the gesture's undo stop; later updates are ignored. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.model.pushStackElement();
  }
}

/** The open nudge group: what it nudged, when, and the model's version after. */
interface NudgeGroup {
  readonly model: EditableModel;
  readonly key: string;
  readonly at: number;
  readonly version: number;
  readonly cancelTimer: () => void;
}

/** The canvas's edit path: gestures and nudges, each grouped into undo stops. */
export class CanvasEditor {
  private readonly modelOf: (file: string) => EditableModel | undefined;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => () => void;
  private group: NudgeGroup | undefined;

  /**
   * @param modelOf The model of a project document, opening it if need be;
   *                undefined for a path that is not a document.
   * @param options The clock and timer, for tests.
   */
  constructor(modelOf: (file: string) => EditableModel | undefined, options: CanvasEditorOptions = {}) {
    this.modelOf = modelOf;
    this.now = options.now ?? (() => performance.now());
    this.setTimer =
      options.setTimer ??
      ((callback, ms) => {
        const handle = setTimeout(callback, ms);
        return () => clearTimeout(handle);
      });
  }

  /**
   * @brief Starts a drag or a resize on a document: one undo stop opens.
   *
   * Any nudge group is closed first, so the gesture never joins it.
   *
   * @return The gesture, or undefined if `file` is not a document.
   */
  begin(file: string): EditGesture | undefined {
    this.closeGroup();
    const model = this.modelOf(file);
    if (model === undefined) return undefined;
    model.pushStackElement();
    return new EditGesture(model);
  }

  /**
   * @brief Applies one nudge.
   *
   * It joins the open nudge group when the group nudged the same `key` in the
   * same document, within {@link NUDGE_GROUP_MS}, and the document has not been
   * edited since by anything else; otherwise it starts a new undo stop.
   *
   * @param file    The document.
   * @param key     What is being nudged — the selection, as one string.
   * @param compute The nudge's edits against the text as it is now.
   * @return True if the text changed.
   */
  nudge(file: string, key: string, compute: (text: string) => readonly TextEdit[]): boolean {
    // --- Step 1: Join the open group, or close it and start a new stop ---
    const model = this.modelOf(file);
    if (model === undefined) return false;
    const now = this.now();
    const open = this.group;
    const joins =
      open !== undefined &&
      open.model === model &&
      open.key === key &&
      now - open.at <= NUDGE_GROUP_MS &&
      model.getAlternativeVersionId() === open.version;
    if (!joins) {
      this.closeGroup();
      model.pushStackElement();
    }

    // --- Step 2: The edit, against the text now ---
    const edits = compute(model.getValue());
    if (edits.length > 0) {
      model.pushEditOperations(null, toOperations(model, edits), () => null);
    }

    // --- Step 3: Keep the group open until the window passes ---
    open?.cancelTimer();
    const cancelTimer = this.setTimer(() => this.closeGroup(), NUDGE_GROUP_MS);
    this.group = { model, key, at: now, version: model.getAlternativeVersionId(), cancelTimer };
    return edits.length > 0;
  }

  /**
   * @brief Ends the nudge group now: its undo stop is closed, so nothing
   *        edited after joins it (the canvas lost the keyboard, a gesture
   *        began, or the window passed).
   */
  closeGroup(): void {
    const group = this.group;
    if (group === undefined) return;
    this.group = undefined;
    group.cancelTimer();
    group.model.pushStackElement();
  }
}
