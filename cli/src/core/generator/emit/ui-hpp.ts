/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/ui-hpp.ts
 * Purpose: `ui.hpp` — the umbrella header §13.7 requires, and the only file an
 *          application needs to include to drive a generated UI. It is also
 *          where [D-21]'s inclusion order is enforced: the generated capacities
 *          must be seen **before** any runtime header, because
 *          `u8g2gl_config.h`'s `#ifndef` defaults win whichever is seen first.
 *          Get that order wrong and the capacities are silently ignored — the
 *          failure mode [D-21] exists to remove.
 * Description: Declares, in a fixed order: the generated capacities (by
 *              including them first), the runtime headers with sorted includes
 *              (§13.9), the `U8G2GL_PROGMEM` shim the images unit needs, the
 *              display contract, every subject and its `ui_set_*` setter, the
 *              styles, fonts and images, the classes the handles refer to,
 *              each screen's five §13.7 functions with its descriptor, its
 *              named objects' handles and its collections' facades, and the
 *              project's own entry points.
 *
 *              **The display contract** (design_spec §16) is here because this
 *              is the one file an application includes, and not in
 *              `u8g2gl_generated_config.h`, which the runtime library's own
 *              build also includes: the runtime's sizing must not depend on
 *              which target was built. It states the panel the layout was
 *              resolved against — the oriented size, the rotation to construct
 *              with and the setup — and `ui_display_matches()` (defined in
 *              `ui.cpp`) checks a constructed display against it. The board
 *              owns construction and wiring; U8G2GL states only what its layout
 *              depends on.
 *
 *              Declarations are spelled by the same functions that emit the
 *              definitions — `subjectDeclarations()`, `styleIdentifiers()`,
 *              `fontDeclarations()`, `imageDeclarations()` — so a template
 *              argument or a type can never differ between a declaration here
 *              and its definition in the unit, which would be an ODR violation
 *              no compiler is obliged to diagnose.
 *
 *              **`ui_init()` is declared here and defined in `ui.cpp`**
 *              (`ui-init.ts`, PR-04 WO10), the unit that knows every screen it
 *              has to initialise and registers the frame-dirty observers.
 *
 *              Each screen's `u8g2gl_screen` descriptor is declared beside its
 *              five functions, because it is what an application hands to
 *              `u8g2gl_set_active_screen()` — without the declaration a screen
 *              could be initialised but never shown.
 *
 *              **A project with input (§12)** — a focus ring, or an event on
 *              any element — also gets `ui_dispatch()`, defined in `ui.cpp`,
 *              and a declaration of each `<event_cb>` callback, once each,
 *              which the application defines: a missing definition is a link
 *              error naming it (§12.3). A project with neither gets none
 *              of it, so it regenerates exactly as before input existed.
 *
 *              **Each named object gets a handle** beside its screen's
 *              functions (§9.2): `extern wd_service_list& ui_departures_services;`,
 *              a reference the screen's unit binds to its `static` object, so
 *              an application can reach the object without the object itself
 *              leaving its unit. Its class is forward-declared, never included:
 *              a reference to an incomplete type is a complete declaration, and
 *              this header still pulls in no widget (below). Code that calls
 *              through a handle includes the widget's header itself.
 *
 *              **Each collection gets a facade** beside its screen (§9.2,
 *              `facades.ts`): a `const` object whose `begin()`, typed
 *              `add_row()` and `commit()` forward to the widget's own, so an
 *              application fills `services` without including its class.
 *
 * Exports:
 * - UI_HEADER:        The header's file name
 * - UI_INIT_FUNCTION: The application's entry point
 * - UI_DISPLAY_MATCHES_FUNCTION: The board's check against the display contract
 * - TARGET_WIDTH_MACRO, TARGET_HEIGHT_MACRO, TARGET_ROTATION_MACRO,
 *   TARGET_SETUP_MACRO: The display contract's macro names
 * - contractOf():     The contract a unit states, or a thrown programmer error
 * - screenDescriptorIdentifier(): A screen's `u8g2gl_screen` descriptor name
 * - emitUiHeader():   Emit `ui.hpp`
 */

import {
  UI_DISPLAY_MATCHES_FUNCTION,
  UI_INIT_FUNCTION,
  screenDescriptorIdentifier,
  screenFunctionIdentifier,
  SCREEN_FUNCTIONS,
} from '../../resolver/index.js';
import { GENERATED_CONFIG_HEADER } from './generated-config.js';
import { fontDeclarations } from './fonts.js';
import { imageDeclarations, PROGMEM_MACRO } from './images.js';
import { STYLES_INIT_FUNCTION, styleIdentifiers } from './styles.js';
import { SUBJECTS_INIT_FUNCTION, subjectDeclarations } from './subjects.js';
import { includeBlock, section, type DisplayContract, type EmittedUnit, type ProjectEmitInput } from './unit.js';
import { elementHandles, projectInputOf, type ElementHandle } from './screen-model.js';
import { UI_DISPATCH_FUNCTION } from '../../schema/input-model.js';
import { FACADE_HEADERS, facadeDeclaration, facadeOf } from './facades.js';
import { compareCodeUnits } from '../../order.js';

/** §13.7's umbrella header. */
export const UI_HEADER = 'ui.hpp';

/** The one call an application makes at boot (§13.7). Defined in `ui.cpp`. */
export { UI_INIT_FUNCTION }; // Spelled once, in mangle.ts, which collision-checks it (PR-04 WO11b).

/** The board's check against the display contract (§16). Defined in `ui.cpp`. */
export { UI_DISPLAY_MATCHES_FUNCTION }; // Spelled once, in mangle.ts, beside ui_init.

/** The display contract's macros (design_spec §16). */
export const TARGET_WIDTH_MACRO = 'U8G2GL_TARGET_WIDTH';
export const TARGET_HEIGHT_MACRO = 'U8G2GL_TARGET_HEIGHT';
export const TARGET_ROTATION_MACRO = 'U8G2GL_TARGET_ROTATION';
export const TARGET_SETUP_MACRO = 'U8G2GL_TARGET_SETUP';

/**
 * @brief The display contract a unit must state.
 *
 * @param input The unit's input.
 * @return Its contract.
 * @throws Error when the input has none: `generate` refuses a target with no
 *         catalogue record before emission (Pass 3's U8G2GL_UNKNOWN_DISPLAY, or
 *         a missing `setup`), so reaching here without one is a broken
 *         pipeline. Emitting the macros with no value instead would compile
 *         into a firmware whose check means nothing.
 */
export function contractOf(input: ProjectEmitInput): DisplayContract {
  if (input.contract === undefined) {
    throw new Error('ui.hpp and ui.cpp state the display contract, and were emitted without one.');
  }
  return input.contract;
}

// contractLines
// The display contract's macros and the check's declaration, as `ui.hpp`
// states them. The rotation is spelled as U8G2's own `U8G2_Rn` macro, so it is
// usable only where U8g2lib.h is included — at the board's constructor, which
// includes it anyway — and this header adds no include for it.
//   contract — the target's setup and oriented display
function contractLines(contract: DisplayContract): readonly string[] {
  const { display, setup } = contract;
  return [
    section('Display contract (design_spec §16)'),
    '// The panel this layout was resolved against. The board constructs the',
    '// display; these say what it must construct. Not #ifndef-guarded: a',
    '// contract that could be overridden would check nothing.',
    '',
    '// Width after rotation: what getDisplayWidth() returns once constructed.',
    `#define ${TARGET_WIDTH_MACRO} ${display.width}`,
    '// Height after rotation: what getDisplayHeight() returns once constructed.',
    `#define ${TARGET_HEIGHT_MACRO} ${display.height}`,
    "// The rotation to pass to the U8G2 constructor (U8G2's own macro, from U8g2lib.h).",
    `#define ${TARGET_ROTATION_MACRO} U8G2_${display.rotation}`,
    '// For diagnostics only, never compared: the bus is part of the name.',
    `#define ${TARGET_SETUP_MACRO} "${setup}"`,
    '',
    '/**',
    ' * @brief Whether a constructed display is the one this UI was laid out for.',
    ' *',
    ` * Compares the display's own width and height, after the rotation it was`,
    ` * constructed with, against ${TARGET_WIDTH_MACRO} and ${TARGET_HEIGHT_MACRO}. Call it`,
    ' * after begin(). It catches the wrong panel size and the wrong rotation; it',
    ' * cannot catch a same-size panel on a different controller.',
    ' *',
    " * @param display The board's constructed display.",
    ' * @return true when the sizes match. Allocates and logs nothing: what to do',
    " *         on a mismatch is the firmware's decision.",
    ' */',
    `bool ${UI_DISPLAY_MATCHES_FUNCTION}(U8G2& display);`,
  ];
}

/**
 * The runtime headers `ui.hpp` needs for the declarations it makes: the screen
 * descriptor and render signature, the style struct, and the subject templates.
 *
 * Widget classes are deliberately absent — a `u8g2gl_label` is declared in the
 * screen unit that owns it (WO10), so a project's umbrella header does not pull
 * in every widget in the framework.
 */
const RUNTIME_HEADERS: readonly string[] = [
  '#include "u8g2gl/u8g2gl_core.h"',
  '#include "u8g2gl/u8g2gl_style.h"',
  '#include "u8g2gl/u8g2gl_subject.h"',
];

/**
 * `ui_screen_home` — a screen's `u8g2gl_screen` descriptor, which an application
 * hands to `u8g2gl_set_active_screen()` (§12.4). Declared here and defined by
 * the screen's own unit (`screen.ts`). Spelled by `mangle.ts`, which also
 * collision-checks it (PR-04 WO11b); re-exported so this module's callers are
 * unchanged.
 */
export { screenDescriptorIdentifier };

/** The five functions §13.7 emits per screen, and what each returns and takes. */
const SCREEN_SIGNATURES: Readonly<Record<string, { readonly returns: string; readonly params: string }>> = {
  init: { returns: 'void', params: '' },
  activate: { returns: 'void', params: '' },
  deactivate: { returns: 'void', params: '' },
  tick: { returns: 'uint32_t', params: 'uint32_t now_ms' },
  render: { returns: 'void', params: 'U8G2& display' },
};

// handlesByScreen
// Each screen's handles, from the realisation emission was handed; none when
// it was handed none (the editor target's project units).
//   input — the unit's input
function handlesByScreen(input: ProjectEmitInput): Map<ProjectEmitInput['screens'][number], readonly ElementHandle[]> {
  const byScreen = new Map<ProjectEmitInput['screens'][number], readonly ElementHandle[]>();
  for (const realised of input.realised ?? []) {
    byScreen.set(realised.screen, elementHandles(realised, input.manifests));
  }
  return byScreen;
}

/**
 * @brief Emits `ui.hpp` (§13.7).
 *
 * @param input Project, globals, screens, capacities, the display contract and
 *              this file's stamp.
 * @return The header. Never raises a diagnostic: everything it declares was
 *         checked by validation, and the units that define them report
 *         anything else.
 * @throws Error when the input carries no display contract ({@link contractOf}).
 */
export function emitUiHeader(input: ProjectEmitInput): EmittedUnit {
  const guard = 'UI_HPP';
  const subjects = subjectDeclarations(input);
  const styles = styleIdentifiers(input);
  const fonts = fontDeclarations(input);
  const images = imageDeclarations(input);

  const lines: string[] = [
    input.stamp.trimEnd(),
    '',
    `#ifndef ${guard}`,
    `#define ${guard}`,
    '',
    section('Generated capacities, first ([D-21], §13.7)'),
    '// Before any runtime header: u8g2gl_config.h guards every capacity with',
    '// #ifndef, so whichever is seen first wins. Included the other way round,',
    '// the defaults would be defined first and these values silently ignored.',
    `#include "${GENERATED_CONFIG_HEADER}"`,
    '',
    section('Runtime (§13.7)'),
    // The facades' signatures need size_t and initializer_list (§9.2).
    includeBlock(['#include <cstdint>', ...(input.capacities.collections.length > 0 ? FACADE_HEADERS : [])]),
    '',
    includeBlock(RUNTIME_HEADERS),
    '',
    section('Flash storage (§14.2)'),
    '// PROGMEM exists only on AVR, and this runtime also builds for 32-bit',
    '// targets, the host test suite and Wasm ([D-9]), so the attribute is named',
    '// through a macro that is empty wherever PROGMEM is not provided.',
    `#ifndef ${PROGMEM_MACRO}`,
    '#if defined(PROGMEM)',
    `#define ${PROGMEM_MACRO} PROGMEM`,
    '#else',
    `#define ${PROGMEM_MACRO}`,
    '#endif',
    '#endif',
    '',
    ...contractLines(contractOf(input)),
  ];

  // --- Subjects, and the setters an application drives them through (§8) ---
  lines.push('', section('Subjects (§8)'));
  if (subjects.length === 0) {
    lines.push('// globals.xml declares no subjects.');
  }
  for (const { subject, type, identifier, setter } of subjects) {
    lines.push('', `// ${subject.name} (${subject.type})`, `extern ${type} ${identifier};`, `${setter};`);
  }

  // --- Styles (§10) ---
  lines.push('', section('Styles (§10)'));
  if (styles.length === 0) {
    lines.push('// The project declares no styles.');
  }
  for (const { identifier } of styles) {
    lines.push(`extern u8g2gl_style ${identifier};`);
  }

  // --- Fonts (§14.1) ---
  lines.push('', section('Fonts (§14.1)'));
  if (fonts.length === 0) {
    lines.push('// globals.xml declares no <builtin> fonts.');
  }
  for (const { identifier } of fonts) {
    lines.push(`extern const uint8_t* const ${identifier};`);
  }

  // --- Images (§14.2) ---
  // `extern` first, deliberately: a `const` array at namespace scope has
  // internal linkage by default in C++, so without this declaration the
  // definition in the images unit would be invisible to every other unit.
  lines.push('', section('Images (§14.2)'));
  if (images.length === 0) {
    lines.push('// globals.xml declares no <xbm> images.');
  }
  for (const { identifier } of images) {
    lines.push(`extern const uint8_t ${identifier}[];`);
  }

  // --- The classes the handles below refer to, declared but not included (§9.2) ---
  const handles = handlesByScreen(input);
  const classes = [...new Set([...handles.values()].flat().map((handle) => handle.className))].sort(compareCodeUnits);
  if (classes.length > 0) {
    lines.push(
      '',
      section('Element classes, for the handles below (§9.2)'),
      "// Declared, not included: a handle is a reference, which needs no complete",
      "// type. To call through one, include the class's own header.",
      ...classes.map((name) => `class ${name};`),
    );
  }

  // --- Screens (§13.7) ---
  lines.push('', section('Screens (§13.7)'));
  if (input.screens.length === 0) {
    lines.push('// The project declares no screens.');
  }
  for (const screen of input.screens) {
    lines.push('', `// screen '${screen.name}'`);
    for (const fn of SCREEN_FUNCTIONS) {
      const signature = SCREEN_SIGNATURES[fn];
      if (signature === undefined) {
        continue;
      }
      lines.push(
        `${signature.returns} ${screenFunctionIdentifier(screen.name, fn)}(${signature.params});`,
      );
    }
    lines.push(`extern u8g2gl_screen ${screenDescriptorIdentifier(screen.name)};`);
    const own = handles.get(screen) ?? [];
    if (own.length > 0) {
      lines.push(`// Its named objects (§9.2), each bound to its static in ui_screen_${screen.name}.cpp:`);
      lines.push(...own.map((handle) => `extern ${handle.className}& ${handle.identifier};`));
    }
    // Its collections' facades (§9.2), defined in its unit beside the widgets.
    for (const storage of input.capacities.collections.filter((block) => block.screen === screen.name)) {
      lines.push(...facadeDeclaration(facadeOf(storage)));
    }
  }

  // --- Input (§12), only for a project that has a ring or an event ---
  const projectInput = projectInputOf(input.realised);
  if (projectInput.hasInput) {
    lines.push(
      '',
      section('Input (§12)'),
      '/**',
      ' * @brief Deliver one input event to the active screen (§12.1).',
      ' *',
      ' * The application reads its own buttons or encoder, debounces them and',
      ' * times long presses; this moves focus or fires the focused element\'s',
      ' * events. Synchronous, and allocates nothing.',
      ' *',
      ' * @param event The event.',
      ' * @return true if it moved focus or reached a focused element.',
      ' */',
      `bool ${UI_DISPATCH_FUNCTION}(u8g2gl_event_t event);`,
    );
    if (projectInput.callbacks.length > 0) {
      lines.push(
        '',
        '// The <event_cb> callbacks (§12.3). The application defines each one; a',
        '// missing definition is a link error naming it. One may serve many',
        '// elements: the target and trigger say which fired it.',
        ...projectInput.callbacks.map((callback) => `void ${callback}(u8g2gl_obj& target, u8g2gl_trigger_t trigger);`),
      );
    }
  }

  // --- The project's own entry points ---
  lines.push(
    '',
    section('Project (§13.7)'),
    '// init is ordered: construct, set properties, apply styles, then register',
    '// bindings last, so no observer fires against a partly configured object.',
    `void ${SUBJECTS_INIT_FUNCTION}();`,
    `void ${STYLES_INIT_FUNCTION}();`,
    `void ${UI_INIT_FUNCTION}();`,
    '',
    `#endif // ${guard}`,
    '',
  );

  return { content: lines.join('\n'), diagnostics: [] };
}
