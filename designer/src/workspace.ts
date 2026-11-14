/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/workspace.ts
 * Purpose: The designer session's state outside the document, and the one
 *          object every panel is given: the project's documents, which file is
 *          active, what the Problems and Output panels show, and the requests
 *          that cross panels ("open this file at this line"). React renders
 *          from it; it does not live in React, because the edit loop runs at
 *          frame rate and must not wait on a render.
 * Description: Observables per concern, so each panel subscribes to only what
 *              it shows. Opening a file, and showing Output, are requests the
 *              layout fulfils, since only the layout knows where panels go.
 *              The connection state follows the served file system's: when it
 *              comes back, the documents catch up with whatever changed on
 *              disk in the gap.
 *
 * Exports:
 * - OpenRequest:     A file to show, and optionally where
 * - Workspace:       The session
 *
 *     State:
 *     - session:        The server and token, for requests beyond the file system
 *     - connection:     Whether the design server can be reached
 *     - documents, activeFile, selection, problems, output, projectName
 *     - canvasFile:     The file of the screen the canvas draws
 *     - elementTrees:   Each screen's element rows, for the Explorer
 *     - projectSections: Each project file's section rows, for the Explorer
 *     - designHidden:   The elements the author hid in the designer (never exported)
 *     - wasm, loop:     The editor Wasm and the edit loop
 *     - testRun:        Run and its parity verdict
 *     - formHighlight:  The range of the project-file form's focused section, for the XML
 *     - formCaret:      Where the XML caret is in a project file, for its form
 *     - formReveal:     The form section the Explorer last asked to show
 *
 *     Lifecycle:
 *     - start():        Start the loop and the Wasm, once loaded
 *     - refreshElementTrees(): Rebuild the element and section rows from the text (each run)
 *
 *     Requests:
 *     - save():         Save one document; show Output if that fails
 *     - saveActive():   ⌘S: the active document, else the canvas's
 *     - saveAll():      ⌘⌥S: every unsaved document, one at a time
 *     - openFile():     Ask the layout to show a file
 *     - revealFormSection(): Open a project file at a section of its form
 *     - onOpenFile():   The layout's subscription to those requests
 *     - showOutput():   Ask the layout to bring Output to the front
 *     - onShowOutput(): The layout's subscription to those requests
 *     - log():          Append a line to Output
 */

import type { ConnectionState, ServedProjectFileSystem } from '@u8g2gl/core/project-fs/served-project-file-system.js';
import { DesignHiddenModel } from './canvas/design-hidden';
import { nextTrees, type ElementNode } from './documents/element-tree';
import { isFormFile } from './forms/form-model';
import { nextSectionRows, type SectionRow } from './forms/form-sections';
import { ProjectDocuments, type SaveOutcome } from './documents/project-documents';
import type { ProblemRow } from './pipeline/diagnostics';
import { EditLoop } from './pipeline/edit-loop';
import { classifyProjectFile } from './project/project-model';
import type { DesignSession } from './session';
import { SelectionModel } from './selection/selection-model';
import { Observable } from './state/observable';
import { TestRunController } from './test-run/test-run-controller';
import { saveTarget } from './ui/save-status';
import { EditorWasmController } from './wasm/editor-wasm-controller';

/** A file to show, and optionally the position to put the caret at. */
export interface OpenRequest {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
}

/** Lines kept in Output; older ones are dropped so a long session stays bounded. */
const OUTPUT_LIMIT = 500;

/** The designer session. */
export class Workspace {
  /** The server this page belongs to, and its token: for the routes that are not file I/O. */
  readonly session: DesignSession;
  /** The project's documents. */
  readonly documents: ProjectDocuments;
  /** The project file the editor shows, if any; the canvas shows its screen. */
  readonly activeFile = new Observable<string | undefined>(undefined);
  /**
   * The file of the screen the canvas last drew, if any: what its Save button
   * and a ⌘S with no editor tab save. It changes only when the drawn screen's
   * file does, never per frame, so the canvas toolbar's Save does not
   * re-render on a keystroke or a drag.
   */
  readonly canvasFile = new Observable<string | undefined>(undefined);
  /**
   * Each screen's element tree, by project path in listing order, from its
   * current buffer (ui_spec §6). Rebuilt after every pipeline run, but
   * replaced only when a row would change, so the Explorer does not re-render
   * on a keystroke or a drag that moves no row.
   */
  readonly elementTrees = new Observable<ReadonlyMap<string, readonly ElementNode[]>>(new Map());
  /**
   * The section rows of `u8g2gl.xml` and `globals.xml`, from their current
   * buffers (ruling 2), rebuilt with the element trees and replaced only when
   * a row would change.
   */
  readonly projectSections = new Observable<ReadonlyMap<string, readonly SectionRow[]>>(new Map());
  /**
   * The elements the author hid in the designer: a view setting of this
   * browser, never the XML's or the device's `hidden`. Loaded at `start()`,
   * once the project's name is known.
   */
  readonly designHidden = new DesignHiddenModel();
  /** The Problems panel's rows. */
  readonly problems = new Observable<readonly ProblemRow[]>([]);
  /** The Output panel's lines, oldest first. */
  readonly output = new Observable<readonly string[]>([]);
  /**
   * The selected elements, by file and name: the canvas outlines them and the
   * XML editor decorates them. Selection is never an edit.
   */
  readonly selection: SelectionModel;
  /** The project's name from `u8g2gl.xml`, once loaded, for the title and status bar. */
  readonly projectName = new Observable<string>('');
  /** Whether the design server can be reached: the session banner shows while it is `lost`. */
  readonly connection: Observable<ConnectionState>;
  /**
   * The text range of the project-file form's focused section, item or part:
   * the XML editor highlights it, without taking focus. Never an edit.
   */
  readonly formHighlight = new Observable<{ readonly path: string; readonly start: number; readonly end: number } | undefined>(undefined);
  /**
   * Where the caret was last put in a project file's XML: its form scrolls to
   * the section, item or part it is in, without taking focus.
   */
  readonly formCaret = new Observable<{ readonly path: string; readonly offset: number } | undefined>(undefined);
  /**
   * The form section the Explorer last asked to show, with a count so the
   * same section asked for twice is shown twice.
   */
  readonly formReveal = new Observable<{ readonly path: string; readonly key: string; readonly seq: number } | undefined>(undefined);

  private readonly openListeners = new Set<(request: OpenRequest) => void>();
  private readonly outputListeners = new Set<() => void>();
  /** The screen texts the element trees were last built from. */
  private treeTexts: ReadonlyMap<string, string> = new Map();

  /** The editor Wasm the canvas draws with. */
  readonly wasm: EditorWasmController;
  /** The live loop from text to pixels. */
  readonly loop: EditLoop;
  /** Run: the firmware target checked against the live canvas. */
  readonly testRun: TestRunController;

  /**
   * @param fs      The served project file system, connected.
   * @param session The server and token: for builds, the Wasm route, and the
   *                Explorer's open and reveal requests, through `session`.
   */
  constructor(fs: ServedProjectFileSystem, session: DesignSession) {
    this.session = session;
    this.documents = new ProjectDocuments(fs, (line) => this.log(line));
    // The server going and coming back. Events sent in the gap were lost, so
    // a return re-lists the project, as ServedProjectFileSystem.connect asks.
    // The workspace lives as long as the page, so this is never unsubscribed.
    this.connection = new Observable<ConnectionState>(fs.connection);
    fs.onConnectionChange((state) => {
      this.connection.set(state);
      if (state === 'lost') {
        this.log('the design server has stopped: saving is not possible until a new session is open');
      } else {
        this.log('the design server is back');
        void this.documents.resync().catch((error: unknown) => console.error(error));
      }
    });
    this.selection = new SelectionModel((path) => this.documents.textOf(path));
    // Canvas or tree to XML: a selection made on the canvas or in the
    // Explorer's tree shows its file, so the editor can reveal it, and the
    // canvas draws that file's screen. An open request without a position
    // never moves the caret or takes focus.
    this.selection.current.subscribe(() => {
      const selection = this.selection.current.get();
      if (selection.origin !== 'text' && selection.file !== undefined) this.openFile({ path: selection.file });
    });
    this.wasm = new EditorWasmController(session, (line) => this.log(line));
    this.loop = new EditLoop(this, this.wasm);
    // The drawn frame's hit targets carry its screen's file. They are replaced
    // on every run; `canvasFile` notifies only when the file itself moves.
    this.loop.hitTargets.subscribe(() => this.canvasFile.set(this.loop.hitTargets.get().file));
    this.testRun = new TestRunController({
      session,
      wasmStatus: this.wasm.status,
      module: this.wasm.module,
      lastRun: this.loop.lastRun,
      wellFormed: this.loop.canvasEditing,
      canvas: this.loop.frameState,
      settled: () => this.loop.settled(),
      restoreCanvas: () => this.loop.requestRun(),
      dirtyDocuments: () =>
        [...this.documents.dirty.get()].sort().flatMap((path) => {
          const model = this.documents.modelOf(path);
          return model === undefined ? [] : [{ path, content: model.getValue(), version: String(model.getVersionId()) }];
        }),
      onEdit: (listener) => this.documents.onDidChangeContent(() => listener()),
      log: (line) => this.log(line),
    });
    this.loop.addDiagnosticSource(this.testRun.diagnostics);
    this.testRun.mismatch.subscribe(() => this.loop.showDiff(this.testRun.mismatch.get()?.pixels));
  }

  /**
   * @brief Starts the session once the documents are loaded: the edit loop,
   *        the editor Wasm and its rebuilds on source changes.
   */
  start(): void {
    this.designHidden.load(this.projectName.get());
    this.documents.onDidChangeOnDisk((path) => this.wasm.fileChanged(path));
    this.loop.start();
    this.testRun.start();
    void this.wasm.start();
  }

  /**
   * @brief Rebuilds each listed screen's element tree from its current text,
   *        keeping a tree whose text no longer parses (element-tree.ts), and
   *        drops hidden names the trees no longer have; and the project
   *        files' section rows, under the same rule (form-sections.ts). The edit loop calls it
   *        in each run, before it draws, so the rows, the hiding and the frame
   *        all come from the same text.
   */
  refreshElementTrees(): void {
    const texts = new Map<string, string>();
    for (const path of this.documents.files.get()) {
      if (classifyProjectFile(path) !== 'screen') continue;
      const text = this.documents.textOf(path);
      if (text !== undefined) texts.set(path, text);
    }
    this.elementTrees.set(nextTrees(this.elementTrees.get(), texts, this.treeTexts));
    this.treeTexts = texts;
    this.designHidden.prune(this.elementTrees.get());
    const projectTexts = new Map<string, string>();
    for (const path of this.documents.files.get()) {
      if (!isFormFile(path)) continue;
      const text = this.documents.textOf(path);
      if (text !== undefined) projectTexts.set(path, text);
    }
    this.projectSections.set(nextSectionRows(this.projectSections.get(), projectTexts));
  }

  /**
   * @brief Saves one document. Explicit only: there is no autosave, because a
   *        write the author did not ask for, into a file their IDE also holds,
   *        makes a conflict out of nothing.
   *
   * A save that fails brings Output to the front, since it holds the reason;
   * a conflict has its own bar on the editor, so it does not.
   *
   * @param path A project document; one not open in a model reports `failed`.
   * @return What the save did.
   */
  async save(path: string): Promise<SaveOutcome> {
    const outcome = await this.documents.save(path);
    if (outcome === 'failed') this.showOutput();
    return outcome;
  }

  /**
   * @brief Saves what ⌘S means: the active editor tab's document, or, with no
   *        editor tab active, the document of the screen the canvas draws.
   */
  async saveActive(): Promise<void> {
    const path = saveTarget(this.activeFile.get(), this.canvasFile.get());
    if (path !== undefined) await this.save(path);
  }

  /**
   * @brief Saves every unsaved document (⌘⌥S, and the status bar's Save).
   *
   * One at a time, sorted, each through `ProjectDocuments.save`, so every file
   * gets the same conditional write, conflict and failure handling as a
   * single save, and Output logs each one's outcome. Output comes to the front
   * once, after them all, if any failed.
   *
   * @return Each path's outcome, in the order saved.
   */
  async saveAll(): Promise<ReadonlyMap<string, SaveOutcome>> {
    const outcomes = new Map<string, SaveOutcome>();
    for (const path of [...this.documents.dirty.get()].sort()) {
      outcomes.set(path, await this.documents.save(path));
    }
    if ([...outcomes.values()].includes('failed')) this.showOutput();
    return outcomes;
  }

  /** @brief Asks the layout to show a file, at a position if given. */
  openFile(request: OpenRequest): void {
    for (const listener of [...this.openListeners]) listener(request);
  }

  /**
   * @brief Opens a project file and shows a section of its form: an Explorer
   *        section row's click.
   *
   * @param path `u8g2gl.xml` or `globals.xml`.
   * @param key  The form section's (or item's) key.
   */
  revealFormSection(path: string, key: string): void {
    this.openFile({ path });
    this.formReveal.set({ path, key, seq: (this.formReveal.get()?.seq ?? 0) + 1 });
  }

  /** @brief The layout's subscription to open requests; returns the unsubscribe. */
  onOpenFile(listener: (request: OpenRequest) => void): () => void {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /** @brief Asks the layout to bring the Output panel to the front. */
  showOutput(): void {
    for (const listener of [...this.outputListeners]) listener();
  }

  /** @brief The layout's subscription to show-Output requests; returns the unsubscribe. */
  onShowOutput(listener: () => void): () => void {
    this.outputListeners.add(listener);
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  /** @brief Appends a line to Output, stamped with the time of day. */
  log(line: string): void {
    const stamp = new Date().toTimeString().slice(0, 8);
    this.output.set([...this.output.get(), `${stamp}  ${line}`].slice(-OUTPUT_LIMIT));
  }
}
