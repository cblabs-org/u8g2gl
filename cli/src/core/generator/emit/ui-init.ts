/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/ui-init.ts
 * Purpose: `ui.cpp` — the definition of `ui_init()`, the one call an
 *          application makes at boot (§13.7), and the home of the **frame-dirty
 *          observers** (§13.5). Those belong to the project, not to any screen:
 *          §13.5 registers one per subject that a draw call reads, not one per
 *          binding and not one per screen, because `u8g2gl_mark_dirty()` marks
 *          whichever screen is active. Putting them in a screen unit would
 *          register a subject's observer once per screen that reads it, which
 *          overruns the `_n<N>` capacity WO8b counted with exactly one.
 * Description: `ui_init()` sets the subjects' initial values, builds the styles,
 *              initialises every screen in document order, then registers the
 *              frame-dirty observers — last, like every other registration, so
 *              no observer fires against a half-built UI (§13.7).
 *
 *              Which subjects get one is **read from WO8b's capacities**
 *              (`SubjectObservers.frameDirty`), never recomputed, so the
 *              observers registered are by construction the observers counted.
 *
 * Exports:
 * - UI_INIT_UNIT:     The unit's file name
 * - emitUiInitUnit(): Emit `ui.cpp`
 */

import { screenFunctionIdentifier, subjectIdentifier } from '../../resolver/index.js';
import { STYLES_INIT_FUNCTION } from './styles.js';
import { SUBJECTS_INIT_FUNCTION } from './subjects.js';
import { UI_HEADER, UI_INIT_FUNCTION } from './ui-hpp.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** The unit defining `ui_init()`, beside the `ui.hpp` that declares it. */
export const UI_INIT_UNIT = 'ui.cpp';

/**
 * @brief Emits `ui.cpp`: `ui_init()` and the frame-dirty observers (§13.5, §13.7).
 *
 * @param input Screens in load order, the capacities and this file's stamp.
 * @return The unit. Never raises.
 */
export function emitUiInitUnit(input: ProjectEmitInput): EmittedUnit {
  const frameDirty = input.capacities.subjects.filter((subject) => subject.frameDirty);

  const lines: string[] = [
    input.stamp.trimEnd(),
    '',
    `#include "${UI_HEADER}"`,
    '',
    section('ui_init: the one call an application makes at boot (§13.7)'),
    `void ${UI_INIT_FUNCTION}() {`,
    '    // --- Step 1: Subjects take their initial values, before anything binds ---',
    '    // A binding applies the subject\'s current value when it is registered, so',
    '    // setting the values first is what makes the first frame correct.',
    `    ${SUBJECTS_INIT_FUNCTION}();`,
    '',
    '    // --- Step 2: Styles, before any object applies one (§10) ---',
    `    ${STYLES_INIT_FUNCTION}();`,
    '',
    '    // --- Step 3: Every screen, in document order (§13.7) ---',
    ...(input.screens.length === 0
      ? ['    // The project declares no screens.']
      : input.screens.map((screen) => `    ${screenFunctionIdentifier(screen.name, 'init')}();`)),
    '',
    '    // --- Step 4: One frame-dirty observer per subject a draw call reads (§13.5) ---',
    '    // A draw call reads its subject at draw time and has no object observing',
    '    // it, so without this nothing would schedule a frame when the value',
    '    // changes. One per subject, not per binding or per screen: the observer',
    "    // marks whichever screen is active. The subject's capacity counts exactly",
    '    // this one ([D-21]), so the result is not checked.',
    ...(frameDirty.length === 0
      ? ['    // No draw call reads a subject.']
      : frameDirty.map(
          (subject) =>
            `    ${subjectIdentifier(subject.subject.name)}.add_observer(nullptr, u8g2gl_frame_dirty_observer);`,
        )),
    '}',
    '',
  ];

  return { content: lines.join('\n'), diagnostics: [] };
}
