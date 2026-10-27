/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/cst-test-helpers.ts
 * Purpose: Shared fixtures for the CST tests — the repository's XML corpus,
 *          a tree walker, and the stress100 screen — so each test file states
 *          its acceptance criterion rather than re-deriving its inputs.
 * Description: The corpus is found with `git ls-files` at test time, so an XML
 *              file added anywhere in the repository joins the round-trip
 *              tests without anyone remembering to list it.
 *
 * Exports:
 * - REPO_ROOT:          Absolute path of the repository root
 * - repoXmlFiles():     Every tracked `.xml` file, repo-relative, sorted
 * - readRepoFile():     Read a repo-relative file as UTF-8
 * - allElements():      Every element of a tree, depth first, document order
 * - stressScreen():     The stress100 screen of the E-D bench, built in memory
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CstContent, CstDocument, CstElement } from '../../src/core/cst/index.js';

/** Absolute path of the repository root (two levels above cli/test/cst). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Every tracked `.xml` file in the repository, repo-relative and sorted. */
export function repoXmlFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '*.xml'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .sort();
}

/** Read a repo-relative file as UTF-8, exactly as on disk. */
export function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

/** Every element in `cst`, depth first in document order. */
export function allElements(cst: CstDocument): CstElement[] {
  const out: CstElement[] = [];
  const visit = (nodes: readonly CstContent[]): void => {
    for (const node of nodes) {
      if (node.kind === 'element') {
        out.push(node);
        visit(node.children);
      }
    }
  };
  visit(cst.children);
  return out;
}

/**
 * The stress screen the E-D bench measured (LOOP-BUDGET §1): `count`
 * alternating labels and boxes inside one `<view>`. Mirrors that evidence's
 * generator line for line, so the numbers are comparable.
 */
export function stressScreen(count = 100): string {
  const rows: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i * 13) % 230;
    const y = (i * 7) % 54;
    rows.push(
      i % 2 === 0
        ? `        <u8g2gl_label name="l${i}" x="${x}" y="${y}" width="24" height="10" font="u8g2_font_6x10_mr" text="L${i}" />`
        : `        <u8g2gl_box name="b${i}" x="${x}" y="${y}" width="20" height="8" filled="false" />`,
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<screen name="departures">\n    <view>\n' +
    rows.join('\n') +
    '\n    </view>\n</screen>\n'
  );
}
