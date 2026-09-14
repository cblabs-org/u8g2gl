/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/expanded-tree.test.ts
 * Purpose: Pins the validator changes PR-04 WO7 makes on top of composite
 *          expansion: binding types checked inside composite interiors (WO3
 *          carry); flag values checked (WO5a carry); a composite's top level
 *          bounds-checked against each instance's size; declared collection
 *          children known to Pass 2 (WO5b carry); and the parser keeping
 *          `extends` on a manifest with a `<view>` (WO5b carry).
 * Description: Parses real XML so locations are real; runs single passes against
 *              the bundled framework manifests.
 */

import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import {
  validate,
  validateGeometry,
  validateReferences,
  validateTypes,
  type ValidateInput,
} from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const NARROW = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';

/** A screen whose view holds `body`; the body's first line is line 3, column 9. */
function screen(body: string): Screen {
  return parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, 'screens/screen_home.xml').value!;
}

function composite(lines: readonly string[], file: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(lines.join('\n'), file);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

function inputWith(body: string, composites: readonly WidgetManifest[] = []): ValidateInput {
  return {
    project: { schema: '0.4', name: 'expanded', version: '1.0.0', targets: [{ name: 'primary', setup: NARROW }] },
    globals: {
      consts: [],
      subjects: [
        { name: 'station_name', type: 'string', maxLen: 16 },
        { name: 'wifi_connected', type: 'bool' },
      ],
      styles: [],
      fonts: [{ kind: 'builtin', name: 'u8g2_font_6x10_mr' }],
      images: [],
    },
    screens: [screen(body)],
    manifests: frameworkRegistry(composites),
    catalogue: CATALOGUE,
  };
}

const withCode = (diagnostics: readonly Diagnostic[], code: string) => diagnostics.filter((d) => d.code === code);

const READOUT_FILE = 'widgets/wd_readout/wd_readout.xml';
const READOUT = composite(
  [
    '<widget name="wd_readout">',
    '    <api><prop name="source" type="subject" /></api>',
    '    <view>',
    '        <u8g2gl_label name="value" x="0" y="0" width="40" height="10" font="u8g2_font_6x10_mr" bind_text="$source" />',
    '    </view>',
    '</widget>',
  ],
  READOUT_FILE,
);

describe('Pass 5 on the expanded tree (WO3 carry)', () => {
  it('type-checks a binding inside a composite once $source is substituted, at the interior element, naming the instance', () => {
    const diagnostics = validateTypes(inputWith('        <wd_readout name="readout" x="0" y="0" width="40" height="10" source="wifi_connected" />', [READOUT]));

    const mismatches = withCode(diagnostics, DIAGNOSTIC_CODES.TYPE_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ file: READOUT_FILE, line: 4, offendingText: 'wifi_connected' });
    expect(mismatches[0]?.message).toContain("Subject 'wifi_connected' has type 'bool', which is incompatible with 'bind_text'");
    expect(mismatches[0]?.message).toContain("(in instance 'readout' of <wd_readout> at screens/screen_home.xml:3:9)");
  });

  it('reports only the instance that passes the wrong type', () => {
    const diagnostics = validateTypes(
      inputWith(
        [
          '        <wd_readout name="good" x="0" y="0" width="40" height="10" source="station_name" />',
          '        <wd_readout name="bad" x="0" y="20" width="40" height="10" source="wifi_connected" />',
        ].join('\n'),
        [READOUT],
      ),
    );
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.TYPE_MISMATCH).map((d) => d.message.includes("instance 'bad'"))).toEqual([true]);
  });

  it("reports an argument that is not a declared subject at the instantiation site", () => {
    const diagnostics = validateTypes(inputWith('        <wd_readout name="readout" x="0" y="0" width="40" height="10" source="station_nam" />', [READOUT]));
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.UNKNOWN_SUBJECT).map((d) => [d.file, d.line, d.suggestions])).toEqual([
      ['screens/screen_home.xml', 3, ['station_name']],
    ]);
  });

  it('leaves a missing required prop to Pass 4, which already reports it on every instance', () => {
    const required = composite(
      ['<widget name="wd_req">', '    <api><prop name="source" type="subject" required="true" /></api>', '    <view />', '</widget>'],
      'widgets/wd_req/wd_req.xml',
    );
    expect(validateTypes(inputWith('        <wd_req name="r" x="0" y="0" width="4" height="4" />', [required]))).toEqual([]);
  });
});

describe('flag values (WO5a carry)', () => {
  const flagged = (flag: string) =>
    validateTypes(
      inputWith(
        [
          '        <u8g2gl_box name="sep" x="0" y="11" width="128" height="1">',
          `            <bind_flag_if_eq subject="wifi_connected" ref_value="0"${flag} />`,
          '        </u8g2gl_box>',
        ].join('\n'),
      ),
    );

  it('rejects an unknown flag with a near-miss suggestion', () => {
    expect(flagged(' flag="hiden"')).toEqual([
      expect.objectContaining({
        code: DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
        file: 'screens/screen_home.xml',
        line: 4,
        offendingText: 'hiden',
        suggestions: ['hidden'],
      }),
    ]);
  });

  it('rejects a directive with no flag', () => {
    expect(flagged('')).toEqual([
      expect.objectContaining({ code: DIAGNOSTIC_CODES.MISSING_REQUIRED, line: 4, offendingText: 'flag' }),
    ]);
  });

  it('accepts hidden and disabled', () => {
    expect(flagged(' flag="hidden"')).toEqual([]);
    expect(flagged(' flag="disabled"')).toEqual([]);
  });

  it('checks a flag inside a composite once expanded, naming the instance', () => {
    const icon = composite(
      [
        '<widget name="wd_icon">',
        '    <api />',
        '    <view>',
        '        <u8g2gl_box name="dot" x="0" y="0" width="2" height="2">',
        '            <bind_flag_if_eq subject="wifi_connected" ref_value="0" flag="hidn" />',
        '        </u8g2gl_box>',
        '    </view>',
        '</widget>',
      ],
      'widgets/wd_icon/wd_icon.xml',
    );
    const diagnostics = validateTypes(inputWith('        <wd_icon name="icon" x="0" y="0" width="4" height="4" />', [icon]));
    expect(diagnostics.map((d) => [d.code, d.file, d.line, d.suggestions])).toEqual([
      [DIAGNOSTIC_CODES.INVALID_ENUM_VALUE, 'widgets/wd_icon/wd_icon.xml', 5, ['hidden']],
    ]);
    expect(diagnostics[0]?.message).toContain("in instance 'icon' of <wd_icon>");
  });
});

describe('Pass 6: a composite top level is bounds-checked per instance', () => {
  const PANEL_FILE = 'widgets/wd_panel/wd_panel.xml';
  const panel = composite(
    [
      '<widget name="wd_panel">',
      '    <api />',
      '    <view>',
      '        <u8g2gl_box name="fill" x="0" y="0" width="50" height="#parent_height" />',
      '    </view>',
      '</widget>',
    ],
    PANEL_FILE,
  );

  it('catches a child overflowing the instance it is placed in, which the template alone cannot know', () => {
    const diagnostics = validateGeometry(inputWith('        <wd_panel name="narrow" x="0" y="0" width="40" height="10" />', [panel]));
    const oob = withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS);
    expect(oob).toHaveLength(1);
    expect(oob[0]).toMatchObject({ file: PANEL_FILE, line: 4 });
    expect(oob[0]?.message).toContain("extends to x=50, containing element '<wd_panel>' is 40px wide");
    expect(oob[0]?.message).toContain("(in instance 'narrow' of <wd_panel> at screens/screen_home.xml:3:9)");
  });

  it('accepts the same template in an instance large enough for it', () => {
    const diagnostics = validateGeometry(inputWith('        <wd_panel name="wide" x="0" y="0" width="60" height="10" />', [panel]));
    expect(diagnostics).toEqual([]);
  });

  it('reports each instance it overflows, and none it fits', () => {
    const diagnostics = validateGeometry(
      inputWith(
        [
          '        <wd_panel name="a" x="0" y="0" width="40" height="10" />',
          '        <wd_panel name="b" x="0" y="20" width="60" height="10" />',
          '        <wd_panel name="c" x="0" y="40" width="30" height="10" />',
        ].join('\n'),
        [panel],
      ),
    );
    expect(withCode(diagnostics, DIAGNOSTIC_CODES.OUT_OF_BOUNDS).map((d) => /instance '(\w)'/.exec(d.message)?.[1])).toEqual(['a', 'c']);
  });

  it("reports a defect in the template's own text once, however many instances use it", () => {
    const broken = composite(
      ['<widget name="wd_broken">', '    <api />', '    <view>', '        <u8g2gl_box name="b" x="0" y="0" width="10 +" height="4" />', '    </view>', '</widget>'],
      'widgets/wd_broken/wd_broken.xml',
    );
    const diagnostics = validateGeometry(
      inputWith(
        ['        <wd_broken name="one" x="0" y="0" width="40" height="10" />', '        <wd_broken name="two" x="0" y="20" width="40" height="10" />'].join('\n'),
        [broken],
      ),
    );
    expect(diagnostics.map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.MALFORMED_EXPRESSION]);
    expect(diagnostics[0]?.message).not.toContain('instance');
  });
});

describe('Pass 2: declared collection children are known (WO5b carry)', () => {
  const list = composite(
    ['<widget name="wd_list" extends="u8g2gl_obj">', '    <api>', '        <element name="column" access="add"><arg name="width" type="int" /></element>', '    </api>', '</widget>'],
    'widgets/wd_list/wd_list.xml',
  );
  const unknownComponents = (body: string) =>
    withCode(validateReferences(inputWith(body, [list])), DIAGNOSTIC_CODES.UNKNOWN_COMPONENT).map((d) => d.offendingText);

  it('does not report a child the parent declares as an <element>', () => {
    expect(unknownComponents('        <wd_list name="l" x="0" y="0" width="128" height="40">\n            <column name="c" width="64" />\n        </wd_list>')).toEqual([]);
  });

  it('still reports an undeclared child tag, and a collection element outside its parent', () => {
    expect(unknownComponents('        <wd_list name="l" x="0" y="0" width="128" height="40">\n            <colum name="c" width="64" />\n        </wd_list>')).toEqual(['colum']);
    expect(unknownComponents('        <column name="c" width="64" />')).toEqual(['column']);
  });

  it('so `validate` only warns on a collection, as PR-04 decision 1 requires', () => {
    const result = validate(inputWith('        <wd_list name="l" x="0" y="0" width="128" height="40">\n            <column name="c" width="64" />\n        </wd_list>', [list]));
    expect(result.errors).toBe(0);
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([[DIAGNOSTIC_CODES.NOT_YET_SUPPORTED, 'warning']]);
  });
});

describe('parser keeps `extends` on a manifest with a <view> (WO5b carry)', () => {
  it('keeps it as written, and still sets none when none is written', () => {
    const classed = parseWidgetManifestFile('<widget name="wd_card" extends="u8g2gl_obj"><api /><view /></widget>', 'widgets/wd_card/wd_card.xml');
    const plain = parseWidgetManifestFile('<widget name="wd_card"><api /><view /></widget>', 'widgets/wd_card/wd_card.xml');
    expect(classed.value?.extends).toBe('u8g2gl_obj');
    expect(classed.value?.view).toBeDefined();
    expect(plain.value?.extends).toBeUndefined();
    // The registry still gives a composite that declares none u8g2gl_obj.
    expect(frameworkRegistry([plain.value!]).get('wd_card')?.chain).toEqual(['wd_card', 'u8g2gl_obj']);
  });
});
