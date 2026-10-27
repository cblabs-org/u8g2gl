/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/cst/diagnostics-parity.test.ts
 * Purpose: On malformed input the CST reports what the recorded tokeniser
 *          reported: the same diagnostic code at the same line and column, in
 *          the same order. The parser runs on the CST, so every location an
 *          author or a test relies on is held to that record.
 * Description: The comparison is against the recorded output,
 *              tokeniser-diagnostics.json (see
 *              tokeniser-golden.ts). Three corpora: every tracked `.xml` file in
 *              the repository (which includes the malformed fixtures, and checks
 *              that well-formed files stay diagnostic-free); the inline
 *              malformed cases of parser/malformed.test.ts and
 *              parser/xml-tokeniser.test.ts; and one case per recovery branch of
 *              the tokeniser, so every branch is compared at least once.
 *              Messages were recorded too, but parity is defined over code, line
 *              and column: messages are prose and may be reworded.
 */

import { describe, expect, it } from 'vitest';
import { parseCst } from '../../src/core/cst/index.js';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';
import { readRepoFile } from './cst-test-helpers.js';
import { loadDiagnosticsGolden, sha256 } from './tokeniser-golden.js';

// located
// Parity is defined over code, line and column; messages are prose and may
// be reworded independently.
function located(
  diagnostics: ReadonlyArray<Pick<Diagnostic, 'code' | 'line' | 'column'>>,
): Array<Pick<Diagnostic, 'code' | 'line' | 'column'>> {
  return diagnostics.map(({ code, line, column }) => ({ code, line, column }));
}

const golden = loadDiagnosticsGolden();

describe('CST diagnostics parity with the recorded tokeniser', () => {
  it.each(golden.repositoryFiles)('repository file $file', ({ file, sha256: recorded, diagnostics }) => {
    const text = readRepoFile(file);
    // A changed file is a stale golden entry, not a parser regression.
    expect(sha256(text), `${file} changed since the tokeniser was recorded`).toBe(recorded);
    expect(located(parseCst(text, file).diagnostics)).toEqual(located(diagnostics));
  });

  it('includes the malformed fixture, and it is malformed', () => {
    const file = 'cli/test/parser/fixtures/malformed.xml';
    expect(golden.repositoryFiles.map((entry) => entry.file)).toContain(file);
    expect(parseCst(readRepoFile(file), file).diagnostics.length).toBeGreaterThan(0);
  });

  it.each(golden.inlineCases)('$group case: $name', ({ file, text, diagnostics }) => {
    expect(located(parseCst(text, file).diagnostics)).toEqual(located(diagnostics));
  });

  it('covers every inline and recovery-branch case', () => {
    const groups = golden.inlineCases.map((entry) => entry.group);
    expect(groups.filter((group) => group === 'existing')).toHaveLength(5);
    expect(groups.filter((group) => group === 'branch')).toHaveLength(29);
  });
});
