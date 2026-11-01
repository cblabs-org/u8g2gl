/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/stage-project.ts
 * Purpose: Makes a test run test **the text the canvas showed**, not the text
 *          on disk. The designer's live canvas draws its open buffers, saved
 *          or not, so a verdict about the saved files would vouch for text the
 *          user is not looking at. The designer posts every buffer that
 *          differs from disk; this module stages a copy of the project in the
 *          build cache with those buffers in place, and the test run generates
 *          from the copy. Nothing is written to the project: saving stays the
 *          user's act, never the designer's.
 * Description: The copy lives at `<project cache>/staged/`, one per project,
 *              and is synchronised rather than rebuilt: a file is written only
 *              when its bytes differ, and a file the project no longer has is
 *              removed, so the staged path, and with it every object key the
 *              build derives from it, stays stable from run to run. Project
 *              source is what DiskProject lists (ignored paths excluded), so
 *              `generated/` is never copied: the build generates its own.
 *              Widget C++ is always the disk's, because the designer does not
 *              edit it: an overlay may only replace an XML document.
 *
 * Exports:
 * - StagedDocument:   One buffer the designer posted
 * - StagedProject:    The staged copy
 * - stageProject():   Synchronise the copy and apply the buffers
 * - checkStagedDocuments(): Validate posted buffers before staging
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkProjectPath } from '../../../core/project-fs/project-path-rule.js';
import { projectCacheDir } from '../build/prepare-build.js';
import { DiskProject } from '../disk-project.js';
import { isIgnoredPath } from '../ignored-paths.js';

/** One buffer the designer posted: a document whose text differs from disk. */
export interface StagedDocument {
  /** Project-relative, `/`-separated. */
  readonly path: string;
  /** The buffer's full text. */
  readonly content: string;
  /** The designer's version of that text, echoed in the result so it can tell what was tested. */
  readonly version: string;
}

/** The staged copy. */
export interface StagedProject {
  /** The copy's root: generate from here. */
  readonly root: string;
  /** Files written or removed by this synchronisation, project-relative. */
  readonly changed: readonly string[];
}

/**
 * @brief Why posted buffers cannot be staged, or undefined if they can.
 *
 * A buffer must name a project XML document by a path the project's own
 * rule accepts, outside the ignored directories, once.
 */
export function checkStagedDocuments(documents: readonly StagedDocument[]): string | undefined {
  const seen = new Set<string>();
  for (const document of documents) {
    if (!checkProjectPath(document.path).ok || isIgnoredPath(document.path)) {
      return `'${document.path}' is not a project source path`;
    }
    if (!document.path.endsWith('.xml')) {
      return `'${document.path}' is not an XML document: the designer edits only those`;
    }
    if (seen.has(document.path)) {
      return `'${document.path}' is posted twice`;
    }
    seen.add(document.path);
  }
  return undefined;
}

/**
 * @brief Synchronises the project's staged copy with disk, then applies the buffers.
 *
 * @param projectRoot The user's project.
 * @param cacheRoot   The editor build cache.
 * @param documents   Checked by checkStagedDocuments() first.
 */
export function stageProject(projectRoot: string, cacheRoot: string, documents: readonly StagedDocument[]): StagedProject {
  const project = new DiskProject(projectRoot);
  const root = join(projectCacheDir(cacheRoot, project.root), 'staged');
  const changed: string[] = [];

  // --- Step 1: Every source file's bytes: the disk's, or the buffer's ---
  const wanted = new Map<string, Uint8Array>();
  for (const path of project.listFiles()) {
    wanted.set(path, readFileSync(project.absolutePath(path)));
  }
  for (const document of documents) {
    wanted.set(document.path, new TextEncoder().encode(document.content));
  }

  // --- Step 2: Write what differs, so unchanged files keep their bytes and paths ---
  for (const [path, bytes] of wanted) {
    const target = join(root, ...path.split('/'));
    if (existsSync(target) && Buffer.from(readFileSync(target)).equals(bytes)) {
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    changed.push(path);
  }

  // --- Step 3: Remove what the project no longer has ---
  for (const path of listStaged(root)) {
    if (!wanted.has(path)) {
      unlinkSync(join(root, ...path.split('/')));
      changed.push(path);
    }
  }
  removeEmptyDirectories(root);
  return { root, changed: changed.sort() };
}

// listStaged
// Every file under the staged root, project-relative.
function listStaged(root: string, prefix = ''): string[] {
  const dir = prefix === '' ? root : join(root, ...prefix.split('/'));
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const path = prefix === '' ? name : `${prefix}/${name}`;
    return statSync(join(dir, name)).isDirectory() ? listStaged(root, path) : [path];
  });
}

// removeEmptyDirectories
// Deletes directories left empty by Step 3, deepest first; keeps the root.
function removeEmptyDirectories(dir: string, isRoot = true): void {
  if (!existsSync(dir)) {
    return;
  }
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (statSync(child).isDirectory()) {
      removeEmptyDirectories(child, false);
    }
  }
  if (!isRoot && readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
}
