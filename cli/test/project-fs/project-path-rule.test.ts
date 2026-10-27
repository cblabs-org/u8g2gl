/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/project-path-rule.test.ts
 * Purpose: `checkProjectPath`, the lexical write boundary every
 *          `ProjectFileSystem` and the design server share: what it accepts,
 *          what it refuses, and that a refusal names its rule.
 * Description: The refused cases are the contract suite's INVALID_PATHS, so
 *              the rule and every implementation are tested against one list.
 */

import { describe, expect, it } from 'vitest';
import { checkProjectPath } from '../../src/core/project-fs/index.js';
import { INVALID_PATHS } from './contract.js';

describe('checkProjectPath()', () => {
  it.each([
    'u8g2gl.xml',
    'screens/screen_home.xml',
    'widgets/gauge/gauge.xml',
    'fonts/.hidden.bdf',
    'a..b/c.d..e',
    'with space/file name.xml',
    'unicode/温度.xml',
  ])('accepts %j unchanged', (path) => {
    expect(checkProjectPath(path)).toEqual({ ok: true, path });
  });

  it.each(INVALID_PATHS.map((path) => [JSON.stringify(path), path]))('refuses %s', (_label, path) => {
    const result = checkProjectPath(path);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason.length).toBeGreaterThan(0);
  });

  it.each([
    ['', /empty/],
    ['/etc/passwd', /absolute/],
    ['a\\b', /backslash/],
    ['C:/x', /colon/],
    ['a//b', /empty segment/],
    ['a/../b', /'\.\.' segment/],
    ['a/./b', /'\.' segment/],
    ['a\u0001b', /control/],
  ])('names the rule %j broke', (path, reason) => {
    const result = checkProjectPath(path);
    expect(!result.ok && result.reason).toMatch(reason);
  });
});
