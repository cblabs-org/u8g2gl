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
import { registryOf } from '../helpers/manifest-registry.js';
import { validateReferences } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';

/** Composites every test starts with. */
const BASE_COMPOSITES: readonly WidgetManifest[] = [
  {
    name: 'status_bar',
    api: { props: [], bindings: [], elements: [] },
    view: { children: [] },
  },
  {
    name: 'battery_badge',
    api: { props: [], bindings: [], elements: [] },
    view: { children: [] },
  },
];

/** Plain widgets every test starts with. */
const BASE_WIDGETS: readonly WidgetManifest[] = [
  {
    name: 'u8g2gl_label',
    extends: 'u8g2gl_obj',
    api: {
      props: [{ name: 'font', type: 'font', setter: 'set_font' }],
      bindings: [{ name: 'bind_text', type: 'string', setter: 'bind_text' }],
      elements: [],
    },
  },
];

describe('validateReferences', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.5',
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
    manifests: registryOf([...BASE_COMPOSITES, ...BASE_WIDGETS]),
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

  // --- Item 1: TIER1_PRIMITIVES removed — a tag validates iff a manifest ---
  it('rejects <u8g2gl_frame>: it has no manifest and is not a hardcoded primitive', () => {
    const screen: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'u8g2gl_frame',
            attributes: { name: 'f1' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateReferences({ ...baseInput, screens: [screen] });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_WIDGET);
    expect(diag).toBeDefined();
    expect(diag?.offendingText).toBe('u8g2gl_frame');
  });

  it.each(['u8g2gl_ellipse', 'u8g2gl_pixel', 'u8g2gl_triangle', 'u8g2gl_xbm'])(
    'still validates %s once a manifest declares it',
    (tag) => {
      const screen: Screen = {
        name: 'main_screen',
        view: {
          children: [
            { tag, attributes: { name: 'el1' }, children: [], styleOverrides: {} },
          ],
        },
      };

      const diagnostics = validateReferences({
        ...baseInput,
        screens: [screen],
        manifests: registryOf([
          ...BASE_COMPOSITES,
          ...BASE_WIDGETS,
          {
            name: tag,
            extends: 'u8g2gl_obj',
            api: { props: [], bindings: [], elements: [] },
          },
        ]),
      });

      expect(
        diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_WIDGET),
      ).toBe(false);
    },
  );

  // --- Item 2: a misspelled element inside a composite's own template ---
  it('flags a misspelled element tag nested inside a composite template', () => {
    const diagnostics = validateReferences({
      ...baseInput,
      manifests: registryOf([
        ...BASE_WIDGETS,
        {
          name: 'status_bar',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              {
                tag: 'u8g2gl_labl', // typo for u8g2gl_label
                attributes: { name: 'inner' },
                children: [],
                styleOverrides: {},
              },
            ],
          },
        },
      ]),
    });

    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_WIDGET);
    expect(diag).toBeDefined();
    expect(diag?.offendingText).toBe('u8g2gl_labl');
  });

  // --- Item 3: composite instantiation cycles, direct and transitive ---
  it('reports a direct self-cycle (A -> A) naming the path', () => {
    const diagnostics = validateReferences({
      ...baseInput,
      manifests: registryOf([
        ...BASE_WIDGETS,
        {
          name: 'a',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              { tag: 'a', attributes: { name: 'self' }, children: [], styleOverrides: {} },
            ],
          },
        },
      ]),
    });

    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.CIRCULAR_REFERENCE);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('a -> a');
  });

  it('reports an indirect cycle (A -> B -> A) naming the full path, once', () => {
    const diagnostics = validateReferences({
      ...baseInput,
      manifests: registryOf([
        ...BASE_WIDGETS,
        {
          name: 'a',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              { tag: 'b', attributes: { name: 'child_b' }, children: [], styleOverrides: {} },
            ],
          },
        },
        {
          name: 'b',
          api: { props: [], bindings: [], elements: [] },
          view: {
            children: [
              { tag: 'a', attributes: { name: 'child_a' }, children: [], styleOverrides: {} },
            ],
          },
        },
      ]),
    });

    const cycleDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
    );
    expect(cycleDiags).toHaveLength(1);
    expect(cycleDiags[0]?.message).toContain('a -> b -> a');
  });

  // --- PR-3R WO7: image-ness derived from the manifest, not a hardcoded tag
  // list. `u8g2gl_bitmap` and `u8g2gl_icon` never had manifests; only
  // `u8g2gl_xbm` does, via a `type="image"` prop named `src`. ---
  describe('image references derived from the manifest', () => {
    it('rejects <u8g2gl_bitmap> as an unknown widget rather than checking it for an image', () => {
      const screen: Screen = {
        name: 'main_screen',
        view: {
          children: [
            {
              tag: 'u8g2gl_bitmap',
              attributes: { name: 'bmp', src: 'nonexistent.xbm' },
              children: [],
              styleOverrides: {},
            },
          ],
        },
      };

      const diagnostics = validateReferences({ ...baseInput, screens: [screen] });

      const widgetDiag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_WIDGET);
      expect(widgetDiag).toBeDefined();
      expect(widgetDiag?.offendingText).toBe('u8g2gl_bitmap');

      // No manifest means no `type="image"` prop to derive image-ness from,
      // so the unknown `src` value produces no separate UNKNOWN_IMAGE noise
      // on top of the UNKNOWN_WIDGET diagnostic that already names the defect.
      expect(diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_IMAGE)).toBe(false);
    });

    it("still checks u8g2gl_xbm's image reference via its manifest's type=\"image\" prop", () => {
      const xbmManifest = {
        name: 'u8g2gl_xbm',
        extends: 'u8g2gl_obj',
        api: {
          props: [{ name: 'src', type: 'image' as const, setter: 'set_src' }],
          bindings: [],
          elements: [],
        },
      };

      const screen: Screen = {
        name: 'main_screen',
        view: {
          children: [
            {
              tag: 'u8g2gl_xbm',
              attributes: { name: 'icon', src: 'icon_missing' },
              children: [],
              styleOverrides: {},
            },
          ],
        },
      };

      const diagnostics = validateReferences({
        ...baseInput,
        screens: [screen],
        manifests: registryOf([...BASE_COMPOSITES, ...BASE_WIDGETS, xbmManifest]),
      });

      const imageDiag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_IMAGE);
      expect(imageDiag).toBeDefined();
      expect(imageDiag?.offendingText).toBe('icon_missing');
    });
  });
});
