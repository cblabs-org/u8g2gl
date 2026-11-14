/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-controller.ts
 * Purpose: Connects one project file's form to the session: it reads the form
 *          from the document's current buffer whenever the buffer changes,
 *          places the Problems rows on it, offers what the project declares,
 *          and lands each change as a text edit on the document's own model,
 *          as one undo stop of that document ([UD-3], ruling 1). The form
 *          never holds the document: the text is the model.
 * Description: The edit goes through `CanvasEditor.apply`, the path the
 *              canvas's commands use, so a form change and a canvas command
 *              group into undo stops the same way. A change is computed by
 *              `formEdit` from the text at the moment it applies. While the
 *              text cannot be read, the last good form is kept and every
 *              change is refused.
 *
 * Exports:
 * - formOptions():          What reference fields offer, from the last run
 * - ProjectFormController:  One file's form, live
 *
 *     - state:     What the form draws
 *     - start():   Follow the buffer, the Problems rows and the run; returns the stop
 *     - apply():   Land a change
 *     - refresh(): Read the form again now
 */

import { CanvasEditor } from '../editing/canvas-editor';
import type { CompletedRun } from '../pipeline/edit-loop';
import { Observable } from '../state/observable';
import type { Workspace } from '../workspace';
import { NO_OPTIONS, type FormOptions } from './form-options';
import { formEdit, type FormChange } from './form-edits';
import { buildFormModel, type FormFile, type FormModel, type FormNode } from './form-model';
import { placeProblems } from './form-problems';
import type { FormViewState } from './form-view';

/** No rows placed. */
const NO_PROBLEMS = { byField: new Map(), byNode: new Map() } as const;

/**
 * @brief What reference fields offer: the fonts, subjects, styles and images
 *        the last run's globals declare, the project's files, and every
 *        catalogued setup.
 */
export function formOptions(run: CompletedRun | undefined, files: readonly string[]): FormOptions {
  if (run === undefined) return { ...NO_OPTIONS, paths: files };
  const { globals, catalogue } = run.result.model;
  return {
    fonts: globals.fonts.map((font) => font.name),
    subjects: globals.subjects.map((subject) => subject.name),
    styles: globals.styles.map((style) => style.name),
    images: globals.images.map((image) => image.name),
    paths: files,
    setups: catalogue.map((record) => record.setup),
  };
}

// sameStrings
// Whether two lists hold the same strings in the same order.
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

// sameOptions
// Whether two option sets offer the same, so a run that changed none of them
// does not re-render the form.
function sameOptions(a: FormOptions, b: FormOptions): boolean {
  return (
    sameStrings(a.fonts, b.fonts) &&
    sameStrings(a.subjects, b.subjects) &&
    sameStrings(a.styles, b.styles) &&
    sameStrings(a.images, b.images) &&
    sameStrings(a.paths, b.paths) &&
    sameStrings(a.setups, b.setups)
  );
}

/** One project file's form, following its buffer. */
export class ProjectFormController {
  /** What the form draws. */
  readonly state: Observable<FormViewState>;

  private readonly workspace: Workspace;
  private readonly file: FormFile;
  private readonly editor: CanvasEditor;
  private refusal: string | undefined;

  /**
   * @param workspace The session.
   * @param file      The project file the form is of.
   */
  constructor(workspace: Workspace, file: FormFile) {
    this.workspace = workspace;
    this.file = file;
    this.editor = new CanvasEditor((path) => workspace.documents.open(path));
    this.state = new Observable<FormViewState>({ model: undefined, problems: NO_PROBLEMS, options: NO_OPTIONS });
    this.refresh();
  }

  /**
   * @brief Follows the document's buffer, the Problems rows, the run and the
   *        XML caret, re-reading the form on each.
   *
   * @return Stops following.
   */
  start(): () => void {
    const stops = [
      this.workspace.documents.onDidChangeContent((path) => {
        if (path === this.file) this.refresh();
      }),
      this.workspace.documents.onDidOpen((path) => {
        if (path === this.file) this.refresh();
      }),
      this.workspace.problems.subscribe(() => this.refresh()),
      this.workspace.loop.lastRun.subscribe(() => this.refresh()),
      this.workspace.documents.files.subscribe(() => this.refresh()),
      this.workspace.formCaret.subscribe(() => this.refresh()),
    ];
    this.refresh();
    return () => stops.forEach((stop) => stop());
  }

  /**
   * @brief Reads the form from the buffer now: a new form, or the last good
   *        one kept and marked unreadable, with the Problems rows placed.
   */
  refresh(): void {
    const previous = this.state.get();
    const text = this.workspace.documents.textOf(this.file) ?? '';
    const reading = buildFormModel(this.file, text);
    const model = reading.kind === 'form' ? reading.model : previous.model;
    const options = formOptions(this.workspace.loop.lastRun.get(), this.workspace.documents.files.get());
    const caret = this.workspace.formCaret.get();
    const current = caret !== undefined && caret.path === this.file && model !== undefined ? currentKey(model, caret.offset) : previous.current;
    const next: FormViewState = {
      model,
      ...(reading.kind === 'unreadable' ? { unreadable: { problem: reading.problem, line: reading.line, column: reading.column } } : {}),
      problems: model === undefined ? NO_PROBLEMS : placeProblems(model, this.workspace.problems.get()),
      options: sameOptions(options, previous.options) ? previous.options : options,
      ...(current !== undefined ? { current } : {}),
      ...(this.refusal !== undefined ? { refusal: this.refusal } : {}),
    };
    this.state.set(next);
  }

  /**
   * @brief Lands a change on the document as one undo stop.
   *
   * @return True if the text changed. A refused change sets the form's
   *         refusal until the next change.
   */
  apply(change: FormChange): boolean {
    if (this.state.get().unreadable !== undefined) return false;
    let refused: string | undefined;
    const changed = this.editor.apply(this.file, (text) => {
      const result = formEdit(this.file, text, change);
      refused = result.refused;
      return result.edits;
    });
    this.refusal = refused;
    this.refresh();
    return changed;
  }
}

// currentKey
// The key of the deepest section, item or part whose element holds an offset.
function currentKey(model: FormModel, offset: number): string | undefined {
  let best: { key: string; span: number } | undefined;
  const consider = (key: string, range: { start: number; end: number } | undefined): void => {
    if (range === undefined || offset < range.start || offset >= range.end) return;
    const span = range.end - range.start;
    if (best === undefined || span <= best.span) best = { key, span };
  };
  for (const section of model.sections) {
    consider(section.key, section.range);
    const visit = (node: FormNode): void => {
      if (node.index !== undefined || node !== section.node) consider(node.key, node.range);
      node.parts.forEach(visit);
      node.lists.forEach((list) => list.items.forEach(visit));
    };
    if (section.node !== undefined) visit(section.node);
    section.list?.items.forEach(visit);
  }
  return best?.key;
}
