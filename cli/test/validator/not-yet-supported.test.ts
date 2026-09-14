/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/not-yet-supported.test.ts
 * Purpose: Pins Pass 8 — every construct `generate` does not build yet is named,
 *          with the PR that delivers it, at one location, and at the severity the
 *          caller's policy chooses (PR-04 decisions 1 and 3, WO5b).
 * Description: One document carrying every deferred construct is checked under
 *              both policies; the two runs must agree on everything but severity.
 */

import { describe, expect, it } from 'vitest';
import {
  parseGlobalsFile,
  parseProjectFile,
  parseScreenFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import {
  validate,
  validateNotYetSupported,
  type ValidateInput,
} from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const PROJECT_XML = `<u8g2gl schema="0.4" name="deferred" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`;

const GLOBALS_XML = `<globals>
    <fonts>
        <bdf name="tall_12" src="fonts/tall_12.bdf" />
        <builtin name="u8g2_font_6x10_mr" />
    </fonts>
    <images>
        <convert name="logo" src="images/logo.png" width="16" height="16" />
        <xbm name="icon" src="images/icon.xbm" />
    </images>
</globals>
`;

// Line numbers matter: the location assertions below name them.
const SCREEN_XML = [
  '<screen name="home">',
  '    <view>',
  '        <u8g2gl_label name="title" x="0" y="0" width="128" height="12" font="u8g2_font_6x10_mr" text="Hi">',
  '            <event_cb trigger="press" callback="on_title" />',
  '            <screen_load_event trigger="long_press" screen="settings" />',
  '            <screen_back_event trigger="press" />',
  '        </u8g2gl_label>',
  '        <wd_list name="list" x="0" y="20" width="128" height="40">',
  '            <column name="col_a" width="64" />',
  '        </wd_list>',
  '        <focus_ring wrap="true">',
  '            <entry name="title" />',
  '        </focus_ring>',
  '    </view>',
  '</screen>',
  '',
].join('\n');

const LIST_MANIFEST_XML = `<widget name="wd_list" extends="u8g2gl_obj">
    <api>
        <element name="column" access="add">
            <arg name="width" type="int" />
        </element>
    </api>
</widget>
`;

const CARD_COMPOSITE_XML = `<widget name="wd_card">
    <api>
        <prop name="caption" type="string" default="" />
    </api>
    <view>
        <u8g2gl_label name="card_label" x="0" y="0" width="64" height="12" font="u8g2_font_6x10_mr" text="$caption">
            <event_cb trigger="press" callback="on_card" />
        </u8g2gl_label>
    </view>
</widget>
`;

/** The document above as validator input, with the given extra project manifests. */
function inputWith(extra: readonly WidgetManifest[] = []): ValidateInput {
  return {
    project: parseProjectFile(PROJECT_XML, 'u8g2gl.xml').value!,
    globals: parseGlobalsFile(GLOBALS_XML, 'globals.xml').value!,
    screens: [parseScreenFile(SCREEN_XML, 'screens/screen_home.xml').value!],
    manifests: frameworkRegistry([
      parseWidgetManifestFile(LIST_MANIFEST_XML, 'widgets/wd_list/wd_list.xml').value!,
      ...extra,
    ]),
    catalogue: CATALOGUE,
  };
}

/** Diagnostics of Pass 8's code only. */
function deferred(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.NOT_YET_SUPPORTED);
}

describe('validateNotYetSupported (PR-04 WO5b)', () => {
  it('names every deferred construct in a screen and globals, with the PR that delivers it', () => {
    const found = deferred(validateNotYetSupported(inputWith()));
    const byText = new Map(found.map((d) => [d.offendingText, d]));

    expect(found.map((d) => d.offendingText).sort()).toEqual(
      ['bdf', 'column', 'convert', 'event_cb', 'focus_ring', 'screen_back_event', 'screen_load_event'].sort(),
    );
    for (const pr9 of ['focus_ring', 'event_cb', 'screen_load_event', 'screen_back_event']) {
      expect(byText.get(pr9)?.message).toContain('PR-09');
    }
    expect(byText.get('column')?.message).toContain('PR-08');
    expect(byText.get('column')?.message).toContain('<wd_list>');
    // Specific enough for PR-04b to find and replace: the declaration, the tool, the PR.
    expect(byText.get('bdf')?.message).toBe(
      "<bdf> font 'tall_12' is not yet supported: compiling BDF fonts with bdfconv (§14) — it is " +
        "delivered in PR-04b, and 'u8g2gl generate' refuses it until then. Declare a <builtin> U8G2 font meanwhile.",
    );
    expect(byText.get('convert')?.message).toContain("<convert> image 'logo'");
    expect(byText.get('convert')?.message).toContain('PR-04b');
  });

  it('locates each construct where it is declared', () => {
    const found = deferred(validateNotYetSupported(inputWith()));
    const at = (text: string): string => {
      const d = found.find((x) => x.offendingText === text);
      return `${d?.file}:${d?.line}:${d?.column}`;
    };

    expect(at('event_cb')).toBe('screens/screen_home.xml:4:13');
    expect(at('screen_load_event')).toBe('screens/screen_home.xml:5:13');
    expect(at('screen_back_event')).toBe('screens/screen_home.xml:6:13');
    expect(at('column')).toBe('screens/screen_home.xml:9:13');
    expect(at('focus_ring')).toBe('screens/screen_home.xml:11:9');
    expect(at('bdf')).toMatch(/^globals\.xml:3:/);
    expect(at('convert')).toMatch(/^globals\.xml:7:/);
  });

  it('reports nothing for builtin fonts, xbm images, and plain elements', () => {
    const found = deferred(validateNotYetSupported(inputWith())).map((d) => d.message).join('\n');

    expect(found).not.toContain('u8g2_font_6x10_mr');
    expect(found).not.toContain("'icon'");
    expect(found).not.toContain('<u8g2gl_label>');
  });

  it('warns by default and under "warning", errors under "error" — same code, location and message', () => {
    const byDefault = deferred(validate(inputWith()).diagnostics);
    const warned = deferred(validate({ ...inputWith(), notYetSupported: 'warning' }).diagnostics);
    const refused = deferred(validate({ ...inputWith(), notYetSupported: 'error' }).diagnostics);

    expect(byDefault).toHaveLength(7);
    expect(byDefault).toEqual(warned);
    expect(warned.every((d) => d.severity === 'warning')).toBe(true);
    expect(refused.every((d) => d.severity === 'error')).toBe(true);
    expect(refused.map((d) => ({ ...d, severity: 'warning' }))).toEqual(warned);
  });

  it('checks a composite template on the same path as a screen', () => {
    const card = parseWidgetManifestFile(CARD_COMPOSITE_XML, 'widgets/wd_card/wd_card.xml').value!;
    const found = deferred(validateNotYetSupported(inputWith([card])));
    const inCard = found.filter((d) => d.file === 'widgets/wd_card/wd_card.xml');

    expect(inCard.map((d) => d.offendingText)).toEqual(['event_cb']);
    expect(inCard[0]?.line).toBe(7);
  });

  // Checked on the parsed model here; since PR-04 WO7 the parser keeps `extends`
  // on a manifest with a <view>, and test/integration/classed-composite.test.ts
  // proves the same refusal from real XML.
  it('reports a composite that also extends a C++ class (PR-08), from the declared manifest', () => {
    const card = parseWidgetManifestFile(CARD_COMPOSITE_XML, 'widgets/wd_card/wd_card.xml').value!;
    const classed: WidgetManifest = { ...card, extends: 'u8g2gl_obj' };

    const found = deferred(validateNotYetSupported(inputWith([classed])));
    const composite = found.find((d) => d.offendingText === 'wd_card');

    expect(composite?.message).toBe(
      "Composite <wd_card> also extends C++ class 'u8g2gl_obj': a composite with a C++ class of its own — " +
        "it is delivered in PR-08, and 'u8g2gl generate' refuses it until then.",
    );
    expect(composite?.file).toBe('widgets/wd_card/wd_card.xml');
    // A composite with no declared `extends` inherits u8g2gl_obj through the
    // registry, and that is not a class of its own.
    expect(deferred(validateNotYetSupported(inputWith([card]))).some((d) => d.offendingText === 'wd_card')).toBe(false);
  });
});
