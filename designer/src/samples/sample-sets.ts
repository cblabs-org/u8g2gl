/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/sample-sets.ts
 * Purpose: The project's sample sets as the designer manages them: which sets
 *          there are, each one's document, and every change the Sample data
 *          view and the subjects table make to them. One place, so a value
 *          edited in either is the same edit, and so set files are always
 *          edited through the project's documents (one undo step per edit,
 *          saved like the XML) and never written behind their back.
 * Description: A set is `samples/<name>.json`; the list follows the project's
 *              file listing. An edit reads the set's current text (the open
 *              buffer, else the disk's), applies a pure change to its plain
 *              document, and replaces the text as one undo step
 *              (`ProjectDocuments.replaceText`), so it is dirty until saved,
 *              exactly as an XML edit is. A set whose text does not parse is
 *              never edited: overwriting it would lose what its author wrote.
 *
 *              Creating, duplicating, renaming and deleting a set are file
 *              operations the author asks for by name, so they happen on disk
 *              at once; the view asks before a delete. A rename writes the new
 *              file from the current text, then deletes the old, and the active
 *              set follows it. Deleting the active set leaves none active.
 *
 * Exports:
 * - SetChange:          A pure change to a set's document
 * - SampleSets:         The sets
 *
 *     - names:          The sets' names, sorted
 *     - pathOf():       A set's path
 *     - documentOf():   A set's document, if it parses
 *     - isDirty():      Whether its buffer is unsaved
 *     - edit():         Apply a change, as one undo step
 *     - undo(), redo(): Step its document's undo stack
 *     - create():       A new set
 *     - duplicate():    A copy under a new name
 *     - rename():       A new name, the active set following
 *     - remove():       Delete one
 *     - save():         Save one
 *     - cycle():        Make the next or previous set active, none included
 *
 *     Document changes:
 * - withValue():        A subject's value written, or removed to inherit
 * - withRows():         A collection's rows replaced
 * - rowsIn():           A collection's rows, as written
 */

import { loadMonaco } from '../monaco/monaco';
import { Observable } from '../state/observable';
import type { ActiveSampleSet } from './active-sample-set';
import type { ProjectDocuments } from '../documents/project-documents';
import {
  isSampleSetPath,
  readSampleSetDocument,
  sampleSetName,
  sampleSetPath,
  serialiseSampleSet,
  validSetName,
  type SampleSetDocument,
} from './sample-set';

/** A pure change to a set's document: returns the new document. */
export type SetChange = (document: SampleSetDocument) => SampleSetDocument;

/** The project's sample sets. */
export class SampleSets {
  /** The sets' names, sorted: what the view lists and the switcher cycles. */
  readonly names = new Observable<readonly string[]>([]);

  private readonly documents: ProjectDocuments;
  private readonly active: ActiveSampleSet;
  private readonly log: (line: string) => void;
  private readonly save_: (path: string) => Promise<unknown>;

  /**
   * @param documents The project's documents.
   * @param active    The active set, which a rename or delete moves.
   * @param log       Where a refused change is said (Output).
   * @param save      How a document is saved (the workspace's, which reports a failure).
   */
  constructor(documents: ProjectDocuments, active: ActiveSampleSet, log: (line: string) => void, save: (path: string) => Promise<unknown>) {
    this.documents = documents;
    this.active = active;
    this.log = log;
    this.save_ = save;
    const refresh = (): void => {
      const names = this.documents.files
        .get()
        .filter(isSampleSetPath)
        .map(sampleSetName)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const current = this.names.get();
      if (names.length !== current.length || names.some((name, i) => name !== current[i])) this.names.set(names);
    };
    // The workspace lives as long as the page, so this is never unsubscribed.
    this.documents.files.subscribe(refresh);
    refresh();
  }

  /** @brief A set's project path. */
  pathOf(name: string): string {
    return sampleSetPath(name);
  }

  /** @brief A set's document, from its current text; undefined if it is missing or does not parse. */
  documentOf(name: string): SampleSetDocument | undefined {
    const text = this.documents.textOf(sampleSetPath(name));
    return text === undefined ? undefined : readSampleSetDocument(text);
  }

  /** @brief Whether a set's buffer differs from what was last saved. */
  isDirty(name: string): boolean {
    return this.documents.dirty.get().has(sampleSetPath(name));
  }

  /**
   * @brief Applies a change to a set as one undo step. The set is then dirty
   *        until saved, like an XML edit; project XML is never touched.
   *
   * @return Whether it was applied; a set whose text does not parse is refused.
   */
  async edit(name: string, change: SetChange): Promise<boolean> {
    await loadMonaco();
    const path = sampleSetPath(name);
    const document = this.documentOf(name);
    if (document === undefined) {
      this.log(`${path} is not valid JSON, so it was not changed: fix it in its editor tab first`);
      return false;
    }
    return this.documents.replaceText(path, serialiseSampleSet(change(document)));
  }

  /** @brief Undoes the last change to a set's document, as ⌘Z in its tab would. */
  undo(name: string): void {
    this.documents.modelOf(sampleSetPath(name))?.undo();
  }

  /** @brief Redoes the last undone change to a set's document. */
  redo(name: string): void {
    this.documents.modelOf(sampleSetPath(name))?.redo();
  }

  /**
   * @brief Creates a set, written to disk at once.
   *
   * @param name     Its name; `validSetName()` holds it.
   * @param document Its content; empty when omitted.
   * @return Why it was not created, or undefined when it was.
   */
  async create(name: string, document: SampleSetDocument = { u8g2gl_samples: 1, values: {}, rows: {} }): Promise<string | undefined> {
    return this.createText(name, serialiseSampleSet(document));
  }

  /** @brief Copies a set's current text under a new name. */
  async duplicate(name: string, copy: string): Promise<string | undefined> {
    const text = this.documents.textOf(sampleSetPath(name));
    if (text === undefined) return `there is no set '${name}'`;
    return this.createText(copy, text);
  }

  /**
   * @brief Renames a set: the new file from the current text (an unsaved
   *        buffer included), then the old one deleted. The active set follows.
   */
  async rename(name: string, to: string): Promise<string | undefined> {
    const refused = await this.duplicate(name, to);
    if (refused !== undefined) return refused;
    const removed = await this.documents.remove(sampleSetPath(name));
    if (!removed) return `'${to}' was created, but '${name}' could not be deleted: see Output`;
    if (this.active.name.get() === name) this.active.choose(to);
    return undefined;
  }

  /** @brief Deletes a set from disk. The caller has asked first. */
  async remove(name: string): Promise<boolean> {
    const removed = await this.documents.remove(sampleSetPath(name));
    if (removed && this.active.name.get() === name) this.active.choose(undefined);
    return removed;
  }

  /**
   * @brief Makes the next (1) or previous (-1) set active, in name order, with
   *        none (the initial values) as the stop before the first: the canvas
   *        switcher's keyboard cycle, so one layout is swept against every set.
   *
   * @return The set now active, or undefined for none.
   */
  cycle(by: 1 | -1): string | undefined {
    const stops: (string | undefined)[] = [undefined, ...this.names.get()];
    const current = this.active.name.get();
    const at = Math.max(0, stops.indexOf(stops.includes(current) ? current : undefined));
    const next = stops[(at + by + stops.length) % stops.length];
    this.active.choose(next);
    return next;
  }

  /** @brief Saves a set's buffer. */
  async save(name: string): Promise<void> {
    await this.save_(sampleSetPath(name));
  }

  // createText
  // A new set's file, written at once; the reason when it is refused.
  private async createText(name: string, text: string): Promise<string | undefined> {
    if (!validSetName(name)) return `'${name}' cannot name a set: use letters, digits, spaces, '_', '.' and '-', starting with a letter or digit`;
    if (this.names.get().includes(name)) return `there is already a set '${name}'`;
    const outcome = await this.documents.create(sampleSetPath(name), text);
    return outcome === 'saved' ? undefined : outcome === 'conflict' ? `samples/${name}.json already exists` : 'it could not be written: see Output';
  }
}

/**
 * @brief A set's document with a subject's value written, or removed (so the
 *        subject inherits its initial value) when `value` is undefined.
 */
export function withValue(document: SampleSetDocument, subject: string, value: unknown): SampleSetDocument {
  const values = { ...document.values };
  if (value === undefined) delete values[subject];
  else values[subject] = value;
  return { ...document, values };
}

/** @brief A collection's rows as the set writes them; none when it gives none. */
export function rowsIn(document: SampleSetDocument | undefined, file: string, element: string): readonly unknown[] {
  const rows = document?.rows[file]?.[element];
  return Array.isArray(rows) ? rows : [];
}

/** @brief A set's document with one collection's rows replaced. */
export function withRows(document: SampleSetDocument, file: string, element: string, rows: readonly unknown[]): SampleSetDocument {
  return { ...document, rows: { ...document.rows, [file]: { ...(document.rows[file] ?? {}), [element]: [...rows] } } };
}
