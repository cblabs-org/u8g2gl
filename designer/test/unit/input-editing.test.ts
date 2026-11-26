/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/input-editing.test.ts
 * Purpose: The designer's input authoring (§12) writes XML the parser reads
 *          back as intended, and nothing else: an element's events as the
 *          panel edits them, a screen's focus ring added to, reordered,
 *          wrapped and emptied — never a member the author did not pick — and
 *          the Explorer's ring marker read from the ring as written.
 * Description: Each action is applied to a small screen's text in memory; the
 *              result is parsed by the CLI's own parser, so "the parser reads
 *              it back" is checked, not assumed.
 */

import { expect, test } from '@playwright/test';
import { applyEdits, parseCst } from '@u8g2gl/core/cst/index.js';
import { parseScreenFile } from '@u8g2gl/core/parser/index.js';
import { isElementNode, type EventChild, type WidgetNode } from '@u8g2gl/core/schema/widget-node.js';
import { elementEventEdits, elementEvents, type ElementEventEdit } from '../../src/panel/element-events';
import { focusPositions, focusRingEdits, focusRingOf, type FocusRingEdit } from '../../src/panel/focus-ring';
import { elementTree } from '../../src/documents/element-tree';
import { namedCstElements } from '../../src/panel/element-facts';

const FILE = 'screens/screen_menu.xml';

const SCREEN = `<screen name="menu">
    <view>
        <u8g2gl_button name="go" x="0" y="0" width="60" height="12" font="f" text="Go" />
        <u8g2gl_switch name="sw" x="64" y="0" width="24" height="12">
            <event_cb trigger="value_changed" callback="on_sw" />
        </u8g2gl_switch>
        <u8g2gl_label name="about" x="0" y="20" width="60" height="12" font="f" text="About">
            <style name="quiet" />
        </u8g2gl_label>
    </view>
</screen>
`;

const ELEMENT_TAGS = new Set(['u8g2gl_button', 'u8g2gl_switch', 'u8g2gl_label']);
const isElement = (tag: string): boolean => ELEMENT_TAGS.has(tag);

/** The text after one event action on `name`. */
function events(text: string, name: string, action: ElementEventEdit): string {
  return applyEdits(text, elementEventEdits(text, FILE, name, action));
}

/** The text after one ring action. */
function ring(text: string, action: FocusRingEdit): string {
  return applyEdits(text, focusRingEdits(text, FILE, action));
}

/** The parsed screen; throws if the text does not parse cleanly. */
function parsed(text: string): ReturnType<typeof parseScreenFile> {
  const result = parseScreenFile(text, FILE);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result;
}

/** One element's parsed events. */
function parsedEvents(text: string, name: string): EventChild[] {
  const find = (nodes: readonly WidgetNode[]): WidgetNode | undefined => {
    for (const node of nodes) {
      if (node.attributes.name === name) return node;
      const inner = find(node.children.filter(isElementNode));
      if (inner !== undefined) return inner;
    }
    return undefined;
  };
  const node = find(parsed(text).value!.view.children);
  return (node?.children ?? []).filter((child): child is EventChild => 'kind' in child && child.kind === 'event');
}

test('an event added to a self-closing element is written inside it, and parses as written', () => {
  const after = events(SCREEN, 'go', { kind: 'add', action: 'screen_load', trigger: 'press', target: 'settings' });
  expect(after).toContain('<u8g2gl_button name="go" x="0" y="0" width="60" height="12" font="f" text="Go">');
  expect(after).toContain('<screen_load_event trigger="press" screen="settings" />');
  expect(parsedEvents(after, 'go')).toMatchObject([{ type: 'screen_load_event', trigger: 'press', screen: 'settings' }]);
});

test("an event's trigger, target and action are each one small edit, and remove and move undo cleanly", () => {
  // --- Add two, after the one already there ---
  let text = events(SCREEN, 'sw', { kind: 'add', action: 'callback', trigger: 'press', target: 'on_press' });
  text = events(text, 'sw', { kind: 'add', action: 'screen_back', trigger: 'long_press', target: '' });
  expect(parsedEvents(text, 'sw').map((e) => `${e.type}:${e.trigger}`)).toEqual([
    'event_cb:value_changed',
    'event_cb:press',
    'screen_back_event:long_press',
  ]);

  // --- Change one's trigger and target, then its action ---
  text = events(text, 'sw', { kind: 'trigger', row: 1, trigger: 'long_press' });
  text = events(text, 'sw', { kind: 'target', row: 1, target: 'on_hold' });
  expect(parsedEvents(text, 'sw')[1]).toMatchObject({ type: 'event_cb', trigger: 'long_press', callback: 'on_hold' });
  text = events(text, 'sw', { kind: 'action', row: 1, action: 'screen_load', target: 'menu' });
  expect(parsedEvents(text, 'sw')[1]).toMatchObject({ type: 'screen_load_event', trigger: 'long_press', screen: 'menu' });

  // --- Move the last up, then remove it: the rest are as before ---
  const moved = events(text, 'sw', { kind: 'move', row: 2, by: -1 });
  expect(parsedEvents(moved, 'sw').map((e) => e.type)).toEqual(['event_cb', 'screen_back_event', 'screen_load_event']);
  const removed = events(moved, 'sw', { kind: 'remove', row: 1 });
  expect(parsedEvents(removed, 'sw').map((e) => e.type)).toEqual(['event_cb', 'screen_load_event']);

  // --- The reader sees what was written ---
  const element = namedCstElements(parseCst(removed, FILE).cst).get('sw')!;
  expect(elementEvents(element).map(({ action, trigger, screen, callback }) => ({ action, trigger, screen, callback }))).toEqual([
    { action: 'callback', trigger: 'value_changed', screen: '', callback: 'on_sw' },
    { action: 'screen_load', trigger: 'long_press', screen: 'menu', callback: '' },
  ]);
});

test('an action naming a row the text no longer has changes nothing', () => {
  expect(elementEventEdits(SCREEN, FILE, 'go', { kind: 'remove', row: 0 })).toEqual([]);
  expect(elementEventEdits(SCREEN, FILE, 'nobody', { kind: 'add', action: 'callback', trigger: 'press', target: 'x' })).toEqual([]);
  expect(elementEventEdits(SCREEN, FILE, 'sw', { kind: 'trigger', row: 0, trigger: 'value_changed' })).toEqual([]);
});

test('the ring offers only named elements written in the screen, and adds nothing on its own', () => {
  const before = focusRingOf(parseCst(SCREEN, FILE).cst, isElement);
  // `quiet` is a <style> child and `on_sw` a callback: neither is an element.
  expect(before).toMatchObject({ exists: false, members: [], candidates: ['go', 'sw', 'about'] });

  // --- The first member writes the ring, wrapping by default ---
  let text = ring(SCREEN, { kind: 'add', name: 'sw' });
  const first = parsed(text).value!.view.focusRing;
  expect(first).toMatchObject({ wrap: true, entries: [{ name: 'sw' }] });
  expect(focusRingOf(parseCst(text, FILE).cst, isElement).candidates).toEqual(['go', 'about']);

  // --- More, then reorder and unwrap ---
  text = ring(text, { kind: 'add', name: 'go' });
  text = ring(text, { kind: 'add', name: 'about' });
  text = ring(text, { kind: 'move', row: 1, by: -1 });
  text = ring(text, { kind: 'wrap', wrap: false });
  expect(parsed(text).value!.view.focusRing).toMatchObject({ wrap: false, entries: [{ name: 'go' }, { name: 'sw' }, { name: 'about' }] });
  expect(ring(text, { kind: 'add', name: 'go' })).toBe(text);  // never twice

  // --- Removing every member removes the ring ---
  text = ring(text, { kind: 'remove', row: 0 });
  text = ring(text, { kind: 'remove', row: 0 });
  text = ring(text, { kind: 'remove', row: 0 });
  expect(parsed(text).value!.view.focusRing).toBeUndefined();
  expect(text).toBe(SCREEN);
});

test("the Explorer marks each member with its stop, and a ring's entries are no rows of their own", () => {
  const text = ring(ring(SCREEN, { kind: 'add', name: 'about' }), { kind: 'add', name: 'go' });
  expect([...focusPositions(text, FILE)]).toEqual([
    ['about', 1],
    ['go', 2],
  ]);
  const rows = elementTree(text)!;
  expect(rows.map((row) => `${row.name}:${row.tag}:${row.ring ?? '-'}`)).toEqual(['go:u8g2gl_button:2', 'sw:u8g2gl_switch:-', 'about:u8g2gl_label:1']);
});
