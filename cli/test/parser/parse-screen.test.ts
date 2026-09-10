/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-screen.test.ts
 * Purpose: Verification tests for parsing screen XML files (screens/screen_*.xml).
 * Description: Asserts that valid-screen.xml parses into a typed Screen model with
 *              nested visual widget trees, common attributes, style overrides, reactive
 *              binding children, user interaction event handlers, and explicit focus rings.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScreenFile } from '../../src/core/parser/index.js';
import type {
  BindingChild,
  EventChild,
  WidgetNode,
} from '../../src/core/schema/widget-node.js';

describe('parseScreenFile', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-screen.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('parses valid-screen.xml into a typed Screen model with view, styles, and focus ring', () => {
    const result = parseScreenFile(fixtureXml, 'screen_home.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const screen = result.value!;
    expect(screen.name).toBe('home');

    // Local styles
    expect(screen.styles).toBeDefined();
    expect(screen.styles).toHaveLength(2);
    expect(screen.styles?.[0]?.name).toBe('footer');
    expect(screen.styles?.[1]?.name).toBe('selected');

    // View & children
    expect(screen.view).toBeDefined();
    expect(screen.view.children).toHaveLength(4);

    const labelNode = screen.view.children[0]!;
    expect(labelNode.tag).toBe('u8g2gl_label');
    expect(labelNode.attributes.name).toBe('title');
    expect(labelNode.attributes.text).toBe('Home Screen');
    expect(labelNode.attributes.width).toBe('128');
    expect(labelNode.attributes.height).toBe('12');
    expect(labelNode.attributes.align).toBe('center');

    const hlineNode = screen.view.children[1]!;
    expect(hlineNode.tag).toBe('u8g2gl_hline');
    expect(hlineNode.attributes.name).toBe('divider');
    expect(hlineNode.attributes.width).toBe('128');

    // Button with children
    const wifiButton = screen.view.children[2] as WidgetNode;
    expect(wifiButton.tag).toBe('u8g2gl_button');
    expect(wifiButton.attributes.name).toBe('btn_wifi');
    expect(wifiButton.attributes.focusStyle).toBe('selected');
    expect(wifiButton.styleOverrides).toEqual({ invert: 'false' });

    // Child event and binding
    expect(wifiButton.children).toHaveLength(2);
    const eventChild = wifiButton.children[0] as EventChild;
    expect(eventChild.kind).toBe('event');
    expect(eventChild.type).toBe('screen_load_event');
    expect(eventChild.screen).toBe('screen_wifi');
    expect(eventChild.trigger).toBe('press');

    const bindingChild = wifiButton.children[1] as BindingChild;
    expect(bindingChild.kind).toBe('binding');
    expect(bindingChild.type).toBe('bind_flag_if_eq');
    expect(bindingChild.subject).toBe('wifi_connected');
    expect(bindingChild.refValue).toBe('0');
    expect(bindingChild.flag).toBe('hidden');

    // Back button
    const backButton = screen.view.children[3] as WidgetNode;
    expect(backButton.tag).toBe('u8g2gl_button');
    const backEvent = backButton.children[0] as EventChild;
    expect(backEvent.type).toBe('screen_back_event');
    expect(backEvent.trigger).toBe('press');

    // Focus ring
    expect(screen.view.focusRing).toBeDefined();
    expect(screen.view.focusRing?.wrap).toBe(true);
    expect(screen.view.focusRing?.entries).toHaveLength(2);
    expect(screen.view.focusRing?.entries[0]?.name).toBe('btn_wifi');
    expect(screen.view.focusRing?.entries[1]?.name).toBe('btn_back');
  });

  it('preserves attribute and element source locations on widget nodes', () => {
    const result = parseScreenFile(fixtureXml, 'screen_home.xml');
    const screen = result.value!;

    expect(screen.loc).toBeDefined();
    expect(screen.loc?.file).toBe('screen_home.xml');

    const labelNode = screen.view.children[0]!;
    expect(labelNode.loc).toBeDefined();
    expect(labelNode.loc?.line).toBe(10);

    expect(labelNode.attributeLocs).toBeDefined();
    expect(labelNode.attributeLocs?.name).toBeDefined();
    expect(labelNode.attributeLocs?.text).toBeDefined();
  });
});
