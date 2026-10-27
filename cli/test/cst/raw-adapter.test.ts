/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/raw-adapter.test.ts
 * Purpose: `tokenizeXml` is what every parser in core/parser/ reads XML
 *          through, and it is public API. It now builds its RawXmlDocument
 *          from the CST instead of scanning the text itself, and nothing
 *          downstream was changed to accommodate that — so the tree it returns
 *          and the diagnostics it reports must be exactly what the old scanner
 *          produced, on every input it was recorded on.
 * Description: Compares against the two goldens recorded from the old
 *              tokeniser (tokeniser-golden.ts): the full tree for every tracked
 *              `.xml` file and inline case, and every diagnostic including its
 *              message. A repository file edited since the recording fails as a
 *              stale entry, by hash, before its tree is compared.
 */

import { describe, expect, it } from 'vitest';
import { tokenizeXml } from '../../src/core/parser/index.js';
import { readRepoFile } from './cst-test-helpers.js';
import {
  freezeDiagnostics,
  freezeTree,
  loadDiagnosticsGolden,
  loadTreesGolden,
  sha256,
} from './tokeniser-golden.js';

const trees = loadTreesGolden();
const diagnostics = loadDiagnosticsGolden();

describe('tokenizeXml matches the recorded tokeniser', () => {
  it.each(trees.repositoryFiles)('tree of repository file $file', ({ file, sha256: recorded, root }) => {
    const text = readRepoFile(file);
    expect(sha256(text), `${file} changed since the tokeniser was recorded`).toBe(recorded);
    expect(freezeTree(tokenizeXml(text, file), file)).toEqual(root);
  });

  it.each(trees.inlineCases)('tree of inline case: $name', ({ file, text, root }) => {
    expect(freezeTree(tokenizeXml(text, file), file)).toEqual(root);
  });

  it.each(diagnostics.repositoryFiles)('diagnostics of repository file $file', ({ file, diagnostics: recorded }) => {
    expect(freezeDiagnostics(tokenizeXml(readRepoFile(file), file).diagnostics)).toEqual(recorded);
  });

  it.each(diagnostics.inlineCases)('diagnostics of $group case: $name', ({ file, text, diagnostics: recorded }) => {
    expect(freezeDiagnostics(tokenizeXml(text, file).diagnostics)).toEqual(recorded);
  });
});
