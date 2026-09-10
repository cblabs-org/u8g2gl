/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/fix-names.ts
 * Purpose: The disk half of [U-1] write-back. `src/core/parser/name-policy.ts`
 *          decides *what* to insert and where; this module is the only place
 *          that touches the filesystem to do it. The split exists because the
 *          designer performs the identical operation against an in-memory
 *          buffer in the browser, where nothing under `src/core/` may import
 *          `node:` anything.
 * Description: Re-parses screen and component documents under the `'generate'`
 *              missing-name policy, applies the resulting insertions to their
 *              source files, and reports which names landed in which file. It
 *              never re-serialises XML — every change is a text insertion at a
 *              recorded source location, so comments, attribute order and
 *              indentation are preserved by construction.
 *
 * Exports:
 * - NameFixRecord:   One file, and the names written into it
 * - fixMissingNames: Generate and write names for a project directory or single file
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  applyTextEdits,
  parseComponentFile,
  parseScreenFile,
  type SourceEdit,
} from '../core/parser/index.js';
import { readProjectFiles } from './read-project.js';

/** One file rewritten by `--fix-names`, and the names inserted into it. */
export interface NameFixRecord {
  /** Project-relative path as reported to the user (forward slashes). */
  readonly file: string;
  /** Names inserted, in document order. */
  readonly names: readonly string[];
}

/**
 * Parses one document under the `'generate'` policy and returns its insertions.
 *
 * The root tag decides the parser, matching the dispatch `validate` already does
 * for a single file. Anything else — a project manifest, globals, a widget
 * manifest — has no element-identity namespace, so it has nothing to fix.
 */
function computeNameEdits(content: string, filename: string): readonly SourceEdit[] {
  const rootTag = content.match(/<([a-zA-Z0-9_]+)/)?.[1] ?? '';
  const options = { missingNamePolicy: 'generate' } as const;

  if (rootTag === 'screen') {
    return parseScreenFile(content, filename, options).nameEdits ?? [];
  }
  if (rootTag === 'component') {
    return parseComponentFile(content, filename, options).nameEdits ?? [];
  }
  return [];
}

/**
 * Extracts the inserted name from an edit's text for reporting.
 *
 * The edit text is built by `createNameInsertion()` and is always exactly
 * ` name="…"`, so this is a read of a known shape rather than XML parsing.
 */
function nameOfEdit(edit: SourceEdit): string {
  return edit.text.match(/name="([^"]*)"/)?.[1] ?? '';
}

/**
 * Applies a document's insertions to its file on disk.
 *
 * Re-reads the file rather than reusing the string the caller parsed, so the
 * bytes written are derived from the bytes on disk at the moment of writing.
 */
function writeNameEdits(absolutePath: string, edits: readonly SourceEdit[]): void {
  const original = readFileSync(absolutePath, 'utf-8');
  writeFileSync(absolutePath, applyTextEdits(original, edits), 'utf-8');
}

/**
 * @brief Writes generated names into every unnamed element of a project or file.
 *
 * @param targetPath Absolute path to a project directory or a single XML file.
 * @param targetLabel Path as the user typed it, used for a single file's report.
 * @return One record per file actually modified, ordered by file name. Files
 *         with nothing to fix are omitted entirely, so an empty array means the
 *         project already names every element.
 * @throws Error if a project directory has no u8g2gl.xml — propagated from
 *         readProjectFiles so the caller reports it the same way `validate` does.
 */
export function fixMissingNames(
  targetPath: string,
  targetLabel: string,
): readonly NameFixRecord[] {
  // --- Step 1: Enumerate the documents that have an identity namespace ---
  const documents: { relativePath: string; absolutePath: string; content: string }[] = [];

  if (statSync(targetPath).isDirectory()) {
    const projectRoot = resolve(targetPath);
    const projectFiles = readProjectFiles(projectRoot);
    for (const entry of [...projectFiles.screenXmls, ...projectFiles.componentXmls]) {
      documents.push({
        relativePath: entry.filename,
        absolutePath: join(projectRoot, entry.filename),
        content: entry.content,
      });
    }
  } else {
    documents.push({
      relativePath: targetLabel,
      absolutePath: targetPath,
      content: readFileSync(targetPath, 'utf-8'),
    });
  }

  // --- Step 2: Compute insertions, write them back, and record what landed ---
  const records: NameFixRecord[] = [];

  for (const doc of documents) {
    const edits = computeNameEdits(doc.content, doc.relativePath);
    if (edits.length === 0) {
      continue;
    }

    writeNameEdits(doc.absolutePath, edits);
    records.push({ file: doc.relativePath, names: edits.map(nameOfEdit) });
  }

  return records;
}
