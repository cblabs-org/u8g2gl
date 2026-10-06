/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-schema.ts
 * Purpose: Pass 1 — Validates document schema structure, required attributes,
 *          attribute types, and schema specification version (§15.4).
 * Description: Checks that all required attributes are present across project,
 *              globals, screens, components, and widget manifests. Validates that
 *              attribute values match expected primitive types and enum sets.
 *              Enforces schema version "0.4", refusing the superseded "0.3"
 *              with a specific migration diagnostic rather than a generic
 *              mismatch (§15.4, PR-3R WO8).
 *
 *              The 254-object ceiling is **not** checked here. This pass used to
 *              count objects structurally, and that count predated [D-18]: it
 *              skipped composite containers and counted `draw=`-only elements,
 *              both inverted by that decision, so it could report fewer objects
 *              than a screen really has. Pass 9 enforces the ceiling against
 *              realisation's exact count instead (`validate-realisation.ts`,
 *              PR-04 WO8c).
 *
 *              Declarations are checked where they are declared (PR-04 WO7b): an
 *              `<int>` constant's value must be an integer literal within int32,
 *              the four built-in constant names are reserved (§7.2), and a prop
 *              may not be both `required` and defaulted. A subject's initial
 *              value must fit its type, and a string's its `max_len` (PR-04
 *              WO11b). Every `<style>` property is held to the `u8g2gl_obj` prop
 *              it is applied through, on global and screen-local styles alike,
 *              through the one bool and enum rule an element's attribute uses
 *              (value-rules.ts; PR-04 WO11b finding 12).
 *
 *              Two `<globals>` checks reuse a definition owned elsewhere, so
 *              `validate` and the build cannot disagree: a `<bdf range>` is checked
 *              by `parseBdfRange()` (`MALFORMED_BDF_RANGE`), the module
 *              `compileBdf()` also translates the range with; a `<convert>`'s
 *              `mode`, `threshold` and size are checked by `convertDeclProblems()`,
 *              the same function that keeps the asset step from converting one the
 *              validator rejects.
 *
 * Exports:
 * - validateSchema(input): Runs Pass 1 schema structure validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import { parseBdfRange } from '../fonts/bdf-range.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { ValidateInput } from './validate.js';
import type { BindDef, PropDef, PropType, WidgetManifest } from '../schema/widget-manifest.js';
import { ROOT_CLASS_MANIFEST, isDrawingElement } from '../manifest/manifest-registry.js';
import { geometryBindingFor, geometryBindingNamed } from '../resolver/geometry-bindings.js';
import { BUILTIN_CONSTANTS, INT32_MAX, INT32_MIN, integerLiteralValue } from '../resolver/index.js';
import { COLOR_VALUES, STYLE_PROPERTIES, type StyleDecl, type SubjectDecl, type SubjectType } from '../schema/globals.js';
import { convertDeclProblems } from '../images/convert-decl.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { booleanValueError, enumValueError } from './value-rules.js';

const VALID_SCHEMA_VERSION = '0.4';

/**
 * The prefix §13.4 fixes every generated identifier at, and the only value
 * `<output prefix>` may name (see section 1b).
 *
 * Spelled here because `mangle.ts` builds it into each per-kind spelling helper
 * (`ui_screen_${screen}_${fn}`) rather than exporting it as one constant; there
 * is no single symbol to import. Recorded as a finding rather than fixed,
 * because `mangle.ts` is outside this work order's boundary.
 */
const GENERATED_IDENTIFIER_PREFIX = 'ui_';

/**
 * [D-19]'s remedy for `truncate`, spelled once: the §15.4 migration table below
 * names it for a 0.3 project, and Pass 1 names it for a `<style>` in any
 * project that still writes it (PR-04 WO11b follow-up), so an author who
 * writes it is told why rather than only that it is unknown.
 */
const TRUNCATE_REMOVED = "'truncate' is removed: use long_mode=\"clip\" ([D-19])";

/**
 * The §15.4 migration table for the one superseded schema version this CLI
 * still recognises by name. Each entry is a change landed by PR-3R (WO1–WO7)
 * that a `schema="0.3"` project must apply verbatim; the refusal path below
 * renders these into a single diagnostic message so the break is described,
 * not just detected.
 *
 * design_spec §15.4 is the source of truth for this table; do not edit the
 * wording here without also updating there; they document the same contract
 * from two directions (spec: normative table, code: enforcement).
 */
const SCHEMA_0_3_MIGRATIONS: readonly string[] = [
  "'<component>' is removed: use '<widget>' with a '<view>', and move " +
    "'components/x/' to 'widgets/x/' ([D-18])",
  "the 'components/' directory is removed: use one 'widgets/' directory " +
    'for all user elements ([D-18])',
  TRUNCATE_REMOVED,
  "'<u8g2gl_scrolling_label>' is removed: use " +
    '\'<u8g2gl_label long_mode="scroll_circular">\' — the old widget wrapped ' +
    "continuously, which is 'scroll_circular'; 'scroll' reverses at each end " +
    'and is not what that widget did ([D-19])',
  "'animated' is removed from manifests: delete the attribute; realisation " +
    'is per instance ([D-18])',
  "manifest 'setter=' naming a U8G2 call becomes 'draw=' naming a runtime " +
    'free function ([D-18])',
];

const VALID_PROP_TYPES: ReadonlySet<PropType> = new Set([
  'int',
  'bool',
  'string',
  'enum',
  'font',
  'image',
  'subject',
  'style',
  'color',
]);

const VALID_SUBJECT_TYPES: ReadonlySet<SubjectType> = new Set([
  'int',
  'string',
  'bool',
  'time',
]);

const VALID_ROTATIONS: ReadonlySet<string> = new Set([
  'R0',
  'R1',
  'R2',
  'R3',
  '0',
  '90',
  '180',
  '270',
]);

function createDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}

// outputDirEscapes
// Whether an `<output dir>` could name anything outside the project (§13.10).
// Lexical, because `src/core/` may not use `node:path` (typescript.md §1) — and
// lexical is the stricter reading anyway: an absolute path is refused outright
// rather than accepted because it happens to point inside the project today, and
// a Windows-style `\` or drive letter is refused for the same reason.
//
// The rule: no absolute path, no backslash, and the running depth must never go
// negative as the segments are walked. A trailing `..` that only returns to the
// project root — `a/..` — is a strange way to write `.`, and `.` itself is the
// project root, which is not a directory generation may own either, so a net
// depth of zero is refused as well.
//   dir — the declared directory, exactly as written
function outputDirEscapes(dir: string): boolean {
  const trimmed = dir.trim();
  if (trimmed === '' || trimmed.startsWith('/') || trimmed.includes('\\') || /^[A-Za-z]:/.test(trimmed)) {
    return true;
  }
  let depth = 0;
  for (const segment of trimmed.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      depth--;
      if (depth < 0) {
        return true;
      }
      continue;
    }
    depth++;
  }
  return depth === 0;
}

// checkRequiredWithDefault
// A prop declaring both `required="true"` and a `default` (PR-04 WO7 F10). A
// required prop is always given, so its default can never apply, and expansion
// and Pass 4 disagreed about whether an instance omitting it is missing it. An
// error at the declaration; OVERCONSTRAINED, as for a prop declaring both
// `setter` and `draw` — one declaration saying two incompatible things.
//   prop  — the declared prop
//   owner — prose naming its manifest: "composite 'card'"
function checkRequiredWithDefault(prop: PropDef, owner: string): Diagnostic | undefined {
  if (prop.required !== true || prop.default === undefined) {
    return undefined;
  }
  return createDiagnostic(
    DIAGNOSTIC_CODES.OVERCONSTRAINED,
    `Prop '${prop.name}' in ${owner} declares both required="true" and default="${prop.default}"; ` +
      `a required prop is always given, so its default can never apply. Remove one.`,
    prop.loc,
    'required, default',
  );
}

// unknownStyleAttributes
// UNKNOWN_ATTRIBUTE for each attribute a `<style>` writes that is neither `name`
// nor a §10 style property — the same code, severity and wording an unknown
// attribute on an element gets (Pass 4), with the closest property suggested.
// Until PR-04 WO11b the style parser simply dropped them, so
// `<style truncate="true" bogus="1">` passed both journeys in silence. The
// properties are STYLE_PROPERTIES, the one list; `truncate` keeps [D-19]'s remedy.
//   style — the declaration, with the attributes the parser did not recognise
function unknownStyleAttributes(style: StyleDecl): Diagnostic[] {
  const spellings = STYLE_PROPERTIES.flatMap((property) => [property.attribute, ...(property.aliases ?? [])]);
  return (style.unknownAttributes ?? []).map((attribute) =>
    createDiagnostic(
      DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      attribute.name === 'truncate'
        ? `Unknown attribute 'truncate' on <style>: ${TRUNCATE_REMOVED}.`
        : `Unknown attribute '${attribute.name}' on <style>.`,
      attribute.loc ?? style.loc,
      attribute.name,
      attribute.name === 'truncate' ? undefined : findClosest(attribute.name, spellings),
    ),
  );
}

// checkStyleValues
// Every style property a `<style>` writes, against the `u8g2gl_obj` prop of the
// same name — the prop the style is applied through (§10, `emit/styles.ts`), and
// the very prop an element's own attribute of that name is checked against. So a
// style and an element accept exactly the same values, through the one rule in
// value-rules.ts, and say the same thing when they do not (PR-04 WO11b,
// finding 12).
//
// This replaces four sets Pass 1 kept for `draw_color`, `align`, `font_mode` and
// `bitmap_mode` — a second spelling of what the manifest already declares, which
// also ran on global styles only. A `font` is Pass 2's (UNKNOWN_FONT); an `int`
// is the parser's, which reports a non-integer where it reads it.
//   style     — the declaration, with its properties as written
//   manifests — the registry, for the root class's props
function checkStyleValues(style: StyleDecl, manifests: ValidateInput['manifests']): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const root = manifests.get(ROOT_CLASS_MANIFEST);
  if (root === undefined) {
    return diagnostics; // No root manifest: emission cannot spell a style either.
  }
  const owner = `<style> '${style.name}'`;
  for (const { attribute, spelled, value, loc } of style.written ?? []) {
    const prop = root.api.props.find((candidate) => candidate.name === attribute);
    if (prop === undefined) {
      continue; // A property u8g2gl_obj does not declare is a framework defect, not an author's.
    }
    const at = loc ?? style.loc;
    const diagnostic =
      prop.type === 'bool'
        ? booleanValueError(value, `'${spelled}' on ${owner}`, at)
        : prop.type === 'enum'
          ? enumValueError(value, (prop.values ?? '').split(',').map((member) => member.trim()), spelled, owner, at)
          : prop.type === 'color'
            ? enumValueError(value, COLOR_VALUES, spelled, owner, at)
            : undefined;
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

/** The range of a `<time>` subject: Unix seconds, held as `uint32_t` (`set_time`). */
const TIME_MAX = 4294967295;

// checkSubjectValue
// A subject's initial `value` against its declared type (§8.1), and a string's
// against its `max_len` (§8.2). Until PR-04 WO11b no pass checked either (WO9
// finding 6): emission caught a non-integer int or a bool that was neither
// `true` nor `false`, as TYPE_MISMATCH — the code used here, so both journeys
// name it alike — and nothing at all caught an int outside int32_t, a time
// outside uint32_t, or a string longer than its buffer, which the runtime would
// silently truncate. The same trimming emission applies to a non-string value.
//   subject — the declaration
function checkSubjectValue(subject: SubjectDecl): Diagnostic | undefined {
  const declared = subject.default;
  if (declared === undefined || declared === '') {
    return undefined;
  }
  const mismatch = (why: string): Diagnostic =>
    createDiagnostic(
      DIAGNOSTIC_CODES.TYPE_MISMATCH,
      `Subject '${subject.name}' is ${subject.type === 'int' ? 'an' : 'a'} <${subject.type}> whose value ` +
        `'${declared}' ${why} (§8.1).`,
      subject.loc,
      declared,
    );
  const value = declared.trim();

  switch (subject.type) {
    case 'bool':
      return value === 'true' || value === 'false' ? undefined : mismatch("is neither 'true' nor 'false'");
    case 'int':
    case 'time': {
      if (!/^-?\d+$/.test(value)) {
        return mismatch('is not an integer');
      }
      const number = Number(value);
      if (subject.type === 'int' && (number < INT32_MIN || number > INT32_MAX)) {
        return mismatch(`is outside int32_t (${INT32_MIN}..${INT32_MAX})`);
      }
      if (subject.type === 'time' && (number < 0 || number > TIME_MAX)) {
        return mismatch(`is outside 0..${TIME_MAX}: a time is Unix seconds, held unsigned`);
      }
      return undefined;
    }
    case 'string': {
      // `max_len` counts the bytes the buffer holds before its terminator (§8.2),
      // and the runtime copies bytes, so a non-ASCII character counts as its
      // UTF-8 length.
      if (subject.maxLen === undefined) {
        return undefined;
      }
      const bytes = new TextEncoder().encode(declared).length;
      if (bytes <= subject.maxLen) {
        return undefined;
      }
      const characters = [...declared].length;
      return createDiagnostic(
        DIAGNOSTIC_CODES.STRING_TOO_LONG,
        `Subject '${subject.name}' has max_len="${subject.maxLen}", but its value '${declared}' is ${bytes} ` +
          `bytes${characters !== bytes ? ` (${characters} characters, UTF-8)` : ''}, so it would not fit its buffer ` +
          `and the runtime would silently cut it short (§8.2).`,
        subject.loc,
        declared,
      );
    }
    default:
      return undefined;
  }
}

/**
 * The subject type a prop of each type can be bound to (§13.2, §8.4). Only three
 * prop types have a subject type of their own; a `time` subject has no prop to
 * match, because it is consumed by a method (`bind_time`), never written to a
 * prop. Props of any other type (enum, font, image, style, color) are not bound
 * to a subject by a drawing manifest, so a `<bind>` naming one is left to the
 * author rather than guessed at.
 */
const SUBJECT_TYPE_OF_PROP: Readonly<Partial<Record<PropType, SubjectType>>> = {
  int: 'int',
  bool: 'bool',
  string: 'string',
};

// checkBindDeclarations
// Checks each `<bind>` a widget manifest declares against the setter it targets
// (§13.1, §13.2: a subject must match the type its target accepts; a setter the
// `extends` chain already binds keeps its inherited name, and a drawing manifest's
// own geometry prop keeps its [D-20] name). Pass 5
// checks a subject against the *declared* `<bind>`; this checks the declaration
// itself, which is the only path a mistyped subject could otherwise take.
//   manifest  — a widget manifest as declared
//   registry  — supplies the effective manifest of `extends`, never an element name ([D-17])
function checkBindDeclarations(
  manifest: WidgetManifest,
  registry: ValidateInput['manifests'],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const bindings = manifest.api?.bindings ?? [];
  if (bindings.length === 0) {
    return diagnostics;
  }

  // --- Step 1: Gather what the targets are ---
  // A class manifest's `setter=` is a method its `extends` chain may already
  // bind; a drawing manifest's is one of its own props ([Q-9]).
  // A composite declares no `extends`; the registry supplies `u8g2gl_obj`
  // as its base (§13.12), so the base is read from the effective chain.
  const baseTag = manifest.extends ?? registry.get(manifest.name)?.chain[1];
  const inherited: readonly BindDef[] =
    baseTag !== undefined ? (registry.get(baseTag)?.api.bindings ?? []) : [];
  const drawingProps: readonly PropDef[] = isDrawingElement(manifest) ? (manifest.api?.props ?? []) : [];

  for (const bind of bindings) {
    // --- Step 2: A binding the inherited chain already has fixes the name and types ---
    // The binding is one already declared under this setter.
    const sharing = inherited.filter((candidate) => candidate.setter === bind.setter);
    if (sharing.length > 0 && !sharing.some((candidate) => candidate.name === bind.name)) {
      diagnostics.push(
        bindingAliasDiagnostic(
          manifest,
          bind,
          Array.from(new Set(sharing.map((candidate) => candidate.name))),
          'inherited',
        ),
      );
    }
    if (sharing.length > 0) {
      const accepted = Array.from(new Set(sharing.map((candidate) => candidate.type)));
      if (!accepted.includes(bind.type)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.TYPE_MISMATCH,
            `Widget '${manifest.name}' declares <bind name="${bind.name}" type="${bind.type}" ` +
              `setter="${bind.setter}">, but the setter '${bind.setter}' it inherits accepts only ` +
              `${accepted.map((type) => `'${type}'`).join(', ')} (§13.2). Declare type="${accepted[0]}", ` +
              `or point setter= at a new method on your own class.`,
            bind.loc,
            bind.type,
            accepted,
          ),
        );
      }
      continue;
    }

    // --- Step 3: Otherwise a drawing manifest's setter= names one of its props ---
    const prop = drawingProps.find((candidate) => candidate.name === bind.setter);
    if (prop === undefined) {
      continue; // A new method on the author's own class: the C++ compiler checks it.
    }
    if (prop.name === 'x' || prop.name === 'y' || prop.name === 'width' || prop.name === 'height') {
      const geometry = geometryBindingFor(prop.name);
      if (geometry.binding !== bind.name) {
        diagnostics.push(bindingAliasDiagnostic(manifest, bind, [geometry.binding], 'own'));
      }
    }
    const subjectType = SUBJECT_TYPE_OF_PROP[prop.type];
    if (subjectType !== undefined && subjectType !== bind.type) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.TYPE_MISMATCH,
          `Widget '${manifest.name}' declares <bind name="${bind.name}" type="${bind.type}" ` +
            `setter="${bind.setter}">, but prop '${prop.name}' is of type '${prop.type}' and takes a ` +
            `'${subjectType}' subject (§13.2). Declare type="${subjectType}".`,
          bind.loc,
          bind.type,
          [subjectType],
        ),
      );
    }
  }
  return diagnostics;
}

// bindingAliasDiagnostic
// The one diagnostic for a `<bind>` that reaches a setter under another name (§13.1).
// A geometry setter gets [D-20]'s consequence, since origin, clamp and anchor are
// keyed by name; any other gets [UD-5]'s, since the editor would show a name the
// runtime does not use.
//   manifest — the declaring manifest
//   bind     — the offending `<bind>`
//   expected — the inherited binding name(s) to write instead
//   origin   — whose setter it is: 'inherited' from an ancestor, or the drawing
//              element's 'own' prop, which words the cause accordingly
function bindingAliasDiagnostic(
  manifest: WidgetManifest,
  bind: BindDef,
  expected: readonly string[],
  origin: 'inherited' | 'own',
): Diagnostic {
  const geometry = expected.some((name) => geometryBindingNamed(name) !== undefined);
  const names = expected.map((name) => `name="${name}"`).join(' or ');
  const consequence = geometry
    ? `geometry bindings keep their names so origin and clamping apply, and under another name the ` +
      `generated call does not compile`
    : `the editor's property panel and diagnostics would show '${bind.name}', a name the runtime ` +
      `does not use`;
  const citation = geometry ? '§13.1, §8.4, [D-20]' : '§13.1, [UD-5]';
  const cause =
    origin === 'own'
      ? `binds its own prop '${bind.setter}' under another name`
      : `reaches a setter that is bound under another name`;
  return createDiagnostic(
    DIAGNOSTIC_CODES.BINDING_ALIAS,
    `Widget '${manifest.name}' declares <bind name="${bind.name}" setter="${bind.setter}">, which ` +
      `${cause}. Write ${names}: ${consequence} (${citation}).`,
    bind.loc,
    bind.name,
    expected,
  );
}

/**
 * Validates document schema structure, version, and required attributes.
 */
export function validateSchema(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { project, globals, screens, manifests } = input;

  // --- 1. Project-level schema validation ---
  if (project) {
    if (project.schema === '0.3') {
      // §15.4: 0.3 is a known-superseded version, not merely an unknown one —
      // the CLI can name exactly what changed, so it must, rather than
      // failing with the same generic message an unrecognised string would
      // get. This is the refusal path the schema bump exists to justify
      // (rules/03-versioning.md: "a bump without the migration message is a
      // silent break wearing a version number").
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION,
          `Schema version '0.3' is no longer supported (now '${VALID_SCHEMA_VERSION}'). ` +
            `Required changes:\n` +
            SCHEMA_0_3_MIGRATIONS.map((m, i) => `  ${i + 1}. ${m}`).join('\n'),
          project.loc,
          project.schema,
          [VALID_SCHEMA_VERSION],
        ),
      );
    } else if (!project.schema || project.schema !== VALID_SCHEMA_VERSION) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
          `Unknown or unsupported schema version '${project.schema || ''}'. Expected '${VALID_SCHEMA_VERSION}'.`,
          project.loc,
          project.schema || undefined,
          [VALID_SCHEMA_VERSION],
        ),
      );
    }

    if (!project.name) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          "Missing required attribute 'name' on <u8g2gl>.",
          project.loc,
          'name',
        ),
      );
    }

    if (!project.version) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          "Missing required attribute 'version' on <u8g2gl>.",
          project.loc,
          'version',
        ),
      );
    }

    if (project.targets) {
      for (const target of project.targets) {
        if (!target.name) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.MISSING_REQUIRED,
              "Missing required attribute 'name' on <target>.",
              target.loc,
              'name',
            ),
          );
        }

        if (!target.setup) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.MISSING_REQUIRED,
              `Missing required attribute 'setup' on target '${target.name}'.`,
              target.loc,
              'setup',
            ),
          );
        }

        if (target.rotation && !VALID_ROTATIONS.has(target.rotation)) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
              `Invalid rotation '${target.rotation}' on target '${target.name}'. Expected one of: ${Array.from(VALID_ROTATIONS).join(', ')}.`,
              target.loc,
              target.rotation,
              Array.from(VALID_ROTATIONS),
            ),
          );
        }
      }
    }

    // --- 1b. <output prefix> cannot be honoured (§13.4, PR-04 WO9) ---
    // `<output prefix>` has been parsed since PR-02 and read by nothing, so an
    // author could set it and quietly get `ui_` anyway (PR-04 WO5b finding 4).
    // It cannot be made to mean anything: §13.4 fixes every generated identifier
    // at `ui_` — `ui_screen_home_init`, `ui_subject_temperature`,
    // `ui_style_header` — and §13.7's file names are that same stem, so a prefix
    // could only rename the files while the identifiers inside them kept `ui_`.
    // That is precisely the mismatch §13.4's "never silently renamed" rule
    // exists to prevent: generated code must read against the author's XML.
    //
    // So it is diagnosed rather than accepted silently. `prefix="ui_"` is
    // allowed: it asks for exactly what the generator already does, so it is a
    // redundant restatement rather than a request that cannot be met, and
    // erroring on it would reject a harmless document.
    // --- 1c. <output dir> must stay inside the project (§13.10, PR-04 WO12) ---
    // §13.10 draws the boundary and the writer enforces it *relative to the
    // directory it is handed* — so `dir="../src"` validated cleanly and the
    // writer, pointed at the application's own sources, would happily delete any
    // file there carrying the GENERATED marker. Checked lexically rather than by
    // resolving a real path, because this module is isomorphic and `src/core/`
    // may not touch the filesystem or `node:path` (typescript.md §1); a lexical
    // check is also the stricter one, since it refuses an absolute path outright
    // instead of asking whether it happens to land inside the project today.
    const dir = project.output?.dir;
    if (dir !== undefined && outputDirEscapes(dir)) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.OUTPUT_DIR_OUTSIDE_PROJECT,
          `'dir="${dir}"' on <output> resolves outside the project. §13.10 generates only into the ` +
            `configured output directory and never into the application's own sources, and the writer ` +
            `deletes stale generated files anywhere beneath the directory it is given. Name a ` +
            `directory inside the project, such as dir="generated".`,
          project.output?.loc ?? project.loc,
          dir,
          ['generated'],
        ),
      );
    }

    const prefix = project.output?.prefix;
    if (prefix !== undefined && prefix !== GENERATED_IDENTIFIER_PREFIX) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
          `'prefix="${prefix}"' on <output> cannot be honoured: §13.4 fixes every generated ` +
            `identifier at '${GENERATED_IDENTIFIER_PREFIX}', and the generated file names are that ` +
            `same stem, so a prefix would leave the file names disagreeing with the identifiers ` +
            `inside them. Remove it, or write prefix="${GENERATED_IDENTIFIER_PREFIX}".`,
          project.output?.loc ?? project.loc,
          prefix,
          [GENERATED_IDENTIFIER_PREFIX],
        ),
      );
    }
  }

  // --- 2. Globals schema validation ---
  if (globals) {
    for (const c of globals.consts ?? []) {
      if (!c.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            "Missing required attribute 'name' on <const>.",
            c.loc,
            'name',
          ),
        );
      }
      if (!c.type) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'type' on const '${c.name}'.`,
            c.loc,
            'type',
          ),
        );
      } else if (c.type !== 'int' && c.type !== 'string') {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid type '${c.type}' on const '${c.name}'. Expected 'int' or 'string'.`,
            c.loc,
            c.type,
            ['int', 'string'],
          ),
        );
      }
      if (c.value === undefined || c.value === '') {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'value' on const '${c.name}'.`,
            c.loc,
            'value',
          ),
        );
      } else if (c.type === 'int') {
        // §7.2: constants are validated where they are declared, not only where
        // used — an unused bad constant was otherwise never reported. The literal
        // rule is the resolver's own, so declaration and use cannot disagree.
        const literal = integerLiteralValue(c.value);
        if (literal === undefined) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.NON_INTEGER_CONSTANT,
              `Constant '${c.name}' is an <int> whose value '${c.value}' is not an integer literal (§7.2).`,
              c.loc,
              c.value,
            ),
          );
        } else if (literal < INT32_MIN || literal > INT32_MAX) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.INTEGER_OVERFLOW,
              `Constant '${c.name}' has value ${c.value}, outside the int32_t range ` +
                `(${INT32_MIN}..${INT32_MAX}) an <int> holds (§13.2).`,
              c.loc,
              c.value,
            ),
          );
        }
      }
      // §7.2: the built-in constant names are reserved. A <const> of that name
      // could never be used — the built-in always wins — so it is an error at the
      // declaration rather than a silent shadow.
      if (c.name && BUILTIN_CONSTANTS.includes(c.name)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_NAME,
            `Constant name '${c.name}' is reserved: '#${c.name}' is a built-in the resolver supplies ` +
              `(§7.2), so this declaration could never be used. Rename it.`,
            c.loc,
            c.name,
          ),
        );
      }
    }

    for (const s of globals.subjects ?? []) {
      if (!s.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            "Missing required attribute 'name' on <subject>.",
            s.loc,
            'name',
          ),
        );
      }
      if (!s.type) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'type' on subject '${s.name}'.`,
            s.loc,
            'type',
          ),
        );
      } else if (!VALID_SUBJECT_TYPES.has(s.type)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid type '${s.type}' on subject '${s.name}'. Expected one of: ${Array.from(VALID_SUBJECT_TYPES).join(', ')}.`,
            s.loc,
            s.type,
            Array.from(VALID_SUBJECT_TYPES),
          ),
        );
      }
      const valueDiagnostic = checkSubjectValue(s);
      if (valueDiagnostic) {
        diagnostics.push(valueDiagnostic);
      }
    }

    for (const style of globals.styles ?? []) {
      diagnostics.push(...unknownStyleAttributes(style));
      diagnostics.push(...checkStyleValues(style, manifests));
      if (!style.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            "Missing required attribute 'name' on <style>.",
            style.loc,
            'name',
          ),
        );
      }
    }

    for (const font of globals.fonts ?? []) {
      if (!font.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            "Missing required attribute 'name' on font declaration.",
            font.loc,
            'name',
          ),
        );
      }
      if (font.kind === 'bdf' && !font.src) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'src' on BDF font '${font.name}'.`,
            font.loc,
            'src',
          ),
        );
      }
      if (font.kind === 'bdf' && font.range !== undefined) {
        // Same grammar module compileBdf() uses to translate `range` for bdfconv, so
        // `validate` and codegen cannot disagree about what a range means.
        const parsedRange = parseBdfRange(font.range);
        if (!parsedRange.ok) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.MALFORMED_BDF_RANGE,
              `Malformed 'range' on BDF font '${font.name}': ${parsedRange.reason}`,
              font.loc,
              'range',
            ),
          );
        }
      }
    }

    for (const img of globals.images ?? []) {
      if (!img.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            "Missing required attribute 'name' on image declaration.",
            img.loc,
            'name',
          ),
        );
      }
      if (!img.src) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'src' on image '${img.name}'.`,
            img.loc,
            'src',
          ),
        );
      }
      if (img.kind === 'convert') {
        // §14.2: the attributes `<convert>` already has, judged from the one
        // definition the asset step also consults.
        for (const problem of convertDeclProblems(img.name, img)) {
          diagnostics.push(
            createDiagnostic(
              problem.attribute === 'mode' ? DIAGNOSTIC_CODES.INVALID_ENUM_VALUE : DIAGNOSTIC_CODES.TYPE_MISMATCH,
              problem.message,
              img.loc,
              problem.offendingText,
              problem.suggestions,
            ),
          );
        }
      }
    }
  }

  // --- 3. Screen schema validation ---
  for (const screen of screens ?? []) {
    for (const style of screen.styles ?? []) {
      diagnostics.push(...unknownStyleAttributes(style));
      diagnostics.push(...checkStyleValues(style, manifests));
    }
    if (!screen.name) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          "Missing required attribute 'name' on <screen>.",
          screen.loc,
          'name',
        ),
      );
    }
    if (!screen.view) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `Missing required <view> container in screen '${screen.name}'.`,
          screen.loc,
          'view',
        ),
      );
    }
    if (screen.view?.focusRing) {
      for (const entry of screen.view.focusRing.entries) {
        if (!entry.name) {
          diagnostics.push(
            createDiagnostic(
              DIAGNOSTIC_CODES.MISSING_REQUIRED,
              `Missing required attribute 'name' on <focus> entry in screen '${screen.name}'.`,
              entry.loc,
              'name',
            ),
          );
        }
      }
    }

  }

  // --- 4. Composite schema validation ---
  // Declared, not effective, manifests: these checks are about what a file
  // itself declares, so an inherited prop is reported once, against its owner.
  for (const component of manifests.declaredComposites) {
    if (!component.name) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          "Missing required attribute 'name' on composite <widget>.",
          component.loc,
          'name',
        ),
      );
    }

    for (const prop of component.api?.props ?? []) {
      if (!prop.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'name' on <prop> in composite '${component.name}'.`,
            prop.loc,
            'name',
          ),
        );
      }
      if (!prop.type) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'type' on prop '${prop.name}' in composite '${component.name}'.`,
            prop.loc,
            'type',
          ),
        );
      } else if (!VALID_PROP_TYPES.has(prop.type)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid type '${prop.type}' on prop '${prop.name}' in composite '${component.name}'. Expected one of: ${Array.from(VALID_PROP_TYPES).join(', ')}.`,
            prop.loc,
            prop.type,
            Array.from(VALID_PROP_TYPES),
          ),
        );
      }
      const contradiction = checkRequiredWithDefault(prop, `composite '${component.name}'`);
      if (contradiction) {
        diagnostics.push(contradiction);
      }
    }
  }

  // --- 5. Widget manifest schema validation ---
  for (const manifest of manifests.declaredWidgets) {
    if (!manifest.name) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          "Missing required attribute 'name' on <widget>.",
          manifest.loc,
          'name',
        ),
      );
    }
    // The `extends` rule (PR-04 WO3). `extends` names real C++ inheritance
    // (§6.5), so whether it is required follows from whether there is a class:
    //   - `setter=` props mean a class, which must name its base — except the
    //     root class manifest, which is the base;
    //   - `draw=` props only mean a drawing element with no class ([D-18]),
    //     which therefore has nothing to extend;
    //   - a composite (declaredComposites, not this loop) needs none, because
    //     the registry supplies u8g2gl_obj.
    // A manifest with neither kind of prop is left alone: an `<api>` with no
    // new props is how §6.5 says to give an existing class a manifest.
    //
    // A manifest mixing the two kinds (PR-04 WO5a) is reported instead of either
    // `extends` diagnostic: [D-18] gives an element one emission target or the
    // other, so neither `extends` answer would be right until it picks one. A
    // single prop carrying both is the per-prop OVERCONSTRAINED error below,
    // not a mixed manifest, so each kind is found among props declaring only it.
    const props = manifest.api?.props ?? [];
    const hasSetterProp = props.some((p) => p.setter !== undefined);
    const setterOnlyProp = props.find((p) => p.setter !== undefined && p.draw === undefined);
    const drawOnlyProp = props.find((p) => p.draw !== undefined && p.setter === undefined);
    if (setterOnlyProp && drawOnlyProp) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MIXED_EMISSION_TARGETS,
          `Widget '${manifest.name}' mixes emission targets: prop '${setterOnlyProp.name}' declares ` +
            `setter="${setterOnlyProp.setter}" and prop '${drawOnlyProp.name}' declares ` +
            `draw="${drawOnlyProp.draw}". A manifest declares setter= props (an element with a ` +
            `class) or draw= props (a drawing element), never both ([D-18], §13.1).`,
          manifest.loc,
          `${setterOnlyProp.name}, ${drawOnlyProp.name}`,
        ),
      );
    } else if (hasSetterProp && !manifest.extends && manifest.name !== ROOT_CLASS_MANIFEST) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `Missing required attribute 'extends' on widget '${manifest.name}'.`,
          manifest.loc,
          'extends',
        ),
      );
    } else if (isDrawingElement(manifest) && manifest.extends !== undefined) {
      diagnostics.push(
        createDiagnostic(
          DIAGNOSTIC_CODES.DRAWING_ELEMENT_EXTENDS,
          `Drawing element '${manifest.name}' declares extends="${manifest.extends}", but a ` +
            `drawing element (draw= props only) has no class to inherit from; remove 'extends'.`,
          manifest.loc,
          'extends',
        ),
      );
    }
    for (const prop of manifest.api?.props ?? []) {
      if (!prop.name) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'name' on prop in widget '${manifest.name}'.`,
            prop.loc,
            'name',
          ),
        );
      }
      if (!prop.type) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute 'type' on prop '${prop.name}' in widget '${manifest.name}'.`,
            prop.loc,
            'type',
          ),
        );
      } else if (!VALID_PROP_TYPES.has(prop.type)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid type '${prop.type}' on prop '${prop.name}' in widget '${manifest.name}'. Expected one of: ${Array.from(VALID_PROP_TYPES).join(', ')}.`,
            prop.loc,
            prop.type,
            Array.from(VALID_PROP_TYPES),
          ),
        );
      }
      const contradiction = checkRequiredWithDefault(prop, `widget '${manifest.name}'`);
      if (contradiction) {
        diagnostics.push(contradiction);
      }
      // A property reaches the display through exactly one of two emission
      // targets ([D-18], §13.1): `setter` for a method on the element's own
      // class, or `draw` for a free `u8g2gl_draw_*` function on a drawing
      // element with no class. WO4 made `setter` optional and added `draw`
      // as its alternative; requiring `setter` unconditionally here (as
      // before WO4) meant every `draw=` prop drew a spurious diagnostic.
      if (!prop.setter && !prop.draw) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Prop '${prop.name}' in widget '${manifest.name}' must declare exactly one of 'setter' or 'draw'; neither is present.`,
            prop.loc,
            'setter',
          ),
        );
      } else if (prop.setter && prop.draw) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.OVERCONSTRAINED,
            `Prop '${prop.name}' in widget '${manifest.name}' must declare exactly one of 'setter' or 'draw'; both are present.`,
            prop.loc,
            'setter, draw',
          ),
        );
      }
    }
    diagnostics.push(...checkBindDeclarations(manifest, manifests));
  }

  // --- 6. Composite `<bind>` declarations: the same rule as a class's ---
  for (const composite of manifests.declaredComposites) {
    diagnostics.push(...checkBindDeclarations(composite, manifests));
  }

  return diagnostics;
}
