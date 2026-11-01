/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/manifest-bundle.test.ts
 * Purpose: Drift guard for src/data/manifests.json (PR-04 WO1). The bundle is a
 *          copy of include/u8g2gl/manifests/, and a copy that silently lags its
 *          source is precisely the stale-fixture defect WO1 removed. This test
 *          fails the moment a manifest is added, removed or edited without
 *          `npm run build:manifests`.
 * Description: Compares the bundle to the directory byte-for-byte — same file
 *              set, same order, same content — through bundleDrift(), and proves
 *              that function is not vacuous by feeding it a doctored copy.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';
import type { ManifestText } from '../../src/core/manifest/index.js';

const MANIFESTS_DIR = resolve(__dirname, '../../../include/u8g2gl/manifests');

/** The manifests on disk, in the build script's order. */
function readOnDisk(): ManifestText[] {
  return readdirSync(MANIFESTS_DIR)
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((filename) => ({ filename, xml: readFileSync(resolve(MANIFESTS_DIR, filename), 'utf8') }));
}

/**
 * Every way `bundle` differs from `onDisk`, as human-readable lines; empty when
 * they match exactly.
 */
function bundleDrift(bundle: readonly ManifestText[], onDisk: readonly ManifestText[]): string[] {
  const problems: string[] = [];
  const bundled = new Map(bundle.map((m) => [m.filename, m.xml]));
  const disk = new Map(onDisk.map((m) => [m.filename, m.xml]));

  for (const [filename, xml] of disk) {
    const bundledXml = bundled.get(filename);
    if (bundledXml === undefined) {
      problems.push(`missing from bundle: ${filename}`);
    } else if (bundledXml !== xml) {
      problems.push(`content differs: ${filename}`);
    }
  }
  for (const filename of bundled.keys()) {
    if (!disk.has(filename)) {
      problems.push(`in bundle but not on disk: ${filename}`);
    }
  }
  const bundleOrder = bundle.map((m) => m.filename).join(',');
  const diskOrder = onDisk.map((m) => m.filename).join(',');
  if (problems.length === 0 && bundleOrder !== diskOrder) {
    problems.push('bundle order differs from sorted directory order');
  }
  return problems;
}

describe('framework manifest bundle', () => {
  const onDisk = readOnDisk();

  // Without this, a wrong MANIFESTS_DIR yields an empty set, and an empty
  // bundle would "match" it.
  it('resolves the manifest directory to a non-empty set', () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(FRAMEWORK_MANIFESTS.length).toBeGreaterThan(0);
  });

  it('matches include/u8g2gl/manifests/ byte-for-byte (run `npm run build:manifests` if not)', () => {
    expect(bundleDrift(FRAMEWORK_MANIFESTS, onDisk)).toEqual([]);
  });

  describe('the drift check itself', () => {
    it('detects a manifest edited without rebuilding', () => {
      const edited = onDisk.map((m, i) => (i === 0 ? { ...m, xml: m.xml.replace('</api>', '</api> ') } : m));
      expect(bundleDrift(FRAMEWORK_MANIFESTS, edited)).toEqual([
        `content differs: ${onDisk[0]!.filename}`,
      ]);
    });

    it('detects a manifest added without rebuilding', () => {
      const added = [...onDisk, { filename: 'u8g2gl_zzz.xml', xml: '<widget name="u8g2gl_zzz"/>' }];
      expect(bundleDrift(FRAMEWORK_MANIFESTS, added)).toEqual(['missing from bundle: u8g2gl_zzz.xml']);
    });

    it('detects a manifest removed without rebuilding', () => {
      expect(bundleDrift(FRAMEWORK_MANIFESTS, onDisk.slice(1))).toEqual([
        `in bundle but not on disk: ${onDisk[0]!.filename}`,
      ]);
    });
  });
});
