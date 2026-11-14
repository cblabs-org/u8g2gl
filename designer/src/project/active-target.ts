/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/project/active-target.ts
 * Purpose: Which of the project's targets the designer shows ([U-3], closed by
 *          D1): one canvas, with a switcher in the status bar. The canvas, an
 *          insert, the display picker's impact preview and the budget figure
 *          all read the target from here, so nothing in the designer takes
 *          the first target behind the author's back.
 * Description: The choice is per-browser view state, like the elements hidden
 *              in the designer: kept in localStorage by project, never in the
 *              XML, the buffer or undo, so switching is never an edit. The
 *              stored name is a preference; `pickTarget` turns it into a
 *              target, falling back to the first (the project's default,
 *              design_spec §5.1) when the name is missing or no longer
 *              declared, as after a rename. Storage can be missing or throw:
 *              the choice then lasts as long as the page.
 *
 * Exports:
 * - ACTIVE_TARGET_KEY:  Where this browser keeps the choice, before the project's name
 * - pickTarget():       The target a stored name stands for, or the first
 * - ActiveTarget:       The choice
 *
 *     - name:     The chosen target's name, observable; undefined is the default
 *     - load():   Read the choice for a project
 *     - choose(): Choose a target, and remember it
 */

import type { Target } from '@u8g2gl/core/schema/project.js';
import { Observable } from '../state/observable';
import { browserStorage, type SettingStorage } from '../state/setting-storage';

/** Where this browser keeps the active target; the project's name follows. */
export const ACTIVE_TARGET_KEY = 'u8g2gl.target:';

/**
 * @brief The target a chosen name stands for: the target of that name, or the
 *        first target when there is no choice or no target has that name.
 *
 * @param targets The project's targets, in document order.
 * @param name    The chosen name, if any.
 * @return Undefined only when the project declares no target.
 */
export function pickTarget(targets: readonly Target[], name: string | undefined): Target | undefined {
  return (name === undefined ? undefined : targets.find((target) => target.name === name)) ?? targets[0];
}

/** The target the designer shows, chosen per browser and project. */
export class ActiveTarget {
  /** The chosen target's name; undefined until one is chosen, which means the first. */
  readonly name = new Observable<string | undefined>(undefined);

  private readonly storage: SettingStorage;
  private key: string | undefined;

  /** @param storage Where the choice is kept; the browser's by default. */
  constructor(storage: SettingStorage = browserStorage()) {
    this.storage = storage;
  }

  /** @brief Reads the remembered choice for a project, once its name is known. */
  load(project: string): void {
    this.key = `${ACTIVE_TARGET_KEY}${project}`;
    try {
      const stored = this.storage?.getItem(this.key);
      this.name.set(typeof stored === 'string' && stored !== '' ? stored : undefined);
    } catch {
      this.name.set(undefined);
    }
  }

  /** @brief Chooses a target by name, and remembers it in this browser. Never an edit. */
  choose(name: string): void {
    this.name.set(name);
    if (this.key === undefined) return;
    try {
      this.storage?.setItem(this.key, name);
    } catch {
      // Not remembered: storage is unavailable, and the choice lasts the page.
    }
  }
}
