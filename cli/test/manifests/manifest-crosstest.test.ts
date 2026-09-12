/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/manifest-crosstest.test.ts
 * Purpose: Cross-tests all C++ library widget manifests against the CLI schema parser (§6.4, §13.1).
 * Description: Reads every XML manifest in include/u8g2gl/manifests/, runs it through
 *              parseWidgetManifestFile(), and asserts zero error diagnostics, valid
 *              WidgetManifest structures, valid PropDefs, and valid BindDefs.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWidgetManifestFile } from '../../src/core/parser/parse-widget-manifest.js';

const MANIFESTS_DIR = resolve(__dirname, '../../../include/u8g2gl/manifests');

describe('Widget Manifests', () => {
  const files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith('.xml'));

  // Guards against a vacuous suite rather than against a manifest count. If
  // MANIFESTS_DIR resolves wrong, `files` is empty, the loop below generates no
  // tests at all, and the whole cross-test passes while checking nothing. A
  // hardcoded count would also have to be edited every time a manifest is
  // legitimately added or removed — drift of exactly the kind [D-17] exists to
  // avoid, and which TIER1_PRIMITIVES already demonstrated.
  it('resolves the manifest directory and finds manifests to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const xml = readFileSync(join(MANIFESTS_DIR, file), 'utf-8');
      const result = parseWidgetManifestFile(xml, file);

      it('should parse with zero error diagnostics', () => {
        const errors = result.diagnostics.filter((d) => d.severity === 'error');
        expect(errors).toEqual([]);
      });

      it('should produce a valid WidgetManifest', () => {
        expect(result.value).toBeDefined();
        expect(result.value!.name).toBeTruthy();
        expect(result.value!.api).toBeDefined();
      });

      it('should have valid PropDefs', () => {
        for (const prop of result.value!.api.props) {
          expect(prop.name).toBeTruthy();
          expect(prop.type).toBeTruthy();
          expect(prop.setter).toBeTruthy();
        }
      });

      it('should have valid BindDefs', () => {
        for (const bind of result.value!.api.bindings) {
          expect(bind.name).toBeTruthy();
          expect(bind.type).toBeTruthy();
          expect(bind.setter).toBeTruthy();
        }
      });
    });
  }
});
