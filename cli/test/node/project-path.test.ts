/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/project-path.test.ts
 * Purpose: `isInsideProject`, the real-path half of the write boundary that
 *          `loadProject()` and the design server share: symlinks judged by
 *          their target, a symlinked project root still working, and the
 *          documented fallback for a path that does not exist yet.
 * Description: Real directories and symlinks under the git-ignored cli/tmp/.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isInsideProject } from '../../src/node/project-path.js';

const tempDirs: string[] = [];

// tempDir
// A fresh directory under cli/tmp/, removed after the suite.
function tempDir(prefix: string): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, `../../tmp/${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('isInsideProject()', () => {
  it('accepts the root itself and a file beneath it', () => {
    const root = tempDir('project-path');
    writeFileSync(join(root, 'a.xml'), '');
    expect(isInsideProject(root, root)).toBe(true);
    expect(isInsideProject(root, join(root, 'a.xml'))).toBe(true);
  });

  it('refuses a sibling whose name merely starts with the root', () => {
    const root = tempDir('project-path');
    const sibling = `${root}-sibling`;
    mkdirSync(sibling);
    tempDirs.push(sibling);
    expect(isInsideProject(root, join(sibling, 'x.xml'))).toBe(false);
  });

  it('refuses a symlink inside the project that points outside it', () => {
    const root = tempDir('project-path');
    const outside = tempDir('project-path-outside');
    writeFileSync(join(outside, 'secret.xml'), '');
    symlinkSync(join(outside, 'secret.xml'), join(root, 'link.xml'));
    symlinkSync(outside, join(root, 'linkdir'));
    expect(isInsideProject(root, join(root, 'link.xml'))).toBe(false);
    expect(isInsideProject(root, join(root, 'linkdir'))).toBe(false);
  });

  it('accepts everything when the root is itself reached through a symlink', () => {
    const real = tempDir('project-path-real');
    writeFileSync(join(real, 'a.xml'), '');
    const link = `${tempDir('project-path-linkparent')}/root`;
    symlinkSync(real, link);
    expect(isInsideProject(link, join(link, 'a.xml'))).toBe(true);
  });

  it('falls back to a lexical comparison for a path that does not exist', () => {
    // Documented behaviour, not a recommendation: a caller creating a file
    // must check its nearest existing ancestor, because this cannot see that
    // 'linkdir/new.xml' would land outside.
    const root = tempDir('project-path');
    const outside = tempDir('project-path-outside');
    symlinkSync(outside, join(root, 'linkdir'));
    expect(isInsideProject(root, join(root, 'linkdir', 'new.xml'))).toBe(true);
    expect(isInsideProject(root, join(root, '..', 'new.xml'))).toBe(false);
  });
});
