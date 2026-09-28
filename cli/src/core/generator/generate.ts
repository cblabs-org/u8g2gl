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
 *              hands the validated, realised model to `emit/`, which renders the
 *              §13.7 file set — `u8g2gl_generated_config.h`, `ui.hpp`, the
 *              subjects, styles, fonts and images units, and one `.cpp` per
 *              screen in document order — each opening with its header stamp.
 *
 *              PR-04 WO8b added the analysis emission reads: every element's
 *              realisation and the flat object model (§13.5, §13.3), and the
 *              static capacities counted from them ([D-21]). WO9 emitted the
 *              project-level files from it; WO10 emits `ui.cpp` and every
 *              screen's unit — objects, parent tables, draw calls — from the
 *              same realisation and resolution.
 *
 *              Emission can raise diagnostics of its own, for the two defects no
 *              pass can see — an unreadable `<xbm>` asset and a subject's
 *              declared value — and they refuse the build like any other error.
 *
 * Exports:
 * - GENERATE_REFUSAL_POLICY: Always 'error' — the build refuses what it cannot emit
 * - GenerateInput:   A loaded project, the target to build and the generator version
 * - GeneratedFile:   One output file: output-relative path and full text
 * - GenerateResult:  Files, diagnostics and counts
 * - generate():      Validate, then lay out the file set
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { BdfFontDecl } from '../schema/globals.js';
import type { Target } from '../schema/project.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { RefusalPolicy } from '../validator/validate-not-yet-supported.js';
import { createScreenPipeline, findTargetDisplay, type ResolvedScreen } from '../resolver/index.js';
import { checkProject, finaliseDiagnostics, type ProjectModel } from './check-project.js';
import { emitProjectFiles } from './emit/index.js';
import { computeCapacities, realiseScreens, type Capacities, type RealisedScreen } from '../realise/index.js';
import type { CompiledFont } from '../fonts/index.js';
import type { CompileProjectAssetsResult } from '../assets/index.js';

/**
 * The not-yet-supported policy `generate()` applies. Fixed, not a parameter: a
 * build that emitted code without a construct it cannot build would silently
 * drop part of the UI (PR-04 decision 1).
 */
export const GENERATE_REFUSAL_POLICY: RefusalPolicy = 'error';

/**
 * Everything `generate()` needs.
 */
export interface GenerateInput extends ProjectModel {
  /** `<target>` name to build. Defaults to the first target the project declares. */
  readonly target?: string;
  /** Version of the CLI running, stamped into every file (§13.9). */
  readonly generatorVersion: string;
  /**
   * Asset file **bytes** by the `src` path its declaration names (§14.1,
   * §14.2, PR-04b WO3 item 2) — an `<xbm>`'s bytes and a `<bdf>`'s source are
   * both compiled into the generated code, so emission needs them.
   *
   * Passed in rather than read, because this module is isomorphic and
   * `src/core/` may not touch the filesystem (typescript.md §1): the Node
   * loader reads them from disk and the designer will supply them from editor
   * buffers. Absent is the same as empty — the images emitter reports any asset
   * it needed and did not get.
   */
  readonly assets?: ReadonlyMap<string, Uint8Array>;
  /**
   * Every `<bdf>` font already compiled, and any diagnostic compiling one
   * raised — from `compileProjectAssets()`, run **before** `generate()`
   * because it is asynchronous and this function is not (PR-04b WO3 item 3).
   *
   * Absent means the host never called it. `generate()` treats that as a
   * programming error rather than a silently empty build: any `<bdf>` the
   * document declares is reported as `U8G2GL_MISSING_COMPILED_FONT` rather
   * than emitted with no data, or dropped without a trace as it would be if
   * a build simply skipped fonts it did not recognise.
   */
  readonly compiledAssets?: CompileProjectAssetsResult;
  /**
   * Licence-like files found beside each `<bdf>`'s own source file, keyed by
   * font `name`, sorted and project-relative (§14.1's provenance rule,
   * PR-04b WO3 item 5) — a directory listing, which `src/core/` may not do
   * (typescript.md §1). Absent is the same as empty: no licence line is
   * emitted for a font with no entry.
   */
  readonly bdfLicenceFiles?: ReadonlyMap<string, readonly string[]>;
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
  /**
   * What every element became and where it sits in the flat object model
   * (§13.5, §13.3), in the same order as {@link resolved} — the two are views
   * of one expanded tree. Present only when files were produced; WO10 emits the
   * objects, parent tables and draw calls from it.
   */
  readonly realised?: readonly RealisedScreen[];
  /**
   * The static capacities counted from what was realised ([D-21]). Present only
   * when files were produced; WO9 emits `u8g2gl_generated_config.h` from it and
   * §18 reports it.
   */
  readonly capacities?: Capacities;
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

// missingCompiledFontDiagnostic
// The internal-error diagnostic for a <bdf> generate() has no compiled entry
// for (PR-04b WO3 item 3) — see GenerateInput.compiledAssets's doc comment.
//   font — the declaration with no entry
function missingCompiledFontDiagnostic(font: BdfFontDecl): Diagnostic {
  const loc = font.loc;
  return {
    code: DIAGNOSTIC_CODES.MISSING_COMPILED_FONT,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message:
      `<bdf> font '${font.name}' has no compiled entry. 'u8g2gl generate' never compiles a <bdf> itself — ` +
      `the host must call compileProjectAssets() first and pass its result as GenerateInput.compiledAssets ` +
      `— so this means that step was never run, or it silently dropped this font.`,
    offendingText: font.name,
  };
}

// compiledFontDiagnostics
// Every diagnostic generate() owes its caller about <bdf> compilation: the
// asset compile step's own diagnostics (a missing source file, or bdfconv
// failing — both located and named by compileProjectAssets()), plus a loud,
// internal-error diagnostic for any <bdf> that is neither compiled nor already
// accounted for by one of those — which can only mean the host never called
// compileProjectAssets() at all, or silently dropped a font it returned.
//   input         — generate's own input; reads `globals.fonts` and `compiledAssets`
//   compiledFonts — input.compiledAssets?.fonts ?? new Map()
function compiledFontDiagnostics(
  input: GenerateInput,
  compiledFonts: ReadonlyMap<string, CompiledFont>,
): readonly Diagnostic[] {
  const assetDiagnostics = input.compiledAssets?.diagnostics ?? [];
  const diagnosedFontNames = new Set(
    assetDiagnostics.map((d) => d.offendingText).filter((name): name is string => name !== undefined),
  );
  const missing: Diagnostic[] = [];
  for (const font of input.globals.fonts ?? []) {
    if (font.kind === 'bdf' && !compiledFonts.has(font.name) && !diagnosedFontNames.has(font.name)) {
      missing.push(missingCompiledFontDiagnostic(font));
    }
  }
  return [...assetDiagnostics, ...missing];
}

/**
 * @brief Validates a project and lays out its generated files.
 *
 * Runs {@link checkProject} under {@link GENERATE_REFUSAL_POLICY} —
 * the same validation `validate` runs, with not-yet-supported constructs as
 * errors. If any error remains, no files are produced. Never throws for a user
 * error.
 *
 * @param input Loaded project, target name and generator version.
 * @return Files in emission order (empty on any error), and sorted diagnostics.
 */
export function generate(input: GenerateInput): GenerateResult {
  // --- Step 1: Choose the target, so validation checks the display being built ---
  // A screen that fits the first target can overflow this one (§7.2, §7.3), so
  // bounds, int16_t fit and positioning are judged for the target generated. An
  // unknown target falls back to the first for validation, and is reported below.
  const target = resolveTarget(input);

  // --- Step 2: Expand once and resolve once, against the display being built ---
  // This is the model WO9/WO10 emit from, and handing the same one to validation
  // is what makes "validated" and "generated" the same document (§13.11 step 3,
  // PR-04 WO8a). Before this, `generate` validated an expanded tree and then
  // resolved an *unexpanded* one of its own, so its resolved model had no
  // composite interiors at all (WO7 F2) and the first target was resolved twice
  // (WO6 finding 11). An unresolved target has no display to build for; the
  // refusal below reports it, and validation falls back to the first target.
  const display = 'code' in target ? undefined : findTargetDisplay(target, input.catalogue);
  const pipeline =
    'code' in target
      ? undefined
      : createScreenPipeline({
          globals: input.globals,
          screens: input.screens,
          manifests: input.manifests,
          ...(display ? { display } : {}),
        });

  // --- Step 3: Decide what every element becomes ---
  // Realisation runs on the very model validation is about to judge — the
  // pipeline built for *this* target (§13.11 step 3) — so what is counted is
  // what will be emitted. It runs *before* validation, not after, because
  // Pass 9 judges it: the exact object count against §13.3's ceiling, and
  // realisation's own refusals at this journey's severity. One realisation per
  // build, and one object count in the codebase (PR-04 WO8c).
  const realisation =
    pipeline === undefined
      ? undefined
      : realiseScreens({ globals: input.globals, manifests: input.manifests, expansion: pipeline.expansion });

  // --- Step 4: Validate exactly as `validate` does, refusing unsupported constructs ---
  const validated = checkProject(
    input,
    GENERATE_REFUSAL_POLICY,
    'code' in target ? undefined : target,
    pipeline,
    realisation,
  );
  // Never compiled here — `compileProjectAssets()` is asynchronous and this
  // function is not (PR-04b WO3 item 3); its result, and the diagnostics it
  // raised, arrive through `input.compiledAssets`.
  const compiledFonts = input.compiledAssets?.fonts ?? new Map<string, CompiledFont>();
  const checked = finaliseDiagnostics([...validated.diagnostics, ...compiledFontDiagnostics(input, compiledFonts)]);
  if (checked.errors > 0) {
    return { files: [], ...checked, ...('code' in target ? {} : { target: target.name }) };
  }
  if ('code' in target) {
    return {
      files: [],
      diagnostics: [...checked.diagnostics, target],
      errors: checked.errors + 1,
      warnings: checked.warnings,
    };
  }

  // --- Step 5: Count the capacities from what was realised ([D-21]) ---
  // No second resolution and no second count: Pass 6 judged this very model
  // against this very display, and these are the objects and bindings Pass 9
  // has just checked against §13.3's ceiling (PR-04 WO8c).
  const capacities =
    realisation === undefined
      ? undefined
      : computeCapacities({ globals: input.globals, screens: realisation.screens });

  // --- Step 6: Emit every file (§13.7) ---
  // The screens are emitted from the very realisation Pass 9 judged and the very
  // resolution Pass 6 judged — the pipeline built for this target — so what is
  // written is what was validated (PR-04 WO10).
  const emitted =
    capacities === undefined || realisation === undefined || pipeline === undefined
      ? { files: [] as readonly GeneratedFile[], diagnostics: [] }
      : emitProjectFiles({
          project: input.project,
          globals: input.globals,
          screens: input.screens,
          realised: realisation.screens,
          resolved: pipeline.resolution.screens,
          manifests: input.manifests,
          capacities,
          assets: input.assets ?? new Map<string, Uint8Array>(),
          compiledFonts,
          bdfLicenceFiles: input.bdfLicenceFiles ?? new Map<string, readonly string[]>(),
          generatorVersion: input.generatorVersion,
          target: target.name,
        });

  // Emission sees two defects validation cannot: an `<xbm>` asset, which is not
  // read until now, and a subject's declared `value`, which no pass type-checks.
  // Both are the author's, so they refuse the build exactly as a validation
  // error does — a partial set is never written ([D-11]).
  const finalised = finaliseDiagnostics([...checked.diagnostics, ...emitted.diagnostics]);
  if (finalised.errors > 0) {
    return { files: [], ...finalised, target: target.name };
  }

  return {
    files: emitted.files,
    ...finalised,
    target: target.name,
    ...(pipeline !== undefined ? { resolved: pipeline.resolution.screens } : {}),
    ...(realisation !== undefined ? { realised: realisation.screens } : {}),
    ...(capacities !== undefined ? { capacities } : {}),
  };
}
