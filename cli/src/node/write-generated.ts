/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/write-generated.ts
 * Purpose: The only code that puts generated files on disk. Generation writes
 *          only to the configured output directory ([D-11], §13.10), and a
 *          generator that deleted a hand-written file, or wrote through `..` or
 *          a symlink into the application's own sources, would destroy work
 *          nobody can regenerate. So this module owns three guarantees: nothing is
 *          written outside the output directory; nothing is deleted unless it
 *          carries the GENERATED marker; nothing is written at all for a result
 *          with errors.
 * Description: Planning and writing are separate. `planGeneratedWrite()` reads
 *              the output directory and says what each file would do — created,
 *              updated, unchanged, or a stale generated file deleted — writing
 *              nothing; `generate --check` is exactly that plan (§16's CI check).
 *              `writeGenerated()` checks every path first and only then writes,
 *              so a rejected path leaves the directory untouched. Files whose
 *              bytes are already right are not rewritten.
 *
 * Exports:
 * - FileAction:             'created' | 'updated' | 'unchanged' | 'deleted'
 * - FileChange:             One output path and what happens to it
 * - planGeneratedWrite():   What writing would do, writing nothing
 * - writeGenerated():       Write a generation result into the output directory
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  isGeneratedContent,
  type GeneratedFile,
  type GenerateResult,
} from '../core/generator/index.js';

/** What writing does to one output path. */
export type FileAction = 'created' | 'updated' | 'unchanged' | 'deleted';

/** One output path and its action. */
export interface FileChange {
  /** Path relative to the output directory, forward slashes. */
  readonly path: string;
  readonly action: FileAction;
}

/** Whether `candidate` is `root` itself or lies beneath it. */
function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

// confinedPath
// The absolute destination of a generated file, or a thrown error if it could
// land outside the output directory. Checked lexically (no absolute path, no
// `..`/`.`/empty segment, no backslash) *and* physically (the nearest existing
// ancestor resolves, through symlinks, inside the real output directory, and the
// file itself is not a symlink). Throws because core never produces such a path:
// reaching here is a programmer error, not a user one.
//   outDir — absolute output directory
//   path   — the generated file's output-relative path
function confinedPath(outDir: string, path: string): string {
  // --- Step 1: Lexical — reject anything that is not a plain relative path ---
  const segments = path.split('/');
  if (
    path === '' ||
    isAbsolute(path) ||
    path.includes('\\') ||
    segments.some((s) => s === '' || s === '.' || s === '..')
  ) {
    throw new Error(`Refusing to write '${path}': generated paths must be relative and stay inside the output directory.`);
  }
  const absolute = resolve(outDir, ...segments);
  if (!isWithin(outDir, absolute) || absolute === outDir) {
    throw new Error(`Refusing to write '${path}': it resolves outside the output directory.`);
  }

  // --- Step 2: Physical — a symlink inside the directory must not lead out ---
  let ancestor = dirname(absolute);
  while (!existsSync(ancestor) && isWithin(outDir, ancestor) && ancestor !== outDir) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(outDir)) {
    const realOut = realpathSync(outDir);
    if (existsSync(ancestor) && !isWithin(realOut, realpathSync(ancestor))) {
      throw new Error(`Refusing to write '${path}': a symlink leads outside the output directory.`);
    }
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`Refusing to write '${path}': the destination is a symlink.`);
  }
  return absolute;
}

// listFiles
// Every regular file under a directory, output-relative, sorted by code unit so
// the plan's order is the same on every platform. Symlinks are not followed and
// not listed: the writer never deletes through one.
//   root     — absolute directory to list
//   relative — prefix for recursion; '' at the top
function listFiles(root: string, relative = ''): string[] {
  const here = relative === '' ? root : join(root, ...relative.split('/'));
  const found: string[] = [];
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listFiles(root, rel));
    } else if (entry.isFile()) {
      found.push(rel);
    }
  }
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * @brief Says what writing `files` into `outDir` would do, writing nothing.
 *
 * A file already in `outDir` that is not in `files` is `deleted` only if it
 * starts with the GENERATED marker; any other file is not listed and never
 * touched.
 *
 * @param outDir Output directory; need not exist (every file is then `created`).
 * @param files  Generated files, in emission order.
 * @return One change per generated file in emission order, then the stale
 *         generated files to delete, sorted.
 * @throws Error if any path could land outside `outDir` (see confinedPath).
 */
export function planGeneratedWrite(outDir: string, files: readonly GeneratedFile[]): readonly FileChange[] {
  const root = resolve(outDir);

  // --- Step 1: Each generated file against what is on disk ---
  const changes: FileChange[] = files.map((file) => {
    const destination = confinedPath(root, file.path);
    if (!existsSync(destination)) {
      return { path: file.path, action: 'created' };
    }
    const current = readFileSync(destination, 'utf-8');
    return { path: file.path, action: current === file.content ? 'unchanged' : 'updated' };
  });

  // --- Step 2: Stale generated files — present, not regenerated, and stamped ---
  if (existsSync(root)) {
    const generatedPaths = new Set(files.map((f) => f.path));
    for (const path of listFiles(root)) {
      if (generatedPaths.has(path)) {
        continue;
      }
      if (isGeneratedContent(readFileSync(join(root, ...path.split('/')), 'utf-8'))) {
        changes.push({ path, action: 'deleted' });
      }
    }
  }

  return changes;
}

/**
 * @brief Writes a generation result into the output directory.
 *
 * Every path is checked before anything is written. Unchanged files are not
 * rewritten; stale files carrying the GENERATED marker are deleted; everything
 * else in the directory is left alone.
 *
 * @param outDir Output directory, created if absent.
 * @param result A generation result. It must have no errors.
 * @return The changes made, in {@link planGeneratedWrite}'s order.
 * @throws Error, writing nothing, if `result.errors` is non-zero or any path
 *         could land outside `outDir`. Both are programmer errors: the CLI
 *         never calls this for a refused build, and core never emits such a path.
 */
export function writeGenerated(outDir: string, result: GenerateResult): readonly FileChange[] {
  // --- Step 1: Refuse a result validation did not pass ---
  if (result.errors > 0) {
    throw new Error(`Refusing to write generated files: validation reported ${result.errors} error(s).`);
  }

  // --- Step 2: Plan, which confines every path before any write ---
  const root = resolve(outDir);
  const changes = planGeneratedWrite(root, result.files);
  const contentByPath = new Map(result.files.map((f) => [f.path, f.content]));

  // --- Step 3: Apply ---
  for (const change of changes) {
    const destination = join(root, ...change.path.split('/'));
    if (change.action === 'deleted') {
      unlinkSync(destination);
    } else if (change.action !== 'unchanged') {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, contentByPath.get(change.path) ?? '', 'utf-8');
    }
  }
  return changes;
}
