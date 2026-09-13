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
import { validateSchema } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';

describe('validateSchema — setter/draw mutual exclusion', () => {
  const baseInput: ValidateInput = {
    project: { schema: '0.4', name: 'schema_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    components: [],
    widgetManifests: [],
    catalogue: [],
  };

  function manifestWithProp(prop: {
    setter?: string;
    draw?: string;
  }): WidgetManifest {
    return {
      name: 'u8g2gl_widget',
      extends: 'u8g2gl_obj',
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
      widgetManifests: [manifestWithProp({ setter: 'set_value' })],
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('passes when only draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [manifestWithProp({ draw: 'u8g2gl_draw_value' })],
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('is an error when neither setter nor draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [manifestWithProp({})],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
  });

  it('is an error when both setter and draw are present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [
        manifestWithProp({ setter: 'set_value', draw: 'u8g2gl_draw_value' }),
      ],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
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
    components: [],
    widgetManifests: [],
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
      components: [composite],
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
        components: [cyclic],
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
