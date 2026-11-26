/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/screen-table.ts
 * Purpose: The one C++ unit a test run adds to a project's generated firmware
 *          code: the table telling the harness (wasm/harness.cpp) which
 *          screens exist and how large the panel is. An application never
 *          needs such a table, it names its screens itself, so the generator
 *          does not emit one, and the firmware code under test stays exactly
 *          what `generate` writes. The test run emits it instead, here.
 * Description: The screens and the display come from the project's scene
 *              description (`ui_scene.json`), generated from the same
 *              document in the same run as the firmware code, so the harness
 *              runs exactly the screens the live canvas can show, in the same
 *              order, at the same size. Each screen's descriptor is named by
 *              the resolver's own rule (`screenDescriptorIdentifier()`), the
 *              one the generator declares it with.
 *
 *              It also defines each `<event_cb>` callback the project names
 *              (§12.3), which an application would define itself: each
 *              records its name, target and trigger with the harness
 *              (`u8g2gl_harness_record_callback()`), so a test run reports
 *              which callbacks a scripted input reached, as the canvas does.
 *
 * Exports:
 * - SCREEN_TABLE_UNIT:     The unit's file name
 * - SceneLayout:           The screens and display a scene describes
 * - readSceneLayout():     Read them from scene JSON
 * - screenTableUnit():     The unit's C++ text
 */

import { screenDescriptorIdentifier } from '../../../core/resolver/index.js';

/** The table unit's file name, beside the generated firmware code's objects. */
export const SCREEN_TABLE_UNIT = 'u8g2gl_harness_screens.cpp';

/** The screens and panel a scene describes. */
export interface SceneLayout {
  readonly display: { readonly width: number; readonly height: number };
  /** Screen names in document order. */
  readonly screens: readonly string[];
  /** Every `<event_cb>` callback the screens name, once each, in first-use order. */
  readonly callbacks: readonly string[];
  /** Per screen, in `screens` order, each object's element name by object index. */
  readonly objects: readonly (readonly string[])[];
}

// sceneObjects
// Each object's element name by its index, for one scene screen: what turns
// an object index the harness reports back into the name the designer shows.
//   screen — one of the scene's `screens`
function sceneObjects(screen: unknown): string[] {
  const names: string[] = [];
  const elements = (screen as { elements?: unknown }).elements;
  for (const element of Array.isArray(elements) ? elements : []) {
    const { realisation, object, name } = element as { realisation?: unknown; object?: unknown; name?: unknown };
    if (realisation === 'object' && typeof object === 'number' && typeof name === 'string') {
      names[object] = name;
    }
  }
  return Array.from(names, (name) => name ?? '');
}

// sceneCallbacks
// The callbacks a scene's screens name, in first-use order: each object's
// `events`, where an `<event_cb>`'s action is `callback` (scene format 6).
//   screens — the scene's `screens`
function sceneCallbacks(screens: readonly unknown[]): string[] {
  const callbacks: string[] = [];
  for (const screen of screens) {
    const elements = (screen as { elements?: unknown }).elements;
    for (const element of Array.isArray(elements) ? elements : []) {
      const events = (element as { events?: unknown }).events;
      for (const event of Array.isArray(events) ? events : []) {
        const { action, callback } = event as { action?: unknown; callback?: unknown };
        if (action === 'callback' && typeof callback === 'string' && !callbacks.includes(callback)) {
          callbacks.push(callback);
        }
      }
    }
  }
  return callbacks;
}

/**
 * @brief The screens and display of a scene description.
 *
 * @param sceneJson `ui_scene.json`'s text.
 * @return The layout, or undefined if the text is not a scene with a sized
 *         display: the scene emitter always writes one, so undefined means
 *         the file is not what the build generated.
 */
export function readSceneLayout(sceneJson: string): SceneLayout | undefined {
  let scene: unknown;
  try {
    scene = JSON.parse(sceneJson);
  } catch {
    return undefined;
  }
  if (typeof scene !== 'object' || scene === null) {
    return undefined;
  }
  const { display, screens } = scene as { display?: { width?: unknown; height?: unknown }; screens?: unknown };
  const width = display?.width;
  const height = display?.height;
  if (typeof width !== 'number' || typeof height !== 'number' || !Array.isArray(screens)) {
    return undefined;
  }
  const names = screens.map((screen: unknown) =>
    typeof screen === 'object' && screen !== null ? (screen as { name?: unknown }).name : undefined,
  );
  if (!names.every((name): name is string => typeof name === 'string')) {
    return undefined;
  }
  return {
    display: { width, height },
    screens: names,
    callbacks: sceneCallbacks(screens as unknown[]),
    objects: (screens as unknown[]).map(sceneObjects),
  };
}

/**
 * @brief The screen table unit for a project.
 *
 * Deterministic: the same layout always gives the same text, so the unit's
 * object is reused until a screen or the display changes.
 */
export function screenTableUnit(layout: SceneLayout): string {
  // A screenless project still links: C++ has no zero-length array, so the
  // table then holds one null row the count excludes.
  const rows =
    layout.screens.length === 0
      ? ['    {nullptr, nullptr},']
      : layout.screens.map((name) => `    {${cString(name)}, &${screenDescriptorIdentifier(name)}},`);
  return [
    '// GENERATED by the u8g2gl design server for a test run: the harness\'s',
    '// screen table (wasm/harness.h). Not part of the firmware target.',
    '',
    '#include "ui.hpp"',
    '#include "harness.h"',
    '',
    'const u8g2gl_harness_screen u8g2gl_harness_screens[] = {',
    ...rows,
    '};',
    `const uint8_t u8g2gl_harness_screen_count = ${layout.screens.length};`,
    `const int32_t u8g2gl_harness_display_width = ${layout.display.width};`,
    `const int32_t u8g2gl_harness_display_height = ${layout.display.height};`,
    ...(layout.callbacks.length === 0
      ? []
      : [
          '',
          "// The project's <event_cb> callbacks, which ui.hpp declares and an",
          '// application would define: each records itself with the harness.',
          ...layout.callbacks.flatMap((callback) => [
            `void ${callback}(u8g2gl_obj& target, u8g2gl_trigger_t trigger) {`,
            `    u8g2gl_harness_record_callback(${cString(callback)}, target, trigger);`,
            '}',
          ]),
        ]),
    '',
  ].join('\n');
}

// cString
// A C string literal. Screen names are identifiers (the validator requires
// it, since each names C++ symbols), so escaping is a guard, not a feature.
function cString(text: string): string {
  return `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}
