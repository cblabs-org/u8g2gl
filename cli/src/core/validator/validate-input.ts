/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-input.ts
 * Purpose: Pass 11 — judges each screen's focus ring and every element's
 *          events (§12) before the generator spells them as tables. The ring
 *          is exactly what the author wrote, never inferred (Q1a), so the
 *          checks here are about what the author can be told: a target or
 *          callback the build cannot emit is an error, and a ring or event that
 *          is valid but can never do anything is a warning, because it may be
 *          deliberate.
 * Description: Reported, in document order per screen, then per declared
 *              composite:
 *              - errors: the same element twice in one ring
 *                (`U8G2GL_DUPLICATE_FOCUS_ENTRY`); a trigger that is not one
 *                of the three (`U8G2GL_UNKNOWN_TRIGGER`); a
 *                `<screen_load_event>` whose screen is not in the project
 *                (`U8G2GL_UNKNOWN_SCREEN`); a callback that is not a C
 *                identifier (`U8G2GL_INVALID_CALLBACK`);
 *              - warnings: `value_changed` on an element whose input never
 *                changes its value (`U8G2GL_VALUE_CHANGED_UNREACHABLE`); a ring
 *                member with no events that is not a switch
 *                (`U8G2GL_INERT_FOCUS_STOP`); a `press` or `long_press` on an
 *                element no ring lists (`U8G2GL_PRESS_UNREACHABLE`).
 *              Checked elsewhere, and not repeated: a `<focus name>` that names
 *              no element written in the screen (Pass 2's
 *              `U8G2GL_UNKNOWN_WIDGET`), a `focus_style` naming no style
 *              (Pass 2), a callback colliding with a generated identifier
 *              (Pass 9's `U8G2GL_GENERATED_NAME_COLLISION`), and a ring member
 *              or event-carrying element that has no class (Pass 9's
 *              `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT`).
 *
 *              An element inside a composite's template is never in a ring —
 *              a ring names elements written in the screen — so its `press`
 *              and `long_press` events are always unreachable, and are reported
 *              once, at the template.
 *
 * Exports:
 * - validateInput(input): Runs Pass 11
 */

import { findClosest } from '../catalogue/edit-distance.js';
import { DIAGNOSTIC_CODES, type Diagnostic, type Severity } from '../schema/diagnostic.js';
import {
  callbackIdentifierProblem,
  EVENT_TRIGGERS,
  eventsOf,
  isEventTrigger,
  isPressTrigger,
  producesValueChanged,
} from '../schema/input-model.js';
import type { FocusRing } from '../schema/screen.js';
import type { SourceLocation } from '../schema/source-location.js';
import { isElementNode, type EventChild, type WidgetNode, type WidgetNodeChild } from '../schema/widget-node.js';
import type { ValidateInput } from './validate.js';

// diagnostic
// One Pass 11 diagnostic, located at @p loc.
function diagnostic(
  code: string,
  severity: Severity,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity,
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions !== undefined && suggestions.length > 0 ? { suggestions } : {}),
  };
}

// elementsOf
// Every element written in a view, depth first, in document order. Composite
// templates are not entered: their elements are written in the widget.
//   children — a view's or an element's children
function elementsOf(children: readonly WidgetNodeChild[]): WidgetNode[] {
  const out: WidgetNode[] = [];
  for (const child of children) {
    if (isElementNode(child)) {
      out.push(child, ...elementsOf(child.children));
    }
  }
  return out;
}

// label
// How a diagnostic names an element: its tag and, when it has one, its name.
function label(node: WidgetNode): string {
  const name = typeof node.attributes.name === 'string' ? node.attributes.name : '';
  return name === '' ? `<${node.tag}>` : `<${node.tag}> '${name}'`;
}

// nameOf
function nameOf(node: WidgetNode): string {
  return typeof node.attributes.name === 'string' ? node.attributes.name : '';
}

// checkRing
// The ring's own checks: a repeated member, and a member that does nothing.
//   ring     — the screen's focus ring
//   byName   — elements written in the screen, by name
//   chainOf  — an element's manifest chain
//   out      — collector
function checkRing(
  ring: FocusRing,
  byName: ReadonlyMap<string, WidgetNode>,
  chainOf: (node: WidgetNode) => readonly string[],
  screenName: string,
  out: Diagnostic[],
): void {
  const seen = new Set<string>();
  for (const entry of ring.entries) {
    if (entry.name === '') {
      continue; // Pass 1 reports the missing name.
    }
    if (seen.has(entry.name)) {
      out.push(
        diagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_FOCUS_ENTRY,
          'error',
          `Focus ring entry '${entry.name}' appears twice in screen '${screenName}'; each element is ` +
            'one stop in the ring (§12.2). Remove the second <focus>.',
          entry.loc,
          entry.name,
        ),
      );
      continue;
    }
    seen.add(entry.name);
    const node = byName.get(entry.name);
    if (node !== undefined && eventsOf(node).length === 0 && !producesValueChanged(chainOf(node))) {
      out.push(
        diagnostic(
          DIAGNOSTIC_CODES.INERT_FOCUS_STOP,
          'warning',
          `${label(node)} is in the focus ring of screen '${screenName}' but has no events, and a press does ` +
            'nothing to it (§12.2): focus stops on it and nothing happens. That is fine for a ' +
            'highlight-only stop shown by its focus_style; otherwise give it an event or leave it out of the ring.',
          entry.loc,
          entry.name,
        ),
      );
    }
  }
}

// checkEvent
// One event's checks: its trigger, its target screen or its callback, and
// whether its trigger can ever fire on this element.
//   event    — the event
//   node     — the element carrying it
//   inRing   — whether a ring lists the element
//   screens  — every screen name in the project
//   chain    — the element's manifest chain
//   out      — collector
function checkEvent(
  event: EventChild,
  node: WidgetNode,
  inRing: boolean,
  screens: readonly string[],
  chain: readonly string[],
  out: Diagnostic[],
): void {
  const where = event.loc ?? node.loc;

  // --- Step 1: The trigger is one of the three ---
  if (!isEventTrigger(event.trigger)) {
    out.push(
      diagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_TRIGGER,
        'error',
        `<${event.type}> on ${label(node)} has trigger '${event.trigger}', which is not one of ` +
          `${EVENT_TRIGGERS.join(', ')} (§12.3).`,
        where,
        String(event.trigger),
        findClosest(String(event.trigger), EVENT_TRIGGERS),
      ),
    );
    return;
  }

  // --- Step 2: What the action names exists and can be declared ---
  if (event.type === 'screen_load_event' && (event.screen === undefined || !screens.includes(event.screen))) {
    const target = event.screen ?? '';
    out.push(
      diagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_SCREEN,
        'error',
        target === ''
          ? `<screen_load_event> on ${label(node)} names no screen; give it screen="..." (§12.3).`
          : `<screen_load_event> on ${label(node)} loads screen '${target}', which is not in the project (§12.3).`,
        where,
        target === '' ? event.type : target,
        target === '' ? screens : findClosest(target, screens),
      ),
    );
  }
  if (event.type === 'event_cb') {
    const problem = callbackIdentifierProblem(event.callback);
    if (problem !== undefined) {
      out.push(
        diagnostic(
          DIAGNOSTIC_CODES.INVALID_CALLBACK,
          'error',
          `<event_cb> on ${label(node)}: callback '${event.callback ?? ''}' ${problem} (§12.3). ` +
            'ui.hpp declares it as void <callback>(u8g2gl_obj& target, u8g2gl_trigger_t trigger).',
          where,
          event.callback ?? event.type,
        ),
      );
    }
  }

  // --- Step 3: Whether the trigger can ever fire here ---
  if (event.trigger === 'value_changed' && !producesValueChanged(chain)) {
    out.push(
      diagnostic(
        DIAGNOSTIC_CODES.VALUE_CHANGED_UNREACHABLE,
        'warning',
        `<${event.type} trigger="value_changed"> on ${label(node)} can never fire: value_changed fires ` +
          "only when input changes an element's value, and input never changes this element's (§12.3). " +
          'Only a switch changes its value on a press.',
        where,
        'value_changed',
      ),
    );
  }
  if (isPressTrigger(event.trigger) && !inRing) {
    out.push(
      diagnostic(
        DIAGNOSTIC_CODES.PRESS_UNREACHABLE,
        'warning',
        `<${event.type} trigger="${event.trigger}"> on ${label(node)} can never fire: only the focused ` +
          'element takes a press, and no focus ring lists this one (§12.2). Add it to its screen\'s ' +
          '<focus_ring>; membership is never inferred.',
        where,
        event.trigger,
      ),
    );
  }
}

/**
 * Judges every focus ring and event (Pass 11).
 *
 * @param input Validator input.
 * @return Errors and warnings, screens first, then declared composites, each
 *         in document order. `validate()` sorts the combined result.
 */
export function validateInput(input: ValidateInput): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const screenNames = (input.screens ?? []).map((screen) => screen.name).filter((name) => name !== '');
  const chainOf = (node: WidgetNode): readonly string[] => input.manifests.get(node.tag)?.chain ?? [];

  // --- Step 1: Each screen's ring, then each element's events ---
  for (const screen of input.screens ?? []) {
    const elements = elementsOf(screen.view?.children ?? []);
    const byName = new Map<string, WidgetNode>();
    for (const node of elements) {
      const name = nameOf(node);
      if (name !== '' && !byName.has(name)) {
        byName.set(name, node);
      }
    }
    const ring = screen.view?.focusRing;
    const members = new Set((ring?.entries ?? []).map((entry) => entry.name));
    if (ring !== undefined) {
      checkRing(ring, byName, chainOf, screen.name, out);
    }
    for (const node of elements) {
      const inRing = nameOf(node) !== '' && members.has(nameOf(node));
      for (const event of eventsOf(node)) {
        checkEvent(event, node, inRing, screenNames, chainOf(node), out);
      }
    }
  }

  // --- Step 2: Events in composite templates: never in a ring ---
  for (const composite of input.manifests.declaredComposites) {
    for (const node of elementsOf(composite.view?.children ?? [])) {
      for (const event of eventsOf(node)) {
        checkEvent(event, node, false, screenNames, chainOf(node), out);
      }
    }
  }
  return out;
}
