/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/pipeline/live-pipeline.ts
 * Purpose: The text-to-scene half of the live edit loop: from
 *          the project's current texts to diagnostics and the scene the editor
 *          Wasm builds. It is the same sequence `generate` runs — parse,
 *          expand and resolve once, realise, validate that very model, count
 *          capacities, describe the scene — using the CLI's own `core/`, so
 *          what the canvas shows is what the firmware would be generated from.
 *          There is no fast path: every run takes every step.
 * Description: `runTextPipeline` is synchronous and pure apart from the timer.
 *              It refuses to describe a scene while any error stands, because
 *              the scene emitter's contract is a validated model; the caller
 *              then keeps the last good frame, dimmed.
 *              Each stage is timed with `performance.now()` and recorded as a
 *              `performance.mark`, so a keystroke measurement can attribute a slow
 *              keystroke to the stage that spent it.
 *
 *              Alongside the scene it returns each element's device-space
 *              rectangle on the active screen, from the same placement the
 *              scene emitter uses, for the canvas's selection highlight.
 *
 *              It also returns the subjects' declared values, which the
 *              caller applies after every scene, since a rebuild clears them.
 *
 * Exports:
 * - Rect:                  A device-space rectangle
 * - CompiledAssets:        The fonts and images compileProjectAssets() produced
 * - TextPipelineInput:     Texts, cache, assets and the active screen
 * - TextPipelineResult:    Diagnostics, scene, rectangles and stage timings
 * - TEXT_STAGES:           The stages, in order
 * - runTextPipeline():     One run
 * - activeScreenName():    The screen a file shows, or the project's first
 */

import type { CompileProjectAssetsResult } from '@u8g2gl/core/assets/index.js';
import { checkProject, finaliseDiagnostics, GENERATE_REFUSAL_POLICY } from '@u8g2gl/core/generator/index.js';
import { describeScenes } from '@u8g2gl/core/generator/emit/scene.js';
import { placeScreen, type Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import { computeCapacities, realiseScreens } from '@u8g2gl/core/realise/index.js';
import { createScreenPipeline, findTargetDisplay } from '@u8g2gl/core/resolver/index.js';
import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import type { Globals } from '@u8g2gl/core/schema/globals.js';
import type { ProjectModelCache } from '../project/project-model';

/** A device-space rectangle. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What `compileProjectAssets()` produced: the scene's fonts and images. */
export type CompiledAssets = CompileProjectAssetsResult;

/** Everything one run needs. */
export interface TextPipelineInput {
  /** Every project document's current text, by project-relative path. */
  readonly texts: ReadonlyMap<string, string>;
  /** Parses reused across runs. */
  readonly cache: ProjectModelCache;
  /** The project's compiled fonts and images; undefined until compiled once. */
  readonly assets: CompiledAssets | undefined;
  /** The file whose screen the canvas shows, if it is a screen. */
  readonly activeFile: string | undefined;
}

/** One run's outcome. */
export interface TextPipelineResult {
  /** The project model the run was of. */
  readonly model: ProjectModel;
  /** Every diagnostic, deduplicated and sorted (`checkProject`'s order). */
  readonly diagnostics: readonly Diagnostic[];
  readonly errors: number;
  /** The scene as JSON text, or undefined while an error stands. */
  readonly scene: string | undefined;
  /** The screen to show; undefined if the project has none. */
  readonly screen: string | undefined;
  /** The target display's size, if the catalogue knows it. */
  readonly display: { readonly width: number; readonly height: number } | undefined;
  /** Each named element's rectangle on `screen`, by name. */
  readonly bounds: ReadonlyMap<string, Rect>;
  /**
   * Each subject's declared initial value, as the `{ name: value }` JSON
   * `applySampleData` takes: the frame the firmware draws at boot, until sample
   * data (a later step) supplies others.
   */
  readonly subjectValues: string;
  /** Milliseconds per stage, in {@link TEXT_STAGES} order. */
  readonly timings: Readonly<Record<TextStage, number>>;
}

/** The text pipeline's stages, in the order a run takes them. */
export const TEXT_STAGES = ['parse', 'resolve', 'realise', 'validate', 'scene'] as const;

/** One stage name. */
export type TextStage = (typeof TEXT_STAGES)[number];

/**
 * @brief Runs the text pipeline once over the project's current texts.
 *
 * @param input The texts, the parse cache, the compiled assets and the active file.
 * @return Diagnostics, and a scene when the project has no error.
 */
export function runTextPipeline(input: TextPipelineInput): TextPipelineResult {
  const timings = { parse: 0, resolve: 0, realise: 0, validate: 0, scene: 0 };
  let started = performance.now();
  const lap = (stage: TextStage): void => {
    const now = performance.now();
    timings[stage] = now - started;
    performance.mark(`u8g2gl:${stage}`);
    started = now;
  };

  // --- Step 1: Parse, reusing every document whose text did not change ---
  const model: ProjectModel = input.cache.build(input.texts);
  lap('parse');

  // --- Step 2: Expand and resolve once, against the target's display ---
  const target = model.project.targets[0];
  const display = findTargetDisplay(target, model.catalogue);
  const pipeline = createScreenPipeline({
    globals: model.globals,
    screens: model.screens,
    manifests: model.manifests,
    ...(display !== undefined ? { display } : {}),
  });
  // Resolution is lazy in the pipeline; touching it here keeps its cost in
  // this stage rather than in whichever later stage first asks.
  void pipeline.resolution.screens;
  lap('resolve');

  // --- Step 3: Decide what each element becomes ---
  const realisation = realiseScreens({ globals: model.globals, manifests: model.manifests, expansion: pipeline.expansion });
  lap('realise');

  // --- Step 4: Validate exactly this model, as generate does ---
  const checked = checkProject(model, GENERATE_REFUSAL_POLICY, target, pipeline, realisation);
  const diagnostics = finaliseDiagnostics([...checked.diagnostics, ...(input.assets?.diagnostics ?? [])]);
  lap('validate');

  // --- Step 5: The scene, only for a model with no error ---
  const screen = activeScreenName(model, input.activeFile);
  const screenIndex = model.screens.findIndex((s) => s.name === screen);
  let scene: string | undefined;
  let bounds: ReadonlyMap<string, Rect> = new Map();
  if (diagnostics.errors === 0 && target !== undefined && input.assets !== undefined) {
    const capacities = computeCapacities({ globals: model.globals, screens: realisation.screens });
    scene = JSON.stringify(
      describeScenes({
        project: {
          project: model.project,
          globals: model.globals,
          screens: model.screens,
          capacities,
          manifests: model.manifests,
          images: input.assets.images,
          compiledFonts: input.assets.fonts,
          bdfLicenceFiles: new Map(),
          stamp: '',
        },
        realised: realisation.screens,
        resolved: pipeline.resolution.screens,
        manifests: model.manifests,
        generated: { source: 'u8g2gl.xml', schema: model.project.schema, generator: 'designer', target: target.name },
      }),
    );
    const realised = realisation.screens[screenIndex];
    const resolved = pipeline.resolution.screens[screenIndex];
    if (realised !== undefined && resolved !== undefined) {
      bounds = elementBounds(placeScreen(realised, resolved, model.manifests).placements.values());
    }
  }
  lap('scene');

  return {
    model,
    diagnostics: diagnostics.diagnostics,
    errors: diagnostics.errors,
    scene,
    screen,
    display: display === undefined ? undefined : { width: display.width, height: display.height },
    bounds,
    subjectValues: declaredValues(model.globals),
    timings,
  };
}

/**
 * @brief The screen the canvas shows: the one in `activeFile`, else the first.
 *
 * @param model      The project model.
 * @param activeFile The editor's active file, if any.
 */
export function activeScreenName(model: ProjectModel, activeFile: string | undefined): string | undefined {
  const own = activeFile === undefined ? undefined : model.screens.find((s) => s.loc?.file === activeFile);
  return (own ?? model.screens[0])?.name;
}

// declaredValues
// The subjects' declared `value`s as JSON for applySampleData: numbers for int
// and time, booleans for bool, text otherwise. An undeclared value is left out,
// so the subject keeps the runtime default the scene gave it.
//   globals — the project's globals
function declaredValues(globals: Globals): string {
  const values: Record<string, string | number | boolean> = {};
  for (const subject of globals.subjects ?? []) {
    const value = subject.default;
    if (value === undefined) continue;
    if (subject.type === 'int' || subject.type === 'time') {
      const number = Number(value);
      if (Number.isFinite(number)) values[subject.name] = number;
    } else if (subject.type === 'bool') {
      values[subject.name] = value === 'true';
    } else {
      values[subject.name] = value;
    }
  }
  return JSON.stringify(values);
}

// elementBounds
// Each named element's device-space rectangle. A rectangle element has x, y,
// width and height once placed; a line or triangle has only endpoints, so its
// bounds are their box, one pixel wide where the points share an axis.
//   placements — placeScreen()'s placements for the active screen
function elementBounds(
  placements: Iterable<Placement>,
): Map<string, Rect> {
  const bounds = new Map<string, Rect>();
  for (const placement of placements) {
    const { node, geometry, extras } = placement.absolute;
    const name = node.attributes.name;
    if (name === '') {
      continue;
    }
    const x = geometry.x?.value;
    const y = geometry.y?.value;
    const width = geometry.width?.value;
    const height = geometry.height?.value;
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      bounds.set(name, { x, y, width, height });
      continue;
    }
    const xs = extras.filter((e) => e.axis === 'horizontal' && e.coordinate !== undefined).map((e) => e.coordinate?.value ?? 0);
    const ys = extras.filter((e) => e.axis === 'vertical' && e.coordinate !== undefined).map((e) => e.coordinate?.value ?? 0);
    if (xs.length > 0 && ys.length > 0) {
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      bounds.set(name, { x: left, y: top, width: Math.max(...xs) - left + 1, height: Math.max(...ys) - top + 1 });
    }
  }
  return bounds;
}
