/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/documents/project-documents.ts
 * Purpose: The project's documents as the designer holds them: the text on
 *          disk, with its version, for every XML document the project reads,
 *          and a Monaco model for each one the user has opened. Text is the
 *          single source of truth ([UD-3]); this is where it is kept, and the
 *          only place the pipeline reads it from, so the canvas can never show
 *          a document other than the one in the editor.
 * Description: `load()` lists the project through its `ProjectFileSystem` and
 *              reads every document. `open()` creates a document's model the
 *              first time it is opened, with any missing element names already
 *              written in ([U-1]), and returns the same model after.
 *              `texts()` is what the pipeline runs on: an open model's text
 *              where there is one, the disk text otherwise.
 *
 *              Saving and the IDE beside it follow EDITOR-DESIGN §2.3 exactly:
 *              - Save is explicit, and conditional on the version last read,
 *                so a file that moved underneath is never overwritten.
 *              - A model is dirty when its undo position differs from the one
 *                it was saved or loaded at (Monaco's alternative version id),
 *                so undoing back to the saved text is clean again, and names
 *                generated on open do not make it dirty.
 *              - A file changed on disk while its buffer is clean reloads
 *                silently, keeping the caret on the element of the same name.
 *              - While it is dirty, the change is held as a conflict and the
 *                user chooses: keep mine, take theirs, or compare. Nothing is
 *                written until they save.
 *              - A clean document is disposed when its tab closes and is never
 *                written: opening a file to look at it does not rewrite it.
 *                A dirty one keeps its model, so closing a tab loses nothing.
 *
 * Exports:
 * - DiskText:              A document's text on disk and its version
 * - SaveOutcome:           What a save did
 * - ProjectDocuments:      The documents
 *
 *     Loading:
 *     - load():            List the project and read its documents
 *     - files:             Every project file, as listed
 *     - fileSystem:        Where the documents come from
 *
 *     Documents:
 *     - isDocument():      Whether the pipeline reads a path
 *     - open():            The path's model, creating it on first open
 *     - modelOf():         The path's model, if open
 *     - openPaths():       Every open document
 *     - close():           Dispose a clean model; keep a dirty one
 *     - texts():           Every document's current text
 *
 *     Saving and conflicts:
 *     - dirty:             The paths whose buffer differs from what was saved
 *     - conflicts:         Paths changed on disk while dirty, with their text
 *     - save():            Write a buffer, conditionally
 *     - keepMine():        Resolve a conflict for the buffer
 *     - takeTheirs():      Resolve a conflict for the disk
 *
 *     Change:
 *     - onDidChangeContent(): Subscribe to edits in any open model
 *     - onDidOpen():          Subscribe to documents being opened
 *     - onDidChangeOnDisk():  Subscribe to files changing on disk
 */

import type { ServedProjectFileSystem } from '@u8g2gl/core/project-fs/served-project-file-system.js';
import { monaco } from '../monaco/monaco';
import { classifyProjectFile } from '../project/project-model';
import { Observable } from '../state/observable';
import { elementAt, namedElements } from './element-at';
import { withGeneratedNames } from './generated-names';

/** A document's text on disk and the version the server gave it. */
export interface DiskText {
  readonly text: string;
  readonly version: string;
}

/** What a save did. */
export type SaveOutcome = 'saved' | 'unchanged' | 'conflict' | 'failed';

/** An open document: its model and the undo position it was last saved at. */
interface OpenDocument {
  readonly model: monaco.editor.ITextModel;
  savedAt: number;
}

/** The project's documents: disk text for all, a Monaco model for the open ones. */
export class ProjectDocuments {
  /** Every file in the project, as last listed, sorted by code unit. */
  readonly files = new Observable<readonly string[]>([]);
  /** Open documents whose buffer differs from what was last saved or loaded. */
  readonly dirty = new Observable<ReadonlySet<string>>(new Set());
  /** Documents changed on disk while dirty, with the disk's text: the three-way choice is pending. */
  readonly conflicts = new Observable<ReadonlyMap<string, DiskText>>(new Map());

  private readonly fs: ServedProjectFileSystem;
  private readonly log: (line: string) => void;
  private readonly disk = new Map<string, DiskText>();
  private readonly open_ = new Map<string, OpenDocument>();
  private readonly contentListeners = new Set<(path: string) => void>();
  private readonly openListeners = new Set<(path: string) => void>();
  private readonly diskListeners = new Set<(path: string) => void>();

  /**
   * @param fs  The served project file system, already connected.
   * @param log Where saves and reloads are reported (the Output panel).
   */
  constructor(fs: ServedProjectFileSystem, log: (line: string) => void = () => undefined) {
    this.fs = fs;
    this.log = log;
  }

  /** The file system the documents are read from and saved to. */
  get fileSystem(): ServedProjectFileSystem {
    return this.fs;
  }

  /**
   * @brief Lists the project, reads every document the pipeline reads, and
   *        starts following changes on disk.
   *
   * @throws Error if the listing or a read fails: without its documents there
   *         is no project to show.
   */
  async load(): Promise<void> {
    const listing = await this.fs.list();
    if (!listing.ok) {
      throw new Error(`could not list the project: ${listing.message}`);
    }
    const documents = listing.files.filter((path) => this.isDocument(path));
    const reads = await Promise.all(documents.map((path) => this.fs.read(path)));
    for (const read of reads) {
      if (!read.ok) {
        throw new Error(`could not read the project: ${read.message}`);
      }
      this.disk.set(read.path, { text: read.text, version: read.version });
    }
    this.files.set(listing.files);
    this.fs.watch((event) => {
      void this.diskChanged(event.path, event.kind).catch((error: unknown) => console.error(error));
    });
  }

  /** @brief Whether the pipeline reads this path as a project document. */
  isDocument(path: string): boolean {
    return classifyProjectFile(path) !== undefined;
  }

  /**
   * @brief The document's model, created on first open from its disk text with
   *        any missing element names written in.
   *
   * The generated names are the model's starting text, not an edit, so the
   * document opens clean: closing it unedited writes nothing (§2.3, E1 e5).
   *
   * @return The model, or undefined for a path that is not a loaded document.
   */
  open(path: string): monaco.editor.ITextModel | undefined {
    const existing = this.open_.get(path);
    if (existing !== undefined) {
      return existing.model;
    }
    const disk = this.disk.get(path);
    if (disk === undefined) {
      return undefined;
    }
    // The URI carries the project path, so markers set for a file find it.
    const model = monaco.editor.createModel(
      withGeneratedNames(path, disk.text),
      'xml',
      monaco.Uri.from({ scheme: 'u8g2gl', path: `/${path}` }),
    );
    const document: OpenDocument = { model, savedAt: model.getAlternativeVersionId() };
    model.onDidChangeContent(() => {
      this.updateDirty(path);
      for (const listener of [...this.contentListeners]) listener(path);
    });
    this.open_.set(path, document);
    for (const listener of [...this.openListeners]) listener(path);
    return model;
  }

  /** @brief The paths of every open document. */
  openPaths(): string[] {
    return [...this.open_.keys()];
  }

  /** @brief The document's model if it is open. */
  modelOf(path: string): monaco.editor.ITextModel | undefined {
    return this.open_.get(path)?.model;
  }

  /**
   * @brief Closes a document's tab: a clean model is disposed, a dirty one kept.
   *
   * Nothing is written either way. A dirty buffer outlives its tab so closing
   * a tab can never lose an edit; reopening the file shows it again.
   */
  close(path: string): void {
    const document = this.open_.get(path);
    if (document === undefined || this.dirty.get().has(path)) {
      return;
    }
    document.model.dispose();
    this.open_.delete(path);
  }

  /** @brief Every document's current text: the open model's, else the disk's. */
  texts(): Map<string, string> {
    const texts = new Map<string, string>();
    for (const [path, disk] of this.disk) {
      texts.set(path, this.open_.get(path)?.model.getValue() ?? disk.text);
    }
    return texts;
  }

  /**
   * @brief Saves an open document's buffer (⌘S).
   *
   * The write names the version last read, so the server refuses it if the file
   * changed since; the change is then held as a conflict and nothing is
   * overwritten. A buffer equal to the disk text is not written at all.
   *
   * @return What happened.
   */
  async save(path: string): Promise<SaveOutcome> {
    // --- Step 1: Nothing to write if the buffer is the disk text ---
    const document = this.open_.get(path);
    const disk = this.disk.get(path);
    if (document === undefined || disk === undefined) {
      return 'failed';
    }
    const text = document.model.getValue();
    const at = document.model.getAlternativeVersionId();
    if (text === disk.text) {
      this.markSaved(path, at);
      return 'unchanged';
    }

    // --- Step 2: The conditional write ---
    const result = await this.fs.write(path, text, { expectedVersion: disk.version });
    if (result.ok) {
      this.disk.set(path, { text, version: result.version });
      this.markSaved(path, at);
      this.log(`saved ${path}`);
      return 'saved';
    }

    // --- Step 3: Refused: hold the disk's text as a conflict, or report ---
    if (result.code === 'conflict') {
      const theirs = await this.fs.read(path);
      if (theirs.ok) {
        this.setConflict(path, { text: theirs.text, version: theirs.version });
      }
      this.log(`${path} changed on disk since it was opened: not saved. Keep yours, take theirs, or compare.`);
      return 'conflict';
    }
    this.log(`could not save ${path}: ${result.message}`);
    return 'failed';
  }

  /**
   * @brief Resolves a conflict for the buffer: it stays as it is, dirty, and the
   *        next save replaces the disk's version deliberately.
   */
  keepMine(path: string): void {
    const theirs = this.conflicts.get().get(path);
    if (theirs === undefined) return;
    this.disk.set(path, theirs);
    this.setConflict(path, undefined);
    this.updateDirty(path);
  }

  /** @brief Resolves a conflict for the disk: the buffer becomes the disk's text, clean. */
  takeTheirs(path: string): void {
    const theirs = this.conflicts.get().get(path);
    if (theirs === undefined) return;
    this.setConflict(path, undefined);
    this.reload(path, theirs);
  }

  /** @brief Calls `listener` with a document's path when its model is created. */
  onDidOpen(listener: (path: string) => void): () => void {
    return subscribe(this.openListeners, listener);
  }

  /** @brief Calls `listener` with the path of any open model whose content changes. */
  onDidChangeContent(listener: (path: string) => void): () => void {
    return subscribe(this.contentListeners, listener);
  }

  /**
   * @brief Calls `listener` with a project path after the file changed on disk
   *        and the documents have caught up with it.
   */
  onDidChangeOnDisk(listener: (path: string) => void): () => void {
    return subscribe(this.diskListeners, listener);
  }

  // diskChanged
  // A watcher event. The listing for an added or removed file; for a changed
  // document, §2.3's rules: a buffer equal to the new text is simply saved
  // (this is the echo of our own save), a clean buffer reloads, a dirty one
  // becomes a conflict.
  //   path — project-relative
  //   kind — what happened
  private async diskChanged(path: string, kind: 'changed' | 'added' | 'removed'): Promise<void> {
    // --- Step 1: The listing, when the set of files changed ---
    if (kind !== 'changed') {
      const listing = await this.fs.list();
      if (listing.ok) this.files.set(listing.files);
    }

    // --- Step 2: A document's new text, and what it means for its buffer ---
    if (this.isDocument(path) && kind !== 'removed') {
      const read = await this.fs.read(path);
      const known = this.disk.get(path);
      if (read.ok && (known === undefined || read.text !== known.text || read.version !== known.version)) {
        const theirs = { text: read.text, version: read.version };
        const document = this.open_.get(path);
        if (document === undefined) {
          this.disk.set(path, theirs);
        } else if (document.model.getValue() === theirs.text) {
          this.disk.set(path, theirs);
          this.markSaved(path, document.model.getAlternativeVersionId());
        } else if (!this.dirty.get().has(path)) {
          this.reload(path, theirs);
          this.log(`${path} changed on disk: reloaded`);
        } else {
          this.setConflict(path, theirs);
          this.log(`${path} changed on disk while you were editing it: keep yours, take theirs, or compare`);
        }
      }
    } else if (kind === 'removed') {
      // An open buffer is kept, so nothing typed is lost; it is no longer
      // read by the pipeline once its disk text is gone.
      this.disk.delete(path);
    }
    for (const listener of [...this.diskListeners]) listener(path);
  }

  // reload
  // Replaces a buffer with the disk's text, clean, keeping the caret on the
  // element of the same name in every editor showing it (§2.3). One edit, so
  // the user can still undo back to what was there.
  //   path   — the document
  //   theirs — the disk's text and version
  private reload(path: string, theirs: DiskText): void {
    this.disk.set(path, theirs);
    const document = this.open_.get(path);
    if (document === undefined) return;
    const model = document.model;
    const editors = monaco.editor.getEditors().filter((editor) => editor.getModel() === model);
    const names = editors.map((editor) => {
      const position = editor.getPosition();
      const found = position === null ? undefined : elementAt(model.getValue(), model.getOffsetAt(position));
      return typeof found === 'object' ? found.name : undefined;
    });
    const text = withGeneratedNames(path, theirs.text);
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    const spans = namedElements(text) ?? [];
    editors.forEach((editor, i) => {
      const span = spans.find((s) => s.name === names[i]);
      if (span !== undefined) editor.setPosition(model.getPositionAt(span.start + 1));
    });
    this.markSaved(path, model.getAlternativeVersionId());
  }

  // markSaved
  // Records the undo position a buffer was saved or loaded at, so it is clean.
  private markSaved(path: string, at: number): void {
    const document = this.open_.get(path);
    if (document !== undefined) document.savedAt = at;
    this.updateDirty(path);
  }

  // updateDirty
  // Recomputes one path's place in the dirty set, notifying only on change.
  private updateDirty(path: string): void {
    const document = this.open_.get(path);
    const isDirty = document !== undefined && document.model.getAlternativeVersionId() !== document.savedAt;
    const current = this.dirty.get();
    if (current.has(path) === isDirty) return;
    const next = new Set(current);
    if (isDirty) next.add(path);
    else next.delete(path);
    this.dirty.set(next);
  }

  // setConflict
  // Holds, or clears, a path's pending three-way choice.
  private setConflict(path: string, theirs: DiskText | undefined): void {
    const next = new Map(this.conflicts.get());
    if (theirs === undefined) next.delete(path);
    else next.set(path, theirs);
    this.conflicts.set(next);
  }
}

// subscribe
// Adds a wrapped listener to a set, returning its unsubscribe: the same
// function subscribed twice is two subscriptions.
function subscribe(listeners: Set<(path: string) => void>, listener: (path: string) => void): () => void {
  const entry = (path: string): void => listener(path);
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}
