/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/geometry.test.ts
 * Purpose: Verification tests for Pass 6 layout geometry and bounds validation (§7.2, §15.1).
 * Description: Asserts detection of over-constrained anchors (simultaneous specification
 *              of origin, dimension, and opposite edge) and checks out-of-bounds positioning
 *              against target display catalogue resolutions.
 */

import { describe, expect, it } from 'vitest';
import { registryOf } from '../helpers/manifest-registry.js';
import { validateGeometry } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

describe('validateGeometry', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.4',
      name: 'geom_test',
      version: '1.0.0',
      targets: [
        {
          name: 'primary',
          setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C', // 128x64 display
        },
      ],
    },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: registryOf([]),
    catalogue: [
      {
        setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        controller: 'SSD1306',
        resolution: '128x64',
        width: 128,
        height: 64,
        buffer: 'full',
        bus: 'hw_i2c',
        busFamily: 'i2c',
        ramBytes: 1024,
      },
    ],
  };

  it('detects over-constrained horizontal anchors (x + width + right)', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            attributes: {
              name: 'box_overconstrained',
              x: '10',
              width: '50',
              right: '20', // Overconstrained!
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateGeometry({
      ...baseInput,
      screens: [screen],
    });

    const overDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED,
    );
    expect(overDiag).toBeDefined();
    expect(overDiag?.severity).toBe('error');
    expect(overDiag?.message).toContain('horizontal anchors: \'x\', \'width\', and \'right\'');
  });

  it('detects over-constrained vertical anchors (y + height + bottom)', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            attributes: {
              name: 'box_overconstrained',
              y: '5',
              height: '30',
              bottom: '10', // Overconstrained!
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateGeometry({
      ...baseInput,
      screens: [screen],
    });

    const overDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED,
    );
    expect(overDiag).toBeDefined();
    expect(overDiag?.severity).toBe('error');
    expect(overDiag?.message).toContain('vertical anchors: \'y\', \'height\', and \'bottom\'');
  });

  it('detects element extending past display width with U8G2GL_OUT_OF_BOUNDS', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_oob',
              x: '50',
              width: '100', // 50 + 100 = 150 > 128
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateGeometry({
      ...baseInput,
      screens: [screen],
    });

    const oobDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
    );
    expect(oobDiag).toBeDefined();
    expect(oobDiag?.severity).toBe('error');
    expect(oobDiag?.message).toContain('extends to x=150, display is 128px wide (0..127)');
  });

  it('detects element extending past display height with U8G2GL_OUT_OF_BOUNDS', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: {
              name: 'lbl_oob',
              y: '40',
              height: '30', // 40 + 30 = 70 > 64
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateGeometry({
      ...baseInput,
      screens: [screen],
    });

    const oobDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
    );
    expect(oobDiag).toBeDefined();
    expect(oobDiag?.severity).toBe('error');
    expect(oobDiag?.message).toContain('extends to y=70, display is 64px high (0..63)');
  });

  it('safely skips unresolvable symbolic expressions without errors', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            attributes: {
              name: 'box_symbolic',
              x: '0',
              width: '#screen_width', // Symbolic constant, should skip bounds check
              y: '0',
              height: '#header_height',
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateGeometry({
      ...baseInput,
      screens: [screen],
    });

    expect(diagnostics).toHaveLength(0);
  });

  // --- [D-20]: bounds are checked against the containing element, which is
  // the display only at screen level; nested elements measure against their
  // immediate parent's own declared geometry, and a composite's own template
  // has no display to check against at all. ---

  it('catches an element overflowing its composite parent container, even though the same size would fit the display', () => {
    const diagnostics = validateGeometry({
      ...baseInput,
      manifests: registryOf([
        {
          name: 'status_bar',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              {
                tag: 'u8g2gl_box',
                attributes: { name: 'container', x: '0', y: '0', width: '40', height: '16' },
                styleOverrides: {},
                children: [
                  {
                    tag: 'u8g2gl_label',
                    attributes: { name: 'inner', x: '10', y: '0', width: '50', height: '10' },
                    children: [],
                    styleOverrides: {},
                  },
                ],
              },
            ],
          },
        },
      ]),
    });

    const oobDiag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS);
    expect(oobDiag).toBeDefined();
    expect(oobDiag?.message).toContain("containing element '<u8g2gl_box>'");
    expect(oobDiag?.message).toContain('extends to x=60');
  });

  it('does not flag a composite template top-level child against any display, since a composite has no display', () => {
    const diagnostics = validateGeometry({
      ...baseInput,
      manifests: registryOf([
        {
          name: 'status_bar',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              {
                tag: 'u8g2gl_label',
                // Larger than the 128x64 display in baseInput's catalogue —
                // irrelevant, since a composite's top-level children have no
                // known instantiated size to check against.
                attributes: { name: 'huge', x: '0', y: '0', width: '9999', height: '9999' },
                children: [],
                styleOverrides: {},
              },
            ],
          },
        },
      ]),
    });

    expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS)).toBe(false);
  });

  it('checks a screen-nested element against its immediate parent container, not the display', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            attributes: { name: 'outer', x: '0', y: '0', width: '30', height: '20' },
            styleOverrides: {},
            children: [
              {
                tag: 'u8g2gl_label',
                // Fits the 128x64 display easily, but overflows its 30px-wide parent.
                attributes: { name: 'inner', x: '0', y: '0', width: '50', height: '10' },
                children: [],
                styleOverrides: {},
              },
            ],
          },
        ],
      },
    };

    const diagnostics = validateGeometry({ ...baseInput, screens: [screen] });
    const oobDiag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS);
    expect(oobDiag).toBeDefined();
    expect(oobDiag?.message).toContain("containing element '<u8g2gl_box>'");
  });
});
