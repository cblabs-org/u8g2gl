/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/active-sample-set.ts
 * Purpose: Which sample set the canvas shows: a view setting of this browser,
 *          kept per project like the active target, and never written to the
 *          project. Two authors sharing a project through source control each
 *          sweep the sets on their own, and nothing in the XML or a set file
 *          records who was looking at what (ui_spec §11).
 * Description: The set is remembered by name in the browser's storage under
 *              `u8g2gl.samples:<project>`. No set chosen, or a name whose file
 *              is not there, means the canvas draws the initial values only, as
 *              it did before sets existed. Storage that is unavailable leaves
 *              the choice for the life of the page.
 *
 * Exports:
 * - ACTIVE_SAMPLE_SET_KEY: The storage key's prefix
 * - ActiveSampleSet:       The chosen set
 *
 *     - name:              The chosen set's name, if any
 *     - load():            Read the remembered choice for a project
 *     - choose():          Choose a set, or none, and remember it
 */

import { Observable } from '../state/observable';
import { browserStorage, type SettingStorage } from '../state/setting-storage';

/** Where this browser keeps the active set; the project's name follows. */
export const ACTIVE_SAMPLE_SET_KEY = 'u8g2gl.samples:';

/** The sample set the designer shows, chosen per browser and project. */
export class ActiveSampleSet {
  /** The chosen set's name; undefined for none, which draws the initial values. */
  readonly name = new Observable<string | undefined>(undefined);

  private readonly storage: SettingStorage;
  private key: string | undefined;

  /** @param storage Where the choice is kept; the browser's by default. */
  constructor(storage: SettingStorage = browserStorage()) {
    this.storage = storage;
  }

  /** @brief Reads the remembered choice for a project, once its name is known. */
  load(project: string): void {
    this.key = `${ACTIVE_SAMPLE_SET_KEY}${project}`;
    try {
      const stored = this.storage?.getItem(this.key);
      this.name.set(typeof stored === 'string' && stored !== '' ? stored : undefined);
    } catch {
      this.name.set(undefined);
    }
  }

  /** @brief Chooses a set by name, or none, and remembers it in this browser. Never an edit. */
  choose(name: string | undefined): void {
    this.name.set(name);
    if (this.key === undefined) return;
    try {
      this.storage?.setItem(this.key, name ?? '');
    } catch {
      // Not remembered: storage is unavailable, and the choice lasts the page.
    }
  }
}
