/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/generator-version.test.ts
 * Purpose: Pins PR-04 WO5b finding 6, closed in WO9: the generator version is
 *          read from package.json and **never guessed**. It used to fall back to
 *          the literal '0.3.0' from a package that was at 0.6.0, stamping a
 *          version that had generated nothing into committed output (§13.9,
 *          [D-11]) — silently, where nobody would re-check it.
 * Description: The reader is injected so the unreadable, malformed and
 *              version-less cases can be exercised without touching the real
 *              package.json. The happy path is asserted against the file's own
 *              declared version rather than a literal, so the test does not need
 *              editing at every release.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getGeneratorVersion } from '../../src/node/generator-version.js';

/** The version package.json really declares, read independently of the module. */
function declaredVersion(): string {
  const path = fileURLToPath(new URL('../../package.json', import.meta.url));
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
}

describe('getGeneratorVersion() (PR-04 WO9, closing WO5b finding 6)', () => {
  it("reads the package's own version", () => {
    expect(getGeneratorVersion()).toBe(declaredVersion());
  });

  it('throws when package.json cannot be read, rather than stamping a guess', () => {
    expect(() =>
      getGeneratorVersion(() => {
        throw new Error('ENOENT: no such file or directory');
      }),
    ).toThrow(/generator version/);
  });

  it('names the underlying reason, so an unreadable install is diagnosable', () => {
    expect(() =>
      getGeneratorVersion(() => {
        throw new Error('EACCES: permission denied');
      }),
    ).toThrow(/EACCES/);
  });

  it('throws when package.json is not valid JSON', () => {
    expect(() => getGeneratorVersion(() => 'not json at all')).toThrow(/not valid JSON/);
  });

  it('throws when no version is declared', () => {
    expect(() => getGeneratorVersion(() => '{"name":"u8g2gl"}')).toThrow(/declares no 'version'/);
  });

  it('throws when the version is declared but empty', () => {
    expect(() => getGeneratorVersion(() => '{"version":""}')).toThrow(/declares no 'version'/);
  });

  it('never returns a fallback for any failure — every path throws', () => {
    // The point of the change: there is no code path that returns a version the
    // package did not declare. A fallback is worse than a failure here, because
    // the wrong value ends up committed inside generated code.
    const failures: readonly (() => string)[] = [
      () => {
        throw new Error('unreadable');
      },
      () => 'not json',
      () => '{}',
      () => '{"version":""}',
    ];
    for (const read of failures) {
      expect(() => getGeneratorVersion(read)).toThrow();
    }
  });
});
