/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/package-copy.test.ts
 * Purpose: The two lookups' preference for what the npm package staged, in
 *          the three situations they meet: an installed CLI whose staged copy
 *          is its own version; a staged copy for another version, which must
 *          be passed over with a reason; and a checkout with nothing staged,
 *          which must behave exactly as before staging existed.
 * Description: Each case builds a package directory under cli/tmp/ and passes
 *              it, with a version, to the lookups, so the CLI running the
 *              tests is never the package being looked in. The source tree
 *              for the fallback is this repository.
 */

import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { locateFrameworkRoot } from '../../../src/node/design/build/framework-sources.js';
import { locateStagedCopy, PACKAGE_STAMP_FILE, writePackageStamp } from '../../../src/node/design/package-copy.js';
import { locateDesignerDist } from '../../../src/node/design/static-files.js';
import { FRAMEWORK_ROOT } from './build/departures-project.js';
import { makeTempDir, removeTempDirs, writeFiles } from './temp-project.js';

afterAll(removeTempDirs);

const VERSION = '1.2.3';

// stagedPackage
// A package directory with a designer/ and framework/ of the given stamp
// version: each holds just the marker file its lookup checks.
function stagedPackage(stampVersion: string): string {
  const root = makeTempDir('package');
  writeFiles(root, { 'designer/index.html': '<p>', 'framework/wasm/bridge.cpp': '', 'framework/include/u8g2gl/x.h': '' });
  for (const name of ['designer', 'framework']) {
    writePackageStamp(join(root, name), { version: stampVersion, commit: '0123abc' });
  }
  return root;
}

describe('locateStagedCopy()', () => {
  it('accepts a copy stamped with this version that has its marker', () => {
    const root = stagedPackage(VERSION);
    expect(locateStagedCopy('designer', 'index.html', { packageRoot: root, version: VERSION })).toEqual({
      kind: 'staged',
      dir: join(root, 'designer'),
    });
  });

  it('reports a package with nothing staged as absent', () => {
    expect(locateStagedCopy('designer', 'index.html', { packageRoot: makeTempDir('package'), version: VERSION })).toEqual({ kind: 'absent' });
  });

  it('ignores a copy staged for another version, saying so', () => {
    const root = stagedPackage('1.2.2');
    expect(locateStagedCopy('framework', 'wasm/bridge.cpp', { packageRoot: root, version: VERSION })).toEqual({
      kind: 'ignored',
      dir: join(root, 'framework'),
      reason: "the package's framework/ was staged for CLI 1.2.2, not this CLI's 1.2.3",
    });
  });

  it('ignores a copy with no stamp, an unreadable stamp, or no marker', () => {
    const root = makeTempDir('package');
    writeFiles(root, { 'designer/index.html': '<p>', [`framework/${PACKAGE_STAMP_FILE}`]: '{ not json' });
    expect(locateStagedCopy('designer', 'index.html', { packageRoot: root, version: VERSION })).toMatchObject({
      kind: 'ignored',
      reason: `the package's designer/ has no readable ${PACKAGE_STAMP_FILE}`,
    });
    expect(locateStagedCopy('framework', 'wasm/bridge.cpp', { packageRoot: root, version: VERSION })).toMatchObject({
      kind: 'ignored',
      reason: `the package's framework/ has no readable ${PACKAGE_STAMP_FILE}`,
    });
    const unmarked = makeTempDir('package');
    writeFiles(unmarked, { 'designer/app.js': '' });
    writePackageStamp(join(unmarked, 'designer'), { version: VERSION, commit: '0123abc' });
    expect(locateStagedCopy('designer', 'index.html', { packageRoot: unmarked, version: VERSION })).toMatchObject({
      kind: 'ignored',
      reason: "the package's designer/ has no index.html",
    });
  });
});

describe('locateFrameworkRoot()', () => {
  it('prefers the staged framework when its stamp matches', () => {
    const root = stagedPackage(VERSION);
    expect(locateFrameworkRoot({ packageRoot: root, version: VERSION, start: FRAMEWORK_ROOT })).toBe(join(root, 'framework'));
  });

  it('passes over a mismatched staged framework for the source tree', () => {
    const root = stagedPackage('1.2.2');
    expect(locateFrameworkRoot({ packageRoot: root, version: VERSION, start: FRAMEWORK_ROOT })).toBe(FRAMEWORK_ROOT);
  });

  it('in a checkout with nothing staged, finds the source tree as before', () => {
    const root = makeTempDir('package');
    expect(locateFrameworkRoot({ packageRoot: root, version: VERSION, start: join(FRAMEWORK_ROOT, 'cli', 'src') })).toBe(FRAMEWORK_ROOT);
  });
});

describe('locateDesignerDist() and the staged designer', () => {
  it('prefers the staged designer when its stamp matches', () => {
    const root = stagedPackage(VERSION);
    const tree = makeTempDir('tree');
    writeFiles(tree, { 'designer/dist/index.html': '<p>' });
    expect(locateDesignerDist({ packageRoot: root, version: VERSION, sourceRoot: tree })).toBe(join(root, 'designer'));
  });

  it("passes over a mismatched staged designer for the source tree's build", () => {
    const root = stagedPackage('1.2.2');
    const tree = makeTempDir('tree');
    writeFiles(tree, { 'designer/dist/index.html': '<p>' });
    expect(locateDesignerDist({ packageRoot: root, version: VERSION, sourceRoot: tree })).toBe(join(tree, 'designer', 'dist'));
  });

  it('in a checkout with nothing staged, serves the built designer as before', () => {
    const tree = makeTempDir('tree');
    writeFiles(tree, { 'designer/dist/index.html': '<p>' });
    expect(locateDesignerDist({ packageRoot: makeTempDir('package'), version: VERSION, sourceRoot: tree })).toBe(
      join(tree, 'designer', 'dist'),
    );
  });
});
