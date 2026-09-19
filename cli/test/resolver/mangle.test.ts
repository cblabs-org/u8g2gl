/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/resolver/mangle.test.ts
 * Purpose: Pins §13.4 identifier mangling (PR-04 WO7): every row of the table,
 *          prefixing, reserved spellings created by joining two valid names, and
 *          the collision rule — a hard error naming both sources, never a rename.
 * Description: Expands parsed screens and composites, then mangles.
 */

import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import {
  childIdentifier,
  expandScreens,
  fontIdentifier,
  imageIdentifier,
  mangleIdentifiers,
  screenFunctionIdentifier,
  styleIdentifier,
  subjectIdentifier,
  subjectSetterIdentifier,
} from '../../src/core/resolver/index.js';
import { objectIdentifier } from '../../src/core/resolver/mangle.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const EMPTY_GLOBALS: Globals = { consts: [], subjects: [], styles: [], fonts: [], images: [] };

function screen(body: string, name = 'home', styles = ''): Screen {
  return parseScreenFile(
    `<screen name="${name}">\n${styles}    <view>\n${body}\n    </view>\n</screen>\n`,
    `screens/screen_${name}.xml`,
  ).value!;
}

function composite(xml: string, file: string): WidgetManifest {
  return parseWidgetManifestFile(xml, file).value!;
}

function mangle(screens: readonly Screen[], composites: readonly WidgetManifest[] = [], globals: Globals = EMPTY_GLOBALS) {
  const expansion = expandScreens({ globals, screens, manifests: frameworkRegistry(composites) });
  return mangleIdentifiers({ globals, screens: expansion.screens });
}

const WD_X = composite(
  '<widget name="wd_x">\n    <api />\n    <view>\n        <u8g2gl_box name="b" x="0" y="0" width="4" height="4" />\n    </view>\n</widget>\n',
  'widgets/wd_x/wd_x.xml',
);

describe('§13.4 identifier helpers', () => {
  it('spell each row of the table', () => {
    expect(screenFunctionIdentifier('home', 'init')).toBe('ui_screen_home_init');
    expect(subjectIdentifier('temperature')).toBe('ui_subject_temperature');
    expect(subjectSetterIdentifier('temperature')).toBe('ui_set_temperature');
    expect(fontIdentifier('small_9')).toBe('ui_font_small_9');
    expect(imageIdentifier('icon_wifi')).toBe('ui_image_icon_wifi');
    expect(styleIdentifier('header')).toBe('ui_style_header');
    expect(childIdentifier('statusbar', 'title')).toBe('statusbar_title');
    expect(childIdentifier(childIdentifier('bar', 'clk'), 'digits')).toBe('bar_clk_digits');
    // Every emitted object is ui_obj_<name> (§13.4, 2026-09-19): a bare
    // `clock` collided with <time.h>'s clock().
    expect(objectIdentifier('clock')).toBe('ui_obj_clock');
    expect(objectIdentifier(childIdentifier(childIdentifier('bar', 'clk'), 'digits'))).toBe('ui_obj_bar_clk_digits');
  });
});

describe('mangleIdentifiers (PR-04 WO7)', () => {
  it('builds the full table in declaration order: screen functions, tables and descriptor, the editor registry, subjects and setters, fonts, images, styles', () => {
    const globals: Globals = {
      consts: [],
      subjects: [{ name: 'temperature', type: 'int' }],
      styles: [{ name: 'header' }],
      fonts: [{ kind: 'builtin', name: 'small_9' }],
      images: [{ kind: 'xbm', name: 'icon_wifi', src: 'wifi.xbm' }],
    };
    const table = mangle([screen('        <u8g2gl_box name="title" x="0" y="0" width="4" height="4" />')], [], globals);

    expect(table.diagnostics).toEqual([]);
    expect(table.global.map((m) => [m.identifier, m.source.kind])).toEqual([
      ['ui_screen_home_init', 'screen_function'],
      ['ui_screen_home_activate', 'screen_function'],
      ['ui_screen_home_deactivate', 'screen_function'],
      ['ui_screen_home_tick', 'screen_function'],
      ['ui_screen_home_render', 'screen_function'],
      ['ui_screen_home_objs', 'screen_table'],
      ['ui_screen_home_parents', 'screen_table'],
      // PR-04 WO11b: the descriptor and the editor registry make the table total.
      ['ui_screen_home', 'screen_descriptor'],
      // ...and every fixed name in the ui_ namespace (WO11b follow-up).
      ['ui_init', 'fixed'],
      ['ui_subjects_init', 'fixed'],
      ['ui_styles_init', 'fixed'],
      ['ui_editor_registry', 'fixed'],
      ['ui_handler', 'fixed'],
      ['ui_subject_temperature', 'subject'],
      ['ui_set_temperature', 'subject_setter'],
      ['ui_font_small_9', 'font'],
      ['ui_image_icon_wifi', 'image'],
      ['ui_style_header', 'style'],
    ]);
    expect(table.screens).toEqual([
      { screen: 'home', identifiers: [expect.objectContaining({ identifier: 'ui_obj_title', source: expect.objectContaining({ kind: 'object' }) })] },
    ]);
  });

  it('lists objects depth-first in document order, composite children prefixed', () => {
    const table = mangle([
      screen(
        [
          '        <wd_x name="first" x="0" y="0" width="8" height="8" />',
          '        <u8g2gl_box name="middle" x="0" y="10" width="4" height="4" />',
          '        <wd_x name="second" x="0" y="20" width="8" height="8" />',
        ].join('\n'),
      ),
    ], [WD_X]);

    expect(table.diagnostics).toEqual([]);
    expect(table.screens[0]?.identifiers.map((m) => m.identifier)).toEqual([
      'ui_obj_first',
      'ui_obj_first_b',
      'ui_obj_middle',
      'ui_obj_second',
      'ui_obj_second_b',
    ]);
  });

  it('two instances of one composite produce distinct, non-colliding identifiers', () => {
    const table = mangle([
      screen(
        ['        <wd_x name="a" x="0" y="0" width="8" height="8" />', '        <wd_x name="c" x="0" y="20" width="8" height="8" />'].join('\n'),
      ),
    ], [WD_X]);

    expect(table.diagnostics).toEqual([]);
    expect(table.screens[0]?.identifiers.map((m) => m.identifier)).toEqual(['ui_obj_a', 'ui_obj_a_b', 'ui_obj_c', 'ui_obj_c_b']);
  });

  it('`a_b` at screen level colliding with child `b` of instance `a` is a hard error naming both', () => {
    const table = mangle([
      screen(
        [
          '        <u8g2gl_box name="a_b" x="0" y="0" width="4" height="4" />',
          '        <wd_x name="a" x="0" y="10" width="8" height="8" />',
        ].join('\n'),
      ),
    ], [WD_X]);

    expect(table.diagnostics).toHaveLength(1);
    const [collision] = table.diagnostics;
    // Located at the later source in document order: child `b`, in its composite's file.
    expect(collision).toMatchObject({
      code: DIAGNOSTIC_CODES.NAME_COLLISION,
      severity: 'error',
      file: 'widgets/wd_x/wd_x.xml',
      line: 4,
      // The caret underlines the name the author wrote, not the ui_obj_ prefix.
      offendingText: 'a_b',
    });
    expect(collision?.message).toContain("C++ identifier 'ui_obj_a_b' is generated twice");
    expect(collision?.message).toContain("<u8g2gl_box> 'a_b' at screens/screen_home.xml:3:");
    expect(collision?.message).toContain("<u8g2gl_box> 'b' at widgets/wd_x/wd_x.xml:4:");
    expect(collision?.message).toContain("in instance 'a' of <wd_x> at screens/screen_home.xml:4:9");
    expect(collision?.message).toContain('never renames');
    // Both identifiers stay in the table as written — nothing is renamed.
    expect(table.screens[0]?.identifiers.map((m) => m.identifier)).toEqual(['ui_obj_a_b', 'ui_obj_a', 'ui_obj_a_b']);
  });

  it('collides nested prefixes the same way: bar_clk_digits against a screen-level bar_clk_digits', () => {
    const clk = composite(
      '<widget name="wd_clk"><api /><view><u8g2gl_box name="digits" x="0" y="0" width="4" height="4" /></view></widget>',
      'widgets/wd_clk/wd_clk.xml',
    );
    const bar = composite(
      '<widget name="wd_bar"><api /><view><wd_clk name="clk" x="0" y="0" width="8" height="8" /></view></widget>',
      'widgets/wd_bar/wd_bar.xml',
    );
    const table = mangle([
      screen(
        ['        <wd_bar name="bar" x="0" y="0" width="20" height="8" />', '        <u8g2gl_box name="bar_clk_digits" x="0" y="10" width="4" height="4" />'].join('\n'),
      ),
    ], [clk, bar]);

    expect(table.diagnostics.map((d) => [d.code, d.offendingText, d.file])).toEqual([
      [DIAGNOSTIC_CODES.NAME_COLLISION, 'bar_clk_digits', 'screens/screen_home.xml'],
    ]);
    expect(table.diagnostics[0]?.message).toContain("in instance 'bar_clk' of <wd_clk>");
    expect(table.diagnostics[0]?.message).toContain("inside instance 'bar' of <wd_bar>");
  });

  it('scopes objects to their screen: one name on two screens is not a collision', () => {
    const table = mangle([
      screen('        <u8g2gl_box name="title" x="0" y="0" width="4" height="4" />', 'home'),
      screen('        <u8g2gl_box name="title" x="0" y="0" width="4" height="4" />', 'settings'),
    ]);
    expect(table.diagnostics).toEqual([]);
  });

  it('leaves a name declared twice to Pass 7 (DUPLICATE_NAME), not a collision', () => {
    const table = mangle([
      screen(
        ['        <u8g2gl_box name="title" x="0" y="0" width="4" height="4" />', '        <u8g2gl_box name="title" x="0" y="8" width="4" height="4" />'].join('\n'),
      ),
    ]);
    expect(table.diagnostics).toEqual([]);
  });

  it('treats a screen style of a global style\'s name as its override, not a collision', () => {
    const globals: Globals = { ...EMPTY_GLOBALS, styles: [{ name: 'header' }] };
    const table = mangle([screen('        <u8g2gl_box name="title" x="0" y="0" width="4" height="4" />', 'home', '    <styles><style name="header" /></styles>\n')], [], globals);
    expect(table.diagnostics).toEqual([]);
    expect(table.screens[0]?.identifiers.map((m) => m.identifier)).toEqual(['ui_style_header', 'ui_obj_title']);
  });

  describe('reserved spellings made by prefixing', () => {
    const child = (name: string) =>
      composite(
        `<widget name="wd_k">\n    <api />\n    <view>\n        <u8g2gl_box name="${name}" x="0" y="0" width="4" height="4" />\n    </view>\n</widget>\n`,
        'widgets/wd_k/wd_k.xml',
      );

    it('reports a joined identifier that is a C++ keyword at the child, naming the instance', () => {
      const table = mangle([screen('        <wd_k name="co" x="0" y="0" width="8" height="8" />')], [child('await')]);
      expect(table.diagnostics.map((d) => [d.code, d.offendingText, d.file, d.line])).toEqual([
        [DIAGNOSTIC_CODES.INVALID_NAME, 'co_await', 'widgets/wd_k/wd_k.xml', 4],
      ]);
      expect(table.diagnostics[0]?.message).toContain('is a C++ keyword');
      expect(table.diagnostics[0]?.message).toContain("in instance 'co' of <wd_k>");
    });

    it("reports a joined identifier beginning with a reserved prefix: instance 'ui' + child 'set_x'", () => {
      // 'ui' alone is a valid element name; joined, it is ui_set_x — a subject setter's spelling.
      const table = mangle([screen('        <wd_k name="ui" x="0" y="0" width="8" height="8" />')], [child('set_x')]);
      expect(table.diagnostics.map((d) => [d.code, d.offendingText])).toEqual([[DIAGNOSTIC_CODES.INVALID_NAME, 'ui_set_x']]);
      expect(table.diagnostics[0]?.message).toContain("reserved prefix 'ui_'");
    });
  });

  it('is deterministic: the same input gives the same table', () => {
    const build = () =>
      mangle([screen(['        <wd_x name="a" x="0" y="0" width="8" height="8" />', '        <u8g2gl_box name="a_b" x="0" y="10" width="4" height="4" />'].join('\n'))], [WD_X]);
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
