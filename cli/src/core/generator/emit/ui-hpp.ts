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
 *              (§13.9), the `U8G2GL_PROGMEM` shim the images unit needs, every
 *              subject and its `ui_set_*` setter, the styles, fonts and images,
 *              each screen's five §13.7 functions, and the project's own
 *              entry points.
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
 * Exports:
 * - UI_HEADER:        The header's file name
 * - UI_INIT_FUNCTION: The application's entry point
 * - screenDescriptorIdentifier(): A screen's `u8g2gl_screen` descriptor name
 * - emitUiHeader():   Emit `ui.hpp`
 */

import { UI_INIT_FUNCTION, screenDescriptorIdentifier, screenFunctionIdentifier, SCREEN_FUNCTIONS } from '../../resolver/index.js';
import { GENERATED_CONFIG_HEADER } from './generated-config.js';
import { fontDeclarations } from './fonts.js';
import { imageDeclarations, PROGMEM_MACRO } from './images.js';
import { STYLES_INIT_FUNCTION, styleIdentifiers } from './styles.js';
import { SUBJECTS_INIT_FUNCTION, subjectDeclarations } from './subjects.js';
import { includeBlock, section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** §13.7's umbrella header. */
export const UI_HEADER = 'ui.hpp';

/** The one call an application makes at boot (§13.7). Defined in `ui.cpp`. */
export { UI_INIT_FUNCTION }; // Spelled once, in mangle.ts, which collision-checks it (PR-04 WO11b).

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

/**
 * @brief Emits `ui.hpp` (§13.7).
 *
 * @param input Project, globals, screens, capacities and this file's stamp.
 * @return The header. Never raises: everything it declares was checked by
 *         validation, and the units that define them report anything else.
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
    '#include <cstdint>',
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
