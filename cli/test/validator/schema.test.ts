/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/schema.test.ts
 * Purpose: Verification tests for Pass 1 schema structure validation (§15.4).
 * Description: Asserts the `setter`/`draw` mutual-exclusion rule on widget props
 *              (WO6, closing the gap WO4 left behind): `setter` alone passes,
 *              `draw` alone passes, neither is an error, and both is an error.
 */

import { describe, expect, it } from 'vitest';
import { frameworkRegistry, registryOf } from '../helpers/manifest-registry.js';
import { parseWidgetManifestFile } from '../../src/core/parser/parse-widget-manifest.js';
import { validateSchema } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';

// PR-04 WO2 F2: before WO2 the parser defaulted a missing `extends` to
// 'u8g2gl_obj', so this diagnostic could never fire through the real pipeline.
describe('validateSchema — required extends on a plain widget', () => {
  const input = (manifests: ValidateInput['manifests']): ValidateInput => ({
    project: { schema: '0.4', name: 'schema_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests,
    catalogue: [],
  });

  it('reports a parsed plain widget manifest that omits extends', () => {
    const parsed = parseWidgetManifestFile(
      '<widget name="wd_meter"><api><prop name="level" type="int" setter="set_level" /></api></widget>',
      'widgets/wd_meter/wd_meter.xml',
    );
    const diagnostics = validateSchema(input(registryOf([parsed.value!])));
    const missing = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toBe("Missing required attribute 'extends' on widget 'wd_meter'.");
  });

  it('reports nothing for the framework manifests: root and drawing elements declare none, the rest do', () => {
    expect(validateSchema(input(frameworkRegistry()))).toEqual([]);
  });

  // --- PR-04 WO3: the `extends` rule, one test per branch ---
  it('reports a drawing manifest (draw= props only) that declares extends', () => {
    const parsed = parseWidgetManifestFile(
      '<widget name="wd_dot" extends="u8g2gl_obj"><api><prop name="x" type="int" draw="u8g2gl_draw_pixel" /></api></widget>',
      'widgets/wd_dot/wd_dot.xml',
    );
    const diagnostics = validateSchema(input(frameworkRegistry([parsed.value!])));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.DRAWING_ELEMENT_EXTENDS]);
    expect(diagnostics[0]?.message).toContain("Drawing element 'wd_dot' declares extends=\"u8g2gl_obj\"");
  });

  it('accepts a drawing manifest that declares no extends', () => {
    const parsed = parseWidgetManifestFile(
      '<widget name="wd_dot"><api><prop name="x" type="int" draw="u8g2gl_draw_pixel" /></api></widget>',
      'widgets/wd_dot/wd_dot.xml',
    );
    expect(validateSchema(input(frameworkRegistry([parsed.value!])))).toEqual([]);
  });

  it('accepts a composite with no extends, because the registry supplies u8g2gl_obj', () => {
    const composite: WidgetManifest = {
      name: 'status_bar',
      api: { props: [{ name: 'title', type: 'string' }], bindings: [], elements: [] },
      view: { children: [] },
    };
    expect(validateSchema(input(frameworkRegistry([composite])))).toEqual([]);
  });

  it('exempts the root class manifest, u8g2gl_obj, from the requirement', () => {
    const root: WidgetManifest = {
      name: 'u8g2gl_obj',
      api: { props: [{ name: 'x', type: 'int', setter: 'set_x' }], bindings: [], elements: [] },
    };
    expect(validateSchema(input(registryOf([root])))).toEqual([]);
  });
});

describe('validateSchema — setter/draw mutual exclusion', () => {
  const baseInput: ValidateInput = {
    project: { schema: '0.4', name: 'schema_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: registryOf([]),
    catalogue: [],
  };

  function manifestWithProp(prop: {
    setter?: string;
    draw?: string;
  }): WidgetManifest {
    return {
      name: 'u8g2gl_widget',
      // A draw-only manifest must not declare `extends` (PR-04 WO3), so only a
      // prop with a setter gets one; this suite is about setter/draw, not extends.
      ...(prop.setter !== undefined ? { extends: 'u8g2gl_obj' } : {}),
      api: {
        props: [{ name: 'value', type: 'int', ...prop }],
        bindings: [],
        elements: [],
      },
    };
  }

  it('passes when only setter is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      manifests: registryOf([manifestWithProp({ setter: 'set_value' })]),
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('passes when only draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      manifests: registryOf([manifestWithProp({ draw: 'u8g2gl_draw_value' })]),
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('is an error when neither setter nor draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      manifests: registryOf([manifestWithProp({})]),
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
  });

  it('is an error when both setter and draw are present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      manifests: registryOf([
        manifestWithProp({ setter: 'set_value', draw: 'u8g2gl_draw_value' }),
      ]),
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
  });
});

// --- PR-04 WO5a: one emission target per manifest ([D-18]) ---
describe('validateSchema — mixed setter= and draw= manifests', () => {
  const input = (manifests: ValidateInput['manifests']): ValidateInput => ({
    project: { schema: '0.4', name: 'schema_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests,
    catalogue: [],
  });

  it('is an error naming one setter= prop and one draw= prop, instead of either extends diagnostic', () => {
    const parsed = parseWidgetManifestFile(
      '<widget name="wd_hybrid"><api>' +
        '<prop name="level" type="int" setter="set_level" />' +
        '<prop name="x" type="int" draw="u8g2gl_draw_pixel" />' +
        '</api></widget>',
      'widgets/wd_hybrid/wd_hybrid.xml',
    );
    const diagnostics = validateSchema(input(frameworkRegistry([parsed.value!])));
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MIXED_EMISSION_TARGETS]);
    expect(diagnostics[0]?.message).toContain("prop 'level' declares setter=\"set_level\"");
    expect(diagnostics[0]?.message).toContain("prop 'x' declares draw=\"u8g2gl_draw_pixel\"");
    expect(diagnostics[0]?.offendingText).toBe('level, x');
    expect(diagnostics[0]?.file).toBe('widgets/wd_hybrid/wd_hybrid.xml');
  });
});

// --- PR-3R WO7: the 254-object structural ceiling ([A-3], [D-21]) ---
// `parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes one value,
// so a screen may hold at most 254 objects. This is a hard error, not a
// tunable capacity.
describe('validateSchema — 254-object structural ceiling', () => {
  const baseInput: ValidateInput = {
    project: { schema: '0.4', name: 'ceiling_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: registryOf([]),
    catalogue: [],
  };

  /** A flat list of `count` leaf nodes of an arbitrary tag. */
  function flatNodes(count: number, tag = 'u8g2gl_pixel') {
    return Array.from({ length: count }, (_, i) => ({
      tag,
      attributes: { name: `n${i}` },
      children: [],
      styleOverrides: {},
    }));
  }

  it('accepts a screen at exactly 254 objects', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      screens: [{ name: 'busy_screen', view: { children: flatNodes(254) } }],
    });
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.TOO_MANY_OBJECTS)).toBe(false);
  });

  it('is a hard error at 255 objects, naming the screen, count and ceiling', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      screens: [{ name: 'busy_screen', view: { children: flatNodes(255) } }],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.TOO_MANY_OBJECTS);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('busy_screen');
    expect(diag?.message).toContain('255');
    expect(diag?.message).toContain('254');
  });

  it('counts nested children, not just top-level siblings', () => {
    const nested = {
      tag: 'u8g2gl_box',
      attributes: { name: 'container' },
      styleOverrides: {},
      children: flatNodes(254),
    };
    const diagnostics = validateSchema({
      ...baseInput,
      // 1 (container) + 254 (children) = 255
      screens: [{ name: 'nested_screen', view: { children: [nested] } }],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.TOO_MANY_OBJECTS);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('255');
  });

  it('inlines a composite instantiation rather than double-counting it', () => {
    // The composite tag itself contributes 0; its own template's 254
    // children are what land in the generated object array ([D-18]).
    const composite = {
      name: 'busy_composite',
      api: { props: [], bindings: [], elements: [] },
      view: { children: flatNodes(254) },
    };
    const diagnostics = validateSchema({
      ...baseInput,
      manifests: registryOf([composite]),
      screens: [
        {
          name: 'host_screen',
          view: {
            children: [
              { tag: 'busy_composite', attributes: { name: 'inst' }, children: [], styleOverrides: {} },
            ],
          },
        },
      ],
    });
    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.TOO_MANY_OBJECTS)).toBe(false);
  });

  it('does not infinite-loop on a self-referencing composite cycle', () => {
    const cyclic = {
      name: 'cyclic_composite',
      api: { props: [], bindings: [], elements: [] },
      view: {
        children: [
          { tag: 'cyclic_composite', attributes: { name: 'self' }, children: [], styleOverrides: {} },
        ],
      },
    };
    expect(() =>
      validateSchema({
        ...baseInput,
        manifests: registryOf([cyclic]),
        screens: [
          {
            name: 'host_screen',
            view: {
              children: [
                { tag: 'cyclic_composite', attributes: { name: 'inst' }, children: [], styleOverrides: {} },
              ],
            },
          },
        ],
      }),
    ).not.toThrow();
  });
});
