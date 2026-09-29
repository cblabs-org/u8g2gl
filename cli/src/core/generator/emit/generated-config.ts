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
 *          It also carries §16's version guard, so a stale `generated/`
 *          directory fails as one named compile error rather than as a missing
 *          symbol or, worse, not at all.
 * Description: Emits the four [D-21] capacities and
 *              `U8G2GL_REQUIRE_SCHEMA_VERSION`. The figures come from WO8b's
 *              `Capacities` — this module does not count anything, because a
 *              second count is the defect WO8c spent a whole work order
 *              removing.
 *
 *              **Reaching the library's own compilation (WO4 F5).** The pools
 *              are sized inside `src/u8g2gl_obj.cpp`, which is compiled as part
 *              of the library and never includes this header — so a project that
 *              only included it from generated units would link against the
 *              *defaults*, [D-21] would silently not happen, and §18's report
 *              would be false. The integration that fixes it is a **forced
 *              include** of this same header into every translation unit that
 *              reads a capacity, documented in the emitted file itself for
 *              CMake, ESP-IDF and PlatformIO. WO10's compile layer proves it.
 *
 *              A forced include rather than a second file of `-D` definitions:
 *              a define list would spell the four capacities a second time, and
 *              two spellings of one number is exactly the drift this programme
 *              keeps paying for — WO8c spent a work order removing a second
 *              object count. It also keeps every generated file recognisable by
 *              the GENERATED marker the writer uses to clean up stale output,
 *              which a CMake fragment (whose comments are `#`) could not carry.
 *
 * Exports:
 * - GENERATED_CONFIG_HEADER: The header's file name
 * - emitGeneratedConfigHeader(): Emit `u8g2gl_generated_config.h`
 */

import { declarationError, section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** §13.7's generated capacity header ([D-21]). */
export const GENERATED_CONFIG_HEADER = 'u8g2gl_generated_config.h';

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
 * @return The header, and a diagnostic if the project's schema version cannot be
 *         split into the major and minor the guard needs.
 */
export function emitGeneratedConfigHeader(input: ProjectEmitInput): EmittedUnit {
  const { capacities, project } = input;
  const guard = 'U8G2GL_GENERATED_CONFIG_H';

  // --- Step 1: The schema version the guard asserts ---
  // Taken from the document rather than from a constant of our own: the guard's
  // whole job is to compare what this code was generated *for* against what the
  // runtime implements, so a hardcoded version would assert nothing.
  const version = /^(\d+)\.(\d+)$/.exec(project.schema.trim());
  if (version === null) {
    return {
      content: '',
      diagnostics: [
        declarationError(
          `Schema version '${project.schema}' is not 'major.minor', so the generated version guard ` +
            `cannot be emitted (§16). Pass 1 reports the version itself.`,
          project.loc,
          project.schema,
        ),
      ],
    };
  }
  const [, major, minor] = version;

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
    '// and the budget in section 18 would be false. Force this header into every',
    '// translation unit that reads a capacity:',
    '//',
    '//   CMake / ESP-IDF',
    '//     target_compile_options(u8g2gl PUBLIC',
    '//         -include ${CMAKE_CURRENT_LIST_DIR}/generated/u8g2gl_generated_config.h)',
    '//',
    '//   PlatformIO (platformio.ini)',
    '//     build_flags = -include generated/u8g2gl_generated_config.h',
    '//',
    '// A forced include rather than a second file of -D definitions: a define list',
    '// would spell these four numbers a second time, and two spellings of one',
    '// number is how they come to disagree.',
    '',
    '#include "u8g2gl/u8g2gl_version.h"',
    '',
    section('Version guard (§16)'),
    '// Refuses to compile against a runtime implementing a different schema. The',
    '// minor is compared too while the major is 0, because before 1.0 breaking',
    '// changes land in minor bumps (§15.4).',
    `U8G2GL_REQUIRE_SCHEMA_VERSION(${major}, ${minor});`,
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
        `#define ${macro} 1`,
      );
      continue;
    }
    lines.push(`#define ${macro} ${value}`);
  }

  lines.push('', `#endif // ${guard}`, '');
  return { content: lines.join('\n'), diagnostics: [] };
}

