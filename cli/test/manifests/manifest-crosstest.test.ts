/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/manifest-crosstest.test.ts
 * Purpose: Proves every framework manifest names C++ that exists with the shape
 *          the generator will assume (§6.4, §13.1, §13.8). The generator emits a
 *          call for every `setter=`, `draw=` and `<bind setter=>` it reads, so a
 *          manifest naming a missing method compiles right up until the user's
 *          firmware build fails. PR-03's version checked only that `draw=`
 *          named a declared function; `bind_time` and `bind_value` shipped
 *          declared but unimplemented because nothing checked the rest (PR-04
 *          WO2).
 * Description: Reads include/u8g2gl/manifests/ from disk, resolves `extends`
 *              through the real manifest registry (never a second walk), and
 *              reads the runtime's public surface from its headers with
 *              ./cpp-header.ts. Per file: parses cleanly, no [D-18] fossils,
 *              exactly one emission target per prop, draw targets exist. Per
 *              element: every `setter=` is a public method along the effective
 *              `extends` chain; every `<bind setter=>` has an overload taking
 *              the declared subject type; every `<bind type=>` is a subject
 *              type the runtime has; a draw function's parameters after
 *              `U8G2&` match the `draw=` props by name, in count and order.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWidgetManifestFile } from '../../src/core/parser/parse-widget-manifest.js';
import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import type { EffectiveManifest } from '../../src/core/manifest/index.js';
import type { PropDef } from '../../src/core/schema/widget-manifest.js';
import { type CppFunction, freeFunctionsOf, publicMethodsOf, subjectTypesOf } from './cpp-header.js';

const INCLUDE_DIR = resolve(__dirname, '../../../include/u8g2gl');
const MANIFESTS_DIR = join(INCLUDE_DIR, 'manifests');

/** Header source for a class or module stem, or undefined if there is none. */
function headerFor(stem: string): string | undefined {
  const path = join(INCLUDE_DIR, `${stem}.h`);
  return existsSync(path) ? readFileSync(path, 'utf-8') : undefined;
}

const files = readdirSync(MANIFESTS_DIR)
  .filter((f) => f.endsWith('.xml'))
  .sort();

// The manifests on disk, not the bundle: a manifest edit is checked here before
// `npm run build:manifests` runs, and manifest-bundle.test.ts separately fails
// if the bundle has drifted from these files.
const parsedFramework = parseFrameworkManifests(
  files.map((filename) => ({ filename, xml: readFileSync(join(MANIFESTS_DIR, filename), 'utf-8') })),
);
const registry = buildManifestRegistry({ framework: parsedFramework.manifests, project: [] });

const drawFunctions = new Map<string, CppFunction>(
  freeFunctionsOf(headerFor('u8g2gl_draw') ?? '').map((fn) => [fn.name, fn]),
);
const subjectTypes = subjectTypesOf(headerFor('u8g2gl_subject') ?? '');

/**
 * Public methods of every class along an element's effective `extends` chain,
 * nearest first. A chain member with no header (a classless drawing element)
 * contributes nothing.
 */
function methodsAlongChain(manifest: EffectiveManifest): CppFunction[] {
  return manifest.chain.flatMap((tag) => publicMethodsOf(headerFor(tag) ?? '', tag) ?? []);
}

/** The `draw=` props of a prop list, in list order. */
function drawProps(props: readonly PropDef[]): PropDef[] {
  return props.filter((p) => p.draw !== undefined);
}

// Draw-argument order read from the *effective* (inherited) prop list disagrees
// with the draw function for these elements. Recorded, not chosen: see the
// PR-04 WO2 Completion Report, "draw= argument order". `it.fails` keeps the
// mismatch visible and turns red the moment it is resolved either way, so this
// list cannot silently outlive the question.
const OPEN_EFFECTIVE_ORDER_MISMATCHES: ReadonlySet<string> = new Set(['u8g2gl_box']);

describe('Widget Manifests', () => {
  // --- Guards against a vacuous suite ---
  // Every loop below generates tests from data. If a path resolves wrong or an
  // extractor stops matching after a header reformat, the loops would generate
  // nothing, or check against empty sets, and the suite would pass while
  // checking nothing. Hardcoded counts would instead need editing whenever a
  // manifest is legitimately added — the drift [D-17] exists to avoid.
  describe('self-checks', () => {
    it('resolves the manifest directory and finds manifests to check', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    it('resolves every framework manifest with no parse or registry diagnostics', () => {
      expect(parsedFramework.diagnostics).toEqual([]);
      expect(registry.diagnostics).toEqual([]);
      expect(registry.tags.length).toBe(files.length);
    });

    it('extracts named draw functions from u8g2gl_draw.h, parameters included', () => {
      const box = drawFunctions.get('u8g2gl_draw_box');
      expect(box?.params.map((p) => p.name)).toEqual(['display', 'x', 'y', 'width', 'height', 'filled', 'radius']);
      expect(box?.params[0]?.type).toBe('U8G2&');
    });

    it('extracts public methods only, with parameter types, from a real header', () => {
      const obj = publicMethodsOf(headerFor('u8g2gl_obj') ?? '', 'u8g2gl_obj');
      const names = (obj ?? []).map((m) => m.name);
      const setCoords = obj?.find((m) => m.name === 'set_coords');
      expect(setCoords?.params.map((p) => p.name)).toEqual(['x', 'y', 'w', 'h']);
      expect(names).toContain('bind_text');
      expect(names).not.toContain('add_flag_binding'); // private
      expect(names).not.toContain('add_value_binding'); // protected
    });

    it('honours access specifiers, a class default of private, and inline bodies', () => {
      const header = `
        class wd_probe : public u8g2gl_obj {
            void hidden_by_default();
        public:
            // void commented_out();
            int inline_body(int a) { if (a) { return 1; } return 0; }
            void after_inline(const char* text, int count = 3);
        protected:
            void not_public();
        public:
            void public_again();
        };`;
      const methods = publicMethodsOf(header, 'wd_probe');
      expect(methods?.map((m) => m.name)).toEqual(['inline_body', 'after_inline', 'public_again']);
      expect(methods?.[1]?.params).toEqual([
        { type: 'const char*', name: 'text' },
        { type: 'int', name: 'count' },
      ]);
      expect(publicMethodsOf(header, 'wd_absent')).toBeUndefined();
    });

    it('reads the subject types u8g2gl_subject.h defines (§8.1)', () => {
      expect(subjectTypes).toEqual(['int', 'string', 'bool', 'time']);
    });
  });

  // --- Per file, as declared ---
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

      it('should declare extends explicitly', () => {
        // PR-04 WO2 F2: the parser no longer defaults `extends`, so a framework
        // widget without it would fail the schema pass on every project.
        expect(result.value!.extends).toBeTruthy();
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
            // A `draw=` target must resolve to a function this header actually
            // declares; a missing one would compile right up until link.
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

  // --- Per element, effective manifest against the C++ ---
  describe('manifest ↔ runtime parity', () => {
    for (const tag of registry.tags) {
      const manifest = registry.get(tag)!;

      describe(tag, () => {
        it('every <prop setter=> is a public method along the extends chain', () => {
          // A class that declares its own setter props must have a header that
          // declares the class — otherwise nothing below could ever find them.
          if (manifest.declared.api.props.some((p) => p.setter !== undefined)) {
            expect(publicMethodsOf(headerFor(tag) ?? '', tag), `class ${tag} in ${tag}.h`).toBeDefined();
          }
          const methods = new Set(methodsAlongChain(manifest).map((m) => m.name));
          const missing = manifest.api.props
            .filter((p) => p.setter !== undefined && !methods.has(p.setter))
            .map((p) => `${p.name} -> ${p.setter}()`);
          expect(missing).toEqual([]);
        });

        it('every <bind setter=> has a public overload taking the declared subject type', () => {
          const methods = methodsAlongChain(manifest);
          const missing = manifest.api.bindings
            .filter((b) => {
              const subjectParam = `u8g2gl_subject_${b.type}_base*`;
              return !methods.some((m) => m.name === b.setter && m.params[0]?.type === subjectParam);
            })
            .map((b) => `${b.name} -> ${b.setter}(u8g2gl_subject_${b.type}_base*)`);
          expect(missing).toEqual([]);
        });

        it('every <bind type=> is a subject type', () => {
          const invalid = manifest.api.bindings
            .filter((b) => !subjectTypes.includes(b.type))
            .map((b) => `${b.name}: ${b.type}`);
          expect(invalid).toEqual([]);
        });

        const ownDraw = drawProps(manifest.declared.api.props);
        if (ownDraw.length > 0) {
          const target = ownDraw[0]!.draw!;

          it('names one draw function, taking U8G2& then the draw= props in declaration order', () => {
            expect(new Set(ownDraw.map((p) => p.draw))).toEqual(new Set([target]));
            const params = drawFunctions.get(target)?.params ?? [];
            expect(params[0]?.type).toBe('U8G2&');
            expect(params.slice(1).map((p) => p.name)).toEqual(ownDraw.map((p) => p.name));
          });

          const effectiveOrder = OPEN_EFFECTIVE_ORDER_MISMATCHES.has(tag) ? it.fails : it;
          effectiveOrder('draw= props in effective (inherited) order match the draw function', () => {
            const params = drawFunctions.get(target)?.params ?? [];
            expect(params.slice(1).map((p) => p.name)).toEqual(drawProps(manifest.api.props).map((p) => p.name));
          });
        }
      });
    }
  });
});
