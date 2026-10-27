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
 *              first time it is opened and returns the same model after.
 *              `texts()` is what the pipeline runs on: an open model's text
 *              where there is one, the disk text otherwise. Content changes in
 *              any model are reported through `onDidChangeContent`.
 *
 * Exports:
 * - DiskText:              A document's text on disk and its version
 * - ProjectDocuments:      The documents
 *
 *     Loading:
 *     - load():            List the project and read its documents
 *     - files:             Every project file, as listed
 *
 *     Documents:
 *     - isDocument():      Whether the pipeline reads a path
 *     - open():            The path's model, creating it on first open
 *     - modelOf():         The path's model, if open
 *     - close():           Dispose a model
 *     - texts():           Every document's current text
 *
 *     Change:
 *     - onDidChangeContent(): Subscribe to edits in any open model
 */

import type { ServedProjectFileSystem } from '@u8g2gl/core/project-fs/served-project-file-system.js';
import { monaco } from '../monaco/monaco';
import { classifyProjectFile } from '../project/project-model';
import { Observable } from '../state/observable';

/** A document's text on disk and the version the server gave it. */
export interface DiskText {
  readonly text: string;
  readonly version: string;
}

/** The project's documents: disk text for all, a Monaco model for the open ones. */
export class ProjectDocuments {
  /** Every file in the project, as last listed, sorted by code unit. */
  readonly files = new Observable<readonly string[]>([]);

  private readonly fs: ServedProjectFileSystem;
  private readonly disk = new Map<string, DiskText>();
  private readonly models = new Map<string, monaco.editor.ITextModel>();
  private readonly contentListeners = new Set<(path: string) => void>();

  /** @param fs The served project file system, already connected. */
  constructor(fs: ServedProjectFileSystem) {
    this.fs = fs;
  }

  /**
   * @brief Lists the project and reads every document the pipeline reads.
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
  }

  /** @brief Whether the pipeline reads this path as a project document. */
  isDocument(path: string): boolean {
    return classifyProjectFile(path) !== undefined;
  }

  /**
   * @brief The document's model, created from its disk text on first open.
   *
   * @return The model, or undefined for a path that is not a loaded document.
   */
  open(path: string): monaco.editor.ITextModel | undefined {
    const existing = this.models.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const disk = this.disk.get(path);
    if (disk === undefined) {
      return undefined;
    }
    // The URI carries the project path, so markers set for a file find it.
    const model = monaco.editor.createModel(disk.text, 'xml', monaco.Uri.from({ scheme: 'u8g2gl', path: `/${path}` }));
    model.onDidChangeContent(() => {
      for (const listener of [...this.contentListeners]) listener(path);
    });
    this.models.set(path, model);
    return model;
  }

  /** @brief The document's model if it is open. */
  modelOf(path: string): monaco.editor.ITextModel | undefined {
    return this.models.get(path);
  }

  /** @brief The project path a model was opened for, if it is one of these. */
  pathOf(model: monaco.editor.ITextModel): string | undefined {
    for (const [path, candidate] of this.models) {
      if (candidate === model) return path;
    }
    return undefined;
  }

  /** @brief Disposes a document's model; its disk text stays. */
  close(path: string): void {
    this.models.get(path)?.dispose();
    this.models.delete(path);
  }

  /** @brief Every document's current text: the open model's, else the disk's. */
  texts(): Map<string, string> {
    const texts = new Map<string, string>();
    for (const [path, disk] of this.disk) {
      texts.set(path, this.models.get(path)?.getValue() ?? disk.text);
    }
    return texts;
  }

  /**
   * @brief Calls `listener` with the path of any open model whose content changes.
   *
   * @return The unsubscribe function.
   */
  onDidChangeContent(listener: (path: string) => void): () => void {
    const entry = (path: string): void => listener(path);
    this.contentListeners.add(entry);
    return () => {
      this.contentListeners.delete(entry);
    };
  }
}
