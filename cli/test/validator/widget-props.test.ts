/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/widget-props.test.ts
 * Purpose: Verification tests for Pass 4 element property validation (§13.1, §13.2).
 * Description: Asserts that attributes are validated against effective <api>
 *              manifests, missing required props are flagged, invalid enum values
 *              are caught with suggestions, and common attributes/style overrides
 *              are permitted. PR-04 WO1 merged the widget and composite code paths
 *              into one; the tests under "one code path" pin that a behaviour
 *              once present on only one path now holds on both, and that props
 *              inherited through `extends` are accepted.
 */

import { describe, expect, it } from 'vitest';
import { registryOf, frameworkRegistry } from '../helpers/manifest-registry.js';
import { validateWidgetProps } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';

const LABEL: WidgetManifest = {
  name: 'u8g2gl_label',
  extends: 'u8g2gl_obj',
  api: {
    props: [
      { name: 'text', type: 'string', setter: 'set_text' },
      { name: 'font', type: 'font', setter: 'set_font', required: true },
      {
        name: 'align',
        type: 'enum',
        setter: 'set_align',
        values: 'left,center,right',
      },
    ],
    bindings: [{ name: 'bind_text', type: 'string', setter: 'bind_text' }],
    elements: [],
  },
};

const STATUS_BAR: WidgetManifest = {
  name: 'status_bar',
  api: {
    props: [
      { name: 'mode', type: 'enum', values: 'left,right', default: 'left' },
      { name: 'title', type: 'string', required: true },
    ],
    bindings: [],
    elements: [],
  },
  view: { children: [] },
};

/** A one-screen document holding a single instance. */
function screenWith(node: Omit<WidgetNode, 'children' | 'styleOverrides'>): Screen {
  return {
    name: 'screen_home',
    view: { children: [{ ...node, children: [], styleOverrides: {} }] },
  };
}

describe('validateWidgetProps', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.4',
      name: 'widget_props_test',
      version: '1.0.0',
      targets: [],
    },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: registryOf([LABEL, STATUS_BAR]),
    catalogue: [],
  };

  it('permits common attributes and inline style overrides without diagnostics', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_title',
              x: '0',
              y: '0',
              width: '128',
              height: '12',
              right: '0',
              bottom: '10',
              hcenter: 'true',
              vcenter: 'false',
              hidden: false,
              style: 'header',
              focus_style: 'focused',
              style_invert: 'true',
              font: 'small_9',
              text: 'Hello',
              align: 'center',
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateWidgetProps({
      ...baseInput,
      screens: [screen],
    });

    expect(diagnostics).toHaveLength(0);
  });

  it('flags unknown attribute on widget with U8G2GL_UNKNOWN_ATTRIBUTE and suggestions', () => {
    const diagnostics = validateWidgetProps({
      ...baseInput,
      screens: [
        screenWith({
          tag: 'u8g2gl_label',
          attributes: { name: 'lbl', font: 'small_9', txt: 'Hello' }, // Typo for 'text'
        }),
      ],
    });

    const unknownAttr = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
    );
    expect(unknownAttr).toBeDefined();
    expect(unknownAttr?.offendingText).toBe('txt');
    expect(unknownAttr?.suggestions).toContain('text');
  });

  it('flags missing required property with U8G2GL_MISSING_REQUIRED', () => {
    const diagnostics = validateWidgetProps({
      ...baseInput,
      screens: [
        screenWith({ tag: 'u8g2gl_label', attributes: { name: 'lbl', text: 'Hello' } }),
      ],
    });

    const missingReq = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED,
    );
    expect(missingReq).toBeDefined();
    expect(missingReq?.offendingText).toBe('font');
    expect(missingReq?.message).toContain("Missing required attribute 'font'");
  });

  it('flags invalid enum value with U8G2GL_INVALID_ENUM_VALUE and allowed suggestions', () => {
    const diagnostics = validateWidgetProps({
      ...baseInput,
      screens: [
        screenWith({
          tag: 'u8g2gl_label',
          attributes: { name: 'lbl', font: 'small_9', align: 'middle' },
        }),
      ],
    });

    const invalidEnum = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(invalidEnum).toBeDefined();
    expect(invalidEnum?.offendingText).toBe('middle');
    expect(invalidEnum?.message).toContain('Expected one of: left, center, right');
  });

  it('flags invalid enum value on a composite prop with U8G2GL_INVALID_ENUM_VALUE', () => {
    const diagnostics = validateWidgetProps({
      ...baseInput,
      screens: [
        screenWith({
          tag: 'status_bar',
          attributes: { name: 'bar', title: 'Home', mode: 'sideways' },
        }),
      ],
    });

    const invalidEnum = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(invalidEnum).toBeDefined();
    expect(invalidEnum?.offendingText).toBe('sideways');
    expect(invalidEnum?.message).toContain('Expected one of: left, right');
  });

  // --- PR-04 WO1: one code path for widgets and composites ---
  describe('one code path for widgets and composites', () => {
    it('suggests common layout attributes for a composite instance, as it always did for a widget', () => {
      // Before WO1 only the widget path put COMMON_ATTRIBUTES into its
      // suggestion pool; a composite's `widht` got no suggestion at all.
      const diagnostics = validateWidgetProps({
        ...baseInput,
        screens: [
          screenWith({
            tag: 'status_bar',
            attributes: { name: 'bar', title: 'Home', widht: '20' },
          }),
        ],
      });

      const unknownAttr = diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      );
      expect(unknownAttr?.offendingText).toBe('widht');
      expect(unknownAttr?.suggestions).toContain('width');
    });

    it('words composite and widget diagnostics identically (no "on component <x>")', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        screens: [screenWith({ tag: 'status_bar', attributes: { name: 'bar', bogus: '1' } })],
      });

      const unknownAttr = diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      );
      const missing = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
      expect(unknownAttr?.message).toBe("Unknown attribute 'bogus' on <status_bar>.");
      expect(missing?.message).toBe("Missing required attribute 'title' on <status_bar>.");
    });

    it('checks an element whose tag is declared once, exactly once', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        screens: [screenWith({ tag: 'status_bar', attributes: { name: 'bar' } })],
      });
      expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED)).toHaveLength(
        1,
      );
    });
  });

  // --- PR-04 WO1: props inherited through `extends` ---
  describe('inherited props', () => {
    it('accepts props a framework element inherits from u8g2gl_obj', () => {
      // `draw_color` and `disabled` are declared only on u8g2gl_obj. Before WO1
      // nothing resolved `extends`, so both were U8G2GL_UNKNOWN_ATTRIBUTE.
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry(),
        screens: [
          screenWith({
            tag: 'u8g2gl_label',
            attributes: { name: 'lbl', font: 'small_9', draw_color: '1', disabled: 'true' },
          }),
        ],
      });
      expect(diagnostics).toEqual([]);
    });

    it('checks enum values against the child override, not the inherited declaration', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry(),
        screens: [
          screenWith({
            tag: 'u8g2gl_label',
            attributes: { name: 'lbl', font: 'small_9', long_mode: 'wrap' },
          }),
        ],
      });
      const invalidEnum = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
      expect(invalidEnum?.offendingText).toBe('wrap');
    });

    it('enforces a required prop inherited from the parent', () => {
      const parent: WidgetManifest = {
        name: 'wd_base',
        api: {
          props: [{ name: 'source', type: 'string', setter: 'set_source', required: true }],
          bindings: [],
          elements: [],
        },
      };
      const child: WidgetManifest = {
        name: 'wd_child',
        extends: 'wd_base',
        api: { props: [], bindings: [], elements: [] },
      };
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: registryOf([parent, child]),
        screens: [screenWith({ tag: 'wd_child', attributes: { name: 'c' } })],
      });
      const missing = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
      expect(missing?.offendingText).toBe('source');
    });
  });
});
