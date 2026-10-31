/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/tokeniser-golden.ts
 * Purpose: The two committed JSON goldens beside this file are the recorded
 *          output of the hand-rolled tokeniser the CST replaced. The parity
 *          and adapter tests check the CST and `tokenizeXml` against that
 *          record, which is an independent reference; comparing the CST with
 *          itself would prove nothing. This module is the one place that reads
 *          the goldens and the one place that defines how a tree is written
 *          down for comparison.
 * Description: The goldens are a record, not a cache: they are never
 *              regenerated, because the tokeniser that produced them no
 *              longer exists. Each repository file's entry carries the SHA-256 of
 *              the text it was recorded from, so a later edit to that file is
 *              reported as a stale entry rather than as a parser regression.
 *
 *              - `tokeniser-diagnostics.json`: code, line, column and message
 *                of every diagnostic, for every tracked `.xml` file, the inline
 *                malformed cases and one case per recovery branch, plus the
 *                inputs the CST deliberately parses differently.
 *              - `tokeniser-trees.json`: the raw tree (element and attribute
 *                names, values and locations, text content, comments) for
 *                every tracked `.xml` file and every inline case.
 *
 *              Where the recorded location was wrong, the entry keeps its
 *              record and gains `corrected`: what the CST reports instead, and
 *              why. The tests hold the CST to the correction where there is
 *              one, and check that each correction still differs from its
 *              record, so a correction is never a silent no-op.
 *
 *              Where a recorded file was later edited, its entry carries the
 *              same edit applied to the record, and the new hash, rather than
 *              a fresh recording, which nothing could make. Only edits that
 *              move no recorded location are applied this way. Schema 0.5's
 *              move of the fixtures from `schema="0.4"` to `"0.5"` is one: a
 *              same-length value, so the record changes in that value alone.
 *
 * Exports:
 *   Golden shapes:
 *   - FrozenDiagnostic:       One diagnostic as recorded
 *   - FrozenInlineDiagnostics: An inline input and its recorded diagnostics
 *   - FrozenDifference:       An input the CST deliberately parses differently
 *   - DiagnosticsCorrection:  What the CST reports where the record was wrong, and why
 *   - TreeCorrection:         The same for a tree
 *   - DiagnosticsGolden:      The shape of tokeniser-diagnostics.json
 *   - FrozenElement:          One element as recorded
 *   - TreesGolden:            The shape of tokeniser-trees.json
 *
 *   Reading and writing:
 *   - loadDiagnosticsGolden(), loadTreesGolden():  Read the committed goldens
 *   - freezeDiagnostics():    A diagnostic list in the recorded shape
 *   - freezeTree():           A RawXmlDocument's root in the recorded shape
 *   - sha256():               The hash each repository entry is keyed by
 *   - expectedDiagnostics(), expectedRoot():  An entry's correction, else its record
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawXmlDocument, RawXmlElement } from '../../src/core/parser/raw-xml.js';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { SourceLocation } from '../../src/core/schema/source-location.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** One diagnostic as the recorded tokeniser reported it. */
export interface FrozenDiagnostic {
  readonly code: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** Where a recorded entry was wrong: what the CST reports instead, and why. */
export interface DiagnosticsCorrection {
  readonly reason: string;
  readonly diagnostics: readonly FrozenDiagnostic[];
}

/** Where a recorded tree was wrong: the tree now produced (absent: no root), and why. */
export interface TreeCorrection {
  readonly reason: string;
  readonly root?: FrozenElement;
}

/** An inline input and what the recorded tokeniser reported for it. */
export interface FrozenInlineDiagnostics {
  /** Which corpus it came from: `existing` test cases or `branch` (one per recovery branch). */
  readonly group: 'existing' | 'branch';
  readonly name: string;
  readonly file: string;
  readonly text: string;
  readonly diagnostics: readonly FrozenDiagnostic[];
  readonly corrected?: DiagnosticsCorrection;
}

/**
 * An input the CST parses differently on purpose. `diagnostics` is what the
 * recorded tokeniser reported; `threw` is set instead when it threw.
 */
export interface FrozenDifference {
  readonly name: string;
  readonly file: string;
  readonly text: string;
  readonly diagnostics?: readonly FrozenDiagnostic[];
  readonly threw?: string;
}

/** The shape of tokeniser-diagnostics.json. */
export interface DiagnosticsGolden {
  readonly repositoryFiles: ReadonlyArray<{
    readonly file: string;
    readonly sha256: string;
    readonly diagnostics: readonly FrozenDiagnostic[];
    readonly corrected?: DiagnosticsCorrection;
  }>;
  readonly inlineCases: readonly FrozenInlineDiagnostics[];
  readonly intentionalDifferences: readonly FrozenDifference[];
}

/**
 * One element as recorded. Locations are `line:column`; the file name is
 * checked when freezing rather than repeated in every entry.
 */
export interface FrozenElement {
  readonly name: string;
  readonly loc: string;
  readonly endLoc?: string;
  /** `[name, value, valueLoc, nameLoc]` per attribute, in source order. */
  readonly attributes: ReadonlyArray<readonly [string, string, string, string]>;
  readonly textContent?: string;
  readonly comments: readonly string[];
  readonly children: readonly FrozenElement[];
}

/** The shape of tokeniser-trees.json. `root` is absent when there was none. */
export interface TreesGolden {
  readonly repositoryFiles: ReadonlyArray<{
    readonly file: string;
    readonly sha256: string;
    readonly root?: FrozenElement;
  }>;
  readonly inlineCases: ReadonlyArray<{
    readonly name: string;
    readonly file: string;
    readonly text: string;
    readonly root?: FrozenElement;
    readonly corrected?: TreeCorrection;
  }>;
}

/** SHA-256 of `text` as UTF-8, hex. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Code, line, column and message of each diagnostic, in order. */
export function freezeDiagnostics(diagnostics: readonly Diagnostic[]): FrozenDiagnostic[] {
  return diagnostics.map(({ code, line, column, message }) => ({ code, line, column, message }));
}

// at
// A location as `line:column`, refusing one in some other file: every location
// in a tree must name the file it was parsed as.
function at(loc: SourceLocation, file: string): string {
  if (loc.file !== file) {
    throw new Error(`location names '${loc.file}', expected '${file}'`);
  }
  return `${loc.line}:${loc.column}`;
}

function freezeElement(element: RawXmlElement, file: string): FrozenElement {
  return {
    name: element.name,
    loc: at(element.loc, file),
    ...(element.endLoc ? { endLoc: at(element.endLoc, file) } : {}),
    attributes: element.attributes.map(
      (a) => [a.name, a.value, at(a.loc, file), at(a.nameLoc, file)] as const,
    ),
    ...(element.textContent !== undefined ? { textContent: element.textContent } : {}),
    comments: element.comments,
    children: element.children.map((child) => freezeElement(child, file)),
  };
}

/** The document's root in the recorded shape, or undefined when it has none. */
export function freezeTree(doc: RawXmlDocument, file: string): FrozenElement | undefined {
  return doc.root ? freezeElement(doc.root, file) : undefined;
}

/** The diagnostics an entry expects: its correction's, else the record's. */
export function expectedDiagnostics(entry: {
  readonly diagnostics: readonly FrozenDiagnostic[];
  readonly corrected?: DiagnosticsCorrection;
}): readonly FrozenDiagnostic[] {
  return entry.corrected?.diagnostics ?? entry.diagnostics;
}

/** The tree an entry expects: its correction's, else the record's. */
export function expectedRoot(entry: {
  readonly root?: FrozenElement;
  readonly corrected?: TreeCorrection;
}): FrozenElement | undefined {
  return entry.corrected !== undefined ? entry.corrected.root : entry.root;
}

/** Read the committed tokeniser-diagnostics.json. */
export function loadDiagnosticsGolden(): DiagnosticsGolden {
  return JSON.parse(readFileSync(join(HERE, 'tokeniser-diagnostics.json'), 'utf8')) as DiagnosticsGolden;
}

/** Read the committed tokeniser-trees.json. */
export function loadTreesGolden(): TreesGolden {
  return JSON.parse(readFileSync(join(HERE, 'tokeniser-trees.json'), 'utf8')) as TreesGolden;
}
