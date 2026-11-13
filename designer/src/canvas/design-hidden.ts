/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/canvas/design-hidden.ts
 * Purpose: The elements the author has hidden in the designer (ui_spec §6):
 *          a view setting, so that elements layered on top of each other can
 *          be seen and clicked one at a time. It is deliberately not the
 *          device's `hidden`: it never touches the XML, the buffer, undo, the
 *          dirty marker, generated code or a test run, so nothing exported can
 *          see it. That separation is the point of this module, and why it
 *          lives outside the document, beside the selection, rather than in it.
 * Description: Per project file, a set of element names the author hid, kept
 *              outside React as the selection is, and remembered per browser
 *              and project in `localStorage`; storage that is missing or
 *              throws means not remembered, and everything still works. Names
 *              no longer in a file are dropped after a pipeline run (`prune`),
 *              so a renamed element shows again.
 *
 *              What the canvas leaves out is the *effective* set
 *              (`effectiveHidden()`): the hidden names and every element nested
 *              under one, from the Explorer's element tree. A row inside a
 *              hidden row is hidden by its parent, not by the author.
 *
 * Exports:
 * - DESIGN_HIDDEN_KEY:  Where this browser remembers the sets, before the project's name
 * - effectiveHidden():  The names hidden, with everything nested under them
 * - DesignHiddenModel:  The author's hidden names, per file
 *
 *     State:
 *     - hidden:           Every file's hidden names, observable
 *     - namesIn():        One file's
 *
 *     Changing (never an edit):
 *     - load():           Read this project's remembered sets
 *     - setHidden():      Hide or show one element
 *     - showAll():        Show every element of a file
 *     - prune():          Drop names a file no longer has
 */

import { descendantNames, findNode, type ElementNode } from '../documents/element-tree';
import { Observable } from '../state/observable';
import { browserStorage, type SettingStorage } from '../ui/explorer-expansion';

/** Where this browser remembers the hidden names; the project's name follows. */
export const DESIGN_HIDDEN_KEY = 'u8g2gl.design-hidden:';

/** Every file's hidden names; a file with none is absent. */
type HiddenByFile = ReadonlyMap<string, ReadonlySet<string>>;

/** No names: shared, so an empty answer is one object. */
const NONE: ReadonlySet<string> = new Set();

/**
 * @brief The names a screen's canvas leaves out: the hidden names that are in
 *        the tree, and every name nested under one of them.
 *
 * @param tree   The screen's element tree.
 * @param hidden The names the author hid in that screen.
 */
export function effectiveHidden(tree: readonly ElementNode[], hidden: ReadonlySet<string>): Set<string> {
  const present = [...hidden].filter((name) => findNode(tree, name) !== undefined);
  return new Set([...present, ...descendantNames(tree, new Set(present))]);
}

/** The author's hidden elements, per file. Changing them is never an edit. */
export class DesignHiddenModel {
  /** Every file's hidden names, by project path. */
  readonly hidden = new Observable<HiddenByFile>(new Map());

  private key: string | undefined;
  private storage: SettingStorage = null;

  /**
   * @brief Reads this project's remembered sets, replacing any held.
   *
   * @param project The project's name, which keeps two projects served from
   *                one origin apart.
   * @param storage Where the sets are kept; the browser's by default.
   */
  load(project: string, storage: SettingStorage = browserStorage()): void {
    this.key = `${DESIGN_HIDDEN_KEY}${project}`;
    this.storage = storage;
    this.hidden.set(this.read());
  }

  /** @brief The names hidden in one file; empty when none are. */
  namesIn(file: string): ReadonlySet<string> {
    return this.hidden.get().get(file) ?? NONE;
  }

  /** @brief Hides or shows one element of a file, and remembers it. */
  setHidden(file: string, name: string, hidden: boolean): void {
    const names = new Set(this.namesIn(file));
    if (hidden === names.has(name)) return;
    if (hidden) names.add(name);
    else names.delete(name);
    this.replace(file, names);
  }

  /** @brief Shows every element of a file. */
  showAll(file: string): void {
    if (this.namesIn(file).size > 0) this.replace(file, new Set());
  }

  /**
   * @brief Drops the names a file's tree no longer has. A file without a tree
   *        (one that has never parsed) is left alone, so a name is never lost
   *        to text that is merely half-typed.
   *
   * @param trees Each screen's element tree, by project path.
   */
  prune(trees: ReadonlyMap<string, readonly ElementNode[]>): void {
    for (const [file, names] of this.hidden.get()) {
      const tree = trees.get(file);
      if (tree === undefined) continue;
      const kept = new Set([...names].filter((name) => findNode(tree, name) !== undefined));
      if (kept.size !== names.size) this.replace(file, kept);
    }
  }

  // replace
  // One file's names replaced, published and remembered.
  private replace(file: string, names: ReadonlySet<string>): void {
    const next = new Map(this.hidden.get());
    if (names.size === 0) next.delete(file);
    else next.set(file, names);
    this.hidden.set(next);
    this.write();
  }

  // read
  // The remembered sets; none when storage is missing, throws, or holds
  // something that is not an object of string arrays.
  private read(): Map<string, ReadonlySet<string>> {
    try {
      const raw = this.key === undefined ? null : this.storage?.getItem(this.key);
      const parsed: unknown = raw === null || raw === undefined ? {} : JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map();
      const sets = new Map<string, ReadonlySet<string>>();
      for (const [file, names] of Object.entries(parsed)) {
        if (!Array.isArray(names)) continue;
        const strings = names.filter((name): name is string => typeof name === 'string');
        if (strings.length > 0) sets.set(file, new Set(strings));
      }
      return sets;
    } catch {
      return new Map();
    }
  }

  // write
  // Remembers every set, when storage allows; a failure keeps nothing and is
  // not an error.
  private write(): void {
    if (this.key === undefined) return;
    try {
      const plain = Object.fromEntries([...this.hidden.get()].map(([file, names]) => [file, [...names]]));
      this.storage?.setItem(this.key, JSON.stringify(plain));
    } catch {
      // Not kept: see read.
    }
  }
}
