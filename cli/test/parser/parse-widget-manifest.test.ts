/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-widget-manifest.test.ts
 * Purpose: Verification tests for parsing widget manifests (<widget>, §6.4, §13.1).
 * Description: Asserts that valid-widget-manifest.xml parses into a typed WidgetManifest
 *              model with extends inheritance, animation license flags, and <api> block
 *              containing properties, reactive binding slots, and child collection elements.
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

  it('parses valid-widget-manifest.xml into a typed WidgetManifest model', () => {
    const result = parseWidgetManifestFile(fixtureXml, 'wd_service_list.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const manifest = result.value!;
    expect(manifest.name).toBe('wd_service_list');
    expect(manifest.extends).toBe('u8g2gl_widget');
    expect(manifest.animated).toBe(true);

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

  it('correctly handles animated="false" for static demotion (§13.5)', () => {
    const xml = `<widget name="u8g2gl_label" extends="u8g2gl_obj" animated="false">
    <api>
        <prop name="text" type="string" setter="set_text" />
    </api>
</widget>`;
    const result = parseWidgetManifestFile(xml, 'u8g2gl_label.xml');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value?.animated).toBe(false);
  });
});
