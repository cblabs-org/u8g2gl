/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/generate.ts
 * Purpose: The generator's entry point: a validated project in, an ordered set of
 *          files out. It runs exactly the validation `validate` runs, with
 *          not-yet-supported constructs as errors, and produces nothing at all if
 *          any error remains. Isomorphic and free of I/O — the Node writer puts
 *          the files on disk, and the designer will hold them in memory.
 * Description: Chooses the target (the named one, or the first declared), then
 *              lays out the §13.7 file set — `u8g2gl_generated_config.h`, `ui.hpp`,
 *              the subjects, fonts and images units, and one `.cpp` per screen in
 *              document order — each opening with its header stamp. PR-04 WO5b
 *              emits the stamps only; WO9 and WO10 fill in the content.
 *
 * Exports:
 * - GENERATE_NOT_YET_SUPPORTED_POLICY: Always 'error' — the build refuses what it cannot emit
 * - GenerateInput:   A loaded project, the target to build and the generator version
 * - GeneratedFile:   One output file: output-relative path and full text
 * - GenerateResult:  Files, diagnostics and counts
 * - generate():      Validate, then lay out the file set
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Target } from '../schema/project.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { NotYetSupportedPolicy } from '../validator/validate-not-yet-supported.js';
import { findTargetDisplay, resolveScreens, type ResolvedScreen } from '../resolver/index.js';
import { checkProject, finaliseDiagnostics, type ProjectModel } from './check-project.js';
import { formatHeaderStamp } from './header.js';

/**
 * The not-yet-supported policy `generate()` applies. Fixed, not a parameter: a
 * build that emitted code without a construct it cannot build would silently
 * drop part of the UI (PR-04 decision 1).
 */
export const GENERATE_NOT_YET_SUPPORTED_POLICY: NotYetSupportedPolicy = 'error';

/**
 * Everything `generate()` needs.
 */
export interface GenerateInput extends ProjectModel {
  /** `<target>` name to build. Defaults to the first target the project declares. */
  readonly target?: string;
  /** Version of the CLI running, stamped into every file (§13.9). */
  readonly generatorVersion: string;
}

/**
 * One generated file.
 */
export interface GeneratedFile {
  /**
   * Path relative to the output directory, forward slashes, no `..`, never
   * absolute. The writer refuses anything else.
   */
  readonly path: string;
  /** Complete file text, LF line endings. */
  readonly content: string;
}

/**
 * The outcome of a generation run.
 */
export interface GenerateResult {
  /**
   * Files in emission order. Empty whenever `errors` is non-zero: a refused build
   * produces nothing rather than a partial set.
   */
  readonly files: readonly GeneratedFile[];
  /** Load, validation and generation diagnostics, sorted by file, line, column. */
  readonly diagnostics: readonly Diagnostic[];
  readonly errors: number;
  readonly warnings: number;
  /** Name of the target built, when one was resolved. */
  readonly target?: string;
  /**
   * Every screen with its geometry resolved to literal integers against the
   * built target's display (§13.11 step 3), in load order. Present only when
   * files were produced; WO9 and WO10 emit from it.
   */
  readonly resolved?: readonly ResolvedScreen[];
}

// resolveTarget
// The target to build, or a diagnostic saying why there is none.
//   input — generate input; reads `project`, `hasProjectManifest` and `target`
function resolveTarget(input: GenerateInput): Target | Diagnostic {
  const { project } = input;
  const loc = project.loc;
  const at = { file: loc?.file ?? 'u8g2gl.xml', line: loc?.line ?? 1, column: loc?.column ?? 1 };

  // --- Step 1: Generation is per project; a lone document has no target ---
  if (!input.hasProjectManifest) {
    return {
      code: DIAGNOSTIC_CODES.MISSING_FILE,
      severity: 'error',
      ...at,
      message: "'generate' needs a project directory containing u8g2gl.xml; a single file cannot be generated.",
    };
  }

  // --- Step 2: A project declaring no target ---
  const first = project.targets[0];
  if (first === undefined) {
    return {
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      severity: 'error',
      ...at,
      message: "'generate' needs a <target> in u8g2gl.xml, and the project declares none.",
      offendingText: 'target',
    };
  }

  // --- Step 3: The named target, or the first declared ---
  if (input.target === undefined) {
    return first;
  }
  const named = project.targets.find((t) => t.name === input.target);
  if (named) {
    return named;
  }
  const names = project.targets.map((t) => t.name);
  return {
    code: DIAGNOSTIC_CODES.UNKNOWN_TARGET,
    severity: 'error',
    ...at,
    message: `Unknown target '${input.target}'. The project declares: ${names.join(', ')}.`,
    offendingText: input.target,
    ...(findClosest(input.target, names).length > 0 ? { suggestions: findClosest(input.target, names) } : {}),
  };
}

// layoutFiles
// The §13.7 file set, each file a header stamp. Order is fixed — project units,
// then screens in the order loaded — so output never depends on hash or set
// order (§13.9).
//   input  — generate input
//   target — the resolved target
function layoutFiles(input: GenerateInput, target: Target): GeneratedFile[] {
  const projectSource = input.project.loc?.file ?? 'u8g2gl.xml';
  const globalsSource = input.globals.loc?.file ?? 'globals.xml';
  const stamp = (source: string): string =>
    formatHeaderStamp({
      source,
      schema: input.project.schema,
      generator: input.generatorVersion,
      target: target.name,
    });

  // File names are §13.7's. The unit names beyond `ui.hpp` and
  // `u8g2gl_generated_config.h` are placeholders WO9/WO10 may rename; the
  // writer's stale-file cleanup makes a rename safe.
  return [
    { path: 'u8g2gl_generated_config.h', content: stamp(projectSource) },
    { path: 'ui.hpp', content: stamp(projectSource) },
    { path: 'ui_subjects.cpp', content: stamp(globalsSource) },
    { path: 'ui_fonts.cpp', content: stamp(globalsSource) },
    { path: 'ui_images.cpp', content: stamp(globalsSource) },
    ...input.screens.map((screen) => ({
      path: `ui_screen_${screen.name}.cpp`,
      content: stamp(screen.loc?.file ?? `screens/screen_${screen.name}.xml`),
    })),
  ];
}

/**
 * @brief Validates a project and lays out its generated files.
 *
 * Runs {@link checkProject} under {@link GENERATE_NOT_YET_SUPPORTED_POLICY} —
 * the same validation `validate` runs, with not-yet-supported constructs as
 * errors. If any error remains, no files are produced. Never throws for a user
 * error.
 *
 * @param input Loaded project, target name and generator version.
 * @return Files in emission order (empty on any error), and sorted diagnostics.
 */
export function generate(input: GenerateInput): GenerateResult {
  // --- Step 1: Validate exactly as `validate` does, refusing unsupported constructs ---
  const checked = checkProject(input, GENERATE_NOT_YET_SUPPORTED_POLICY);
  if (checked.errors > 0) {
    return { files: [], ...checked };
  }

  // --- Step 2: Choose the target ---
  const target = resolveTarget(input);
  if ('code' in target) {
    return {
      files: [],
      diagnostics: [...checked.diagnostics, target],
      errors: checked.errors + 1,
      warnings: checked.warnings,
    };
  }

  // --- Step 3: Resolve geometry against the built target's display ---
  // Validation resolved against the *first* target. `--target` may name another,
  // whose display can make an expression invalid — `64 / (#screen_width - 128)`
  // is 1 on a 192-wide panel and a division by zero on a 128-wide one — so the
  // chosen target is resolved again and any error refuses the build like any other.
  const resolution = resolveScreens({
    globals: input.globals,
    screens: input.screens,
    manifests: input.manifests,
    display: findTargetDisplay(target, input.catalogue),
  });
  if (resolution.diagnostics.length > 0) {
    const merged = finaliseDiagnostics([...checked.diagnostics, ...resolution.diagnostics]);
    if (merged.errors > 0) {
      return { files: [], ...merged, target: target.name };
    }
  }

  // --- Step 4: Lay out the file set ---
  return { files: layoutFiles(input, target), ...checked, target: target.name, resolved: resolution.screens };
}
