/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/widget-props.test.ts
 * Purpose: Verification tests for Pass 4 widget property validation (§13.1, §13.2).
 * Description: Asserts that widget attributes are validated against <api> manifests,
 *              missing required props are flagged, invalid enum values are caught with
 *              suggestions, and common attributes/style overrides are permitted.
 */

import { describe, expect, it } from 'vitest';
import { validateWidgetProps } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

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
    components: [],
    widgetManifests: [
      {
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
      },
    ],
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
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              font: 'small_9',
              txt: 'Hello', // Typo for 'text' (dist = 1)
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

    const unknownAttr = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
    );
    expect(unknownAttr).toBeDefined();
    expect(unknownAttr?.offendingText).toBe('txt');
    expect(unknownAttr?.suggestions).toContain('text');
  });

  it('flags missing required property with U8G2GL_MISSING_REQUIRED', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              text: 'Hello',
              // Missing required 'font'
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

    const missingReq = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED,
    );
    expect(missingReq).toBeDefined();
    expect(missingReq?.offendingText).toBe('font');
    expect(missingReq?.message).toContain("Missing required attribute 'font'");
  });

  it('flags invalid enum value with U8G2GL_INVALID_ENUM_VALUE and allowed suggestions', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              font: 'small_9',
              align: 'middle', // Invalid: allowed is left, center, right
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

    const invalidEnum = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(invalidEnum).toBeDefined();
    expect(invalidEnum?.offendingText).toBe('middle');
    expect(invalidEnum?.message).toContain('Expected one of: left, center, right');
  });

  // --- Item 6: composite props previously got no enum validation at all ---
  it('flags invalid enum value on a composite prop with U8G2GL_INVALID_ENUM_VALUE', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'status_bar',
            attributes: { name: 'bar', mode: 'sideways' }, // invalid: allowed is left, right
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateWidgetProps({
      ...baseInput,
      components: [
        {
          name: 'status_bar',
          api: {
            props: [{ name: 'mode', type: 'enum', values: 'left,right', default: 'left' }],
            bindings: [],
            elements: [],
          },
          view: { children: [] },
        },
      ],
      screens: [screen],
    });

    const invalidEnum = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    );
    expect(invalidEnum).toBeDefined();
    expect(invalidEnum?.offendingText).toBe('sideways');
    expect(invalidEnum?.message).toContain('Expected one of: left, right');
  });
});
