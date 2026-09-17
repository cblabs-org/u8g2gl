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
 *              may not be both `required` and defaulted.
 *
 * Exports:
 * - validateSchema(input): Runs Pass 1 schema structure validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { ValidateInput } from './validate.js';
import type { PropDef, PropType } from '../schema/widget-manifest.js';
import { ROOT_CLASS_MANIFEST, isDrawingElement } from '../manifest/manifest-registry.js';
import { BUILTIN_CONSTANTS, INT32_MAX, INT32_MIN, integerLiteralValue } from '../resolver/index.js';
import type { SubjectType, DrawColor, TextAlign, FontMode, BitmapMode } from '../schema/globals.js';

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
  "'truncate' is removed: use long_mode=\"clip\" ([D-19])",
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

const VALID_DRAW_COLORS: ReadonlySet<DrawColor> = new Set(['0', '1', 'xor']);
const VALID_TEXT_ALIGNS: ReadonlySet<TextAlign> = new Set(['left', 'center', 'right']);
const VALID_FONT_MODES: ReadonlySet<FontMode> = new Set(['solid', 'transparent']);
const VALID_BITMAP_MODES: ReadonlySet<BitmapMode> = new Set(['solid', 'transparent']);
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
    }

    for (const style of globals.styles ?? []) {
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
      if (style.drawColor && !VALID_DRAW_COLORS.has(style.drawColor)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid drawColor '${style.drawColor}' on style '${style.name}'. Expected one of: ${Array.from(VALID_DRAW_COLORS).join(', ')}.`,
            style.loc,
            style.drawColor,
            Array.from(VALID_DRAW_COLORS),
          ),
        );
      }
      if (style.align && !VALID_TEXT_ALIGNS.has(style.align)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid align '${style.align}' on style '${style.name}'. Expected one of: ${Array.from(VALID_TEXT_ALIGNS).join(', ')}.`,
            style.loc,
            style.align,
            Array.from(VALID_TEXT_ALIGNS),
          ),
        );
      }
      if (style.fontMode && !VALID_FONT_MODES.has(style.fontMode)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid fontMode '${style.fontMode}' on style '${style.name}'. Expected one of: ${Array.from(VALID_FONT_MODES).join(', ')}.`,
            style.loc,
            style.fontMode,
            Array.from(VALID_FONT_MODES),
          ),
        );
      }
      if (style.bitmapMode && !VALID_BITMAP_MODES.has(style.bitmapMode)) {
        diagnostics.push(
          createDiagnostic(
            DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
            `Invalid bitmapMode '${style.bitmapMode}' on style '${style.name}'. Expected one of: ${Array.from(VALID_BITMAP_MODES).join(', ')}.`,
            style.loc,
            style.bitmapMode,
            Array.from(VALID_BITMAP_MODES),
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
    }
  }

  // --- 3. Screen schema validation ---
  for (const screen of screens ?? []) {
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
  }

  return diagnostics;
}
