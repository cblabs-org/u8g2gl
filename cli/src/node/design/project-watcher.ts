/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/project-watcher.ts
 * Purpose: Turns raw filesystem notifications into the `changed` / `added` /
 *          `removed` events the editor acts on: an external change to a clean
 *          buffer reloads it, and to a dirty one asks the user. Raw
 *          notifications are not that: one save is often several (truncate,
 *          write, metadata, or an IDE's write-to-temp-then-rename), they do not
 *          say whether a file is new, and on macOS they can report changes made
 *          just before the watch began. Each would be a spurious reload or a
 *          spurious "keep mine or take theirs?" prompt.
 * Description: `node:fs.watch` with `recursive: true` — no watcher dependency —
 *              then, per path, a short debounce, after which the path's
 *              current state is compared with what the watcher last knew:
 *              its content version, or absence. Only a real difference is
 *              reported, so a burst of notifications becomes one event, a
 *              temporary file that came and went becomes none, and a
 *              notification whose content did not change is dropped. A
 *              directory event is expanded to the files beneath it, which is
 *              how a moved-in or deleted directory reports every file.
 *
 * Exports:
 * - WATCH_DEBOUNCE_MS:     How long a path must be quiet before it is reported
 * - ProjectWatcher:        The watcher
 *
 *     Lifecycle:
 *     - start():           Snapshot the project and begin watching
 *     - close():           Stop, and cancel pending reports
 */

import { watch, type FSWatcher } from 'node:fs';
import { sep } from 'node:path';
import type { ProjectFsEvent } from '../../core/project-fs/project-file-system.js';
import { checkProjectPath } from '../../core/project-fs/project-path-rule.js';
import type { DiskProject } from './disk-project.js';
import { isIgnoredPath } from './ignored-paths.js';

/**
 * How long a path must be quiet before it is reported. Long enough to fold one
 * save's burst of notifications into one event; well inside the 200 ms the
 * editor allows from an external write to its event.
 */
export const WATCH_DEBOUNCE_MS = 30;

/**
 * Watches one project directory and reports changes to its source files.
 */
export class ProjectWatcher {
  private readonly project: DiskProject;
  private readonly onEvent: (event: ProjectFsEvent) => void;
  /** Last known content version of every project source file. */
  private readonly known = new Map<string, string>();
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private watcher: FSWatcher | undefined;

  /**
   * @param project The project directory.
   * @param onEvent Called once per real change, after the debounce.
   */
  constructor(project: DiskProject, onEvent: (event: ProjectFsEvent) => void) {
    this.project = project;
    this.onEvent = onEvent;
  }

  /**
   * @brief Records every file's current version, then starts watching.
   *
   * @throws Error if the platform cannot watch recursively (Linux before
   *         Node 20): the server is not useful without it, and saying so beats
   *         an editor that silently never reloads.
   */
  start(): void {
    // --- Step 1: Snapshot first, so the first notification has a baseline ---
    for (const path of this.project.listFiles()) {
      const file = this.project.read(path);
      if (file.ok) {
        this.known.set(path, file.version);
      }
    }

    // --- Step 2: Watch the whole tree ---
    this.watcher = watch(this.project.root, { recursive: true }, (_type, filename) => {
      if (filename !== null) {
        this.schedule(String(filename).split(sep).join('/'));
      }
    });
    // A watcher error (the directory removed, a descriptor limit) must not
    // crash the server; the editor keeps working without external reloads.
    this.watcher.on('error', () => {});
  }

  /** @brief Stops watching and drops every pending report. */
  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }

  // schedule
  // (Re)starts the debounce for one path, so only the last notification of a
  // burst leads to a report.
  //   path — project-relative POSIX path from the notification
  private schedule(path: string): void {
    if (isIgnoredPath(path) || !checkProjectPath(path).ok) {
      return;
    }
    const existing = this.pending.get(path);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    this.pending.set(
      path,
      setTimeout(() => {
        this.pending.delete(path);
        this.settle(path);
      }, WATCH_DEBOUNCE_MS),
    );
  }

  // settle
  // Compares a quiet path's state now with what was last known, and reports
  // the difference. The path may be a file, a directory, or gone.
  //   path — project-relative POSIX path
  private settle(path: string): void {
    // --- Step 1: Everything the watcher knew at or beneath this path ---
    const before = [...this.known.keys()].filter((p) => p === path || p.startsWith(`${path}/`));

    // --- Step 2: Everything that is there now — one file, a directory's files, or nothing ---
    const now = new Map<string, string>();
    const file = this.project.read(path);
    if (file.ok) {
      now.set(path, file.version);
    } else {
      for (const candidate of this.project.listFiles()) {
        if (candidate.startsWith(`${path}/`)) {
          const inner = this.project.read(candidate);
          if (inner.ok) {
            now.set(candidate, inner.version);
          }
        }
      }
    }

    // --- Step 3: Report removals, then additions and real changes ---
    for (const gone of before) {
      if (!now.has(gone)) {
        this.known.delete(gone);
        this.onEvent({ kind: 'removed', path: gone });
      }
    }
    for (const [present, version] of now) {
      const previous = this.known.get(present);
      if (previous === version) {
        continue;
      }
      this.known.set(present, version);
      this.onEvent({ kind: previous === undefined ? 'added' : 'changed', path: present });
    }
  }
}
