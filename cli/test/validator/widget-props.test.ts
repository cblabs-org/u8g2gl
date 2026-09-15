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

  it('permits common and manifest-declared geometry attributes and inline style overrides', () => {
    // Against the real framework label: since PR-04 WO3 `x`, `y`, `width`,
    // `height` and `hidden` are accepted because u8g2gl_obj declares them, not
    // because COMMON_ATTRIBUTES lists them.
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
      manifests: frameworkRegistry(),
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
      // suggestion pool; a composite's `widht` got no suggestion at all. Since
      // PR-04 WO3 `width` comes from the u8g2gl_obj a composite inherits.
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry([STATUS_BAR]),
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

  // --- PR-04 WO3: attribute acceptance comes from the manifests ---
  describe('manifest-sourced attribute acceptance', () => {
    const run = (node: Omit<WidgetNode, 'children' | 'styleOverrides'>) =>
      validateWidgetProps({ ...baseInput, manifests: frameworkRegistry(), screens: [screenWith(node)] });

    it('rejects x on <u8g2gl_line>, whose manifest declares x1/y1/x2/y2 instead', () => {
      const diagnostics = run({
        tag: 'u8g2gl_line',
        attributes: { name: 'ln', x1: '0', y1: '0', x2: '9', y2: '9', x: '3' },
      });
      expect(diagnostics.map((d) => [d.code, d.offendingText])).toEqual([
        [DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE, 'x'],
      ]);
    });

    it('rejects a literal hidden on a drawing element, which hides through a <bind_flag_if_*> child', () => {
      const diagnostics = run({
        tag: 'u8g2gl_box',
        attributes: { name: 'bx', x: '0', y: '0', width: '4', height: '4', hidden: true },
      });
      expect(diagnostics.map((d) => [d.code, d.offendingText])).toEqual([
        [DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE, 'hidden'],
      ]);
    });

    it('accepts bind_width on <u8g2gl_box> ([D-20], §6.2 example)', () => {
      const diagnostics = run({
        tag: 'u8g2gl_box',
        attributes: { name: 'level_bar', x: '4', y: '20', width: '0', height: '6', bind_width: 'level' },
      });
      expect(diagnostics).toEqual([]);
    });

    it('accepts identity attributes on any element, and anchors on a rectangular one', () => {
      expect(run({ tag: 'u8g2gl_pixel', attributes: { name: 'px', x: '0', y: '0', style: 's' } })).toEqual([]);
      const diagnostics = run({
        tag: 'u8g2gl_label',
        attributes: { name: 'lbl', right: '1', bottom: '1', hcenter: 'false', vcenter: 'true', width: '4', height: '4', font: 'f', style: 's' },
      });
      expect(diagnostics).toEqual([]);
    });
  });

  // --- PR-04 WO3 F4: composite interiors are prop-checked like screens ---
  describe('composite interiors (§13.11)', () => {
    const compositeWith = (child: WidgetNode): WidgetManifest => ({
      name: 'wd_panel',
      api: {
        props: [{ name: 'mode', type: 'enum', values: 'left,right', default: 'left' }],
        bindings: [],
        elements: [],
      },
      view: { children: [child] },
    });

    it('reports an unknown attribute on an element inside a <view>', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry([
          compositeWith({
            tag: 'u8g2gl_label',
            attributes: { name: 'inner', font: '$font', txt: 'x' },
            children: [],
            styleOverrides: {},
          }),
        ]),
      });
      expect(diagnostics.map((d) => [d.code, d.offendingText])).toEqual([
        [DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE, 'txt'],
      ]);
    });

    it('skips a $prop placeholder value where an enum value is expected', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry([
          compositeWith({
            tag: 'u8g2gl_label',
            attributes: { name: 'inner', font: '$font', align: '$mode' },
            children: [],
            styleOverrides: {},
          }),
        ]),
      });
      expect(diagnostics).toEqual([]);
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

  // --- PR-04 WO5a: §8.4's fixed flags on drawing elements ---
  describe('flag directives', () => {
    /** A one-screen document holding `tag` with one <bind_flag_if_eq> for `flag`. */
    const flaggedScreen = (tag: string, attributes: WidgetNode['attributes'], flag: string): Screen => ({
      name: 'screen_home',
      view: {
        children: [
          {
            tag,
            attributes,
            children: [
              {
                kind: 'binding',
                type: 'bind_flag_if_eq',
                subject: 'compact_mode',
                refValue: '1',
                value: '1',
                flag,
                loc: { file: 'screens/screen_home.xml', line: 4, column: 9 },
              },
            ],
            styleOverrides: {},
          },
        ],
      },
    });

    it('rejects flag="disabled" on <u8g2gl_box>, a drawing element', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry(),
        screens: [flaggedScreen('u8g2gl_box', { name: 'bar', x: '0', y: '0', width: '4', height: '4' }, 'disabled')],
      });
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.INAPPLICABLE_FLAG]);
      expect(diagnostics[0]?.message).toBe(
        "Flag 'disabled' in <bind_flag_if_eq> cannot apply to <u8g2gl_box>: it is a drawing element " +
          "(draw= props only) with no object to disable. Only 'hidden' applies to a drawing element (§8.4).",
      );
      expect(diagnostics[0]?.offendingText).toBe('disabled');
      expect(diagnostics[0]?.line).toBe(4);
    });

    it('accepts flag="hidden" on <u8g2gl_box>', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry(),
        screens: [flaggedScreen('u8g2gl_box', { name: 'bar', x: '0', y: '0', width: '4', height: '4' }, 'hidden')],
      });
      expect(diagnostics).toEqual([]);
    });

    it('accepts flag="disabled" on a class-backed element', () => {
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry(),
        screens: [flaggedScreen('u8g2gl_label', { name: 'lbl', font: 'small_9' }, 'disabled')],
      });
      expect(diagnostics).toEqual([]);
    });

    it('decides "drawing element" from the manifest, so a custom draw= element is rejected too', () => {
      const dot: WidgetManifest = {
        name: 'wd_dot',
        api: {
          props: [
            { name: 'x', type: 'int', draw: 'wd_draw_dot' },
            { name: 'y', type: 'int', draw: 'wd_draw_dot' },
          ],
          bindings: [],
          elements: [],
        },
      };
      const diagnostics = validateWidgetProps({
        ...baseInput,
        manifests: frameworkRegistry([dot]),
        screens: [flaggedScreen('wd_dot', { name: 'd', x: '1', y: '1' }, 'disabled')],
      });
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.INAPPLICABLE_FLAG]);
    });
  });
});
