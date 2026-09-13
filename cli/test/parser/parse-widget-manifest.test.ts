/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-widget-manifest.test.ts
 * Purpose: Verification tests for parsing widget manifests (<widget>, §6.4, §13.1).
 * Description: Asserts that valid-widget-manifest.xml parses into a typed WidgetManifest
 *              model with extends inheritance and an <api> block containing properties,
 *              reactive binding slots, and child collection elements. Also asserts the
 *              [D-18] fossil `animated` attribute is silently ignored rather than read
 *              into the model or rejected (WO4).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWidgetManifestFile } from '../../src/core/parser/index.js';

describe('parseWidgetManifestFile', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-widget-manifest.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('leaves extends unset on a plain widget that omits it, rather than defaulting it', () => {
    // PR-04 WO2 F2: a parser default made the schema pass's "missing required
    // 'extends'" unreachable. The only default — a composite realising as
    // u8g2gl_obj — is the manifest registry's.
    const result = parseWidgetManifestFile('<widget name="wd_meter"><api></api></widget>', 'wd_meter.xml');
    expect(result.diagnostics).toEqual([]);
    expect(result.value).not.toHaveProperty('extends');
  });

  it('parses valid-widget-manifest.xml into a typed WidgetManifest model', () => {
    const result = parseWidgetManifestFile(fixtureXml, 'wd_service_list.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const manifest = result.value!;
    expect(manifest.name).toBe('wd_service_list');
    expect(manifest.extends).toBe('u8g2gl_widget');
    expect(manifest).not.toHaveProperty('animated');

    // API block
    const api = manifest.api;
    expect(api).toBeDefined();

    // Props
    expect(api.props).toHaveLength(7);
    expect(api.props[0]).toMatchObject({
      name: 'font',
      type: 'font',
      setter: 'set_font',
      required: true,
    });
    expect(api.props[1]).toMatchObject({
      name: 'max_rows',
      type: 'int',
      setter: 'set_max_rows',
      default: '16',
      help: 'Row capacity. Determines allocated RAM.',
    });
    expect(api.props[6]).toMatchObject({
      name: 'align',
      type: 'enum',
      setter: 'set_align',
      values: 'left,center,right',
      default: 'left',
      emit: 'U8G2GL_ALIGN_{VALUE^^}',
    });

    // Bindings
    expect(api.bindings).toHaveLength(1);
    expect(api.bindings[0]).toMatchObject({
      name: 'bind_text',
      type: 'string',
      setter: 'bind_text',
      fmt: 'bind_text_fmt',
    });

    // Elements
    expect(api.elements).toHaveLength(1);
    const element = api.elements[0]!;
    expect(element.name).toBe('column');
    expect(element.access).toBe('add');
    expect(element.help).toBe('Column definition');
    expect(element.args).toHaveLength(2);
    expect(element.args[0]).toMatchObject({
      name: 'width',
      type: 'int',
    });
    expect(element.args[1]).toMatchObject({
      name: 'align',
      type: 'enum',
    });
  });

  it('ignores a lingering `animated` attribute rather than erroring or modelling it ([D-18], WO4)', () => {
    // [D-18] removed `animated` from the widget-level contract: realisation is now
    // decided per instance by the generator (§6.1), never declared by the manifest.
    // A manifest that still carries the attribute — a pre-[D-18] fixture, or a
    // hand-authored widget nobody has migrated — is not a parse error: WO4 chose
    // "ignored" over "parse error" specifically so fixtures owned by other work
    // orders do not go red the moment this attribute stops being read.
    const xml = `<widget name="u8g2gl_label" extends="u8g2gl_obj" animated="false">
    <api>
        <prop name="text" type="string" setter="set_text" />
    </api>
</widget>`;
    const result = parseWidgetManifestFile(xml, 'u8g2gl_label.xml');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).not.toHaveProperty('animated');
  });

  it('parses a primitive prop with draw= and no setter= ([D-18])', () => {
    const xml = `<widget name="u8g2gl_box">
    <api>
        <prop name="x" type="int" draw="u8g2gl_draw_box" required="true" />
    </api>
</widget>`;
    const result = parseWidgetManifestFile(xml, 'u8g2gl_box.xml');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value?.api.props[0]).toMatchObject({
      name: 'x',
      draw: 'u8g2gl_draw_box',
    });
    expect(result.value?.api.props[0]?.setter).toBeUndefined();
  });
});
