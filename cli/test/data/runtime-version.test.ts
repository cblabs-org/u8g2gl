/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/data/runtime-version.test.ts
 * Purpose: Drift guard for src/data/runtime-version.json, the floor every
 *          generated config asserts (§16). A stamp that goes stale without
 *          failing is worse than no stamp, because it makes a wrong floor look
 *          verified. This test fails the moment include/u8g2gl/u8g2gl_version.h
 *          changes without `npm run build:runtime-version`.
 * Description: Compares the stamp to the header's own macros through
 *              stampDrift(), and proves that function is not vacuous by feeding
 *              it a doctored header. Same shape as
 *              test/manifests/manifest-bundle.test.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNTIME_VERSION } from '../../src/data/runtime-version.js';
import { parseRuntimeVersion } from '../../src/node/runtime-version-header.js';

const HEADER = resolve(__dirname, '../../../include/u8g2gl/u8g2gl_version.h');

/**
 * Every way `stamp` differs from the version `headerText` defines, as
 * human-readable lines; empty when they agree.
 */
function stampDrift(
  stamp: { major: number; minor: number; patch: number },
  headerText: string,
): string[] {
  const header = parseRuntimeVersion(headerText);
  const problems: string[] = [];
  for (const part of ['major', 'minor', 'patch'] as const) {
    if (stamp[part] !== header[part]) {
      problems.push(
        `${part}: stamp says ${stamp[part]}, header says ${header[part]}; run \`npm run build:runtime-version\``,
      );
    }
  }
  return problems;
}

describe('runtime version stamp', () => {
  const headerText = readFileSync(HEADER, 'utf8');

  // Without this, a wrong HEADER path would parse nothing and throw rather than
  // compare, but a stamp of all zeros must also not pass by accident.
  it('reads a real, non-zero version from the header', () => {
    const header = parseRuntimeVersion(headerText);
    expect(header.major + header.minor + header.patch).toBeGreaterThan(0);
  });

  it('matches include/u8g2gl/u8g2gl_version.h (run `npm run build:runtime-version` if not)', () => {
    expect(stampDrift(RUNTIME_VERSION, headerText)).toEqual([]);
  });

  describe('the drift check itself', () => {
    it('detects a header whose minor moved without restamping', () => {
      const bumped = headerText.replace(
        /^(#define U8G2GL_VERSION_MINOR +)(\d+)/m,
        (_m, head: string, n: string) => `${head}${Number(n) + 1}`,
      );
      // A stamp that is correct for the real header, so this case stays true
      // whatever the stamp file currently holds.
      const current = parseRuntimeVersion(headerText);
      expect(stampDrift(current, bumped)).toEqual([
        `minor: stamp says ${current.minor}, header says ${current.minor + 1}; run \`npm run build:runtime-version\``,
      ]);
    });

    it('refuses a header that lacks a version macro', () => {
      expect(() => parseRuntimeVersion(headerText.replace('U8G2GL_VERSION_PATCH', 'X'))).toThrow(
        'does not define U8G2GL_VERSION_PATCH',
      );
    });
  });
});
