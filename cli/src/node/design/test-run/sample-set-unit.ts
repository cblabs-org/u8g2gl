/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/sample-set-unit.ts
 * Purpose: Lets a test run check the firmware against every sample set, not
 *          only against the initial values (ruling 9, Q1a). The harness boots
 *          the generated firmware code unmodified, so a set must be applied to
 *          it the way an application would apply live data: through the public
 *          subject setters, and through each collection's generated facade
 *          (§9.2), which forwards to the widget's own `begin()`, declared
 *          access method per row, and `commit()`. This
 *          module writes the one C++ unit that does that, a function per set,
 *          beside the screen table (screen-table.ts).
 * Description: The designer sends each set as it applies it to the canvas —
 *              its checked values, and its rows by screen name, element and
 *              data name — so both halves of the check are given the same
 *              data, and fill it by different routes: the editor through its
 *              registry's fill thunk, the firmware through the generated
 *              collection facade an application uses (design_spec §9.2),
 *              `ui_<screen>_<element>_<data>`: its `begin()`, typed
 *              `add_row()` per row and `commit()`, which forward to the
 *              widget's own methods. The facade is named, not indexed, so
 *              there is no object index to drift from the generated table.
 *
 *              The unit also defines `u8g2gl_harness_apply_sample_set()`,
 *              which the harness calls once after `ui_init()` and before the
 *              first frame, and the exports that choose the set. With no set
 *              selected it does nothing, so a run without sets is exactly what
 *              it was before sets existed. Deterministic: the same sets and
 *              project always give the same text, so its object is reused.
 *
 * Exports:
 * - SAMPLE_SET_UNIT:         The unit's file name
 * - SAMPLE_SET_EXPORTS:      The functions it adds to the harness's exports
 * - MAX_SAMPLE_SETS:         The most sets one run takes
 * - TestRunSampleSet:        One set, as the designer sends it
 * - SampleStage:             What the unit is written against
 * - parseTestRunSampleSets(): Validate a request's sets
 * - readSampleStage():       The stage, from the project and its scene
 * - sampleSetUnit():         The unit's C++ text, or why it cannot be written
 */

import type { ManifestRegistry } from '../../../core/manifest/manifest-registry.js';
import { collectionFacadeIdentifiers } from '../../../core/realise/index.js';
import { subjectSetterIdentifier } from '../../../core/resolver/index.js';
import type { SubjectType } from '../../../core/schema/globals.js';
import { loadProject } from '../../load-project.js';

/** The unit's file name, beside the screen table. */
export const SAMPLE_SET_UNIT = 'u8g2gl_harness_samples.cpp';

/** The harness exports the unit defines, as the link's export list names them. */
export const SAMPLE_SET_EXPORTS: readonly string[] = ['_getSampleSetCount', '_getSampleSetName', '_selectSampleSet'];

/** The most sets one run takes: each costs a harness boot per screen. */
export const MAX_SAMPLE_SETS = 32;

/** A scalar a set gives a subject or a single field. */
type Scalar = string | number | boolean;

/** One set, as the designer applies it to the canvas, keyed for the firmware. */
export interface TestRunSampleSet {
  /** The set's name, for the report. */
  readonly name: string;
  /** Checked subject values, by subject name. */
  readonly values: Readonly<Record<string, Scalar>>;
  /** Checked rows: by screen name, element name, then data name. */
  readonly rows: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, readonly Readonly<Record<string, Scalar | readonly string[]>>[]>>>>>>;
}

/** One scene element, as far as the unit needs it. */
interface SceneObject {
  readonly name: string;
  readonly tag: string;
}

/** What the unit is written against: the project the harness was generated from. */
export interface SampleStage {
  /** The subjects, by name, with their types. */
  readonly subjects: ReadonlyMap<string, SubjectType>;
  /** The manifests: a class's `<data>`. */
  readonly manifests: ManifestRegistry;
  /** Each screen's objects in the scene, by screen name. */
  readonly objects: ReadonlyMap<string, readonly SceneObject[]>;
}

/**
 * @brief Validates a request's `sets`.
 *
 * @param sets The request's value; absent is no sets.
 * @return The sets, or a sentence saying what is wrong with them.
 */
export function parseTestRunSampleSets(sets: unknown): readonly TestRunSampleSet[] | string {
  if (sets === undefined) return [];
  if (!Array.isArray(sets) || sets.length > MAX_SAMPLE_SETS) return `sets must be a list of at most ${MAX_SAMPLE_SETS} sample sets`;
  const names = new Set<string>();
  for (const set of sets as unknown[]) {
    if (!isRecord(set) || typeof set.name !== 'string' || set.name === '' || !isRecord(set.values) || !isRecord(set.rows)) {
      return 'each sample set needs a name, values and rows';
    }
    if (names.has(set.name)) return `sample set '${set.name}' is sent twice`;
    names.add(set.name);
    if (!Object.values(set.values).every(isScalar)) return `sample set '${set.name}': a value must be a string, number or boolean`;
    for (const elements of Object.values(set.rows)) {
      if (!isRecord(elements)) return `sample set '${set.name}': rows must be keyed by screen, element and data name`;
      for (const blocks of Object.values(elements)) {
        if (!isRecord(blocks)) return `sample set '${set.name}': rows must be keyed by screen, element and data name`;
        for (const rows of Object.values(blocks)) {
          const ok =
            Array.isArray(rows) &&
            rows.every((row) => isRecord(row) && Object.values(row).every((cell) => isScalar(cell) || (Array.isArray(cell) && cell.every((t) => typeof t === 'string'))));
          if (!ok) return `sample set '${set.name}': a row must be an object of strings, numbers, booleans or string arrays`;
        }
      }
    }
  }
  return sets as TestRunSampleSet[];
}

/**
 * @brief The stage, from a project and the scene generated from it.
 *
 * @param projectRoot  The (staged) project the harness generates from.
 * @param sceneJson    The scene generated beside the firmware code.
 */
export function readSampleStage(projectRoot: string, sceneJson: string): SampleStage {
  const loaded = loadProject(projectRoot);
  const subjects = new Map((loaded.model.globals.subjects ?? []).map((s) => [s.name, s.type] as const));
  const scene = JSON.parse(sceneJson) as { screens?: Array<{ name?: string; elements?: Array<Record<string, unknown>> }> };
  const objects = new Map<string, SceneObject[]>();
  for (const screen of scene.screens ?? []) {
    if (typeof screen.name !== 'string') continue;
    objects.set(
      screen.name,
      (screen.elements ?? []).flatMap((e): SceneObject[] =>
        e.realisation === 'object' && typeof e.name === 'string' && typeof e.tag === 'string'
          ? [{ name: e.name, tag: e.tag }]
          : [],
      ),
    );
  }
  return { subjects, manifests: loaded.model.manifests, objects };
}

/**
 * @brief The sample-set unit's C++ text.
 *
 * @param sets  The sets, in the order the harness numbers them.
 * @param stage The project they are applied to.
 * @return The text, or the reason a set cannot be staged: a subject, screen,
 *         element or data name the project does not have, or a value of the
 *         wrong type.
 */
export function sampleSetUnit(sets: readonly TestRunSampleSet[], stage: SampleStage): { readonly ok: true; readonly source: string } | { readonly ok: false; readonly message: string } {
  const functions: string[] = [];
  for (const [index, set] of sets.entries()) {
    const body: string[] = [];

    // --- Step 1: The subjects, through their public setters ---
    for (const [subject, value] of Object.entries(set.values)) {
      const type = stage.subjects.get(subject);
      if (type === undefined) return refuse(set, `the project has no subject '${subject}'`);
      const literal = subjectLiteral(type, value);
      if (literal === undefined) return refuse(set, `'${subject}' is ${article(type)} ${type} subject, so ${JSON.stringify(value)} cannot be its value`);
      body.push(`    ${subjectSetterIdentifier(subject)}(${literal});`);
    }

    // --- Step 2: Each collection, through its generated facade (§9.2) ---
    for (const [screen, elements] of Object.entries(set.rows)) {
      const objects = stage.objects.get(screen);
      if (objects === undefined) return refuse(set, `the project has no screen '${screen}'`);
      for (const [element, blocks] of Object.entries(elements)) {
        const found = objects.find((o) => o.name === element);
        const manifest = found === undefined ? undefined : stage.manifests.get(found.tag);
        if (found === undefined || manifest === undefined) return refuse(set, `screen '${screen}' has no object '${element}'`);
        for (const [dataName, rows] of Object.entries(blocks)) {
          const data = (manifest.api.data ?? []).find((d) => d.name === dataName);
          if (data === undefined) return refuse(set, `<${found.tag}> declares no <data name="${dataName}">`);
          const at = `${screen}.${element}`;
          const facade = collectionFacadeIdentifiers(screen, element, data.name).object;
          body.push(`    {  // ${at}: ${data.name}, ${rows.length} row${rows.length === 1 ? '' : 's'}`);
          body.push(`        ${facade}.begin();`);
          for (const [r, row] of rows.entries()) {
            const args: string[] = [];
            for (const field of data.fields) {
              const value = row[field.name];
              if (field.repeat !== undefined) {
                const cells = value === undefined ? [] : value;
                if (!Array.isArray(cells)) return refuse(set, `${at} row ${r}: ${field.name} repeats, so it must be an array`);
                if (cells.length === 0) {
                  args.push('nullptr', 'size_t{0}');
                } else {
                  const array = `row_${r}_${field.name}`;
                  body.push(`        static const char* const ${array}[] = {${cells.map((c) => cString(String(c))).join(', ')}};`);
                  args.push(array, `size_t{${cells.length}}`);
                }
                continue;
              }
              const literal = value === undefined || typeof value === 'object' ? undefined : fieldLiteral(field.type, value);
              if (literal === undefined) return refuse(set, `${at} row ${r}: ${field.name} must be ${article(field.type)} ${field.type}`);
              args.push(literal);
            }
            body.push(`        ${facade}.add_row(${args.join(', ')});`);
          }
          body.push(`        ${facade}.commit();`, '    }');
        }
      }
    }
    functions.push(`// ${set.name.replace(/[\r\n]/g, ' ')}`, `void ui_sample_set_${index}() {`, ...body, '}', '');
  }

  // --- Step 3: The unit, with the harness's entry point and the exports ---
  const names = sets.map((set) => `    ${cString(set.name)},`);
  return {
    ok: true,
    source: [
      "// GENERATED by the u8g2gl design server for a test run: the sample sets,",
      '// applied as an application applies data (wasm/harness.cpp). Not part of',
      '// the firmware target.',
      '',
      '#include <cstddef>',
      '#include <cstdint>',
      '',
      '#include "ui.hpp"',
      '',
      'namespace {',
      '',
      '// The set the next boot applies; -1 for none.',
      'int s_sample_set = -1;',
      '',
      ...functions,
      ...(sets.length === 0 ? [] : ['const char* const s_sample_set_names[] = {', ...names, '};', '']),
      '}  // namespace',
      '',
      'extern "C" {',
      '',
      `int getSampleSetCount() { return ${sets.length}; }`,
      '',
      'const char* getSampleSetName(int index) {',
      sets.length === 0 ? '    (void)index;\n    return "";' : `    return index >= 0 && index < ${sets.length} ? s_sample_set_names[index] : "";`,
      '}',
      '',
      'int selectSampleSet(int index) {',
      `    if (index < -1 || index >= ${sets.length}) return 0;`,
      '    s_sample_set = index;',
      '    return 1;',
      '}',
      '',
      'void u8g2gl_harness_apply_sample_set() {',
      '    switch (s_sample_set) {',
      ...sets.map((_, i) => `        case ${i}: ui_sample_set_${i}(); break;`),
      '        default: break;',
      '    }',
      '}',
      '',
      '}  // extern "C"',
      '',
    ].join('\n'),
  };
}

// refuse
// A set that cannot be staged, naming it.
function refuse(set: TestRunSampleSet, why: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message: `sample set '${set.name}': ${why}` };
}

// subjectLiteral
// A subject value as its setter's argument, or undefined for the wrong type.
function subjectLiteral(type: SubjectType, value: Scalar): string | undefined {
  switch (type) {
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? `int32_t{${value}}` : undefined;
    case 'time':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff ? `uint32_t{${value}u}` : undefined;
    case 'bool':
      return typeof value === 'boolean' ? String(value) : undefined;
    case 'string':
      return typeof value === 'string' ? cString(value) : undefined;
  }
}

// fieldLiteral
// A single field's value as the facade's add_row() argument, typed as the
// facade declares it and the editor registry passes it (int32_t, bool,
// const char*), so both halves call the widget's method the same way.
function fieldLiteral(type: string, value: Scalar): string | undefined {
  if (type === 'int') return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2147483647 ? `int32_t{${value}}` : undefined;
  if (type === 'bool') return typeof value === 'boolean' ? String(value) : undefined;
  if (type === 'string' || type === 'enum') return typeof value === 'string' ? `static_cast<const char*>(${cString(value)})` : undefined;
  return undefined;
}

// cString
// A C++ string literal of a string's UTF-8 bytes: printable ASCII as itself,
// `"` and `\` escaped, everything else as a three-digit octal escape (which,
// unlike a hex escape, cannot swallow the characters after it).
function cString(text: string): string {
  let out = '"';
  for (const byte of new TextEncoder().encode(text)) {
    if (byte === 0x22 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte >= 0x20 && byte < 0x7f) out += String.fromCharCode(byte);
    else out += `\\${byte.toString(8).padStart(3, '0')}`;
  }
  return `${out}"`;
}

// article
// "an" before a vowel, else "a": "an int subject", "a bool subject".
function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

// isRecord, isScalar
// JSON shapes.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
