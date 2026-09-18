/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/index.ts
 * Purpose: Public entry point for emission, and the one place the emitted file
 *          **set and order** are decided (§13.7, §13.9). Order is not a detail:
 *          generated output is committed and read in review ([D-11]), so a file
 *          list that depended on map or hash order would churn a diff for no
 *          reason. Project units first, in a fixed order, then screens in load
 *          order.
 * Description: `emitProjectFiles()` renders every generated file — the project
 *              units (WO9), `ui.cpp` with `ui_init()`, and one translation unit
 *              per screen (WO10) — and returns them with any diagnostics
 *              emission raised.
 *
 *              It also re-exports the two **shared helpers** the rest of the
 *              programme is built on — the §13.2 value spelling and the
 *              draw-argument order. WO10's firmware emission and WO11's editor
 *              target use these rather than spelling a setter call or an
 *              argument list of their own, and WO11's parity test is what holds
 *              them to it.
 *
 * Exports:
 * - cppValue, cppStringLiteral, cppEnumerator (value.ts) — §13.2's type mapping
 * - drawCallFor, DrawCall, DrawCallInput, SUBJECT_READ_SUFFIX (draw-args.ts)
 * - parseXbm, XbmImage (xbm.ts)
 * - EmittedUnit, ProjectEmitInput, section, includeBlock (unit.ts)
 * - The per-unit emitters and their file names, including the screen unit
 *   (screen.ts), `ui.cpp` (ui-init.ts) and the coordinate translation they share
 *   with WO11 (placement.ts)
 * - ProjectEmissionInput, ProjectEmission, emitProjectFiles()
 */

import type { Diagnostic } from '../../schema/diagnostic.js';
import type { Globals } from '../../schema/globals.js';
import type { ManifestRegistry } from '../../manifest/index.js';
import type { U8g2glProject } from '../../schema/project.js';
import type { Screen } from '../../schema/screen.js';
import type { ResolvedScreen } from '../../resolver/index.js';
import type { Capacities, RealisedScreen } from '../realise/index.js';
import { formatHeaderStamp } from '../header.js';
import { emitGeneratedConfigHeader, GENERATED_CONFIG_HEADER } from './generated-config.js';
import { emitFontsUnit, FONTS_UNIT } from './fonts.js';
import { emitImagesUnit, IMAGES_UNIT } from './images.js';
import { emitStylesUnit, STYLES_UNIT } from './styles.js';
import { emitSubjectsUnit, SUBJECTS_UNIT } from './subjects.js';
import { emitScreenUnit, screenUnitPath } from './screen.js';
import { emitUiHeader, UI_HEADER } from './ui-hpp.js';
import { emitUiInitUnit, UI_INIT_UNIT } from './ui-init.js';
import type { EmittedUnit, ProjectEmitInput } from './unit.js';

export { cppEnumerator, cppStringLiteral, cppValue } from './value.js';
export {
  drawCallFor,
  SUBJECT_READ_SUFFIX,
  type DrawCall,
  type DrawCallInput,
} from './draw-args.js';
export { parseXbm, type XbmImage, type XbmParseError } from './xbm.js';
export {
  declarationError,
  includeBlock,
  section,
  type EmittedUnit,
  type ProjectEmitInput,
} from './unit.js';
export { emitGeneratedConfigHeader, GENERATED_CONFIG_HEADER } from './generated-config.js';
export { emitFontsUnit, fontDeclarations, FONTS_UNIT, type FontDeclaration } from './fonts.js';
export {
  emitImagesUnit,
  imageDeclarations,
  IMAGES_UNIT,
  PROGMEM_MACRO,
  type ImageDeclaration,
} from './images.js';
export { emitStylesUnit, styleIdentifiers, STYLES_INIT_FUNCTION, STYLES_UNIT } from './styles.js';
export {
  emitSubjectsUnit,
  subjectDeclarations,
  SUBJECTS_INIT_FUNCTION,
  SUBJECTS_UNIT,
  type SubjectDeclaration,
} from './subjects.js';
export { emitUiHeader, screenDescriptorIdentifier, UI_HEADER, UI_INIT_FUNCTION } from './ui-hpp.js';
export { emitUiInitUnit, UI_INIT_UNIT } from './ui-init.js';
export { emitScreenUnit, screenUnitPath, type ScreenEmitInput } from './screen.js';
export { absoluteElement, childOrigin, DISPLAY_ORIGIN, type Origin } from './placement.js';

/** Everything emission needs about one build. */
export interface ProjectEmissionInput {
  readonly project: U8g2glProject;
  readonly globals: Globals;
  /** Screens in load order — the order their units are emitted in (§13.9). */
  readonly screens: readonly Screen[];
  /** Realisation's answer per screen, in the same order as {@link screens} (WO8b). */
  readonly realised: readonly RealisedScreen[];
  /** Each screen resolved against the target's display, in the same order. */
  readonly resolved: readonly ResolvedScreen[];
  /** Effective manifests, for each element's props, setters and class. */
  readonly manifests: ManifestRegistry;
  /** WO8b's counted capacities ([D-21]). Emitted, never recounted. */
  readonly capacities: Capacities;
  /** Asset text by `src` path, read by `src/node/`. */
  readonly assets: ReadonlyMap<string, string>;
  /** The CLI's own version, for the stamp (§13.9). Never guessed. */
  readonly generatorVersion: string;
  /** The `<target>` being built, for the stamp. */
  readonly target: string;
}

/** What emission produced. */
export interface ProjectEmission {
  /** Files in emission order. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
  /** What emission found — a missing asset, or a declared value of the wrong type. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Where each generated file's stamp says it came from.
 *
 * The **source document**, not the file being written: a reader of
 * `ui_subjects.cpp` wants to know that editing `globals.xml` is what changes it.
 */
interface UnitPlan {
  readonly path: string;
  /** The document this unit is generated from. */
  readonly source: 'project' | 'globals';
  readonly emit: (input: ProjectEmitInput) => EmittedUnit;
}

/**
 * The project-level units, in emission order.
 *
 * Fixed, and fixed *here*, so the order never depends on iteration order
 * anywhere else (§13.9). The capacity header comes first because it is what
 * every other unit's correctness depends on ([D-21]).
 */
const PROJECT_UNITS: readonly UnitPlan[] = [
  { path: GENERATED_CONFIG_HEADER, source: 'project', emit: emitGeneratedConfigHeader },
  { path: UI_HEADER, source: 'project', emit: emitUiHeader },
  { path: SUBJECTS_UNIT, source: 'globals', emit: emitSubjectsUnit },
  { path: STYLES_UNIT, source: 'globals', emit: emitStylesUnit },
  { path: FONTS_UNIT, source: 'globals', emit: emitFontsUnit },
  { path: IMAGES_UNIT, source: 'globals', emit: emitImagesUnit },
  // Last of the project units: it calls every screen's init and registers the
  // frame-dirty observers, so it depends on everything above (§13.5, §13.7).
  { path: UI_INIT_UNIT, source: 'project', emit: emitUiInitUnit },
];

/**
 * @brief Emits every generated file: the project units, then one unit per
 *        screen in load order (§13.7, §13.9).
 *
 * @param input Project, globals, screens, capacities, assets and the stamp's
 *              inputs.
 * @return Files in emission order, and every diagnostic emission raised. Never
 *         throws for a defect in the project; it throws only for a value
 *         validation should have refused (see `value.ts`).
 */
export function emitProjectFiles(input: ProjectEmissionInput): ProjectEmission {
  const projectSource = input.project.loc?.file ?? 'u8g2gl.xml';
  const globalsSource = input.globals.loc?.file ?? 'globals.xml';
  const stampFor = (source: string): string =>
    formatHeaderStamp({
      source,
      schema: input.project.schema,
      generator: input.generatorVersion,
      target: input.target,
    });

  const files: { path: string; content: string }[] = [];
  const diagnostics: Diagnostic[] = [];

  // --- Step 1: The project-level units, in their fixed order ---
  for (const plan of PROJECT_UNITS) {
    const unit = plan.emit({
      project: input.project,
      globals: input.globals,
      screens: input.screens,
      capacities: input.capacities,
      assets: input.assets,
      stamp: stampFor(plan.source === 'project' ? projectSource : globalsSource),
    });
    diagnostics.push(...unit.diagnostics);
    // A unit that raised an error has no usable content; the build is refused
    // on the diagnostics, so an empty file is never written.
    if (unit.content !== '') {
      files.push({ path: plan.path, content: unit.content });
    }
  }

  // --- Step 2: One unit per screen, in load order (§13.7) ---
  // Realisation and resolution were built from the same expanded screens in the
  // same order, so the three lists line up by position. A mismatch is a broken
  // pipeline, not a user error.
  for (const [index, screen] of input.screens.entries()) {
    const realised = input.realised[index];
    const resolved = input.resolved[index];
    if (realised?.screen !== screen || resolved?.screen !== screen) {
      throw new Error(
        `Screen '${screen.name}' has no matching realised and resolved model at position ${index}; ` +
          `emission must be handed the pipeline built for the screens it emits.`,
      );
    }
    const unit = emitScreenUnit({
      realised,
      resolved,
      manifests: input.manifests,
      stamp: stampFor(screen.loc?.file ?? `screens/screen_${screen.name}.xml`),
    });
    diagnostics.push(...unit.diagnostics);
    if (unit.content !== '') {
      files.push({ path: screenUnitPath(screen.name), content: unit.content });
    }
  }

  return { files, diagnostics };
}
