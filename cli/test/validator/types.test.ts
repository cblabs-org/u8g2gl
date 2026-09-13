/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/types.test.ts
 * Purpose: Verification tests for Pass 5 type checking and binding format validation (§8, §15.1).
 * Description: Asserts that subject bindings match expected target types, flags printf format
 *              specifier mismatches in bind_text_fmt, and checks comparison values in
 *              conditional flag directives.
 */

import { describe, expect, it } from 'vitest';
import { frameworkRegistry } from '../helpers/manifest-registry.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';
import { validateTypes } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

describe('validateTypes', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.4',
      name: 'types_test',
      version: '1.0.0',
      targets: [],
    },
    globals: {
      consts: [],
      subjects: [
        { name: 'station_name', type: 'string' },
        { name: 'temperature', type: 'int' },
        { name: 'wifi_connected', type: 'bool' },
      ],
      styles: [],
      fonts: [],
      images: [],
    },
    screens: [],
    // Binding types come from the effective manifests since PR-04 WO3, so these
    // tests need the real framework manifests rather than an empty registry.
    manifests: frameworkRegistry(),
    catalogue: [],
  };

  it('rejects bind_text on a boolean subject with U8G2GL_TYPE_MISMATCH', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_test',
              bind_text: 'wifi_connected', // bool, invalid for bind_text
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateTypes({
      ...baseInput,
      screens: [screen],
    });

    const mismatch = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('error');
    expect(mismatch?.message).toContain("Subject 'wifi_connected' has type 'bool'");
  });

  it('rejects bind_value on a string subject with U8G2GL_TYPE_MISMATCH', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_progress_bar',
            attributes: {
              name: 'prog_test',
              bind_value: 'station_name', // string, invalid for bind_value
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateTypes({
      ...baseInput,
      screens: [screen],
    });

    const mismatch = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("Subject 'station_name' has type 'string'");
  });

  it('rejects integer format specifier (%d) on string subject with U8G2GL_FORMAT_MISMATCH', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_test',
              bind_text: 'station_name', // string
              bind_text_fmt: 'Station: %03d', // %d expects integer
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateTypes({
      ...baseInput,
      screens: [screen],
    });

    const fmtDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.FORMAT_MISMATCH,
    );
    expect(fmtDiag).toBeDefined();
    expect(fmtDiag?.severity).toBe('error');
    expect(fmtDiag?.message).toContain("expects integer, but subject 'station_name' has type 'string'");
  });

  it('rejects string format specifier (%s) on integer subject with U8G2GL_FORMAT_MISMATCH', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_test',
              bind_text: 'temperature', // int
              bind_text_fmt: 'Temp: %s', // %s expects string
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateTypes({
      ...baseInput,
      screens: [screen],
    });

    const fmtDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.FORMAT_MISMATCH,
    );
    expect(fmtDiag).toBeDefined();
    expect(fmtDiag?.message).toContain("expects string, but subject 'temperature' has type 'int'");
  });

  it('rejects non-integer comparison value for int subject in binding child', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_test',
            },
            children: [
              {
                kind: 'binding',
                type: 'bind_flag_if_eq',
                subject: 'temperature',
                flag: 'hidden',
                value: 'not_a_number',
              },
            ],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateTypes({
      ...baseInput,
      screens: [screen],
    });

    const mismatch = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.TYPE_MISMATCH,
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("not a valid integer for subject 'temperature'");
  });

  // --- PR-04 WO3: binding types come from the effective manifest ---
  describe('manifest-declared binding types', () => {
    const screenOf = (node: Omit<WidgetNode, 'children' | 'styleOverrides'>): Screen => ({
      name: 'screen_home',
      view: { children: [{ ...node, children: [], styleOverrides: {} }] },
    });

    it('accepts bind_width on <u8g2gl_box> bound to an int subject ([D-20])', () => {
      const diagnostics = validateTypes({
        ...baseInput,
        screens: [
          screenOf({
            tag: 'u8g2gl_box',
            attributes: { name: 'level_bar', x: '4', y: '20', height: '6', bind_width: 'temperature' },
          }),
        ],
      });
      expect(diagnostics).toEqual([]);
    });

    it('rejects a bool subject bound to bind_width on <u8g2gl_box>', () => {
      const diagnostics = validateTypes({
        ...baseInput,
        screens: [
          screenOf({
            tag: 'u8g2gl_box',
            attributes: { name: 'level_bar', x: '4', y: '20', height: '6', bind_width: 'wifi_connected' },
          }),
        ],
      });
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.TYPE_MISMATCH]);
      expect(diagnostics[0]?.message).toBe(
        "Subject 'wifi_connected' has type 'bool', which is incompatible with 'bind_width' on <u8g2gl_box> (expected 'int').",
      );
    });

    it('accepts an int subject on bind_text, through the bind_text overload set (§8.4)', () => {
      const diagnostics = validateTypes({
        ...baseInput,
        screens: [
          screenOf({
            tag: 'u8g2gl_label',
            attributes: { name: 'temp', bind_text: 'temperature', bind_text_fmt: '%d°C' },
          }),
        ],
      });
      expect(diagnostics).toEqual([]);
    });

    it('checks a format string through the binding\'s declared fmt attribute, not its name', () => {
      const gauge: WidgetManifest = {
        name: 'wd_gauge',
        extends: 'u8g2gl_obj',
        api: {
          props: [],
          bindings: [{ name: 'bind_level', type: 'int', setter: 'bind_level', fmt: 'level_fmt' }],
          elements: [],
        },
      };
      const diagnostics = validateTypes({
        ...baseInput,
        manifests: frameworkRegistry([gauge]),
        screens: [
          screenOf({
            tag: 'wd_gauge',
            attributes: { name: 'g', bind_level: 'temperature', level_fmt: 'Level %s' },
          }),
        ],
      });
      expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.FORMAT_MISMATCH]);
      expect(diagnostics[0]?.message).toContain("'%s' in 'level_fmt' expects string");
    });

    it('ignores a subject bound to a $prop placeholder', () => {
      const diagnostics = validateTypes({
        ...baseInput,
        screens: [
          screenOf({ tag: 'u8g2gl_box', attributes: { name: 'b', x: '0', y: '0', height: '1', bind_width: '$w' } }),
        ],
      });
      expect(diagnostics).toEqual([]);
    });
  });
});
