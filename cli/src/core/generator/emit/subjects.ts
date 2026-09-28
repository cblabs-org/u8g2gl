/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/subjects.ts
 * Purpose: The subjects unit and the `ui_set_*` setters — the whole surface an
 *          application touches to drive a screen (§8). Every subject is
 *          statically allocated at exactly the size this document needs: its
 *          observer pool from the count WO8b took, and a string's buffer from
 *          its declared `max_len`. That exactness is what lets [D-21] promise
 *          that `add_observer()` cannot fail in generated code.
 * Description: Emits, per subject in declaration order: a definition of the
 *              right-sized `u8g2gl_subject_<type>_n<...>` type, and a
 *              `ui_set_<name>()` setter taking the natural C++ type. A string's
 *              initial value goes through `ui_subjects_init()` rather than a
 *              constructor, because the string template's constructor takes a
 *              `max_len` and not a value — the buffer is sized by the template
 *              argument, and `set()` is the only way in.
 *
 *              **`max_len + 1` bytes, from §8.2.** `max_len` is usable
 *              characters excluding the terminator, and the runtime template
 *              allocates `MaxLen + 1` for exactly that reason. So the declared
 *              figure is passed straight through as the template argument and
 *              the +1 is the runtime's — emitting `max_len + 1` here would
 *              double the allowance and make §18's budget untrue. §8.2 records
 *              that this ambiguity already produced one real off-by-one.
 *
 *              **The observer count is floored at 1.** A subject nothing
 *              observes counts 0 observers, and `u8g2gl_observer slots_[0]` is
 *              ill-formed in standard C++. The floor is stated in the emitted
 *              comment so the committed file explains itself.
 *
 * Exports:
 * - SUBJECTS_UNIT:           The unit's file name
 * - SUBJECTS_INIT_FUNCTION:  The function that applies string initial values
 * - subjectDeclarations():   Each subject's type and setter, for `ui.hpp`
 * - emitSubjectsUnit():      Emit `ui_subjects.cpp`
 */

import type { SubjectDecl, SubjectType } from '../../schema/globals.js';
import { SUBJECTS_INIT_FUNCTION, subjectIdentifier, subjectSetterIdentifier } from '../../resolver/index.js';
import type { SubjectObservers } from '../../realise/index.js';
import { cppStringLiteral } from './value.js';
import { declarationError, section, type EmittedUnit, type ProjectEmitInput } from './unit.js';
import type { Diagnostic } from '../../schema/diagnostic.js';

/** §13.7's subjects unit. */
export const SUBJECTS_UNIT = 'ui_subjects.cpp';

/**
 * The function that applies every string subject's initial value.
 *
 * It exists because a string subject cannot carry its initial value in a
 * constructor (see the file header), and because doing it in `ui_init()` would
 * put knowledge of the subjects into the unit that knows about screens.
 */
export { SUBJECTS_INIT_FUNCTION }; // Spelled once, in mangle.ts, which collision-checks it (PR-04 WO11b).

/**
 * The least observer capacity a subject may be generated with.
 *
 * `u8g2gl_observer slots_[N]` with `N == 0` is a zero-length array, which is a
 * GNU extension rather than standard C++ and warns under `-Wpedantic` — and the
 * runtime is held to zero warnings. A subject nothing observes is perfectly
 * legitimate (an application may set it before anything binds), so it is floored
 * rather than refused.
 */
const MINIMUM_OBSERVERS = 1;

/** How each subject type is spelled in C++ (§8.1). */
interface SubjectSpelling {
  /** The `_n` template, given the template arguments. */
  readonly template: (args: string) => string;
  /** The setter's parameter, as §8.1's "Generated Setter" column implies. */
  readonly parameter: string;
}

const SPELLINGS: Readonly<Record<SubjectType, SubjectSpelling>> = {
  int: { template: (args) => `u8g2gl_subject_int_n<${args}>`, parameter: 'int32_t value' },
  string: { template: (args) => `u8g2gl_subject_string_n<${args}>`, parameter: 'const char* value' },
  bool: { template: (args) => `u8g2gl_subject_bool_n<${args}>`, parameter: 'bool value' },
  time: { template: (args) => `u8g2gl_subject_time_n<${args}>`, parameter: 'uint32_t epoch_secs' },
};

// observersFor
// The observer capacity to generate a subject with: WO8b's count, floored.
// Never recounted here — the count is object bindings plus exactly one
// frame-dirty observer, and that arithmetic is realisation's (§13.5).
function observersFor(counted: SubjectObservers | undefined): number {
  return Math.max(counted?.observers ?? 0, MINIMUM_OBSERVERS);
}

// templateArgumentsFor
// The template arguments for one subject: `<MaxLen, N>` for a string, `<N>`
// otherwise.
//
// A string with no `max_len` takes the runtime's own default macro rather than
// the number it currently expands to: the generated file then still says "the
// default" if that default ever changes, instead of freezing today's 32.
function templateArgumentsFor(subject: SubjectDecl, observers: number): string {
  if (subject.type !== 'string') {
    return String(observers);
  }
  const maxLen = subject.maxLen === undefined ? 'U8G2GL_MAX_STRING_LEN' : String(subject.maxLen);
  return `${maxLen}, ${observers}`;
}

// initialValueFor
// A subject's constructor argument, or undefined when it has none — either
// because no default was declared, or because it is a string, whose value
// cannot go through a constructor.
//
// The declared value is checked here because **nothing else checks it**: Pass 1
// validates a subject's name and type but never its `value` against that type,
// so `<int name="n" value="lots" />` reaches emission. That is an author error,
// so it is a diagnostic rather than a thrown error.
//   subject — the declaration
//   report  — receives a diagnostic when the value does not fit the type
function initialValueFor(subject: SubjectDecl, report: (diagnostic: Diagnostic) => void): string | undefined {
  const declared = subject.default;
  if (declared === undefined || declared === '' || subject.type === 'string') {
    return undefined;
  }
  const value = declared.trim();

  if (subject.type === 'bool') {
    if (value === 'true' || value === 'false') {
      return value;
    }
    report(
      declarationError(
        `Subject '${subject.name}' is a <bool> whose value '${declared}' is neither 'true' nor 'false'.`,
        subject.loc,
        declared,
      ),
    );
    return undefined;
  }

  // `int` and `time`. A time is Unix seconds, so it is non-negative; an int is
  // signed 32-bit (§8.1). The width itself is the runtime's to hold.
  if (!/^-?\d+$/.test(value)) {
    report(
      declarationError(
        `Subject '${subject.name}' is an <${subject.type}> whose value '${declared}' is not an integer.`,
        subject.loc,
        declared,
      ),
    );
    return undefined;
  }
  if (subject.type === 'time' && value.startsWith('-')) {
    report(
      declarationError(
        `Subject '${subject.name}' is a <time> whose value '${declared}' is negative; a time is Unix ` +
          `seconds (§8.1).`,
        subject.loc,
        declared,
      ),
    );
    return undefined;
  }
  return String(Number(value));
}

/** One subject's generated declarations, for `ui.hpp` to re-declare. */
export interface SubjectDeclaration {
  readonly subject: SubjectDecl;
  /** The fully spelled type, e.g. `u8g2gl_subject_string_n<48, 2>`. */
  readonly type: string;
  /** `ui_subject_<name>`. */
  readonly identifier: string;
  /** The setter's full signature, without a trailing semicolon. */
  readonly setter: string;
  /** Observers the subject is generated with, after the floor. */
  readonly observers: number;
}

/**
 * @brief Each subject's generated type, identifier and setter signature.
 *
 * Shared with `ui.hpp` so the declaration and the definition are spelled by one
 * function: a template argument that differed between the two would be an
 * ODR violation the compiler need not diagnose.
 *
 * @param input Globals and the counted capacities.
 * @return One entry per declared subject, in declaration order (§13.9).
 */
export function subjectDeclarations(input: ProjectEmitInput): readonly SubjectDeclaration[] {
  const counted = new Map(input.capacities.subjects.map((entry) => [entry.subject.name, entry]));
  return (input.globals.subjects ?? []).map((subject) => {
    const observers = observersFor(counted.get(subject.name));
    const type = SPELLINGS[subject.type].template(templateArgumentsFor(subject, observers));
    const identifier = subjectIdentifier(subject.name);
    const setter = `void ${subjectSetterIdentifier(subject.name)}(${SPELLINGS[subject.type].parameter})`;
    return { subject, type, identifier, setter, observers };
  });
}

/**
 * @brief Emits the subjects unit (§8, §13.7).
 *
 * @param input Globals, capacities and this file's stamp.
 * @return The unit, and a diagnostic per declared value that does not fit its
 *         subject's type — the one defect only emission sees.
 */
export function emitSubjectsUnit(input: ProjectEmitInput): EmittedUnit {
  const diagnostics: Diagnostic[] = [];
  const declarations = subjectDeclarations(input);
  const counted = new Map(input.capacities.subjects.map((entry) => [entry.subject.name, entry]));

  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', ''];

  if (declarations.length === 0) {
    lines.push(section('Subjects (§8)'), '// globals.xml declares no subjects.', '');
    lines.push(`void ${SUBJECTS_INIT_FUNCTION}() {}`, '');
    return { content: lines.join('\n'), diagnostics };
  }

  // --- Step 1: Storage, sized exactly ([D-21]) ---
  lines.push(section('Subjects (§8) — storage sized from this document ([D-21])'));
  for (const declaration of declarations) {
    const { subject, type, identifier, observers } = declaration;
    const tally = counted.get(subject.name);
    const parts = [`${observers} observer${observers === 1 ? '' : 's'}`];
    if (tally !== undefined) {
      parts.push(
        `${tally.objectBindings} object binding${tally.objectBindings === 1 ? '' : 's'}`,
        tally.frameDirty ? 'one frame-dirty observer' : 'no frame-dirty observer',
      );
    }
    if (tally !== undefined && tally.observers === 0) {
      parts.push('floored from 0: a zero-length array is ill-formed');
    }
    if (subject.type === 'string') {
      const maxLen = subject.maxLen === undefined ? 'the default' : String(subject.maxLen);
      parts.push(`${maxLen} usable characters, so max_len + 1 bytes (§8.2)`);
    }
    lines.push('', `// ${subject.name}: ${parts.join('; ')}.`);

    const initial = initialValueFor(subject, (diagnostic) => diagnostics.push(diagnostic));
    lines.push(`${type} ${identifier}${initial === undefined ? '' : `(${initial})`};`);
  }

  // --- Step 2: The setters an application drives the UI through (§8.1) ---
  lines.push('', section('Setters (§8.1)'));
  for (const { subject, setter, identifier } of declarations) {
    const argument = subject.type === 'time' ? 'epoch_secs' : 'value';
    lines.push('', `${setter} {`, `    ${identifier}.set(${argument});`, '}');
  }

  // --- Step 3: Initial values a constructor cannot carry ---
  const stringInitials = declarations.filter(
    (declaration) =>
      declaration.subject.type === 'string' &&
      declaration.subject.default !== undefined &&
      declaration.subject.default !== '',
  );
  lines.push(
    '',
    section('Initial values (§8.2)'),
    '// A string subject copies into its own buffer, so its initial value is set',
    '// rather than constructed — the string template takes a capacity, not a value.',
    '',
    `void ${SUBJECTS_INIT_FUNCTION}() {`,
  );
  if (stringInitials.length === 0) {
    lines.push('    // No string subject declares an initial value.');
  }
  for (const { subject, identifier } of stringInitials) {
    lines.push(`    ${identifier}.set(${cppStringLiteral(subject.default ?? '')});`);
  }
  lines.push('}', '');

  return { content: lines.join('\n'), diagnostics };
}
