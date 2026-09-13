/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-component.test.ts
 * Purpose: Verification tests for parsing composite elements (§6.3, §6.4).
 * Description: Asserts that valid-component.xml is parsed into a typed composite
 *              WidgetManifest (§6.3, [D-18]; WO5b retired the separate `Component`
 *              type) with parameterised <api> properties (types, defaults, required
 *              flags, and — since WO5's merge onto PropDef — help text) and a
 *              templated <view> widget tree with nested binding directives.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseComponentFile } from '../../src/core/parser/index.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';

describe('parseComponentFile', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-component.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('parses valid-component.xml into a typed composite WidgetManifest with API and view', () => {
    const result = parseComponentFile(fixtureXml, 'status_bar.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const component = result.value!;
    expect(component.name).toBe('status_bar');

    // API props — `api` is an ApiBlock post-WO5b, so props live under `.props`.
    expect(component.api.props).toHaveLength(5);
    expect(component.api.props[0]).toMatchObject({
      name: 'title_subject',
      type: 'subject',
      default: 'station_name',
    });
    expect(component.api.props[1]).toMatchObject({
      name: 'wifi_subject',
      type: 'subject',
      default: 'wifi_connected',
    });
    expect(component.api.props[2]).toMatchObject({
      name: 'width',
      type: 'int',
      default: '#screen_width',
    });
    expect(component.api.props[3]).toMatchObject({
      name: 'height',
      type: 'int',
      default: '11',
    });
    expect(component.api.props[4]).toMatchObject({
      name: 'font',
      type: 'font',
      default: 'small_9',
      required: true,
      help: 'Font used for the scrolling location label.',
    });

    // View widget tree
    expect(component.view).toBeDefined();
    expect(component.view?.children).toHaveLength(3);

    const scrollingLabel = component.view!.children[0]!;
    expect(scrollingLabel.tag).toBe('u8g2gl_label');
    expect(scrollingLabel.attributes.name).toBe('location');
    expect(scrollingLabel.attributes.bind_text).toBe('$title_subject');
    expect(scrollingLabel.attributes.font).toBe('$font');
    expect(scrollingLabel.attributes.long_mode).toBe('scroll');

    const xbmWidget = component.view!.children[1] as WidgetNode;
    expect(xbmWidget.tag).toBe('u8g2gl_xbm');
    expect(xbmWidget.attributes.src).toBe('icon_wifi');
    expect(xbmWidget.children).toHaveLength(1);
    expect(xbmWidget.children[0]?.kind).toBe('binding');

    const clockWidget = component.view!.children[2]!;
    expect(clockWidget.tag).toBe('u8g2gl_clock');
    expect(clockWidget.attributes.format).toBe('HH:MM');
  });

  it('round-trips help text on a composite prop (WO5, [D-18] merge onto PropDef)', () => {
    // ComponentProp had no `help` field before this merge, so a composite's
    // props could carry no description text at all — this is the defect the
    // WO5 merge exists to fix (ui_spec.md §9). Without `help` read out of the
    // <prop> element and copied onto the parsed PropDef, this assertion fails.
    const xml = `<component name="labelled">
    <api>
        <prop name="title" type="string" help="Shown at the top of the screen." />
    </api>
    <view>
        <u8g2gl_label name="lbl" text="Test" />
    </view>
</component>`;
    const result = parseComponentFile(xml, 'labelled.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value?.api.props[0]?.help).toBe('Shown at the top of the screen.');
  });

  it('infers component name from file path if name attribute is absent', () => {
    const xml = `<component>
    <view>
        <u8g2gl_label name="lbl" text="Test" />
    </view>
</component>`;
    const result = parseComponentFile(xml, 'components/weather_badge/weather_badge.xml');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value?.name).toBe('weather_badge');
  });
});
