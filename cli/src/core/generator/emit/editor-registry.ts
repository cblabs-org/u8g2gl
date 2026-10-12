/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/editor-registry.ts
 * Purpose: The editor target's generated C++ ([UD-4], design_spec §13.1):
 *          `ui_editor_registry.cpp`, the class registry, property thunks and
 *          draw-by-name table the designer's Wasm runtime uses to build a scene
 *          it was never compiled for. It is generated from the **same effective
 *          manifests** the firmware setters come from, and every C++ spelling in
 *          it comes from the helpers the firmware emitter uses — `cppValue()` for
 *          each enumerator, `drawFunctionOf()` for each draw function and its
 *          argument order, the screen model's rectangle setter, flag table and
 *          class header — so the two targets differ only in where a value comes
 *          from: a literal in firmware, a run-time value here (PROJECT.md,
 *          "Firmware / editor sharing"). WO11's parity test builds the committed
 *          fixture both ways and compares the U8G2 stub's draw history.
 *
 * Description: One entry per loaded manifest, framework and project, so the
 *              palette can place any element:
 *              - a **classed** element gets a class entry: placement construction
 *                into host storage, the rectangle thunk, one set-by-name thunk
 *                per setter prop and one bind-by-name thunk per `<bind>` **per
 *                subject type** (`bind_text` for string and for int are two
 *                entries, never one); a position binding's thunk passes the
 *                container origin the host gives it, as firmware passes the
 *                literal (§7.2, `placement.ts`'s POSITION_BINDINGS);
 *              - a **drawing** element ([D-18]) gets a draw-by-name entry calling
 *                the same `u8g2gl_draw_*` function the firmware call does, its
 *                defaults spelled by `cppValue()`;
 *              - a **composite** gets nothing: it is expanded before the editor
 *                sees it, and its container is a plain `u8g2gl_obj` (§13.12).
 *              Plus the `bind_flag_if_*` directives per subject type and the flag
 *              bits, from the tables firmware emission uses.
 *
 *              The whole unit sits under `#ifdef U8G2GL_EDITOR`, so a firmware
 *              build that compiles it gets an empty translation unit. Every
 *              thunk is a captureless lambda in a `const` table: no heap, no
 *              names to collide, and each entry reads beside the manifest line it
 *              came from. Deterministic (§13.9): manifests in registry order,
 *              props and bindings in effective declaration order.
 *
 * Exports:
 * - EDITOR_REGISTRY_UNIT:    The unit's file name
 * - EditorRegistryInput:     What emitting it needs
 * - editorTypeEnumerator():  A manifest type's `U8G2GL_EDITOR_*` enumerator
 * - emitEditorRegistryUnit(): Emit `ui_editor_registry.cpp`
 */

import { BINDING_FLAGS, isDrawingElement, type EffectiveManifest, type ManifestRegistry } from '../../manifest/index.js';
import { COLOR_VALUES } from '../../schema/globals.js';
import type { BindDef, PropDef, PropType } from '../../schema/widget-manifest.js';
import { FLAG_COMPARISONS } from '../../schema/widget-node.js';
import { EDITOR_REGISTRY_FUNCTION } from '../../resolver/index.js';
import { drawFunctionOf } from './draw-args.js';
import { POSITION_BINDINGS } from './placement.js';
import { classOf, FLAG_ENUMERATOR_PATTERN, RECTANGLE, rectangleSetterOf } from './screen-model.js';
import { includeBlock, section, type EmittedUnit } from './unit.js';
import { cppEnumerator, cppStringLiteral, cppValue } from './value.js';

/** The editor registry unit (§13.7's file set does not name it; [UD-4] does). */
export const EDITOR_REGISTRY_UNIT = 'ui_editor_registry.cpp';

/** Everything emitting the registry needs. */
export interface EditorRegistryInput {
  /** Every loaded manifest, framework and project, with `extends` resolved. */
  readonly manifests: ManifestRegistry;
  /** This file's header stamp, already rendered. */
  readonly stamp: string;
}

/**
 * How a value of each manifest type is read from a `u8g2gl_editor_value` —
 * §13.2's type mapping at run time. The literal rows of §13.2 are `cppValue()`'s;
 * these are the other side of the one legitimate difference between the targets.
 *
 * `enum` and `color` have no row: their text is matched against the manifest's
 * values, each spelled by `cppValue()`, so no enumerator crosses the boundary as
 * a number. `subject` has no row: no class manifest declares a subject-typed
 * setter prop, and the setter's parameter type could not be spelled from the
 * manifest if one did — such a prop is left out of the registry with a comment.
 */
const RUNTIME_READS: Readonly<Partial<Record<PropType, { readonly type: string; readonly read: (v: string) => string }>>> =
  {
    int: { type: 'int32_t', read: (v) => `${v}.integer` },
    bool: { type: 'bool', read: (v) => `${v}.boolean` },
    string: { type: 'const char*', read: (v) => `${v}.text` },
    font: { type: 'const uint8_t*', read: (v) => `static_cast<const uint8_t*>(${v}.pointer)` },
    image: { type: 'const uint8_t*', read: (v) => `static_cast<const uint8_t*>(${v}.pointer)` },
    style: { type: 'const u8g2gl_style&', read: (v) => `*static_cast<const u8g2gl_style*>(${v}.pointer)` },
  };

/** The manifest's subject types and the runtime base class each binds through (§8.1). */
const SUBJECT_TYPES = ['int', 'string', 'bool', 'time'] as const;

// subjectBase, subjectEnumerator
// The `u8g2gl_subject_<type>_base` a binding thunk casts to, and the
// `u8g2gl_subject_type_t` enumerator its entry is keyed by.
function subjectBase(type: string): string {
  return `u8g2gl_subject_${type}_base`;
}
function subjectEnumerator(type: string): string {
  return `U8G2GL_SUBJECT_${type.toUpperCase()}`;
}

// isSubjectType
// Whether a `<bind type>` names a subject type the runtime has. Pass 1 holds a
// manifest to these; anything else here is a gap in validation.
function isSubjectType(type: string): type is (typeof SUBJECT_TYPES)[number] {
  return (SUBJECT_TYPES as readonly string[]).includes(type);
}

/**
 * @brief A manifest type's `u8g2gl_editor_type_t` enumerator.
 *
 * @param type A `<prop>` type.
 * @return e.g. `U8G2GL_EDITOR_FONT`.
 */
export function editorTypeEnumerator(type: PropType): string {
  return `U8G2GL_EDITOR_${type.toUpperCase()}`;
}

// valuesOf
// The spellings an enum or colour prop accepts, in declaration order: an enum's
// `values=` list, or the schema's `COLOR_VALUES`, each of which `value.ts` maps.
function valuesOf(prop: PropDef): readonly string[] {
  if (prop.type === 'color') {
    return COLOR_VALUES;
  }
  return (prop.values ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

// isMatched
// Whether a prop's value is chosen by matching text against its values rather
// than read directly.
function isMatched(prop: PropDef): boolean {
  return prop.type === 'enum' || prop.type === 'color';
}

// indent
// Lines indented by `depth` levels of four spaces.
function indent(lines: readonly string[], depth: number): string[] {
  const pad = '    '.repeat(depth);
  return lines.map((line) => (line === '' ? '' : `${pad}${line}`));
}

// setterThunk
// One property's set-by-name lambda: the setter call the firmware's
// `obj.<setter>(<cppValue>)` line makes, with the argument read from the host's
// value — or, for an enum or colour, one branch per value, each spelled by
// cppValue() exactly as the firmware spells that value.
//   cls  — the C++ class the object is
//   prop — the setter prop
function setterThunk(cls: string, prop: PropDef): string[] {
  const setter = prop.setter ?? '';
  const head = '[](u8g2gl_obj* obj, const u8g2gl_editor_value& value) -> bool {';
  if (isMatched(prop)) {
    const branches = valuesOf(prop).map(
      (value) =>
        `if (u8g2gl_editor_is(value, ${cppStringLiteral(value)})) { self->${setter}(${cppValue(prop, value)}); return true; }`,
    );
    return [head, ...indent([`${cls}* self = static_cast<${cls}*>(obj);`, ...branches, 'return false;'], 1), '}'];
  }
  const read = RUNTIME_READS[prop.type];
  if (read === undefined) {
    throw new Error(`No run-time read for prop type '${prop.type}'; the caller must skip it.`);
  }
  return [head, ...indent([`static_cast<${cls}*>(obj)->${setter}(${read.read('value')});`, 'return true;'], 1), '}'];
}

// bindingThunk
// One binding's bind-by-name lambda, for one subject type. Where the manifest
// declares a format, u8g2gl_editor_bind_call() passes it only to an overload that
// takes one; where it declares none, a format is refused. A position binding
// (bind_x, bind_y) passes the container origin to the runtime, as firmware
// passes its literal; any other binding refuses a non-zero origin rather than
// drop it, the same rule as a format.
//   cls     — the C++ class
//   binding — the `<bind>` declaration for this subject type
function bindingThunk(cls: string, binding: BindDef): string[] {
  const head = '[](u8g2gl_obj* obj, void* subject, const char* fmt, int16_t origin) -> bool {';
  const self = `static_cast<${cls}*>(obj)`;
  const typedSubject = `static_cast<${subjectBase(binding.type)}*>(subject)`;
  if (POSITION_BINDINGS[binding.name] !== undefined) {
    return [
      head,
      ...indent(['if (fmt != nullptr) { return false; }', `return ${self}->${binding.setter}(${typedSubject}, origin);`], 1),
      '}',
    ];
  }
  const refuseOrigin = 'if (origin != 0) { return false; }';
  if (binding.fmt === undefined) {
    return [
      head,
      ...indent(
        [refuseOrigin, 'if (fmt != nullptr) { return false; }', `return ${self}->${binding.setter}(${typedSubject});`],
        1,
      ),
      '}',
    ];
  }
  return [
    head,
    ...indent(
      [
        refuseOrigin,
        `return u8g2gl_editor_bind_call(${self}, ${typedSubject}, fmt,`,
        `    [](auto* s, auto* sub, const char* f) -> decltype(s->${binding.setter}(sub, f)) { return s->${binding.setter}(sub, f); },`,
        `    [](auto* s, auto* sub) { return s->${binding.setter}(sub); });`,
      ],
      1,
    ),
    '}',
  ];
}

/** One class entry's generated parts. */
interface ClassEntry {
  readonly lines: string[];
  readonly initialiser: string[];
  readonly include: string;
}

// classEntry
// A classed element's tables and its entry in `ui_editor_classes[]`.
//   manifest — its effective manifest
function classEntry(manifest: EffectiveManifest): ClassEntry {
  const { name: cls, include } = classOf(manifest);
  const tag = manifest.name;
  const lines: string[] = [section(`${tag}: class (${manifest.origin}${manifest.chain.length > 1 ? `, extends ${manifest.chain.slice(1).join(' → ')}` : ''})`)];

  // --- Step 1: One set-by-name thunk per setter prop, rectangle excepted ---
  // The rectangle is one call through its own thunk, as the firmware emits one
  // set_coords() call rather than four (screen-model.ts).
  const rectangleSetter = rectangleSetterOf(manifest);
  const properties: string[] = [];
  const skipped: string[] = [];
  for (const prop of manifest.api.props) {
    if (prop.setter === undefined || (rectangleSetter !== undefined && (RECTANGLE as readonly string[]).includes(prop.name))) {
      continue;
    }
    if (!isMatched(prop) && RUNTIME_READS[prop.type] === undefined) {
      skipped.push(`// '${prop.name}' (type="${prop.type}") has no run-time read, so it is not settable by name.`);
      continue;
    }
    properties.push(`// ${prop.name} (${prop.type})`, `{${cppStringLiteral(prop.name)},`);
    properties.push(...indent([...setterThunk(cls, prop).map((line, i, all) => (i === all.length - 1 ? `${line},` : line))], 1));
    properties.push(`    ${editorTypeEnumerator(prop.type)}},`);
  }
  const propertyTable = `ui_editor_${tag}_properties`;
  if (properties.length > 0) {
    lines.push(`static const u8g2gl_editor_property ${propertyTable}[] = {`, ...indent(properties, 1), '};');
  }
  lines.push(...skipped);

  // --- Step 2: One bind-by-name thunk per <bind>, per subject type ---
  // Effective bindings are already one per (name, type), so bind_text for a
  // string and for an int arrive here as two declarations and stay two entries.
  const bindings: string[] = [];
  for (const binding of manifest.api.bindings) {
    if (!isSubjectType(binding.type)) {
      throw new Error(
        `<${tag}>'s <bind name="${binding.name}"> takes type '${binding.type}', which is no subject type ` +
          `(${SUBJECT_TYPES.join(', ')}). Pass 1 refuses such a manifest, so validation let it through.`,
      );
    }
    bindings.push(`// ${binding.name} (${binding.type} subject)`, `{${cppStringLiteral(binding.name)},`);
    bindings.push(...indent(bindingThunk(cls, binding).map((line, i, all) => (i === all.length - 1 ? `${line},` : line)), 1));
    bindings.push(`    ${subjectEnumerator(binding.type)}},`);
  }
  const bindingTable = `ui_editor_${tag}_bindings`;
  if (bindings.length > 0) {
    lines.push(`static const u8g2gl_editor_binding ${bindingTable}[] = {`, ...indent(bindings, 1), '};');
  }

  // --- Step 3: The class entry: construct, rectangle, tables, storage needs ---
  const propertyCount = properties.filter((line) => line.startsWith('// ')).length;
  const bindingCount = manifest.api.bindings.length;
  const initialiser = [
    `// ${tag}`,
    `{${cppStringLiteral(tag)},`,
    `    [](void* storage) -> u8g2gl_obj* { return ::new (storage) ${cls}(); },`,
    rectangleSetter === undefined
      ? '    nullptr,'
      : `    [](u8g2gl_obj* obj, int16_t x, int16_t y, int16_t w, int16_t h) { static_cast<${cls}*>(obj)->${rectangleSetter}(x, y, w, h); },`,
    `    ${propertyCount > 0 ? propertyTable : 'nullptr'},`,
    `    ${bindingCount > 0 ? bindingTable : 'nullptr'},`,
    `    sizeof(${cls}), alignof(${cls}), ${propertyCount}, ${bindingCount}},`,
  ];
  return { lines, initialiser, include };
}

// drawArgument
// One argument of a draw thunk as a local `a<i>`, read from the host's value or,
// when absent, from the manifest default spelled by cppValue() — the value the
// firmware call would have been spelled with. A prop with no default makes the
// thunk refuse when it is absent, as the firmware emitter refuses the element.
//   prop  — the draw prop
//   index — its parameter position
function drawArgument(prop: PropDef, index: number): string[] {
  const arg = `args[${index}]`;
  const local = `a${index}`;
  const absent = `${arg}.type == U8G2GL_EDITOR_NONE`;
  // A default naming a generated symbol (a font, image or style) would reach for
  // a project's `ui_*` identifier the editor build does not link, so such a prop
  // is treated as required instead.
  const spelledDefault =
    prop.default !== undefined && !['font', 'image', 'style', 'subject'].includes(prop.type)
      ? cppValue(prop, prop.default)
      : undefined;
  const required = spelledDefault === undefined ? [`if (${absent}) { return false; }`] : [];

  if (isMatched(prop)) {
    const values = valuesOf(prop);
    const first = values[0];
    if (first === undefined) {
      throw new Error(`Prop '${prop.name}' is an enum with no values; Pass 1 refuses such a manifest.`);
    }
    const initial = spelledDefault ?? cppValue(prop, first);
    const branches = values.flatMap((value, i) => [
      `${i === 0 ? '' : '} else '}if (u8g2gl_editor_is(${arg}, ${cppStringLiteral(value)})) {`,
      `    ${local} = ${cppValue(prop, value)};`,
    ]);
    return [
      `// ${prop.name} (${prop.type})`,
      ...required,
      `decltype(${cppValue(prop, first)}) ${local} = ${initial};`,
      `if (${arg}.type != U8G2GL_EDITOR_NONE) {`,
      ...indent([...branches, '} else {', '    return false;', '}'], 1),
      '}',
    ];
  }
  const read = RUNTIME_READS[prop.type];
  if (read === undefined) {
    throw new Error(`Draw prop '${prop.name}' has type '${prop.type}', which no draw function takes.`);
  }
  const value = spelledDefault === undefined ? read.read(arg) : `${absent} ? ${spelledDefault} : ${read.read(arg)}`;
  return [`// ${prop.name} (${prop.type})`, ...required, `const ${read.type} ${local} = ${value};`];
}

// drawingEntry
// A drawing element's parameter table and its entry in `ui_editor_drawings[]`:
// the same free function the firmware's drawCallFor() names, its arguments in
// the same order (draw-args.ts), each from the host or its default.
//   manifest — the drawing element's effective manifest
function drawingEntry(manifest: EffectiveManifest): { lines: string[]; initialiser: string[] } {
  const tag = manifest.name;
  const { fn, props } = drawFunctionOf(manifest);
  const paramTable = `ui_editor_${tag}_params`;
  const lines = [
    section(`${tag}: drawing element, ${fn}() ([D-18])`),
    `static const u8g2gl_editor_param ${paramTable}[] = {`,
    ...props.map((prop) => `    {${cppStringLiteral(prop.name)}, ${editorTypeEnumerator(prop.type)}},`),
    '};',
  ];
  const body = [
    ...props.flatMap((prop, index) => drawArgument(prop, index)),
    `${fn}(display, ${props.map((_, index) => `a${index}`).join(', ')});`,
    'return true;',
  ];
  const initialiser = [
    `// ${tag}`,
    `{${cppStringLiteral(tag)},`,
    '    [](U8G2& display, const u8g2gl_editor_value* args) -> bool {',
    ...indent(body, 2),
    '    },',
    `    ${paramTable}, ${props.length}},`,
  ];
  return { lines, initialiser };
}

// directiveEntries
// Every `bind_flag_if_*` method for every subject type it accepts, from the one
// table firmware emission checks directives against. `bind` is the call the
// firmware's init makes; `clear` is the firmware guard's comparison, so a draw
// call's visibility is decided the same way on both targets. A bool subject
// takes a `bool` ref, or an `int32_t` ref a host may still hand it (the public
// u8g2gl_editor_int() can build one); the integer is reduced to `!= 0` so it
// resolves to the `bool` overload explicitly, as `0`/`1` convert in firmware.
function directiveEntries(): string[] {
  const entries: string[] = [];
  for (const [method, comparison] of Object.entries(FLAG_COMPARISONS)) {
    for (const type of comparison.subjectTypes) {
      const base = subjectBase(type);
      const cast = `static_cast<${base}*>(subject)`;
      const constCast = `static_cast<const ${base}*>(subject)`;
      const bind =
        type === 'bool'
          ? `return ref.type == U8G2GL_EDITOR_BOOL ? obj->${method}(${cast}, ref.boolean, flag) : obj->${method}(${cast}, ref.integer != 0, flag);`
          : `return obj->${method}(${cast}, ref.integer, flag);`;
      const clear =
        type === 'bool'
          ? `return ref.type == U8G2GL_EDITOR_BOOL ? ${constCast}->get() ${comparison.clearWhen} ref.boolean : ${constCast}->get() ${comparison.clearWhen} (ref.integer != 0);`
          : `return ${constCast}->get() ${comparison.clearWhen} ref.integer;`;
      entries.push(
        `// ${method} (${type} subject): the flag is clear when get() ${comparison.clearWhen} ref`,
        `{${cppStringLiteral(method)},`,
        '    [](u8g2gl_obj* obj, void* subject, const u8g2gl_editor_value& ref, uint8_t flag) -> bool {',
        `        ${bind}`,
        '    },',
        '    [](const void* subject, const u8g2gl_editor_value& ref) -> bool {',
        `        ${clear}`,
        '    },',
        `    ${subjectEnumerator(type)}},`,
      );
    }
  }
  return entries;
}

// table
// A `static const` table and its element count, or `nullptr`/0 when empty —
// a zero-length array is ill-formed.
function table(type: string, name: string, entries: readonly string[], count: number): { lines: string[]; ref: string; count: number } {
  if (count === 0) {
    return { lines: [], ref: 'nullptr', count: 0 };
  }
  return { lines: [`static const ${type} ${name}[] = {`, ...indent(entries, 1), '};', ''], ref: name, count };
}

/**
 * @brief Emits the editor registry unit (PR-04 WO11, [UD-4]).
 *
 * @param input Every loaded manifest and this file's stamp.
 * @return The unit. Raises no diagnostics: every manifest was validated, and a
 *         declaration this cannot spell is a programmer error, thrown.
 * @throws Error for a `<bind>` of no subject type or an enum with no values —
 *         both refused by Pass 1, so reaching here is a gap in validation.
 */
export function emitEditorRegistryUnit(input: EditorRegistryInput): EmittedUnit {
  const { manifests } = input;

  // --- Step 1: Sort every manifest into class, drawing or composite ---
  // Registry order — framework first, then project, each in load order — so the
  // tables never depend on map order (§13.9).
  const classes: ClassEntry[] = [];
  const drawings: { lines: string[]; initialiser: string[] }[] = [];
  const composites: string[] = [];
  for (const tag of manifests.tags) {
    const manifest = manifests.get(tag);
    if (manifest === undefined) {
      continue;
    }
    if (isDrawingElement(manifest.declared)) {
      drawings.push(drawingEntry(manifest));
    } else if (manifest.declared.view !== undefined) {
      composites.push(tag);
    } else {
      classes.push(classEntry(manifest));
    }
  }

  // --- Step 2: The four registry tables ---
  const classTable = table(
    'u8g2gl_editor_class',
    'ui_editor_classes',
    classes.flatMap((entry) => entry.initialiser),
    classes.length,
  );
  const drawingTable = table(
    'u8g2gl_editor_drawing',
    'ui_editor_drawings',
    drawings.flatMap((entry) => entry.initialiser),
    drawings.length,
  );
  const directives = directiveEntries();
  const directiveTable = table(
    'u8g2gl_editor_directive',
    'ui_editor_directives',
    directives,
    directives.filter((line) => line.startsWith('{')).length,
  );
  const flagTable = table(
    'u8g2gl_editor_flag',
    'ui_editor_flags',
    BINDING_FLAGS.map((flag) => `{${cppStringLiteral(flag)}, ${cppEnumerator(FLAG_ENUMERATOR_PATTERN, flag)}},`),
    BINDING_FLAGS.length,
  );

  // --- Step 3: Lay the unit out ---
  const includes = [
    '#include "u8g2gl/u8g2gl_editor.h"',
    ...classes.map((entry) => entry.include),
    ...(drawings.length > 0 ? ['#include "u8g2gl/u8g2gl_draw.h"'] : []),
  ];
  const lines: string[] = [
    input.stamp.trimEnd(),
    '',
    '// The editor target ([UD-4], design_spec §13.1): construct-by-name, set-by-name',
    '// and draw-by-name, generated from the same manifests as the firmware setters.',
    '// Compiled only with U8G2GL_EDITOR defined; a firmware build that compiles this',
    '// file gets an empty translation unit and pays nothing.',
    '#ifdef U8G2GL_EDITOR',
    '',
    '#include <new>',
    '',
    includeBlock(includes),
    '',
  ];
  if (composites.length > 0) {
    lines.push(
      section('Composites'),
      `// ${composites.join(', ')}: expanded before the editor sees them; each`,
      '// container is a plain u8g2gl_obj (§13.12), constructed through that entry.',
      '',
    );
  }
  for (const entry of classes) {
    if (entry.lines.length > 1) {
      lines.push(...entry.lines, '');
    }
  }
  for (const entry of drawings) {
    lines.push(...entry.lines, '');
  }
  lines.push(section('Registry'));
  lines.push(...classTable.lines, ...drawingTable.lines, ...directiveTable.lines, ...flagTable.lines);
  lines.push(
    `const u8g2gl_editor_registry& ${EDITOR_REGISTRY_FUNCTION}() {`,
    '    static const u8g2gl_editor_registry registry = {',
    `        ${classTable.ref},`,
    `        ${drawingTable.ref},`,
    `        ${directiveTable.ref},`,
    `        ${flagTable.ref},`,
    `        ${classTable.count},`,
    `        ${drawingTable.count},`,
    `        ${directiveTable.count},`,
    `        ${flagTable.count},`,
    '    };',
    '    return registry;',
    '}',
    '',
    '#endif  // U8G2GL_EDITOR',
    '',
  );
  return { content: lines.join('\n'), diagnostics: [] };
}
