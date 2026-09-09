/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/references.test.ts
 * Purpose: Verification tests for Pass 2 cross-reference symbol validation (§15.1).
 * Description: Asserts that unknown fonts, subjects, styles, and components produce
 *              structured diagnostics with Levenshtein near-match suggestions.
 */

import { describe, expect, it } from 'vitest';
import { validateReferences } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

describe('validateReferences', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.3',
      name: 'ref_test',
      version: '1.0.0',
      targets: [],
    },
    globals: {
      consts: [],
      subjects: [
        { name: 'temperature', type: 'int' },
        { name: 'wifi_connected', type: 'bool' },
      ],
      styles: [
        { name: 'header_style', font: 'font_roboto_12' },
        { name: 'body_style', font: 'font_roboto_12' },
      ],
      fonts: [
        { name: 'font_roboto_12', kind: 'bdf', src: 'roboto12.bdf' },
        { name: 'font_roboto_14', kind: 'bdf', src: 'roboto14.bdf' },
      ],
      images: [{ name: 'icon_wifi', kind: 'xbm', src: 'wifi.xbm' }],
    },
    screens: [],
    components: [
      {
        name: 'status_bar',
        api: [],
        view: { children: [] },
      },
      {
        name: 'battery_badge',
        api: [],
        view: { children: [] },
      },
    ],
    widgetManifests: [
      {
        name: 'u8g2gl_label',
        extends: 'u8g2gl_obj',
        api: {
          props: [{ name: 'font', type: 'font', setter: 'set_font' }],
          bindings: [{ name: 'bind_text', type: 'string', setter: 'bind_text' }],
          elements: [],
        },
      },
    ],
    catalogue: [],
  };

  it('suggests nearest declared font by edit distance for unknown font', () => {
    const screenWithTypoFont: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              font: 'font_roboto_13', // Closest to font_roboto_12 / font_roboto_14
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateReferences({
      ...baseInput,
      screens: [screenWithTypoFont],
    });

    const fontDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_FONT,
    );
    expect(fontDiag).toBeDefined();
    expect(fontDiag?.offendingText).toBe('font_roboto_13');
    expect(fontDiag?.suggestions).toBeDefined();
    expect(fontDiag?.suggestions).toContain('font_roboto_12');
    expect(fontDiag?.suggestions).toContain('font_roboto_14');
  });

  it('suggests nearest declared subject by edit distance for unknown subject', () => {
    const screenWithTypoSubject: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              bind_text: 'temperatue', // Typo for temperature (dist = 1)
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateReferences({
      ...baseInput,
      screens: [screenWithTypoSubject],
    });

    const subjDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
    );
    expect(subjDiag).toBeDefined();
    expect(subjDiag?.offendingText).toBe('temperatue');
    expect(subjDiag?.suggestions).toContain('temperature');
  });

  it('suggests nearest declared style by edit distance for unknown style', () => {
    const screenWithTypoStyle: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl',
              style: 'headr_style', // Typo for header_style (dist = 1)
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateReferences({
      ...baseInput,
      screens: [screenWithTypoStyle],
    });

    const styleDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_STYLE,
    );
    expect(styleDiag).toBeDefined();
    expect(styleDiag?.offendingText).toBe('headr_style');
    expect(styleDiag?.suggestions).toContain('header_style');
  });

  it('suggests nearest declared component by edit distance for unknown component', () => {
    const screenWithTypoComponent: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'status_baar', // Typo for status_bar (dist = 1)
            attributes: {
              name: 'bar',
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateReferences({
      ...baseInput,
      screens: [screenWithTypoComponent],
    });

    const compDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_COMPONENT,
    );
    expect(compDiag).toBeDefined();
    expect(compDiag?.offendingText).toBe('status_baar');
    expect(compDiag?.suggestions).toContain('status_bar');
  });
});
