/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/geometry.test.ts
 * Purpose: Verification tests for Pass 6 layout geometry and bounds validation (§7.2, §15.1).
 * Description: Asserts detection of over-constrained anchors (simultaneous specification
 *              of origin, dimension, and opposite edge) and of out-of-bounds positioning.
 *              Bounds are checked against the element's **immediate containing
 *              element** ([D-20]), which is the display only for a screen-level
 *              element: a child of a composite or a box is held to that
 *              container's rectangle, not to the target display's resolution.
 */

import { describe, expect, it } from 'vitest';
import { frameworkRegistry, registryOf } from '../helpers/manifest-registry.js';
import { validateGeometry } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';

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
    // The framework manifests, because geometry is read only where an element's
    // effective manifest declares it (PR-04 WO3, WO6): with an empty registry
    // every tag here would have no x, y, width or height at all.
    manifests: frameworkRegistry(),
    catalogue: [
      {
        setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        controller: 'SSD1306',
        variant: ['128X64', 'NONAME'],
        width: 128,
        height: 64,
        tiles: { width: 16, height: 8 },
        framebufferBytes: 1024,
        bus: { family: 'i2c', wiring: 'HW_I2C', raw: 'HW_I2C' },
        xOffset: { default: 0, flipmode: 0 },
        driver: 'u8x8_d_ssd1306_128x64_noname',
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

  it('resolves symbolic expressions that fit the display without errors (PR-04 WO6)', () => {
    const screen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            attributes: {
              name: 'box_symbolic',
              x: '0',
              width: '#screen_width', // Resolves to 128 — exactly the display's width
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
      globals: { ...baseInput.globals, consts: [{ name: 'header_height', type: 'int', value: '12' }] },
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
      manifests: frameworkRegistry([
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
      manifests: frameworkRegistry([
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

  // --- PR-04 WO3: [D-20] a geometry-bound container may not have anchored children ---
  describe('bound-geometry containers ([D-20], §8.4)', () => {
    const node = (
      tag: string,
      attributes: Record<string, string>,
      children: WidgetNode[] = [],
    ): WidgetNode => ({ tag, attributes: { name: attributes.name ?? tag, ...attributes }, children, styleOverrides: {} });
    const anchored = (diagnostics: readonly Diagnostic[]) =>
      diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.BOUND_GEOMETRY_ANCHORED_CHILD);

    it('is an error, naming the container, the bound attribute and the anchored child', () => {
      const screen: Screen = {
        name: 'screen_home',
        view: {
          children: [
            node('u8g2gl_box', { name: 'panel', x: '0', y: '0', height: '20', bind_width: 'panel_w' }, [
              node('u8g2gl_label', { name: 'title', y: '0', width: '20', height: '10', right: '0' }),
            ]),
          ],
        },
      };
      const diagnostics = anchored(validateGeometry({ ...baseInput, screens: [screen] }));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ severity: 'error', offendingText: 'right' });
      const message = diagnostics[0]?.message ?? "";
      expect(message).toContain("Container 'panel' <u8g2gl_box>");
      expect(message).toContain("'bind_width'");
      expect(message).toContain("child 'title' <u8g2gl_label>");
      expect(message).toContain("with 'right'");
    });

    it('is not an error when the children use absolute coordinates', () => {
      const screen: Screen = {
        name: 'screen_home',
        view: {
          children: [
            node('u8g2gl_box', { name: 'panel', x: '0', y: '0', height: '20', bind_width: 'panel_w' }, [
              node('u8g2gl_label', { name: 'title', x: '2', y: '0', width: '20', height: '10', hcenter: 'false' }),
            ]),
          ],
        },
      };
      expect(anchored(validateGeometry({ ...baseInput, screens: [screen] }))).toEqual([]);
    });

    it('is not an error when the container geometry is literal', () => {
      const screen: Screen = {
        name: 'screen_home',
        view: {
          children: [
            node('u8g2gl_box', { name: 'panel', x: '0', y: '0', width: '40', height: '20' }, [
              node('u8g2gl_label', { name: 'title', y: '0', width: '20', height: '10', right: '0' }),
            ]),
          ],
        },
      };
      expect(anchored(validateGeometry({ ...baseInput, screens: [screen] }))).toEqual([]);
    });

    it("applies to a composite instance whose <view> anchors a child", () => {
      const statusBar = {
        name: 'status_bar',
        api: { props: [], bindings: [], elements: [] },
        view: { children: [node('u8g2gl_clock', { name: 'clock', y: '0', width: '40', height: '11', right: '0' })] },
      };
      const screen: Screen = {
        name: 'screen_home',
        view: { children: [node('status_bar', { name: 'bar', x: '0', y: '0', width: '128', bind_height: 'bar_h' })] },
      };
      const diagnostics = anchored(
        validateGeometry({ ...baseInput, manifests: registryOf([statusBar]), screens: [screen] }),
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain(
        "Container 'bar' <status_bar> binds its geometry with 'bind_height', so child 'clock' <u8g2gl_clock>",
      );
    });
  });
});
