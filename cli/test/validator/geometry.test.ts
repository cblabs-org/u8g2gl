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
import { validateGeometry } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

describe('validateGeometry', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.3',
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
    components: [],
    widgetManifests: [],
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
});
