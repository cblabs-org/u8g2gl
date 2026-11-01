/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/generated-config.ts
 * Purpose: `u8g2gl_generated_config.h` — [D-21]'s whole point made real. The
 *          runtime's pools are fixed at compile time and cannot grow, and
 *          `u8g2gl_config.h`'s defaults were sized by guesswork that [D-20] and
 *          [D-18] invalidated. This header replaces the guess with arithmetic
 *          over the document being compiled, so exceeding a capacity stops being
 *          a screen that boots and silently fails to update one widget.
 *
 *          It also carries §16's two version guards, so a stale `generated/`
 *          directory fails as one named compile error rather than as a missing
 *          symbol or, worse, not at all: the schema this generator wrote for,
 *          which must match, and the runtime, which must be at least the one
 *          this CLI was built beside.
 * Description: Emits the four [D-21] capacities,
 *              `U8G2GL_REQUIRE_SCHEMA_VERSION`, and
 *              `U8G2GL_REQUIRE_RUNTIME_VERSION` behind an `#ifndef` that names
 *              the floor for a runtime too old to define it. The figures come from the
 *              `Capacities` counted in `src/core/realise/capacities.ts` — this module does not count anything, because a
 *              second count is the defect WO8c spent a whole work order
 *              removing.
 *
 *              **Reaching the library's own compilation (§16).** The pools are
 *              sized inside `src/u8g2gl_obj.cpp`, which is compiled as part of
 *              the library and never includes this header directly — so a
 *              project that only included it from generated units would link
 *              against the *defaults*, [D-21] would silently not happen, and
 *              §18's report would be false. The project names this header in
 *              `U8G2GL_GENERATED_CONFIG`, defined project-wide, and the runtime's
 *              `u8g2gl_config.h` includes it ahead of its defaults. Only runtime
 *              sources and generated code include `u8g2gl_config.h`, so the
 *              definition is inert everywhere else. The emitted file documents
 *              the definition for CMake, ESP-IDF and PlatformIO, in the forms
 *              built by the C++ suite's compile fixture and on an esp32dev
 *              Arduino build.
 *
 *              Not a forced `-include` of the header: on a real multi-library
 *              esp32dev build it reached every unrelated library, and stopped
 *              the build in the first one with
 *              `u8g2gl/u8g2gl_version.h: No such file or directory`; it would
 *              also reach C units, where `static_assert` is not a keyword before
 *              C23. And not a second file of `-D` capacities: a define list
 *              would spell the four numbers a second time, and two spellings of
 *              one number is how they come to disagree. One header also keeps
 *              every generated file recognisable by the GENERATED marker the
 *              writer uses to clean up stale output, which a CMake fragment
 *              (whose comments are `#`) could not carry.
 *
 * Exports:
 * - GENERATED_CONFIG_HEADER: The header's file name
 * - GENERATED_CONFIG_MACRO: The macro a project names the header in (§16)
 * - emittedBindingPoolSlots(): The `U8G2GL_MAX_TOTAL_BINDINGS` the header defines
 * - emitGeneratedConfigHeader(): Emit `u8g2gl_generated_config.h`
 */

import { RUNTIME_VERSION } from '../../../data/runtime-version.js';
import { CURRENT_SCHEMA } from '../../schema/schema-version.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** §13.7's generated capacity header ([D-21]). */
export const GENERATED_CONFIG_HEADER = 'u8g2gl_generated_config.h';

/**
 * The macro a project defines to the header's quoted name, which the runtime's
 * `u8g2gl_config.h` includes ahead of its defaults (§16).
 */
export const GENERATED_CONFIG_MACRO = 'U8G2GL_GENERATED_CONFIG';

/**
 * @brief The binding pool size the header defines, which is not always the count.
 *
 * A document with no bindings counts 0, but the header floors the pool at 1: a
 * zero-length array is ill-formed in standard C++. Shared with §18's budget so
 * the slot count it states is the one the firmware is built with.
 *
 * @param totalBindings The counted total, `Capacities.totalBindings`.
 * @return The value emitted for `U8G2GL_MAX_TOTAL_BINDINGS`.
 */
export function emittedBindingPoolSlots(totalBindings: number): number {
  return totalBindings === 0 ? 1 : totalBindings;
}

/**
 * The capacity macros, in the order [D-21] lists them, each with the figure it
 * takes from {@link Capacities} and whether a zero would be ill-formed in C++.
 *
 * `sizesAnArray` is the reason a floor exists: `U8G2GL_MAX_TOTAL_BINDINGS` sizes
 * `s_binding_pool[]` in `src/u8g2gl_obj.cpp`, and a zero-length array is
 * ill-formed in standard C++ — it would warn under `-Wpedantic`, which the
 * runtime builds with and holds at zero warnings. The other three are compared
 * against rather than used as an extent, so an honest zero is emitted for them.
 */
interface CapacityMacro {
  readonly macro: string;
  readonly value: number;
  readonly sizesAnArray: boolean;
  /** How the figure was arrived at, for the reader of the committed file. */
  readonly note: string;
}

/**
 * @brief Emits `u8g2gl_generated_config.h` ([D-21], §13.7, §16).
 *
 * @param input Project, capacities and this file's stamp.
 * @return The header. It never raises a diagnostic: the guard asserts the
 *         generator's own schema, so nothing in the document can stop it.
 */
export function emitGeneratedConfigHeader(input: ProjectEmitInput): EmittedUnit {
  const { capacities } = input;
  const guard = 'U8G2GL_GENERATED_CONFIG_H';

  // --- Step 1: The schema version the guard asserts ---
  // The schema this generator wrote for (rules/03-versioning.md), not the one
  // the project declares. Every version the validator accepts is the current
  // schema or an older minor of it, which 0.5's additive bump makes a subset,
  // so the code emitted here is code for the current schema whatever the
  // document says. Asserting the declared version instead made an accepted
  // 0.4 project generate code the 0.5 runtime refused: an additive bump turned
  // into a break. The declared version stays in each file's `// schema` stamp.
  const { major, minor } = CURRENT_SCHEMA;

  // The runtime floor: the version of the runtime this CLI was built beside,
  // stamped from the header (src/data/runtime-version.ts). Not an option, and
  // not the CLI's own version, which is independent of the runtime's (§16).
  const floor = `${RUNTIME_VERSION.major}.${RUNTIME_VERSION.minor}`;

  // --- Step 2: The four [D-21] capacities, as counted by WO8b ---
  // `busiestScreen` and `busiestObject` are mangled names (§13.4) — what the
  // author wrote in the XML, not the C++ variables emission declares, which
  // carry the `ui_obj_` prefix (emit/screen.ts's objectIdentifier()). The note
  // is emitted verbatim, so a reader who greps the generated .cpp for the name
  // alone will not find the declaration. Changing the emitted wording changes
  // generated bytes, so it is recorded as a PR-04 WO13 finding rather than
  // done here.
  const macros: readonly CapacityMacro[] = [
    {
      macro: 'U8G2GL_MAX_OBJECTS_PER_SCREEN',
      value: capacities.maxObjectsPerScreen,
      sizesAnArray: false,
      note:
        capacities.busiestScreen === undefined
          ? 'the project declares no screens'
          : `the busiest screen is '${capacities.busiestScreen}'`,
    },
    {
      macro: 'U8G2GL_MAX_BINDINGS_PER_OBJ',
      value: capacities.maxBindingsPerObject,
      sizesAnArray: false,
      note:
        capacities.busiestObject === undefined
          ? 'no object binds a subject'
          : `the busiest object is '${capacities.busiestObject}'`,
    },
    {
      macro: 'U8G2GL_MAX_TOTAL_BINDINGS',
      value: capacities.totalBindings,
      sizesAnArray: true,
      note: 'the true sum across every object, never objects x bindings ([D-21])',
    },
    {
      macro: 'U8G2GL_MAX_STYLES',
      value: capacities.styles,
      sizesAnArray: false,
      note:
        capacities.styleNames.length === 0
          ? 'the project declares no styles'
          : `distinct styles: ${capacities.styleNames.join(', ')}`,
    },
  ];

  const lines: string[] = [
    input.stamp.trimEnd(),
    '',
    `#ifndef ${guard}`,
    `#define ${guard}`,
    '',
    '// Reaching the runtime library as well as the generated units (§16).',
    '//',
    '// The binding pool is sized inside src/u8g2gl_obj.cpp, which is compiled as',
    '// part of the library and never includes this header. A project that included',
    '// it only from generated code would leave the library built with the defaults',
    '// in u8g2gl_config.h, so the capacities below would silently not take effect',
    '// and the budget in section 18 would be false. Name this header in',
    '// U8G2GL_GENERATED_CONFIG, project-wide, and u8g2gl_config.h includes it',
    '// wherever a capacity is read. Units that never include the runtime ignore it.',
    '//',
    '//   CMake / ESP-IDF',
    '//     target_compile_definitions(u8g2gl PUBLIC',
    '//         U8G2GL_GENERATED_CONFIG="${CMAKE_CURRENT_LIST_DIR}/generated/u8g2gl_generated_config.h")',
    '//',
    '//   PlatformIO (platformio.ini; -I is relative to the project directory)',
    '//     build_flags =',
    '//         -I generated',
    '//         -D U8G2GL_GENERATED_CONFIG=\\"u8g2gl_generated_config.h\\"',
    '//',
    '// Not a forced -include of this header: that reaches every unit in the build,',
    '// and fails in the first library that cannot find u8g2gl/u8g2gl_version.h.',
    '// Not a second file of -D capacities: that would spell these four numbers a',
    '// second time, and two spellings of one number is how they come to disagree.',
    '',
    '#include "u8g2gl/u8g2gl_version.h"',
    '',
    section('Version guard (§16)'),
    '// Refuses to compile against a runtime implementing a different schema. The',
    '// minor is compared too while the major is 0, because before 1.0 breaking',
    '// changes land in minor bumps (§15.4).',
    `U8G2GL_REQUIRE_SCHEMA_VERSION(${major}, ${minor});`,
    '',
    '// Refuses to compile against a runtime older than the one this generator was',
    '// built beside (§16). A floor, not an equality: a newer runtime minor is fine.',
    '// A runtime that predates the check does not define the macro, and would',
    '// report a syntax error instead of a refusal, so say what is needed here.',
    '// The call sits in the #else, so a runtime without the macro reports only this #error.',
    '#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION',
    `#error "This code requires u8g2gl runtime ${floor} or newer, but the runtime in use predates the runtime version check. Update the u8g2gl runtime library, or regenerate with a u8g2gl CLI matching the runtime."`,
    '#else',
    `U8G2GL_REQUIRE_RUNTIME_VERSION(${RUNTIME_VERSION.major}, ${RUNTIME_VERSION.minor});`,
    '#endif',
    '',
    section('Static capacities, counted from this document ([D-21])'),
    '// Every value is exact, so add_binding() cannot fail in generated code: the',
    '// pool was sized from the very bindings being added ([D-21] decision 4).',
    "// u8g2gl_config.h's #ifndef defaults then apply only to what is not set here,",
    '// which is why this header must be included first (§13.7).',
  ];

  for (const { macro, value, sizesAnArray, note } of macros) {
    // Capitalised at the point of emission rather than in each note, so the
    // notes read as fragments in the source and as sentences in the output —
    // which is what a human reviewing the committed file sees ([D-11]).
    lines.push('', `// ${note.charAt(0).toUpperCase()}${note.slice(1)}.`);
    if (sizesAnArray && value === 0) {
      // Said in the output, not just in the report: a reader comparing this
      // header against the §18 budget would otherwise find a figure that
      // disagrees with the document, and §1.3 forbids leaving that unexplained.
      lines.push(
        '// The document declares no bindings. The pool is floored at 1 rather than 0',
        '// because a zero-length array is ill-formed in standard C++ and would warn',
        '// under -Wpedantic; the budget still reports the true figure, 0.',
        `#define ${macro} ${emittedBindingPoolSlots(value)}`,
      );
      continue;
    }
    lines.push(`#define ${macro} ${value}`);
  }

  lines.push('', `#endif // ${guard}`, '');
  return { content: lines.join('\n'), diagnostics: [] };
}

