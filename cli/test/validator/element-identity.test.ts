/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/element-identity.test.ts
 * Purpose: Verification tests for [U-1] element identity: required names and fallback (§13.3, §13.4).
 * Description: Asserts that omitting an element name produces a non-fatal warning diagnostic
 *              and auto-generates a valid identifier ({tag}_{index}), explicit names pass
 *              without diagnostics, duplicate names emit errors, reserved prefixes emit
 *              errors, and auto-generated names conform to §13.4 identifier rules.
 */

import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseComponentFile } from '../../src/core/parser/index.js';
import { validateIdentifiers } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

describe('[U-1] Element Identity', () => {
  const baseInput: ValidateInput = {
    project: {
      schema: '0.3',
      name: 'identity_test',
      version: '1.0.0',
      targets: [{ name: 'primary', setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C' }],
    },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    components: [],
    widgetManifests: [],
    catalogue: CATALOGUE,
  };

  it('TEST: Missing name generates warning and auto-name', () => {
    const xml = `<screen name="home">
    <view>
        <u8g2gl_box x="0" y="0" width="10" height="10" />
    </view>
</screen>`;

    const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
    expect(parseResult.value).toBeDefined();

    const warnings = parseResult.diagnostics.filter((d) => d.severity === 'warning');
    const missingNameDiag = warnings.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME);

    expect(missingNameDiag).toBeDefined();
    expect(missingNameDiag?.severity).toBe('warning');
    expect(missingNameDiag?.offendingText).toBe('u8g2gl_box');
    expect(missingNameDiag?.message).toContain("Element <u8g2gl_box> is missing a required 'name' attribute.");
    expect(missingNameDiag?.message).toContain("Auto-generated name 'box_0'");
    expect(missingNameDiag?.suggestions).toEqual(['name="box_0"']);

    const boxNode = parseResult.value!.view.children[0]!;
    expect(boxNode.attributes.name).toBe('box_0');
  });

  it('TEST: Present name passes without warning', () => {
    const xml = `<screen name="home">
    <view>
        <u8g2gl_box name="my_box" x="0" y="0" width="10" height="10" />
    </view>
</screen>`;

    const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
    expect(parseResult.value).toBeDefined();

    const missingNameDiags = parseResult.diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME,
    );
    expect(missingNameDiags).toHaveLength(0);

    const boxNode = parseResult.value!.view.children[0]!;
    expect(boxNode.attributes.name).toBe('my_box');
  });

  it('TEST: Duplicate names within same screen produces error', () => {
    const xml = `<screen name="home">
    <view>
        <u8g2gl_box name="my_box" x="0" y="0" width="10" height="10" />
        <u8g2gl_label name="my_box" x="0" y="15" width="50" height="10" />
    </view>
</screen>`;

    const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
    expect(parseResult.value).toBeDefined();

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [parseResult.value!],
    });

    const dupDiag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME);
    expect(dupDiag).toBeDefined();
    expect(dupDiag?.severity).toBe('error');
    expect(dupDiag?.offendingText).toBe('my_box');
    expect(dupDiag?.message).toContain("Duplicate element name 'my_box' in screen 'home'");
  });

  it('TEST: Reserved prefix in name produces error', () => {
    const xml = `<screen name="home">
    <view>
        <u8g2gl_box name="u8g2gl_box_item" x="0" y="0" width="10" height="10" />
        <u8g2gl_box name="ui_header" x="10" y="0" width="10" height="10" />
        <u8g2gl_box name="wd_widget_instance" x="20" y="0" width="10" height="10" />
    </view>
</screen>`;

    const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
    expect(parseResult.value).toBeDefined();

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [parseResult.value!],
    });

    const invalidNameDiags = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME,
    );
    expect(invalidNameDiags).toHaveLength(3);
    expect(invalidNameDiags.some((d) => d.offendingText === 'u8g2gl_box_item')).toBe(true);
    expect(invalidNameDiags.some((d) => d.offendingText === 'ui_header')).toBe(true);
    expect(invalidNameDiags.some((d) => d.offendingText === 'wd_widget_instance')).toBe(true);
  });

  it('TEST: Auto-generated names are valid identifiers per §13.4', () => {
    const xml = `<screen name="home">
    <view>
        <u8g2gl_box x="0" y="0" width="10" height="10" />
        <u8g2gl_label x="0" y="10" width="50" height="10" />
        <wd_custom_slider x="0" y="20" width="50" height="10" />
    </view>
</screen>`;

    const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
    expect(parseResult.value).toBeDefined();

    const screen = parseResult.value!;
    const names = screen.view.children.map((child) => child.attributes.name);

    expect(names).toEqual(['box_0', 'label_1', 'custom_slider_2']);

    // Validate §13.4 identifier rules for every auto-generated name
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(name.includes('__')).toBe(false);
      expect(name.startsWith('u8g2gl_')).toBe(false);
      expect(name.startsWith('ui_')).toBe(false);
      expect(name.startsWith('wd_')).toBe(false);
    }

    // Pass through validator — auto-generated names should not trigger invalid name errors
    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screen],
    });

    const identifierErrors = diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME || d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME,
    );
    expect(identifierErrors).toHaveLength(0);
  });

  it('reports U8G2GL_MISSING_NAME error when AST node lacks a name in validator', () => {
    const screenWithoutName: Screen = {
      name: 'home',
      view: {
        children: [
          {
            tag: 'u8g2gl_box',
            // @ts-expect-error Testing runtime validator behavior when AST is constructed without required name
            attributes: {
              x: '0',
            },
            children: [],
            styleOverrides: {},
          },
        ],
      },
    };

    const diagnostics = validateIdentifiers({
      ...baseInput,
      screens: [screenWithoutName],
    });

    const missingNameDiag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME,
    );
    expect(missingNameDiag).toBeDefined();
    expect(missingNameDiag?.severity).toBe('error');
    expect(missingNameDiag?.message).toContain("Element <u8g2gl_box> in screen 'home' is missing a required 'name' attribute.");
  });

  it('component view elements also auto-generate names and emit warnings when missing', () => {
    const xml = `<component name="badge">
    <api></api>
    <view>
        <u8g2gl_label text="badge" />
    </view>
</component>`;

    const parseResult = parseComponentFile(xml, 'components/badge/badge.xml');
    expect(parseResult.value).toBeDefined();

    const missingNameDiag = parseResult.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME,
    );
    expect(missingNameDiag).toBeDefined();
    expect(missingNameDiag?.severity).toBe('warning');
    expect(parseResult.value!.view.children[0]!.attributes.name).toBe('label_0');
  });
});
