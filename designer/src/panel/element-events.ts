/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/element-events.ts
 * Purpose: The property panel's table of an element's events (§12.3): each
 *          `<screen_load_event>`, `<screen_back_event>` and `<event_cb>`
 *          written inside it, as a trigger and an action. They are children in
 *          the XML, so without this table the input model could only be
 *          authored by hand in the text — a gap the designer must not have
 *          (ui_spec §2 principle 8). As everywhere in the panel, each change is
 *          the smallest text edit, computed from the document's current text
 *          with the element found by name at that moment.
 * Description: `elementEvents()` reads the events from the element's CST, in
 *              document order. `elementEventEdits()` turns a table action — add
 *              one, remove one, move one up or down, change its trigger, its
 *              action (which rewrites the event element, keeping its trigger),
 *              its target screen or its callback — into CST text edits. Pure,
 *              so it is tested without a browser; the controller lands the
 *              edits as one undo stop.
 *
 * Exports:
 * - EventAction:        What an event does, as the panel names it
 * - EVENT_ACTIONS:      Each action, its element and its label
 * - ElementEvent:       One event as written
 * - ElementEventEdit:   A table action
 * - elementEvents():    The events of one element
 * - elementEventEdits(): The text edits one action makes
 */

import {
  insertAttribute,
  insertElement,
  parseCst,
  removeAttribute,
  removeElement,
  replaceAttributeValue,
  type CstDocument,
  type CstElement,
  type TextEdit,
} from '@u8g2gl/core/cst/index.js';
import type { EventTrigger } from '@u8g2gl/core/schema/widget-node.js';
import { namedCstElements } from './element-facts';

/** What an event does, as the panel names it. */
export type EventAction = 'screen_load' | 'screen_back' | 'callback';

/** Each action, the element it is written as, and how the panel labels it. */
export const EVENT_ACTIONS: ReadonlyArray<{ readonly action: EventAction; readonly tag: string; readonly label: string }> = [
  { action: 'screen_load', tag: 'screen_load_event', label: 'Load screen' },
  { action: 'screen_back', tag: 'screen_back_event', label: 'Back' },
  { action: 'callback', tag: 'event_cb', label: 'Callback' },
];

/** One event as written, in document order. */
export interface ElementEvent {
  readonly action: EventAction;
  /** The trigger as written; absent means `press`, the parser's default. */
  readonly trigger: string;
  /** The target screen of a load, as written; empty when absent. */
  readonly screen: string;
  /** The callback's name, as written; empty when absent. */
  readonly callback: string;
  /** Where the event element is in the text, half-open: what its problems are found by. */
  readonly range: { readonly start: number; readonly end: number };
}

/** A table action: what the user did to one event, or to the table. */
export type ElementEventEdit =
  | { readonly kind: 'add'; readonly action: EventAction; readonly trigger: EventTrigger; readonly target: string }
  | { readonly kind: 'remove'; readonly row: number }
  | { readonly kind: 'move'; readonly row: number; readonly by: -1 | 1 }
  | { readonly kind: 'trigger'; readonly row: number; readonly trigger: EventTrigger }
  | { readonly kind: 'action'; readonly row: number; readonly action: EventAction; readonly target: string }
  | { readonly kind: 'target'; readonly row: number; readonly target: string };

// actionOf
// An event element's action, or undefined for any other child.
function actionOf(tag: string): EventAction | undefined {
  return EVENT_ACTIONS.find((entry) => entry.tag === tag)?.action;
}

// tagOf
function tagOf(action: EventAction): string {
  return EVENT_ACTIONS.find((entry) => entry.action === action)?.tag ?? 'event_cb';
}

// eventChildren
// An element's event children, in document order.
function eventChildren(element: CstElement): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element' && actionOf(child.name) !== undefined);
}

// attributeOf
function attributeOf(element: CstElement, name: string): string {
  return element.attributes.find((attribute) => attribute.name === name)?.value ?? '';
}

/**
 * @brief The events of one element, in document order.
 *
 * @param element The element, in the document's current CST.
 */
export function elementEvents(element: CstElement): ElementEvent[] {
  return eventChildren(element).map((child) => ({
    action: actionOf(child.name) ?? 'callback',
    trigger: attributeOf(child, 'trigger') || 'press',
    screen: attributeOf(child, 'screen'),
    callback: attributeOf(child, 'callback'),
    range: { start: child.start, end: child.end },
  }));
}

// escapeAttribute
// A value as it may sit inside double quotes.
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// eventText
// One event element's text: its trigger, then what its action names.
//   action  — what it does
//   trigger — when
//   target  — the screen a load names, or the callback a callback names
function eventText(action: EventAction, trigger: string, target: string): string {
  const named = action === 'screen_load' ? ` screen="${escapeAttribute(target)}"` : action === 'callback' ? ` callback="${escapeAttribute(target)}"` : '';
  return `<${tagOf(action)} trigger="${escapeAttribute(trigger)}"${named} />`;
}

// elementIndex
// A child's position among its parent's element children, as insertElement
// counts them.
function elementIndex(parent: CstElement, child: CstElement): number {
  return parent.children.filter((c): c is CstElement => c.kind === 'element').indexOf(child);
}

// setAttribute
// The edits that make one attribute hold `value`.
function setAttribute(cst: CstDocument, element: CstElement, name: string, value: string): TextEdit[] {
  const existing = element.attributes.find((attribute) => attribute.name === name);
  if (existing === undefined) return insertAttribute(cst, element, name, value);
  return existing.value === value ? [] : replaceAttributeValue(existing, value);
}

// targetAttribute
// The attribute a row's target is written in: a load's screen, a callback's
// name; a back names nothing.
function targetAttribute(action: EventAction | undefined): string | undefined {
  return action === 'screen_load' ? 'screen' : action === 'callback' ? 'callback' : undefined;
}

/**
 * @brief The text edits one table action makes.
 *
 * @param text   The document's current text.
 * @param file   Its project path.
 * @param name   The element's name.
 * @param action The action.
 * @return Non-overlapping edits in the coordinates of `text`; empty when the
 *         action changes nothing, or names an element or row the text no
 *         longer has (the selection is reconciled after every run, so that is
 *         a race, not an intent).
 */
export function elementEventEdits(text: string, file: string, name: string, action: ElementEventEdit): TextEdit[] {
  // --- Step 1: The element and its events, as the text is now ---
  const { cst } = parseCst(text, file);
  const element = namedCstElements(cst).get(name);
  if (element === undefined) return [];
  const rows = eventChildren(element);

  // --- Step 2: The action ---
  switch (action.kind) {
    case 'add': {
      // After the last event, so the table grows downwards; the first goes
      // first among the element's children, before any nested element.
      const last = rows.at(-1);
      const index = last === undefined ? 0 : elementIndex(element, last) + 1;
      return insertElement(cst, element, index, eventText(action.action, action.trigger, action.target));
    }
    case 'remove': {
      const row = rows[action.row];
      return row === undefined ? [] : removeElement(cst, row);
    }
    case 'move': {
      const a = rows[action.row];
      const b = rows[action.row + action.by];
      if (a === undefined || b === undefined) return [];
      const [first, second] = action.by < 0 ? [b, a] : [a, b];
      const textOf = (child: CstElement): string => cst.text.slice(child.start, child.end);
      return [
        { start: first.start, end: first.end, text: textOf(second) },
        { start: second.start, end: second.end, text: textOf(first) },
      ];
    }
    case 'trigger': {
      const row = rows[action.row];
      return row === undefined ? [] : setAttribute(cst, row, 'trigger', action.trigger);
    }
    case 'target': {
      const row = rows[action.row];
      const attribute = targetAttribute(row === undefined ? undefined : actionOf(row.name));
      if (row === undefined || attribute === undefined) return [];
      if (action.target === '') {
        const existing = row.attributes.find((a) => a.name === attribute);
        return existing === undefined ? [] : removeAttribute(cst, existing);
      }
      return setAttribute(cst, row, attribute, action.target);
    }
    case 'action': {
      // A different element: the event is rewritten whole, keeping its trigger.
      const row = rows[action.row];
      if (row === undefined || actionOf(row.name) === action.action) return [];
      return [{ start: row.start, end: row.end, text: eventText(action.action, attributeOf(row, 'trigger') || 'press', action.target) }];
    }
  }
}
