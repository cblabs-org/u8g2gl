/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/selection/selection-model.ts
 * Purpose: The selection, which everything the canvas and the property panel
 *          edit is applied to. It is a set of element **names** in one file
 *          (EDITOR-DESIGN §3.7), never offsets: `[U-1]` makes a name stable,
 *          and offsets shift on every keystroke. It lives outside React, as the
 *          pipeline's state does, so a selection change re-renders only what
 *          shows the selection.
 * Description: After each pipeline run `reconcile()` looks the names up in the
 *              file's current text. A name still there stays. A name that is
 *              gone stays selected under its new name when the change that
 *              removed it added a new name **at the same element** — the
 *              element whose `<` the old one's maps to through the text
 *              changes since — because a rename is an edit like any other
 *              (§3.7). Otherwise it drops out. Text that does not tokenise
 *              changes nothing: the names are looked up again once it does, so
 *              a half-typed attribute does not lose the selection.
 *
 *              The caret selects through `caretMoved()`: the innermost named
 *              element it is in, but only when the caret has moved there on
 *              purpose or has left the element it was in, so typing inside an
 *              element never changes the selection (§3.7).
 *
 *              Selection is never an edit: nothing here writes text.
 *
 * Exports:
 * - SelectionOrigin:   Who made a selection: the canvas or the text
 * - Selection:         The selected names, their file and origin
 * - NO_SELECTION:      Nothing selected
 * - TextChange:        One replaced span, in the text before the change
 * - mapOffset():       Where an offset lands after a set of changes
 * - SelectionModel:    The selection
 *
 *     State:
 *     - current:         The selection, observable
 *     - spans():         The selected elements' spans in the current text
 *
 *     Selecting:
 *     - select():        Replace the selection
 *     - clear():         Select nothing
 *     - caretMoved():    The caret's element, from the XML editor
 *
 *     Keeping it current:
 *     - textChanged():   Record a document's content change
 *     - reconcile():     Look the names up again after the text changed
 */

import { namedElements, type ElementSpan } from '../documents/element-at';
import { Observable } from '../state/observable';

/** Who made a selection: a canvas gesture, or the caret in the XML. */
export type SelectionOrigin = 'canvas' | 'text';

/** The selected element names, the file they are written in, and who chose them. */
export interface Selection {
  /** The file the names are in; undefined with nothing selected. */
  readonly file: string | undefined;
  /** The names, in the order they were selected; empty with nothing selected. */
  readonly names: readonly string[];
  /** Who made it, so the XML editor reveals only a selection it did not make. */
  readonly origin: SelectionOrigin;
}

/** Nothing selected. */
export const NO_SELECTION: Selection = { file: undefined, names: [], origin: 'text' };

/**
 * One replaced span: `[start, end)` of the text before the change, and the text
 * that replaced it. The shape of the CST's `TextEdit`, so a canvas edit and a
 * Monaco change map offsets the same way.
 */
export interface TextChange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * @brief Where `offset` lands after `changes` are applied.
 *
 * The changes are all in the coordinates of the text before them and do not
 * overlap, as `applyEdits` requires and as one Monaco content event reports
 * them. An offset before a change is unmoved; one at or after its end moves by
 * the change's growth (an insertion exactly at the offset pushes it right, as
 * text typed before an element's `<` moves the element).
 *
 * @return The new offset, or undefined if a change replaced the text the offset
 *         was inside: that position no longer exists.
 */
export function mapOffset(offset: number, changes: readonly TextChange[]): number | undefined {
  let shift = 0;
  for (const change of changes) {
    if (offset >= change.end) {
      shift += change.text.length - (change.end - change.start);
    } else if (offset > change.start) {
      return undefined;
    }
  }
  return offset + shift;
}

// sameSelection
// Two selections are the same when they name the same elements of the same
// file, in the same order; the origin alone changing is not a new selection,
// so the canvas re-selecting what the caret already chose reveals nothing.
function sameSelection(a: Selection, b: Selection): boolean {
  return a.file === b.file && a.names.length === b.names.length && a.names.every((name, i) => name === b.names[i]);
}

/** The selection: element names in one file, kept current across edits. */
export class SelectionModel {
  /** The selection. Subscribe to show it; set it through the methods below. */
  readonly current = new Observable<Selection>(NO_SELECTION, sameSelection);

  private readonly textOf: (file: string) => string | undefined;
  /** The selected file's named elements when the names were last looked up. */
  private known: readonly ElementSpan[] = [];
  /** The selected file's content changes since then, each set in the coordinates before it. */
  private pending: (readonly TextChange[])[] = [];
  /** The element each file's caret was last in, so typing in it selects nothing new. */
  private readonly caret = new Map<string, string | undefined>();

  /**
   * @param textOf A document's current text by project path; undefined if the
   *               path is not a document.
   */
  constructor(textOf: (file: string) => string | undefined) {
    this.textOf = textOf;
  }

  /**
   * @brief Replaces the selection.
   *
   * @param file   The file the names are written in.
   * @param names  The names; empty selects nothing.
   * @param origin Who chose them.
   */
  select(file: string, names: readonly string[], origin: SelectionOrigin): void {
    if (names.length === 0) {
      this.clear();
      return;
    }
    const unique = [...new Set(names)];
    if (file !== this.current.get().file || this.pending.length > 0) {
      this.known = this.lookUp(file) ?? [];
      this.pending = [];
    }
    this.current.set({ file, names: unique, origin });
  }

  /** @brief Selects nothing (Esc, or a click on no element). */
  clear(): void {
    this.known = [];
    this.pending = [];
    this.current.set(NO_SELECTION);
  }

  /**
   * @brief The caret's element in the XML editor, which selects it (XML to
   *        canvas, ui_spec §4.3).
   *
   * @param file     The editor's document.
   * @param name     The innermost named element at the caret; undefined in none.
   * @param explicit True when the caret was moved on purpose (a click, an arrow
   *                 key) rather than carried by typing. An explicit move selects
   *                 even within the same element; typing selects only when the
   *                 caret has left the element it was in.
   */
  caretMoved(file: string, name: string | undefined, explicit: boolean): void {
    const seen = this.caret.has(file);
    const was = this.caret.get(file);
    this.caret.set(file, name);
    if (!explicit && seen && was === name) {
      return;
    }
    if (name === undefined) {
      this.clear();
    } else {
      this.select(file, [name], 'text');
    }
  }

  /**
   * @brief Records an edit to a document, so a later `reconcile()` can follow a
   *        renamed element.
   *
   * @param file    The document.
   * @param changes The edit's spans, in the text before it.
   */
  textChanged(file: string, changes: readonly TextChange[]): void {
    if (file === this.current.get().file && changes.length > 0) {
      this.pending.push(changes);
    }
  }

  /**
   * @brief Looks the selected names up in their file's current text (after a
   *        pipeline run). A name still present stays; a renamed element keeps
   *        its place under its new name; any other missing name drops out.
   *        Nothing to do when the file has not changed since the last look.
   */
  reconcile(): void {
    const selection = this.current.get();
    if (selection.file === undefined || this.pending.length === 0) {
      return;
    }

    // --- Step 1: The file's elements now; text that does not tokenise waits ---
    const now = this.lookUp(selection.file);
    if (now === undefined) {
      return;
    }
    const before = this.known;
    const changes = this.pending;
    this.known = now;
    this.pending = [];

    // --- Step 2: Each name kept, followed through a rename, or dropped ---
    const namesNow = new Set(now.map((span) => span.name));
    const namesBefore = new Set(before.map((span) => span.name));
    const kept: string[] = [];
    for (const name of selection.names) {
      if (namesNow.has(name)) {
        kept.push(name);
        continue;
      }
      const renamed = renameOf(name, before, now, changes, namesBefore);
      if (renamed !== undefined) kept.push(renamed);
    }

    // --- Step 3: Publish; an emptied selection is no selection ---
    if (kept.length === 0) {
      this.current.set(NO_SELECTION);
    } else {
      this.current.set({ file: selection.file, names: [...new Set(kept)], origin: selection.origin });
    }
  }

  /**
   * @brief The selected elements' spans in the text as last looked up, in
   *        selection order: where the XML editor decorates and reveals.
   */
  spans(): ElementSpan[] {
    const byName = new Map(this.known.map((span) => [span.name, span]));
    return this.current
      .get()
      .names.map((name) => byName.get(name))
      .filter((span): span is ElementSpan => span !== undefined);
  }

  // lookUp
  // The file's named elements in its current text; undefined when the file is
  // not a document or its text does not tokenise.
  private lookUp(file: string): ElementSpan[] | undefined {
    const text = this.textOf(file);
    return text === undefined ? undefined : namedElements(text);
  }
}

// renameOf
// The name a vanished element now has, if the change that removed `name` added
// a new name at the same element: the element whose `<` its old `<` maps to,
// with the same tag, carrying a name the text did not have before.
//   name        — the selected name no longer in the text
//   before, now — the file's named elements before and after the changes
//   changes     — the change sets between them, oldest first
//   namesBefore — every name in `before`
function renameOf(
  name: string,
  before: readonly ElementSpan[],
  now: readonly ElementSpan[],
  changes: readonly (readonly TextChange[])[],
  namesBefore: ReadonlySet<string>,
): string | undefined {
  const old = before.find((span) => span.name === name);
  if (old === undefined) return undefined;
  let start: number | undefined = old.start;
  for (const set of changes) {
    start = start === undefined ? undefined : mapOffset(start, set);
  }
  if (start === undefined) return undefined;
  const same = now.find((span) => span.start === start && span.tag === old.tag);
  return same !== undefined && !namesBefore.has(same.name) ? same.name : undefined;
}
