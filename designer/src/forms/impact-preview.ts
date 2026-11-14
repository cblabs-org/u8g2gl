/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/impact-preview.ts
 * Purpose: What a new display would do to the project, before it is chosen
 *          (ui_spec §6.4): every screen drawn at the candidate's geometry, with the
 *          elements that would fall outside it named. A display change moves
 *          every anchored element and can push others off the panel, which is
 *          otherwise discovered only after the edit.
 * Description: The candidate exists in memory only: the project's texts with
 *              the target's setup replaced through the form's own edit
 *              (`formEdit`), run through the same text pipeline the canvas
 *              uses, against that target, and drawn by a second instance of
 *              the editor module (`EditorWasmController.spareInstance`), so
 *              neither the document nor the canvas changes until the author
 *              confirms.
 *
 *              It is measured. The active screen is drawn first; if drawing
 *              the rest would take the preview past {@link PREVIEW_BUDGET_MS}
 *              at the rate the first one took, only the active screen is shown
 *              and the preview says why.
 *
 * Exports:
 * - PREVIEW_BUDGET_MS:  How long a whole preview may take before it shows the active screen only
 * - OutsideElement:     An element the candidate display would not hold
 * - ScreenPreview:      One screen at the candidate geometry
 * - ImpactPreview:      Every screen, how long it took, and whether it stopped early
 * - outsideElements():  The elements of a run whose box leaves the display
 * - candidateTexts():   The project's texts with a target's setup replaced
 * - renderImpact():     Draw the preview
 */

import type { CompiledAssets, Rect } from '../pipeline/live-pipeline';
import { runTextPipeline } from '../pipeline/live-pipeline';
import { ProjectModelCache } from '../project/project-model';
import type { EditorModule } from '../wasm/editor-module';
import { applyEdits } from '@u8g2gl/core/cst/index.js';
import { formEdit } from './form-edits';

/** How long a whole preview may take, in milliseconds, before it shows the active screen only. */
export const PREVIEW_BUDGET_MS = 1000;

/** An element the candidate display would not hold, and the box it would have. */
export interface OutsideElement {
  readonly name: string;
  readonly rect: Rect;
}

/** One screen at the candidate geometry. */
export interface ScreenPreview {
  readonly screen: string;
  readonly width: number;
  readonly height: number;
  /** The U8G2 tile buffer, copied; undefined when it could not be drawn. */
  readonly buffer: Uint8Array | undefined;
  readonly outside: readonly OutsideElement[];
  /** Why it was not drawn, when it was not. */
  readonly problem?: string;
}

/** A whole preview. */
export interface ImpactPreview {
  readonly setup: string;
  readonly screens: readonly ScreenPreview[];
  /** Milliseconds from start to the last screen drawn. */
  readonly ms: number;
  /** True when it stopped after the active screen, with why. */
  readonly activeOnly: boolean;
  readonly note?: string;
}

/**
 * @brief The elements whose box is not wholly on a `width` × `height` display.
 *
 * @param bounds Each selectable element's device box, from a pipeline run.
 */
export function outsideElements(bounds: ReadonlyMap<string, Rect>, width: number, height: number): OutsideElement[] {
  return [...bounds]
    .filter(([, rect]) => rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > height)
    .map(([name, rect]) => ({ name, rect }));
}

/**
 * @brief The project's texts with one target's setup replaced, written where
 *        the form would write it, in memory only.
 *
 * @param texts    Every project document's current text.
 * @param setupKey The form field key of the target's `display/setup`.
 * @param setup    The candidate setup.
 */
export function candidateTexts(texts: ReadonlyMap<string, string>, setupKey: string, setup: string): Map<string, string> {
  const project = texts.get('u8g2gl.xml') ?? '';
  const edited = applyEdits(project, formEdit('u8g2gl.xml', project, { kind: 'set', field: setupKey, value: setup }).edits);
  return new Map([...texts, ['u8g2gl.xml', edited]]);
}

// drawScreen
// One screen of the candidate: its run, then its frame in the spare module.
//   module     — the spare instance; its scene is replaced
//   texts      — the candidate's texts
//   file       — the screen's file
//   targetName — the target being changed
//   assets     — the compiled fonts and images the canvas uses
function drawScreen(module: EditorModule, texts: ReadonlyMap<string, string>, file: string, targetName: string, assets: CompiledAssets | undefined): ScreenPreview {
  const run = runTextPipeline({ texts, cache: new ProjectModelCache(), assets, activeFile: file, targetName });
  const screen = run.screen ?? file;
  const width = run.display?.width ?? 0;
  const height = run.display?.height ?? 0;
  const outside = outsideElements(run.bounds, width, height);
  if (run.scene === undefined || run.screen === undefined) {
    return { screen, width, height, buffer: undefined, outside, problem: 'it does not validate at this size' };
  }
  const applied = module.applyScene(run.scene) && module.selectScreen(run.screen) && module.applySampleData(run.subjectValues);
  const frame = applied ? module.renderFrame(0) : undefined;
  if (frame === undefined) return { screen, width, height, buffer: undefined, outside, problem: module.lastError() };
  const size = module.displaySize();
  // Copied: the view is valid only until the next call into the module.
  return { screen, width: size.width, height: size.height, buffer: frame.slice(), outside };
}

/**
 * @brief Draws every screen at a candidate setup, the active one first.
 *
 * @param module      A spare editor module, never the canvas's.
 * @param texts       The candidate's texts (`candidateTexts`).
 * @param screenFiles Every screen's file, in project order.
 * @param activeFile  The screen the canvas shows, drawn first.
 * @param targetName  The target being changed.
 * @param assets      The canvas's compiled assets.
 */
export function renderImpact(
  module: EditorModule,
  texts: ReadonlyMap<string, string>,
  screenFiles: readonly string[],
  activeFile: string | undefined,
  targetName: string,
  assets: CompiledAssets | undefined,
  setup: string,
): ImpactPreview {
  // --- Step 1: The active screen first, timed ---
  const started = performance.now();
  const first = activeFile !== undefined && screenFiles.includes(activeFile) ? activeFile : screenFiles[0];
  if (first === undefined) return { setup, screens: [], ms: 0, activeOnly: false };
  const screens = [drawScreen(module, texts, first, targetName, assets)];
  const each = performance.now() - started;

  // --- Step 2: The rest, unless at that rate they would pass the budget ---
  const rest = screenFiles.filter((file) => file !== first);
  if (rest.length > 0 && each * screenFiles.length > PREVIEW_BUDGET_MS) {
    return {
      setup,
      screens,
      ms: each,
      activeOnly: true,
      note: `Only the active screen is previewed: it took ${Math.round(each)} ms, so all ${screenFiles.length} would take about ${Math.round(each * screenFiles.length)} ms, over ${PREVIEW_BUDGET_MS} ms.`,
    };
  }
  for (const file of rest) screens.push(drawScreen(module, texts, file, targetName, assets));
  return { setup, screens, ms: performance.now() - started, activeOnly: false };
}
