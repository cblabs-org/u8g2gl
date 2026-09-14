/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/resolver/expand.test.ts
 * Purpose: Pins composite expansion (§13.6 steps 1–3, PR-04 WO7): the §13.12
 *          worked example expands to its identifiers and resolved geometry;
 *          arguments bind supplied-then-default; `$prop` and subject indirection
 *          resolve to the concrete subject; a non-subject name fails at the
 *          instantiation site; nested composites prefix recursively; every
 *          expanded element keeps its source location and instantiation chain.
 * Description: Parses real screen and composite XML so locations are real, and
 *              resolves through WO6's resolver against the real catalogue.
 */

import { describe, expect, it } from 'vitest';
import { parseScreenFile, parseWidgetManifestFile } from '../../src/core/parser/index.js';
import {
  createResolverContext,
  displayContainer,
  expandScreens,
  resolveElements,
  type ExpandedElement,
  type ResolvedElement,
} from '../../src/core/resolver/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { Screen } from '../../src/core/schema/screen.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const WIDE = 'U8G2_SH1122_256X64_F_3W_HW_SPI';

const GLOBALS: Globals = {
  consts: [],
  subjects: [
    { name: 'station_name', type: 'string', maxLen: 48 },
    { name: 'wifi_connected', type: 'bool' },
    { name: 'system_time', type: 'time' },
    { name: 'service_message', type: 'string', maxLen: 64 },
  ],
  styles: [],
  fonts: [],
  images: [],
};

// design_spec §6.4's status_bar. Line numbers are asserted below.
const STATUS_BAR_FILE = 'widgets/status_bar/status_bar.xml';
const STATUS_BAR_XML = [
  '<widget name="status_bar">',
  '    <api>',
  '        <prop name="title_subject" type="subject" default="station_name" />',
  '        <prop name="wifi_subject"  type="subject" default="wifi_connected" />',
  '        <prop name="font"          type="font"    default="small_9" />',
  '    </api>',
  '    <view>',
  '        <u8g2gl_label name="location" x="0" y="0" right="52" height="#parent_height" bind_text="$title_subject" font="$font" long_mode="scroll" />',
  '        <u8g2gl_xbm name="wifi_icon" right="40" y="0" width="12" height="#parent_height" src="icon_wifi">',
  '            <bind_flag_if_eq subject="$wifi_subject" ref_value="0" flag="hidden" />',
  '        </u8g2gl_xbm>',
  '        <u8g2gl_clock name="clock" right="0" y="0" width="40" height="#parent_height" format="hh_mm" font="clock_small_7" blink="true" bind_time="system_time" />',
  '    </view>',
  '</widget>',
  '',
].join('\n');

/** A composite parsed from XML. */
function composite(xml: string, file: string): WidgetManifest {
  const parsed = parseWidgetManifestFile(xml, file);
  expect(parsed.diagnostics).toEqual([]);
  return parsed.value!;
}

/** A screen whose view holds `body`; the body's first line is line 3, column 9. */
function screen(body: string): Screen {
  return parseScreenFile(`<screen name="home">\n    <view>\n${body}\n    </view>\n</screen>\n`, 'screens/screen_home.xml').value!;
}

function expand(body: string, composites: readonly WidgetManifest[]) {
  return expandScreens({ globals: GLOBALS, screens: [screen(body)], manifests: frameworkRegistry(composites) });
}

/** Resolves one expanded screen against a 256-wide display. */
function resolve(elements: readonly ExpandedElement[], composites: readonly WidgetManifest[]) {
  const context = createResolverContext(GLOBALS, frameworkRegistry(composites), CATALOGUE.find((r) => r.setup === WIDE));
  return resolveElements(
    elements.map((element) => element.node),
    displayContainer(context),
    context,
  );
}

const box = (element: ResolvedElement | undefined) => {
  const g = element?.geometry;
  return [g?.x?.value, g?.y?.value, g?.width?.value, g?.height?.value];
};

// §13.12's screen, verbatim apart from line breaks.
const WORKED_EXAMPLE = [
  '        <status_bar name="bar" x="0" y="0" width="#screen_width" height="11" title_subject="station_name" />',
  '        <u8g2gl_hline name="rule" x="0" y="11" width="#screen_width" />',
  '        <u8g2gl_label name="msg" x="0" y="16" right="0" height="12" bind_text="service_message" font="small_9" align="center" />',
].join('\n');

describe('expandScreens (§13.6, PR-04 WO7)', () => {
  describe('§13.12 worked example', () => {
    const statusBar = composite(STATUS_BAR_XML, STATUS_BAR_FILE);
    const expanded = expand(WORKED_EXAMPLE, [statusBar]);
    const [bar, rule, msg] = expanded.screens[0]!.elements;

    it('expands without diagnostics, to the identifiers §13.12 declares, in document order', () => {
      expect(expanded.diagnostics).toEqual([]);
      expect([bar, rule, msg].map((e) => e?.identifier)).toEqual(['bar', 'rule', 'msg']);
      expect(bar?.children.map((e) => e.identifier)).toEqual(['bar_location', 'bar_wifi_icon', 'bar_clock']);
    });

    it("resolves the container and its children against the instance's size, not the display", () => {
      const resolved = resolve(expanded.screens[0]!.elements, [statusBar]);
      expect(resolved.diagnostics).toEqual([]);
      const [rBar, , rMsg] = resolved.elements;

      expect(box(rBar)).toEqual([0, 0, 256, 11]);
      expect(rBar?.children.map(box)).toEqual([
        [0, 0, 204, 11], // bar_location: right="52" → 256-52
        [204, 0, 12, 11], // bar_wifi_icon: right="40", width=12
        [216, 0, 40, 11], // bar_clock: right="0" → 256-40
      ]);
      expect(box(rMsg)).toEqual([0, 16, 256, 12]);
    });

    it('substitutes supplied arguments, then declared defaults, through the subtree', () => {
      const [location, wifiIcon] = bar!.children;
      expect(location?.node.attributes.bind_text).toBe('station_name');
      expect(location?.node.attributes.font).toBe('small_9');
      expect(wifiIcon?.node.children[0]).toMatchObject({ kind: 'binding', subject: 'wifi_connected', flag: 'hidden' });
      expect(bar?.arguments).toEqual([
        expect.objectContaining({ prop: 'title_subject', value: 'station_name', from: 'argument' }),
        expect.objectContaining({ prop: 'wifi_subject', value: 'wifi_connected', from: 'default' }),
        expect.objectContaining({ prop: 'font', value: 'small_9', from: 'default' }),
      ]);
    });

    it('keeps each expanded element\'s original source location and its instantiation chain', () => {
      const location = bar!.children[0]!;
      expect(location.source.loc).toMatchObject({ file: STATUS_BAR_FILE, line: 8 });
      expect(location.node.loc).toEqual(location.source.loc);
      expect(location.source.attributes.bind_text).toBe('$title_subject');
      expect(location.instantiation).toEqual([
        { tag: 'status_bar', name: 'bar', identifier: 'bar', loc: expect.objectContaining({ file: 'screens/screen_home.xml', line: 3, column: 9 }) },
      ]);
      expect(rule?.instantiation).toEqual([]);
      expect(rule?.arguments).toBeUndefined();
    });
  });

  it('gives two instances of one composite distinct identifiers and independent arguments', () => {
    const statusBar = composite(STATUS_BAR_XML, STATUS_BAR_FILE);
    const expanded = expand(
      [
        '        <status_bar name="top" x="0" y="0" width="128" height="11" />',
        '        <status_bar name="bottom" x="0" y="20" width="128" height="11" title_subject="service_message" />',
      ].join('\n'),
      [statusBar],
    );
    const [top, bottom] = expanded.screens[0]!.elements;

    expect(expanded.diagnostics).toEqual([]);
    expect(top?.children.map((e) => e.identifier)).toEqual(['top_location', 'top_wifi_icon', 'top_clock']);
    expect(bottom?.children.map((e) => e.identifier)).toEqual(['bottom_location', 'bottom_wifi_icon', 'bottom_clock']);
    expect(top?.children[0]?.node.attributes.bind_text).toBe('station_name');
    expect(bottom?.children[0]?.node.attributes.bind_text).toBe('service_message');
  });

  it('resolves subject indirection to the concrete subject, and a non-subject name fails at the instantiation site', () => {
    const statusBar = composite(STATUS_BAR_XML, STATUS_BAR_FILE);
    const body = '        <status_bar name="bar" x="0" y="0" width="128" height="11" title_subject="stationname" />';
    const parsed = screen(body);
    const expanded = expandScreens({ globals: GLOBALS, screens: [parsed], manifests: frameworkRegistry([statusBar]) });

    expect(expanded.diagnostics).toHaveLength(1);
    const [diagnostic] = expanded.diagnostics;
    const argumentLoc = parsed.view.children[0]!.attributeLocs!.title_subject!;
    expect(diagnostic).toMatchObject({
      code: DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
      severity: 'error',
      file: 'screens/screen_home.xml',
      line: 3,
      column: argumentLoc.column,
      offendingText: 'stationname',
      suggestions: ['station_name'],
    });
    expect(diagnostic?.message).toContain("Prop 'title_subject' of <status_bar> 'bar' is given 'stationname' as a subject name");
  });

  it('reports a default that is not a declared subject at the instance, saying it is the default', () => {
    const statusBar = composite(STATUS_BAR_XML, STATUS_BAR_FILE);
    const globals: Globals = { ...GLOBALS, subjects: GLOBALS.subjects.filter((s) => s.name !== 'wifi_connected') };
    const expanded = expandScreens({
      globals,
      screens: [screen('        <status_bar name="bar" x="0" y="0" width="128" height="11" />')],
      manifests: frameworkRegistry([statusBar]),
    });

    expect(expanded.diagnostics.map((d) => [d.code, d.file, d.line, d.column])).toEqual([
      [DIAGNOSTIC_CODES.UNKNOWN_SUBJECT, 'screens/screen_home.xml', 3, 9],
    ]);
    expect(expanded.diagnostics[0]?.message).toContain("defaults to 'wifi_connected'");
  });

  describe('nested composites', () => {
    const clockFace = composite(
      [
        '<widget name="clock_face">',
        '    <api><prop name="time_subject" type="subject" /></api>',
        '    <view>',
        '        <u8g2gl_clock name="digits" x="0" y="0" width="#parent_width" height="#parent_height" font="f" bind_time="$time_subject" />',
        '    </view>',
        '</widget>',
      ].join('\n'),
      'widgets/clock_face/clock_face.xml',
    );
    const bar = composite(
      [
        '<widget name="clock_bar">',
        '    <api><prop name="clock_subject" type="subject" default="system_time" /></api>',
        '    <view>',
        '        <clock_face name="clk" right="0" y="0" width="40" height="#parent_height" time_subject="$clock_subject" />',
        '    </view>',
        '</widget>',
      ].join('\n'),
      'widgets/clock_bar/clock_bar.xml',
    );
    const expanded = expand('        <clock_bar name="bar" x="0" y="0" width="200" height="11" />', [clockFace, bar]);
    const clk = expanded.screens[0]!.elements[0]!.children[0]!;
    const digits = clk.children[0]!;

    it('prefix recursively: instance bar → instance clk → digits is bar_clk_digits', () => {
      expect(expanded.diagnostics).toEqual([]);
      expect(clk.identifier).toBe('bar_clk');
      expect(digits.identifier).toBe('bar_clk_digits');
      expect(digits.instantiation.map((site) => site.identifier)).toEqual(['bar', 'bar_clk']);
      expect(digits.instantiation[1]?.loc).toMatchObject({ file: 'widgets/clock_bar/clock_bar.xml', line: 4 });
    });

    it('substitute through both levels to the concrete subject', () => {
      expect(clk.arguments).toEqual([expect.objectContaining({ prop: 'time_subject', value: 'system_time' })]);
      expect(digits.node.attributes.bind_time).toBe('system_time');
    });

    it("resolve each level's #parent_* against the level above", () => {
      const resolved = resolve(expanded.screens[0]!.elements, [clockFace, bar]);
      const rClk = resolved.elements[0]!.children[0];
      expect(box(rClk)).toEqual([160, 0, 40, 11]);
      expect(box(rClk?.children[0])).toEqual([0, 0, 40, 11]);
    });
  });

  describe('arguments', () => {
    const card = composite(
      [
        '<widget name="wd_card">',
        '    <api>',
        '        <prop name="caption" type="string" />',
        '        <prop name="gap" type="int" default="2" />',
        '        <prop name="font_name" type="font" required="true" />',
        '    </api>',
        '    <view>',
        '        <u8g2gl_label name="text" x="$gap * 2" y="0" width="$gap + 10" height="10" font="$font_name" text="$caption" />',
        '        <u8g2gl_label name="typo" x="0" y="10" width="10" height="10" font="$font_name" text="$captoin" />',
        '    </view>',
        '</widget>',
      ].join('\n'),
      'widgets/wd_card/wd_card.xml',
    );

    it('substitutes an int argument inside an expression, parenthesised, so it resolves', () => {
      const expanded = expand('        <wd_card name="c" x="0" y="0" width="64" height="20" gap="1 + 2" font_name="f" />', [card]);
      const text = expanded.screens[0]!.elements[0]!.children[0]!;
      expect(text.node.attributes.x).toBe('(1 + 2) * 2');
      expect(text.node.attributes.width).toBe('(1 + 2) + 10');
      expect(box(resolve(expanded.screens[0]!.elements, [card]).elements[0]?.children[0])).toEqual([6, 0, 13, 10]);
    });

    it('leaves an attribute unset when it names an optional prop given no value', () => {
      const expanded = expand('        <wd_card name="c" x="0" y="0" width="64" height="20" font_name="f" />', [card]);
      const text = expanded.screens[0]!.elements[0]!.children[0]!;
      expect(text.node.attributes.text).toBeUndefined();
      expect(text.node.attributes.x).toBe('(2) * 2');
    });

    it('reports a missing required prop at the instance', () => {
      const expanded = expand('        <wd_card name="c" x="0" y="0" width="64" height="20" />', [card]);
      const missing = expanded.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
      expect(missing.map((d) => [d.file, d.line, d.column, d.offendingText])).toEqual([['screens/screen_home.xml', 3, 9, 'font_name']]);
    });

    it('reports a $name naming no declared prop once, at the reference, however many instances use it', () => {
      const expanded = expand(
        [
          '        <wd_card name="a" x="0" y="0" width="64" height="20" font_name="f" />',
          '        <wd_card name="b" x="0" y="30" width="64" height="20" font_name="f" />',
        ].join('\n'),
        [card],
      );
      const unknown = expanded.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_PROP);
      expect(unknown).toHaveLength(1);
      expect(unknown[0]).toMatchObject({ file: 'widgets/wd_card/wd_card.xml', line: 9, offendingText: '$captoin', suggestions: ['$caption'] });
    });

    it('never substitutes or invents a name', () => {
      const expanded = expand('        <wd_card name="c" x="0" y="0" width="64" height="20" font_name="f" />', [card]);
      expect(expanded.screens[0]!.elements[0]!.children.map((e) => [e.name, e.identifier])).toEqual([
        ['text', 'c_text'],
        ['typo', 'c_typo'],
      ]);
    });
  });

  it('places elements written inside an instance after its template, keeping them in the screen scope', () => {
    const card = composite(
      '<widget name="wd_frame"><api /><view><u8g2gl_box name="edge" x="0" y="0" width="4" height="4" /></view></widget>',
      'widgets/wd_frame/wd_frame.xml',
    );
    const expanded = expand(
      [
        '        <wd_frame name="f" x="0" y="0" width="64" height="20">',
        '            <u8g2gl_box name="extra" x="8" y="0" width="4" height="4" />',
        '        </wd_frame>',
      ].join('\n'),
      [card],
    );
    const frame = expanded.screens[0]!.elements[0]!;
    expect(frame.children.map((e) => [e.identifier, e.instantiation.length])).toEqual([
      ['f_edge', 1],
      ['extra', 0],
    ]);
    expect(frame.node.children.map((c) => ('tag' in c ? c.attributes.name : c.kind))).toEqual(['edge', 'extra']);
  });

  it('does not expand a composite already on the chain — the cycle is Pass 2\'s error', () => {
    const loop = composite(
      '<widget name="wd_loop"><api /><view><wd_loop name="again" x="0" y="0" width="4" height="4" /></view></widget>',
      'widgets/wd_loop/wd_loop.xml',
    );
    const expanded = expand('        <wd_loop name="l" x="0" y="0" width="8" height="8" />', [loop]);
    const again = expanded.screens[0]!.elements[0]!.children[0]!;
    expect(again.identifier).toBe('l_again');
    expect(again.children).toEqual([]);
    expect(again.arguments).toBeUndefined();
  });
});
