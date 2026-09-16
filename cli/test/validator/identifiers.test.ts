/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/identifiers.test.ts
 * Purpose: Verification tests for Pass 7 identifier naming and collision rules (§13.4, §15.1).
 * Description: Asserts identifier syntax compliance ([a-z][a-z0-9_]*), rejection of uppercase,
 *              leading digits, double underscores, reserved prefixes (u8g2gl_, ui_, wd_),
 *              C++ keywords, scope duplicates, and the §13.4 mangled-identifier
 *              collisions this pass now delegates to `mangleIdentifiers` over the
 *              expanded tree (PR-04 WO8a).
 */

import { describe, expect, it } from 'vitest';
import { registryOf } from '../helpers/manifest-registry.js';
import { validateIdentifiers } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';

describe('validateIdentifiers', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.4',
      name: 'id_test',
      version: '1.0.0',
      targets: [{ name: 'primary', setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C' }],
    },
    globals: {
      consts: [{ name: 'header_h', type: 'int', value: '12' }],
      subjects: [{ name: 'temperature', type: 'int' }],
      styles: [{ name: 'main_style' }],
      fonts: [{ name: 'small_font', kind: 'builtin' }],
      images: [{ name: 'logo_img', kind: 'xbm', src: 'logo.xbm' }],
    },
    screens: [],
    manifests: registryOf([]),
    catalogue: [],
  };

  it('valid names pass without diagnostics', () => {
    const validScreen: Screen = {
      name: 'screen_home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'title_label' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'status_text' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [validScreen],
    });

    expect(diagnostics).toHaveLength(0);
  });

  it('rejects names with leading digits with U8G2GL_INVALID_NAME', () => {
    const screen: Screen = {
      name: '1bad_screen',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: '2label' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const invalidNameDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(invalidNameDiags.length).toBeGreaterThanOrEqual(2);
    expect(invalidNameDiags.some((d) => d.offendingText === '1bad_screen')).toBe(true);
    expect(invalidNameDiags.some((d) => d.offendingText === '2label')).toBe(true);
  });

  it('rejects names with uppercase with U8G2GL_INVALID_NAME', () => {
    const screen: Screen = {
      name: 'ScreenHome',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'TitleLabel' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const invalidNameDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(invalidNameDiags.length).toBeGreaterThanOrEqual(2);
    expect(invalidNameDiags.some((d) => d.offendingText === 'ScreenHome')).toBe(true);
    expect(invalidNameDiags.some((d) => d.offendingText === 'TitleLabel')).toBe(true);
  });

  it('rejects reserved prefixes (u8g2gl_, ui_, wd_) on non-widget identifiers', () => {
    const screen: Screen = {
      name: 'home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'u8g2gl_custom' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'ui_label' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'wd_component' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const invalidDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(invalidDiags).toHaveLength(3);
  });

  it('rejects C++ keywords as identifiers', () => {
    const screen: Screen = {
      name: 'home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'class' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'int' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'return' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const invalidDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(invalidDiags).toHaveLength(3);
    const offending = invalidDiags.map((d) => d.offendingText);
    expect(offending).toContain('class');
    expect(offending).toContain('int');
    expect(offending).toContain('return');
  });

  it('rejects duplicate names within the same screen with U8G2GL_DUPLICATE_NAME', () => {
    const screen: Screen = {
      name: 'home',
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'same_name' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'same_name' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const dupDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME,
    );
    expect(dupDiag).toBeDefined();
    expect(dupDiag?.severity).toBe('error');
    expect(dupDiag?.offendingText).toBe('same_name');
    expect(dupDiag?.message).toContain("Duplicate element name 'same_name'");
  });

  // PR-04 WO8a: this pass used to run its own one-level inlining check, which
  // compared a screen-level name against the children of a directly
  // instantiated composite and named only one of the two sources. It is retired
  // in favour of `mangleIdentifiers` over the expanded tree (WO7 F1), which
  // §13.4 requires to name both.
  it('reports a mangled collision naming both sources (§13.4)', () => {
    // Instance "bar" of component "status_bar" with child "title"
    // Screen also contains element "bar_title"
    const statusBarComponent = {
      name: 'status_bar',
      api: { props: [], bindings: [], elements: [] },
      view: {
        children: [
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'title' },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const screenWithCollision: Screen = {
      name: 'main_screen',
      view: {
        children: [
          {
            tag: 'status_bar',
            attributes: { name: 'bar' },
            children: [],
            styleOverrides: {},
          },
          {
            tag: 'u8g2gl_label',
            attributes: { name: 'bar_title' }, // Collides with inlined bar_title
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      manifests: registryOf([statusBarComponent]),
      screens: [screenWithCollision],
    });

    const collisions = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.NAME_COLLISION);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.severity).toBe('error');
    expect(collisions[0]?.offendingText).toBe('bar_title');
    // Both sources, which the retired check could not do: the composite's child
    // and the screen element that mangles to the same C++ identifier.
    expect(collisions[0]?.message).toContain("C++ identifier 'bar_title' is generated twice");
    expect(collisions[0]?.message).toContain("<u8g2gl_label> 'title'");
    expect(collisions[0]?.message).toContain("<u8g2gl_label> 'bar_title'");
    expect(collisions[0]?.message).toContain('never renames');
    expect(collisions[0]?.message).not.toContain('Composite-inlining');
  });

  it('reports a collision through a nested composite, which the retired check never saw', () => {
    // inner's child "digits" inside instance "clk" of outer, instantiated as
    // "bar", mangles to bar_clk_digits — two composites deep, so the old
    // one-level check could not reach it.
    const inner = {
      name: 'clock_face',
      api: { props: [], bindings: [], elements: [] },
      view: {
        children: [
          { tag: 'u8g2gl_label', attributes: { name: 'digits' }, children: [], styleOverrides: {} },
        ],
      },
    };
    const outer = {
      name: 'clock_bar',
      api: { props: [], bindings: [], elements: [] },
      view: {
        children: [{ tag: 'clock_face', attributes: { name: 'clk' }, children: [], styleOverrides: {} }],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      manifests: registryOf([inner, outer]),
      screens: [
        {
          name: 'main_screen',
          view: {
            children: [
              { tag: 'clock_bar', attributes: { name: 'bar' }, children: [], styleOverrides: {} },
              { tag: 'u8g2gl_label', attributes: { name: 'bar_clk_digits' }, children: [], styleOverrides: {} },
            ],
          },
        },
      ],
    });

    const collisions = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.NAME_COLLISION);
    expect(collisions.map((d) => d.offendingText)).toEqual(['bar_clk_digits']);
    expect(collisions[0]?.message).toContain("<u8g2gl_label> 'digits'");
  });

  // --- PR-04 WO3 F7: duplicate manifests are diagnosed for every element ---
  describe('duplicate manifest declarations', () => {
    const plain = (file: string) => ({
      name: 'wd_meter',
      extends: 'u8g2gl_obj',
      api: { props: [], bindings: [], elements: [] },
      loc: { file, line: 2, column: 1 },
    });
    const composite = (file: string) => ({
      name: 'status_bar',
      api: { props: [], bindings: [], elements: [] },
      view: { children: [] },
      loc: { file, line: 2, column: 1 },
    });

    it('reports two plain widget manifests declaring one tag, naming both files', () => {
      const diagnostics = validateIdentifiers({
        ...baseInput,
        manifests: registryOf([plain('widgets/a/wd_meter.xml'), plain('widgets/b/wd_meter.xml')]),
      });
      const dup = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME);
      expect(dup).toHaveLength(1);
      expect(dup[0]?.message).toBe(
        "Duplicate manifest for element <wd_meter>: declared by 'widgets/a/wd_meter.xml' and 'widgets/b/wd_meter.xml'.",
      );
      expect(dup[0]?.file).toBe('widgets/b/wd_meter.xml');
    });

    it('still reports two composites declaring one tag, on the same path', () => {
      const diagnostics = validateIdentifiers({
        ...baseInput,
        manifests: registryOf([composite('widgets/a/bar.xml'), composite('widgets/b/bar.xml')]),
      });
      const dup = diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME);
      expect(dup).toHaveLength(1);
      expect(dup[0]?.message).toContain("'widgets/a/bar.xml' and 'widgets/b/bar.xml'");
    });

    it('reports nothing for distinct tags', () => {
      const diagnostics = validateIdentifiers({
        ...baseInput,
        manifests: registryOf([plain('widgets/a/wd_meter.xml'), composite('widgets/b/bar.xml')]),
      });
      expect(diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME)).toEqual([]);
    });
  });
});
