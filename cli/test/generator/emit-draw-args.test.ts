/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-draw-args.test.ts
 * Purpose: Pins the shared draw-argument helper (PR-04 WO9). A drawing element
 *          compiles to a positional `u8g2gl_draw_*` call ([D-18], §6.2), and a
 *          positional call with an argument in the wrong place still compiles —
 *          so the order is the single most dangerous thing the generator decides.
 *          WO10's firmware emission and WO11's editor target both emit through
 *          this function, so these assertions cover all three.
 * Description: Drives the real pipeline — parse, validate, resolve, realise —
 *              and then asks the helper for the call, so the argument values are
 *              the ones a build would really emit rather than hand-built stubs.
 */

import { describe, expect, it } from 'vitest';
import { parseGlobalsFile, parseProjectFile, parseScreenFile } from '../../src/core/parser/index.js';
import {
  drawCallFor,
  generate,
  walkRealised,
  type ProjectModel,
  type RealisedElement,
} from '../../src/core/generator/index.js';
import type { ResolvedElement } from '../../src/core/resolver/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';

const PROJECT_XML = `<u8g2gl schema="0.5" name="draws" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`;

const GLOBALS_XML = `<globals>
    <subjects><int name="level" value="3" /></subjects>
    <fonts><builtin name="u8g2_font_6x10_mr" /></fonts>
</globals>
`;

/** Builds a one-screen model whose view is `body`. */
function model(body: string): ProjectModel {
  const loadDiagnostics: Diagnostic[] = [];
  const screen = parseScreenFile(`<screen name="home"><view>${body}</view></screen>`, 'screens/screen_home.xml');
  loadDiagnostics.push(...screen.diagnostics);
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: screen.value ? [screen.value] : [],
    manifests: frameworkRegistry(),
    catalogue: CATALOGUE,
    loadDiagnostics,
    hasProjectManifest: true,
  };
}

/** The draw call for the named element, through the real pipeline. */
function drawCall(body: string, name: string): { readonly fn: string; readonly args: readonly string[] } {
  const input = model(body);
  const result = generate({ ...input, generatorVersion: '0.0.0-test' });
  expect(result.errors).toBe(0);

  // Pair the realised element with its resolved twin: both are views of the one
  // expanded tree, keyed by the very same node object.
  let realised: RealisedElement | undefined;
  for (const screen of result.realised ?? []) {
    walkRealised(screen.elements, (element) => {
      if (element.element.name === name) {
        realised = element;
      }
    });
  }
  const findResolved = (elements: readonly ResolvedElement[]): ResolvedElement | undefined => {
    for (const element of elements) {
      if (element.node === realised?.element.node) {
        return element;
      }
      const nested = findResolved(element.children);
      if (nested !== undefined) {
        return nested;
      }
    }
    return undefined;
  };
  const resolved = findResolved(result.resolved?.[0]?.elements ?? []);
  expect(realised).toBeDefined();
  expect(resolved).toBeDefined();

  return drawCallFor({
    manifest: input.manifests.get(realised!.element.node.tag)!,
    resolved: resolved!,
    bindings: realised!.bindings,
  });
}

describe('drawCallFor() — manifest declaration order is parameter order (WO2)', () => {
  it('emits a box in the order u8g2gl_draw_box declares its parameters', () => {
    const call = drawCall(
      '<u8g2gl_box name="b" x="4" y="20" width="60" height="6" filled="true" radius="2" />',
      'b',
    );
    expect(call.fn).toBe('u8g2gl_draw_box');
    expect(call.args).toEqual(['4', '20', '60', '6', 'true', '2']);
  });

  it('fills an omitted prop from the manifest default, keeping its position', () => {
    // `filled` defaults to true and `radius` to 0, so the call stays the same
    // shape as the header rather than losing trailing arguments.
    const call = drawCall('<u8g2gl_box name="b" x="4" y="20" width="60" height="6" />', 'b');
    expect(call.args).toEqual(['4', '20', '60', '6', 'true', '0']);
  });

  it('emits an hline with its three parameters', () => {
    const call = drawCall('<u8g2gl_hline name="rule" x="0" y="11" width="128" />', 'rule');
    expect(call.fn).toBe('u8g2gl_draw_hline');
    expect(call.args).toEqual(['0', '11', '128']);
  });

  it('reads a bound value from the subject at draw time (§13.5)', () => {
    // A full-frame redraw means a stateless element need not store the value, so
    // the argument is the subject read rather than a literal.
    const call = drawCall(
      '<u8g2gl_box name="b" x="4" y="20" width="60" height="6" bind_width="level" />',
      'b',
    );
    expect(call.args).toEqual(['4', '20', 'u8g2gl_coord_bound(0, ui_subject_level.get())', '6', 'true', '0']);
  });

  it('resolves an expression to a literal before emitting it ([D-7])', () => {
    const call = drawCall('<u8g2gl_hline name="rule" x="0" y="11" width="#screen_width" />', 'rule');
    expect(call.args).toEqual(['0', '11', '128']);
  });

  // An anchored drawing element is deliberately not tested here, and cannot be:
  // every shipped drawing manifest marks `x`, `y`, `width` and `height`
  // `required="true"`, so `right="0"` without `x` is a missing-required error
  // before resolution is ever reached. The same interaction makes §6.2's and
  // §8.4's own `bind_width` examples — a box with no `width` — unvalidatable.
  // Recorded as a finding for the Principal Architect rather than worked around.
});

describe('drawCallFor() refuses what is not a drawing element', () => {
  it('refuses an element with a class, which reaches the display through setters', () => {
    const input = model('<u8g2gl_label name="l" x="0" y="0" width="40" height="10" font="u8g2_font_6x10_mr" />');
    const result = generate({ ...input, generatorVersion: '0.0.0-test' });
    const resolved = result.resolved?.[0]?.elements?.[0];
    expect(resolved).toBeDefined();
    expect(() =>
      drawCallFor({ manifest: input.manifests.get('u8g2gl_label')!, resolved: resolved!, bindings: [] }),
    ).toThrow(/no 'draw=' props/);
  });
});
