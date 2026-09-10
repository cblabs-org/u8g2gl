/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/element-identity.test.ts
 * Purpose: Verification tests for [U-1] element identity: required names and fallback (§13.3, §13.4).
 * Description: Asserts that omitting an element name produces a non-fatal warning diagnostic
 *              and auto-generates a valid identifier ({tag}_{n}), explicit names pass
 *              without diagnostics, duplicate names emit errors, reserved prefixes emit
 *              errors, and auto-generated names conform to §13.4 identifier rules.
 *              The WO8 block asserts the remediated guarantee: synthesis allocates from
 *              a document-wide pool, so it can never itself cause U8G2GL_DUPLICATE_NAME.
 */

import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseComponentFile } from '../../src/core/parser/index.js';
import { validateIdentifiers } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetNode, WidgetNodeChild } from '../../src/core/schema/widget-node.js';
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

    // Counters are per clean tag within the document, not a shared sibling
    // index, so each distinct tag starts again at 0 (WO8 remediation).
    expect(names).toEqual(['box_0', 'label_0', 'custom_slider_0']);

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

  describe('WO8: synthesised names are unique within the document namespace', () => {
    it('two unnamed elements under different parents get distinct names and no errors', () => {
      // The WO8 reproduction. Under a per-parent sibling counter both labels
      // became 'label_0' and the screen failed with U8G2GL_DUPLICATE_NAME.
      const xml = `<screen name="home">
    <view>
        <u8g2gl_box name="left" x="0" y="0" width="10" height="10">
            <u8g2gl_label text="a" />
        </u8g2gl_box>
        <u8g2gl_box name="right" x="20" y="0" width="10" height="10">
            <u8g2gl_label text="b" />
        </u8g2gl_box>
    </view>
</screen>`;

      const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
      expect(parseResult.value).toBeDefined();

      const screen = parseResult.value!;
      const left = screen.view.children[0]!;
      const right = screen.view.children[1]!;
      const leftLabel = left.children[0] as WidgetNode;
      const rightLabel = right.children[0] as WidgetNode;

      expect(leftLabel.attributes.name).toBe('label_0');
      expect(rightLabel.attributes.name).toBe('label_1');
      expect(leftLabel.attributes.name).not.toBe(rightLabel.attributes.name);

      const diagnostics = validateIdentifiers({ ...baseInput, screens: [screen] });
      expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
      expect(
        diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME),
      ).toHaveLength(0);

      // The warn-and-continue path stays reachable: one warning per unnamed
      // element, each suggesting the name actually assigned.
      const missing = parseResult.diagnostics.filter(
        (d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME,
      );
      expect(missing).toHaveLength(2);
      expect(missing.every((d) => d.severity === 'warning')).toBe(true);
      expect(missing.map((d) => d.suggestions?.[0])).toEqual([
        'name="label_0"',
        'name="label_1"',
      ]);
    });

    it('a synthesised name never takes an explicit name declared LATER in the document', () => {
      const xml = `<screen name="home">
    <view>
        <u8g2gl_label text="a" />
        <u8g2gl_label name="label_0" text="b" x="0" y="10" width="50" height="10" />
        <u8g2gl_label name="label_1" text="c" x="0" y="20" width="50" height="10" />
    </view>
</screen>`;

      const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
      expect(parseResult.value).toBeDefined();

      const screen = parseResult.value!;
      const names = screen.view.children.map((child) => child.attributes.name);
      expect(names).toEqual(['label_2', 'label_0', 'label_1']);

      const diagnostics = validateIdentifiers({ ...baseInput, screens: [screen] });
      expect(
        diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME),
      ).toHaveLength(0);
    });

    it('a synthesised name never takes an explicit name nested under another parent', () => {
      const xml = `<screen name="home">
    <view>
        <u8g2gl_label text="a" />
        <u8g2gl_box name="wrapper" x="0" y="10" width="40" height="40">
            <u8g2gl_label name="label_0" text="b" />
        </u8g2gl_box>
    </view>
</screen>`;

      const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
      const screen = parseResult.value!;

      expect(screen.view.children[0]!.attributes.name).toBe('label_1');

      const diagnostics = validateIdentifiers({ ...baseInput, screens: [screen] });
      expect(
        diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME),
      ).toHaveLength(0);
    });

    it('deeply nested unnamed elements of the same tag stay unique', () => {
      const xml = `<screen name="home">
    <view>
        <u8g2gl_box name="outer" x="0" y="0" width="60" height="60">
            <u8g2gl_box x="0" y="0" width="20" height="20">
                <u8g2gl_label text="a" />
            </u8g2gl_box>
            <u8g2gl_box x="20" y="0" width="20" height="20">
                <u8g2gl_label text="b" />
            </u8g2gl_box>
        </u8g2gl_box>
    </view>
</screen>`;

      const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
      const screen = parseResult.value!;

      const collected: string[] = [];
      const walk = (nodes: readonly WidgetNodeChild[]): void => {
        for (const node of nodes) {
          if (!('tag' in node)) continue;
          collected.push(node.attributes.name as string);
          walk(node.children);
        }
      };
      walk(screen.view.children);

      expect(new Set(collected).size).toBe(collected.length);

      const diagnostics = validateIdentifiers({ ...baseInput, screens: [screen] });
      expect(
        diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME),
      ).toHaveLength(0);
    });

    it('component views get their own document-scoped namespace', () => {
      const xml = `<component name="badge">
    <api></api>
    <view>
        <u8g2gl_box name="left" x="0" y="0" width="10" height="10">
            <u8g2gl_label text="a" />
        </u8g2gl_box>
        <u8g2gl_box name="right" x="20" y="0" width="10" height="10">
            <u8g2gl_label text="b" />
        </u8g2gl_box>
    </view>
</component>`;

      const parseResult = parseComponentFile(xml, 'components/badge/badge.xml');
      expect(parseResult.value).toBeDefined();

      const comp = parseResult.value!;
      const left = comp.view.children[0]!;
      const right = comp.view.children[1]!;
      expect((left.children[0] as WidgetNode).attributes.name).toBe('label_0');
      expect((right.children[0] as WidgetNode).attributes.name).toBe('label_1');

      const diagnostics = validateIdentifiers({ ...baseInput, components: [comp] });
      expect(
        diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.DUPLICATE_NAME),
      ).toHaveLength(0);
    });

    it('a <style name="..."> child does not reserve an element name', () => {
      // <style name="x"> references a style; it does not declare an element
      // called 'x', so it must not be pulled into the identity namespace.
      const xml = `<screen name="home">
    <view>
        <u8g2gl_label text="a">
            <style name="label_0" />
        </u8g2gl_label>
    </view>
</screen>`;

      const parseResult = parseScreenFile(xml, 'screens/screen_home.xml');
      const screen = parseResult.value!;
      expect(screen.view.children[0]!.attributes.name).toBe('label_0');
    });
  });
});
