/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer-expansion.ts
 * Purpose: Which screens the Explorer shows expanded, remembered per browser
 *          (ui_spec §6), so an author who opened a screen's element rows finds
 *          them open after a reload, and one who closed them finds them
 *          closed. Kept apart from the component, and from React, so the
 *          storage rules are unit-tested without a browser.
 * Description: A screen's state is three-valued: expanded, collapsed, or never
 *              set. Never set is collapsed, except that the screen the canvas
 *              shows expands when first shown — and only then, so a screen the
 *              author collapsed stays collapsed when the canvas draws it
 *              again. The state is stored per project, under one key, as JSON.
 *              Storage can be missing or throw (a private window, a test page):
 *              everything then starts collapsed, still expands and collapses,
 *              and is simply not remembered.
 *
 * Exports:
 * - EXPANSION_KEY:       Where this browser remembers the state, before the project's name
 * - ExplorerExpansion:   The state
 *
 *     Reading:
 *     - expanded:          The expanded screens, observable
 *
 *     Changing:
 *     - setExpanded():     Expand or collapse one screen, and remember it
 *     - shown():           The canvas shows a screen: expand it if never set
 */

import { Observable } from '../state/observable';
import { browserStorage, type SettingStorage } from '../state/setting-storage';

/** Where this browser remembers the expanded screens; the project's name follows. */
export const EXPANSION_KEY = 'u8g2gl.explorer.expanded:';

/** The Explorer's expanded screens, remembered per browser and project. */
export class ExplorerExpansion {
  /** The screens shown expanded, by project path. */
  readonly expanded: Observable<ReadonlySet<string>>;

  private readonly key: string;
  private readonly storage: SettingStorage;
  /** Every screen's remembered state; a screen absent was never set. */
  private readonly states: Map<string, boolean>;

  /**
   * @param project The project's name, which keeps two projects served from
   *                one origin apart.
   * @param storage Where the state is kept; the browser's by default.
   */
  constructor(project: string, storage: SettingStorage = browserStorage()) {
    this.key = `${EXPANSION_KEY}${project}`;
    this.storage = storage;
    this.states = this.read();
    this.expanded = new Observable<ReadonlySet<string>>(this.expandedSet());
  }

  /** @brief Expands or collapses one screen's rows, and remembers it. */
  setExpanded(file: string, expanded: boolean): void {
    this.states.set(file, expanded);
    this.write();
    this.expanded.set(this.expandedSet());
  }

  /**
   * @brief The canvas now shows `file`: it expands if its state was never set,
   *        and is otherwise left as the author left it.
   */
  shown(file: string): void {
    if (!this.states.has(file)) this.setExpanded(file, true);
  }

  // expandedSet
  // The screens whose remembered state is expanded.
  private expandedSet(): ReadonlySet<string> {
    return new Set([...this.states].filter(([, on]) => on).map(([file]) => file));
  }

  // read
  // The remembered states; none when storage is missing, throws, or holds
  // something that is not an object of booleans.
  private read(): Map<string, boolean> {
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed: unknown = raw === null || raw === undefined ? {} : JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map();
      return new Map(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
    } catch {
      return new Map();
    }
  }

  // write
  // Remembers every state, when storage allows; a failure keeps nothing and is
  // not an error.
  private write(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(Object.fromEntries(this.states)));
    } catch {
      // Not kept: see read.
    }
  }
}
