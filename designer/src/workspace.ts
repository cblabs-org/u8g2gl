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
 *              it shows. Opening a file is a request the layout fulfils, since
 *              only the layout knows where editor tabs go.
 *
 * Exports:
 * - OpenRequest:     A file to show, and optionally where
 * - Workspace:       The session
 *
 *     State:
 *     - documents, activeFile, selection, problems, output, projectName
 *     - wasm, loop:     The editor Wasm and the edit loop
 *     - testRun:        Run and its verdict (EDITOR-DESIGN §4)
 *
 *     Lifecycle:
 *     - start():        Start the loop and the Wasm, once loaded
 *
 *     Requests:
 *     - saveActive():   Save the active document
 *     - openFile():     Ask the layout to show a file
 *     - onOpenFile():   The layout's subscription to those requests
 *     - log():          Append a line to Output
 */

import type { ServedProjectFileSystem } from '@u8g2gl/core/project-fs/served-project-file-system.js';
import { ProjectDocuments } from './documents/project-documents';
import type { ProblemRow } from './pipeline/diagnostics';
import { EditLoop } from './pipeline/edit-loop';
import type { DesignSession } from './session';
import { SelectionModel } from './selection/selection-model';
import { Observable } from './state/observable';
import { TestRunController } from './test-run/test-run-controller';
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
  /** The project's documents. */
  readonly documents: ProjectDocuments;
  /** The project file the editor shows, if any; the canvas shows its screen. */
  readonly activeFile = new Observable<string | undefined>(undefined);
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

  private readonly openListeners = new Set<(request: OpenRequest) => void>();

  /** The editor Wasm the canvas draws with. */
  readonly wasm: EditorWasmController;
  /** The live loop from text to pixels. */
  readonly loop: EditLoop;
  /** Run: the firmware target checked against the live canvas. */
  readonly testRun: TestRunController;

  /**
   * @param fs      The served project file system, connected.
   * @param session The server and token, for builds and the Wasm route.
   */
  constructor(fs: ServedProjectFileSystem, session: DesignSession) {
    this.documents = new ProjectDocuments(fs, (line) => this.log(line));
    this.selection = new SelectionModel((path) => this.documents.textOf(path));
    // Canvas to XML: a selection made on the canvas shows its file, so the
    // editor can reveal it. An open request without a position never moves
    // the caret or takes focus.
    this.selection.current.subscribe(() => {
      const selection = this.selection.current.get();
      if (selection.origin === 'canvas' && selection.file !== undefined) this.openFile({ path: selection.file });
    });
    this.wasm = new EditorWasmController(session, (line) => this.log(line));
    this.loop = new EditLoop(this, this.wasm);
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
    this.documents.onDidChangeOnDisk((path) => this.wasm.fileChanged(path));
    this.loop.start();
    this.testRun.start();
    void this.wasm.start();
  }

  /**
   * @brief Saves the active document (⌘S). Explicit only: there is no
   *        autosave, because a write the author did not ask for, into a file
   *        their IDE also holds, makes a conflict out of nothing.
   */
  async saveActive(): Promise<void> {
    const path = this.activeFile.get();
    if (path !== undefined) {
      await this.documents.save(path);
    }
  }

  /** @brief Asks the layout to show a file, at a position if given. */
  openFile(request: OpenRequest): void {
    for (const listener of [...this.openListeners]) listener(request);
  }

  /** @brief The layout's subscription to open requests; returns the unsubscribe. */
  onOpenFile(listener: (request: OpenRequest) => void): () => void {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /** @brief Appends a line to Output, stamped with the time of day. */
  log(line: string): void {
    const stamp = new Date().toTimeString().slice(0, 8);
    this.output.set([...this.output.get(), `${stamp}  ${line}`].slice(-OUTPUT_LIMIT));
  }
}
