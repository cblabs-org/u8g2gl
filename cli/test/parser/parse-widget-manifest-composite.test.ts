/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-widget-manifest-composite.test.ts
 * Purpose: Verification tests for parsing the composite case of a widget
 *          manifest (§6.4, [D-18]) — a `<widget>` root carrying a `<view>`.
 * Description: Formerly test/parser/parse-component.test.ts, exercising the
 *              now-removed `parseComponentFile` against a `<component>` root
 *              (design_spec §15.4, PR-3R WO9). [D-18] leaves one element
 *              vocabulary, so this is `parseWidgetManifestFile` — the same
 *              function test/parser/parse-widget-manifest.test.ts exercises
 *              for a plain widget — asserting on parameterised `<api>`
 *              properties (types, defaults, required flags, help text) and a
 *              templated `<view>` widget tree with nested binding directives.
 *              This is the proof required by the WORKORDER: a composite
 *              authored the new way must parse identically to the old
 *              `<component>` form, not just avoid erroring.
 *
 *              Not carried forward: the old `<component>` parser inferred a
 *              missing `name` from the file path. A `<widget>` root has
 *              always required `name` explicitly (parse-widget-manifest.test.ts
 *              has no inference case either), and [D-18] is one vocabulary
 *              with one rule — so a composite now follows the same
 *              requirement as a plain widget rather than keeping its old,
 *              more lenient one. No fixture in this repository relied on the
 *              inference (PROJECT.md), so nothing regresses in practice.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWidgetManifestFile } from '../../src/core/parser/index.js';
import type { WidgetNode } from '../../src/core/schema/widget-node.js';

describe('parseWidgetManifestFile (composite: a <widget> with a <view>)', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-composite-widget.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('parses valid-composite-widget.xml into a typed composite WidgetManifest with API and view', () => {
    const result = parseWidgetManifestFile(fixtureXml, 'status_bar.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const composite = result.value!;
    expect(composite.name).toBe('status_bar');
    // No C++ class of its own — [D-18], widget-manifest.ts.
    expect(composite.extends).toBeUndefined();

    // API props — `api` is an ApiBlock, same shape a plain widget uses.
    expect(composite.api.props).toHaveLength(5);
    expect(composite.api.props[0]).toMatchObject({
      name: 'title_subject',
      type: 'subject',
      default: 'station_name',
    });
    expect(composite.api.props[1]).toMatchObject({
      name: 'wifi_subject',
      type: 'subject',
      default: 'wifi_connected',
    });
    expect(composite.api.props[2]).toMatchObject({
      name: 'width',
      type: 'int',
      default: '#screen_width',
    });
    expect(composite.api.props[3]).toMatchObject({
      name: 'height',
      type: 'int',
      default: '11',
    });
    expect(composite.api.props[4]).toMatchObject({
      name: 'font',
      type: 'font',
      default: 'small_9',
      required: true,
      help: 'Font used for the scrolling location label.',
    });

    // View widget tree
    expect(composite.view).toBeDefined();
    expect(composite.view?.children).toHaveLength(3);

    const scrollingLabel = composite.view!.children[0]!;
    expect(scrollingLabel.tag).toBe('u8g2gl_label');
    expect(scrollingLabel.attributes.name).toBe('location');
    expect(scrollingLabel.attributes.bind_text).toBe('$title_subject');
    expect(scrollingLabel.attributes.font).toBe('$font');
    expect(scrollingLabel.attributes.long_mode).toBe('scroll');

    const xbmWidget = composite.view!.children[1] as WidgetNode;
    expect(xbmWidget.tag).toBe('u8g2gl_xbm');
    expect(xbmWidget.attributes.src).toBe('icon_wifi');
    expect(xbmWidget.children).toHaveLength(1);
    const xbmChild = xbmWidget.children[0];
    expect(xbmChild !== undefined && 'kind' in xbmChild ? xbmChild.kind : undefined).toBe('binding');

    const clockWidget = composite.view!.children[2]!;
    expect(clockWidget.tag).toBe('u8g2gl_clock');
    expect(clockWidget.attributes.format).toBe('HH:MM');
  });

  it('round-trips help text on a composite prop (WO5, [D-18] merge onto PropDef)', () => {
    // ComponentProp had no `help` field before this merge, so a composite's
    // props could carry no description text at all — this is the defect the
    // WO5 merge exists to fix (ui_spec.md §9). Without `help` read out of the
    // <prop> element and copied onto the parsed PropDef, this assertion fails.
    const xml = `<widget name="labelled">
    <api>
        <prop name="title" type="string" help="Shown at the top of the screen." />
    </api>
    <view>
        <u8g2gl_label name="lbl" text="Test" />
    </view>
</widget>`;
    const result = parseWidgetManifestFile(xml, 'labelled.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value?.api.props[0]?.help).toBe('Shown at the top of the screen.');
  });
});
