/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/input-model.ts
 * Purpose: What the input vocabulary (§12) means, held once for every layer
 *          that reads it: the validator judges rings and events by it, the
 *          firmware emitter spells them as runtime enumerators by it, and the
 *          scene carries them by it. Each needs the same three answers — which
 *          triggers exist, which elements can produce `value_changed`, and what
 *          a callback may be called — and a copy in each would drift (SKILL §4:
 *          a table two layers share lives in neither).
 * Description: Data and pure functions only; no Node imports.
 *
 *              **The one element-class list here is deliberate.** Whether an
 *              element's press changes its value is C++ behaviour — the class
 *              overrides `u8g2gl_obj::on_press_input()` — and the manifest
 *              vocabulary has no attribute to say so: adding one was Q1b,
 *              which the owner declined to keep schema 0.7 free of new surface.
 *              So the runtime classes that override it are named here, matched
 *              against an element's whole `extends` chain, so a custom widget
 *              extending `u8g2gl_switch` inherits the answer exactly as it
 *              inherits the C++. When a second class overrides
 *              `on_press_input()`, it is added here in the same change.
 *
 * Exports:
 * - EVENT_TRIGGERS:            The three triggers, in §12.3's order
 * - TRIGGER_ENUMERATORS:       Each trigger's `u8g2gl_trigger_t` enumerator
 * - ACTION_ENUMERATORS:        Each event element's `u8g2gl_action_t` enumerator
 * - VALUE_INPUT_CLASSES:       The runtime classes whose press changes their value
 * - isEventTrigger():          Whether a written trigger is one of the three
 * - isPressTrigger():          Whether a trigger needs focus to fire
 * - producesValueChanged():    Whether an element's input can fire value_changed
 * - eventsOf():                An element's event children, in document order
 * - callbackIdentifierProblem(): Why a callback name cannot be declared, if it cannot
 * - UI_DISPATCH_FUNCTION:      The generated dispatch entry point
 * - InputEventName, INPUT_EVENTS: The runtime's u8g2gl_event_t values by name,
 *                              for a scripted input sequence (test run, preview)
 */

import { CPP_KEYWORDS } from './cpp-keywords.js';
import type { EventChild, EventTrigger, WidgetNode } from './widget-node.js';

/** §12.3's triggers, in its order. */
export const EVENT_TRIGGERS: readonly EventTrigger[] = ['press', 'long_press', 'value_changed'];

/** The runtime's `u8g2gl_trigger_t` enumerator for each trigger (u8g2gl_types.h). */
export const TRIGGER_ENUMERATORS: Readonly<Record<EventTrigger, string>> = {
  press: 'U8G2GL_TRIGGER_PRESS',
  long_press: 'U8G2GL_TRIGGER_LONG_PRESS',
  value_changed: 'U8G2GL_TRIGGER_VALUE_CHANGED',
};

/** The runtime's `u8g2gl_action_t` enumerator for each event element (u8g2gl_input.h). */
export const ACTION_ENUMERATORS: Readonly<Record<EventChild['type'], string>> = {
  screen_load_event: 'U8G2GL_ACTION_SCREEN_LOAD',
  screen_back_event: 'U8G2GL_ACTION_SCREEN_BACK',
  event_cb: 'U8G2GL_ACTION_CALLBACK',
};

/**
 * The runtime classes whose press changes their value, and so fires
 * `value_changed`: those overriding `u8g2gl_obj::on_press_input()`. See the
 * file header for why this is a list.
 */
export const VALUE_INPUT_CLASSES: readonly string[] = ['u8g2gl_switch'];

/** The dispatch entry point `ui.hpp` declares when a project has input (§12.1). */
export const UI_DISPATCH_FUNCTION = 'ui_dispatch';

/** @brief Whether @p trigger, as written, is one of §12.3's three. */
export function isEventTrigger(trigger: string): trigger is EventTrigger {
  return (EVENT_TRIGGERS as readonly string[]).includes(trigger);
}

/**
 * @brief Whether a trigger fires only on the focused element: `press` and
 *        `long_press` do; `value_changed` follows the element's own value.
 */
export function isPressTrigger(trigger: EventTrigger): boolean {
  return trigger === 'press' || trigger === 'long_press';
}

/**
 * @brief Whether an element's input can change its value, and so fire
 *        `value_changed` (§12.3, Q2a).
 *
 * @param chain The element's effective manifest chain, its own tag first
 *              (`EffectiveManifest.chain`); empty for an unknown tag.
 */
export function producesValueChanged(chain: readonly string[]): boolean {
  return chain.some((tag) => VALUE_INPUT_CLASSES.includes(tag));
}

/** @brief An element's event children, in document order. */
export function eventsOf(node: WidgetNode): readonly EventChild[] {
  const events: EventChild[] = [];
  for (const child of node.children) {
    if ('kind' in child && child.kind === 'event') {
      events.push(child);
    }
  }
  return events;
}

/**
 * @brief Why a callback name cannot be declared in `ui.hpp` and defined by the
 *        application, or undefined when it can (§12.3, ruling 5).
 *
 * The name is the application's own C++ function, so it keeps C's rule rather
 * than §13.4's lowercase rule for names the generator prefixes: `onReset` is
 * fine. It may not be a keyword, and may not sit in the runtime's `u8g2gl_`
 * namespace, where it could define a library function.
 *
 * @param name The `callback` attribute as written; undefined when absent.
 * @return Prose completing "callback '<name>' ...", or undefined.
 */
export function callbackIdentifierProblem(name: string | undefined): string | undefined {
  if (name === undefined || name === '') {
    return 'is missing: <event_cb> needs a callback naming the C++ function to call';
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return 'is not a C identifier: it must match [A-Za-z_][A-Za-z0-9_]*';
  }
  if (CPP_KEYWORDS.has(name)) {
    return 'is a C++ keyword';
  }
  if (name.toLowerCase().startsWith('u8g2gl_')) {
    return "is in the runtime's u8g2gl_ namespace, where it could define a library function";
  }
  return undefined;
}

/**
 * The runtime's `u8g2gl_event_t` values (u8g2gl_types.h), by the name a
 * scripted sequence uses: the enumerator without `U8G2GL_EVENT_`, lowercased.
 * The designer's preview and the test run name events this way, and send the
 * number, so both targets receive the same values the device's ui_dispatch()
 * does.
 */
export const INPUT_EVENTS = {
  encoder_cw: 1,
  encoder_ccw: 2,
  encoder_click: 3,
  button_press: 4,
  button_long_press: 5,
  encoder_long_click: 6,
  button_next: 7,
  button_prev: 8,
} as const;

/** One scripted input event's name. */
export type InputEventName = keyof typeof INPUT_EVENTS;
