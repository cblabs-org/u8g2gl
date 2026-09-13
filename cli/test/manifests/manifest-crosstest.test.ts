/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/manifest-crosstest.test.ts
 * Purpose: Cross-tests all C++ library widget manifests against the CLI schema parser (§6.4, §13.1).
 * Description: Reads every XML manifest in include/u8g2gl/manifests/, runs it through
 *              parseWidgetManifestFile(), and asserts zero error diagnostics, valid
 *              WidgetManifest structures, valid PropDefs, and valid BindDefs. Per [D-18] a
 *              PropDef reaches the display through `setter=` or `draw=`; a `draw=` target is
 *              cross-checked against the actual free-function declarations in
 *              include/u8g2gl/u8g2gl_draw.h, not merely required to be a non-empty string —
 *              a manifest naming a function that does not exist is worse than the `setter=`
 *              it replaced (WO4).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWidgetManifestFile } from '../../src/core/parser/parse-widget-manifest.js';

const MANIFESTS_DIR = resolve(__dirname, '../../../include/u8g2gl/manifests');
const DRAW_HEADER_PATH = resolve(__dirname, '../../../include/u8g2gl/u8g2gl_draw.h');

/**
 * Free-function names actually declared in u8g2gl_draw.h, parsed straight out of the
 * header rather than hand-copied — a hand-copied list would drift from the header the
 * same way TIER1_PRIMITIVES drifted from the manifests it was supposed to mirror.
 */
function declaredDrawFunctions(): ReadonlySet<string> {
  const header = readFileSync(DRAW_HEADER_PATH, 'utf-8');
  const names = new Set<string>();
  const pattern = /\bu8g2gl_draw_[a-z_]+(?=\s*\()/g;
  for (const match of header.matchAll(pattern)) {
    names.add(match[0]);
  }
  return names;
}

describe('Widget Manifests', () => {
  const files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith('.xml'));
  const drawFunctions = declaredDrawFunctions();

  // Guards against a vacuous suite rather than against a manifest count. If
  // MANIFESTS_DIR resolves wrong, `files` is empty, the loop below generates no
  // tests at all, and the whole cross-test passes while checking nothing. A
  // hardcoded count would also have to be edited every time a manifest is
  // legitimately added or removed — drift of exactly the kind [D-17] exists to
  // avoid, and which TIER1_PRIMITIVES already demonstrated.
  it('resolves the manifest directory and finds manifests to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Sanity-checks the extractor itself: if this comes back empty, the regex above
  // stopped matching the header (e.g. after a reformat) and every `draw=` assertion
  // below would vacuously pass against an empty set.
  it('finds draw functions declared in u8g2gl_draw.h', () => {
    expect(drawFunctions.size).toBeGreaterThan(0);
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

      it('should carry no [D-18] fossil `animated` attribute', () => {
        // [D-18] removed the widget-level `animated` attribute entirely — it is not
        // merely unread by the parser (see parse-widget-manifest.ts), the shipped
        // manifests must not carry it at all. A raw-text check, not a WidgetManifest
        // assertion, because the model no longer has anywhere to put the value.
        expect(xml).not.toMatch(/\sanimated\s*=/);
      });

      it('should have valid PropDefs, each resolving to a setter= or a real draw= target', () => {
        for (const prop of result.value!.api.props) {
          expect(prop.name).toBeTruthy();
          expect(prop.type).toBeTruthy();

          // [D-18]: exactly one of the two emission targets applies per property.
          const hasSetter = Boolean(prop.setter);
          const hasDraw = Boolean(prop.draw);
          expect(hasSetter !== hasDraw).toBe(true);

          if (prop.draw) {
            // The meaningful part of this cross-test: a `draw=` target must resolve
            // to a function this header actually declares. A manifest naming a
            // free function that does not exist would compile right up until link,
            // which is exactly the failure mode [D-18]'s free functions replaced
            // the old `setter="drawBox"` U8G2-method spelling to avoid.
            expect(drawFunctions.has(prop.draw)).toBe(true);
          }
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
