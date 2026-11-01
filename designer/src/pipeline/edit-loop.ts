/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/pipeline/edit-loop.ts
 * Purpose: The live edit loop, end to end: a change to
 *          any open document schedules one run on the next animation frame,
 *          and that run takes the text all the way to pixels — parse, resolve,
 *          realise, validate, scene, the editor Wasm's `applyScene`, the
 *          subjects' values, `renderFrame`, and the blit. There is no fast path
 *          and no debounce. The server is never in this loop; everything here
 *          runs in the page.
 * Description: Owns the scheduler, the parse cache and the frame state the
 *              canvas panel shows. Diagnostics go to Monaco markers and to the
 *              Problems rows, and are replaced only when the set changes, so a
 *              keystroke that changes no diagnostic re-renders no list.
 *
 *              The document's states (EDITOR-DESIGN §3.8): valid, the frame is
 *              live. Well-formed but invalid, it stays live while the scene can
 *              still be built, with each element an error is in hatched on the
 *              overlay; when it cannot, the last good frame is kept, dimmed,
 *              with a banner counting the errors. Not well-formed, the last
 *              good frame, dimmed, with *XML not well-formed at L:C*, and
 *              `canvasEditing` false until the text parses again. Losing the
 *              picture mid-edit is disorienting (ui_spec §4.1).
 *
 *              Between edits an animation ticker re-renders the applied scene
 *              each frame so widgets animate (ui_spec §4.2); frozen, every
 *              render is at t = 0 instead, so the frame is stable to compare.
 *
 *              After each run the selection's names are looked up in the new
 *              text (`SelectionModel.reconcile`), and each selected element on
 *              the drawn screen is outlined on the canvas from the run's
 *              rectangles (ui_spec §4.3). The run's hit targets are published
 *              for the canvas's selection gestures. Selection is never an edit.
 *
 *              Each run's stage timings are handed to `onFrame` listeners, which
 *              is how a keystroke measurement attributes a keystroke's cost.
 *
 * Exports:
 * - FrameState:       What the canvas panel and status bar show about the frame
 * - DrawnTargets:     The drawn frame's hit targets
 * - FrameTimings:     One run's milliseconds per stage
 * - CompletedRun:     A run's result and the assets it ran with
 * - EditLoop:         The loop
 *
 *     Wiring:
 *     - start():          Subscribe to the documents, the Wasm and the workspace
 *     - attachCanvas():   Draw into a canvas panel's view
 *     - dispose():        Stop
 *
 *     State:
 *     - frameState, frozen, bounds, hitTargets, selectionRect, selectionCount
 *     - placements:       The drawn elements' placements, for canvas edits
 *     - canvasEditing:    False while a document is not well-formed (§3.8)
 *     - lastRun:          The latest run, for the property panel
 *
 *     Test run (EDITOR-DESIGN §4):
 *     - addDiagnosticSource(): More diagnostics for Problems (a failed run's)
 *     - settled():        Resolves once the latest text is drawn
 *     - requestRun():     Book a normal run: restores the canvas after Run's frames
 *     - showDiff():       Mark a mismatch's differing pixels on the overlay
 *
 *     Measurement:
 *     - onFrame():        Subscribe to each run's timings
 */

import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import type { Pixel } from '../test-run/verdict';
import { DIAGNOSTIC_CODES } from '@u8g2gl/core/schema/diagnostic.js';
import { loadedMonaco } from '../monaco/monaco';
import type { CanvasView, OverlayRect } from '../canvas/canvas-view';
import { countLit } from '../canvas/framebuffer';
import { ProjectAssets } from '../project/project-assets';
import { ProjectModelCache } from '../project/project-model';
import { Observable } from '../state/observable';
import type { EditorModule, Placeholder } from '../wasm/editor-module';
import type { EditorWasmController } from '../wasm/editor-wasm-controller';
import type { HitTarget } from '../selection/hit-test';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import type { Workspace } from '../workspace';
import { innermostAt, namedElements } from '../documents/element-at';
import { markersByFile, sameProblems, toProblemRows } from './diagnostics';
import { BROWSER_FRAMES, FrameScheduler, type FrameSource } from './frame-scheduler';
import {
  runTextPipeline,
  TEXT_STAGES,
  type CompiledAssets,
  type Rect,
  type TextPipelineResult,
  type TextStage,
} from './live-pipeline';

/** What the canvas shows, and why. */
export interface FrameState {
  /** Frames drawn by the pipeline so far; 0 before the first. */
  readonly frame: number;
  /** True while the canvas shows the last good frame rather than the text's. */
  readonly stale: boolean;
  /** Why the frame is stale, or what is missing, for the banner. */
  readonly banner?: string;
  /** The screen drawn. */
  readonly screen?: string;
  readonly display?: { readonly width: number; readonly height: number };
  /** Elements the loaded Wasm drew as placeholders. */
  readonly placeholders: readonly Placeholder[];
  /** Elements hatched because an error is in them, by name; empty on a stale frame. */
  readonly hatched?: readonly string[];
  /** Lit pixels in the frame, for tests and the curious. */
  readonly lit: number;
}

/** The drawn frame's hit targets, and the file whose names they carry. */
export interface DrawnTargets {
  readonly file: string | undefined;
  readonly targets: readonly HitTarget[];
}

/** A pipeline run's result and the compiled assets it ran with. */
export interface CompletedRun {
  readonly result: TextPipelineResult;
  readonly assets: CompiledAssets | undefined;
}

/** The stages after the text pipeline, in order. */
const WASM_STAGES = ['apply', 'render', 'blit'] as const;

/** One run's milliseconds per stage, when it started, and whether it drew. */
export type FrameTimings = Readonly<Record<TextStage | (typeof WASM_STAGES)[number], number>> & {
  /** The animation frame's timestamp. */
  readonly frameStart: number;
  /** `performance.now()` when the run began, after the frame's earlier callbacks. */
  readonly runStart: number;
  readonly drawn: boolean;
};

/** The live loop from text to pixels. */
export class EditLoop {
  /** What the canvas shows. */
  readonly frameState = new Observable<FrameState>({ frame: 0, stale: true, placeholders: [], lit: 0 });
  /** Whether animation is pinned at t = 0 (ui_spec §4.2's freeze toggle). */
  readonly frozen = new Observable<boolean>(false);
  /** The selectable element rectangles of the drawn screen, by name. */
  readonly bounds = new Observable<ReadonlyMap<string, Rect>>(new Map());
  /** What a click on the drawn frame can hit, and the file its names are in. */
  readonly hitTargets = new Observable<DrawnTargets>({ file: undefined, targets: [] });
  /**
   * The selection's geometry on the drawn screen, for the status bar: one
   * element's rectangle, or the box around several. Undefined when nothing
   * selected is drawn.
   */
  readonly selectionRect = new Observable<Rect | undefined>(
    undefined,
    (a, b) => a?.x === b?.x && a?.y === b?.y && a?.width === b?.width && a?.height === b?.height,
  );
  /**
   * Whether the canvas may edit the text: false only while a project document
   * is not well-formed, when an edit computed from the text could land
   * anywhere (EDITOR-DESIGN §3.8). Selection is unaffected; it never edits.
   */
  readonly canvasEditing = new Observable<boolean>(true);
  /** How many selected elements are drawn, for the status bar beside {@link selectionRect}. */
  readonly selectionCount = new Observable<number>(0);
  /**
   * The latest run, published once it has finished, so the property panel
   * reads the same text, diagnostics and geometry the frame was drawn from.
   */
  readonly lastRun = new Observable<CompletedRun | undefined>(undefined);

  private readonly workspace: Workspace;
  private readonly wasm: EditorWasmController;
  private readonly assets: ProjectAssets;
  private readonly cache = new ProjectModelCache();
  private readonly scheduler: FrameScheduler;
  private readonly frames: FrameSource;
  private readonly frameListeners = new Set<(timings: FrameTimings) => void>();
  private readonly subscriptions: Array<() => void> = [];
  private view: CanvasView | undefined;
  /** The overlay's selection outlines and its hatching, kept apart so each can change alone. */
  private selectionRects: readonly OverlayRect[] = [];
  private problemRects: readonly OverlayRect[] = [];
  private drawnPlacements: ReadonlyMap<string, Placement> = new Map();
  private applied: EditorModule | undefined;
  private tickHandle: number | undefined;
  private drawn = 0;
  private diagnosticFiles = new Set<string>();
  private latestDiagnostics: readonly Diagnostic[] = [];
  private readonly diagnosticSources: Array<Observable<readonly Diagnostic[]>> = [];
  private diff: readonly Pixel[] | undefined;

  /**
   * @param workspace The session: documents, active file, Problems.
   * @param wasm      The editor Wasm in use.
   * @param frames    The frame source; the browser's by default.
   */
  constructor(workspace: Workspace, wasm: EditorWasmController, frames: FrameSource = BROWSER_FRAMES) {
    this.workspace = workspace;
    this.wasm = wasm;
    this.frames = frames;
    this.scheduler = new FrameScheduler((time) => this.run(time), frames);
    this.assets = new ProjectAssets(workspace.documents.fileSystem, () => this.scheduler.request());
  }

  /** @brief Subscribes to everything that changes the frame, and runs once. */
  start(): void {
    const request = (): void => this.scheduler.request();
    this.subscriptions.push(
      this.workspace.documents.onDidChangeContent((path, changes) => {
        this.workspace.selection.textChanged(path, changes);
        request();
      }),
      this.workspace.documents.onDidOpen(() => {
        this.publishMarkers(true);
        request();
      }),
      this.workspace.activeFile.subscribe(request),
      this.wasm.module.subscribe(request),
      this.wasm.buildDiagnostics.subscribe(request),
      this.frozen.subscribe(request),
      this.workspace.documents.onDidChangeOnDisk((path) => {
        if (!this.workspace.documents.isDocument(path)) this.assets.assetChanged();
        request();
      }),
    );
    this.subscriptions.push(
      this.workspace.selection.current.subscribe(() => this.highlightSelection()),
      this.bounds.subscribe(() => this.highlightSelection()),
    );
    request();
    this.tick();
  }

  // highlightSelection
  // Outline each selected element that is on the screen being drawn, and
  // publish their geometry for the status bar. Highlight only; never an edit.
  private highlightSelection(): void {
    const selection = this.workspace.selection.current.get();
    const drawn = selection.file !== undefined && selection.file === this.hitTargets.get().file;
    const bounds = this.bounds.get();
    const rects = drawn ? selection.names.map((name) => bounds.get(name)).filter((rect): rect is Rect => rect !== undefined) : [];
    this.selectionRect.set(boundingBox(rects));
    this.selectionCount.set(rects.length);
    this.selectionRects = rects.map((rect) => ({ ...rect, kind: 'selection' }));
    this.showOverlay();
  }

  /**
   * The drawn screen's elements' placements by name, as of the frame on the
   * canvas: what a canvas gesture reads to know which attributes place an
   * element. Read when a gesture needs it, so not observable.
   */
  get placements(): ReadonlyMap<string, Placement> {
    return this.drawnPlacements;
  }

  /** @brief Draws into a canvas panel's view from now on (undefined detaches). */
  attachCanvas(view: CanvasView | undefined): void {
    this.view = view;
    if (view !== undefined) {
      this.showOverlay();
      view.setDiff(this.diff);
      this.scheduler.request();
    }
  }

  /**
   * @brief Adds diagnostics to every run's Problems: a failed test run's, say.
   *        A change to the source books a run, so they appear on the next frame.
   */
  addDiagnosticSource(source: Observable<readonly Diagnostic[]>): void {
    this.diagnosticSources.push(source);
    this.subscriptions.push(source.subscribe(() => this.scheduler.request()));
  }

  /**
   * @brief Resolves once the canvas shows the latest text: at once when no run
   *        is booked, else after the booked run has finished.
   */
  settled(): Promise<void> {
    if (!this.scheduler.pending) return Promise.resolve();
    return new Promise((resolve) => {
      const unsubscribe = this.onFrame(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  /** @brief Books a normal run on the next frame, as an edit would. */
  requestRun(): void {
    this.scheduler.request();
  }

  /**
   * @brief Marks a mismatch's differing pixels on the overlay; undefined clears them.
   *        On the overlay, never the frame: the frame stays the live canvas's.
   */
  showDiff(pixels: readonly Pixel[] | undefined): void {
    this.diff = pixels;
    this.view?.setDiff(pixels);
  }

  // showOverlay
  // The overlay's hatching and selection outlines, to the view if attached.
  private showOverlay(): void {
    this.view?.setOverlay([...this.problemRects, ...this.selectionRects]);
  }

  /**
   * @brief Calls `listener` with each pipeline run's timings.
   *
   * @return The unsubscribe function.
   */
  onFrame(listener: (timings: FrameTimings) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  /** @brief Stops the loop and the ticker. */
  dispose(): void {
    this.scheduler.dispose();
    if (this.tickHandle !== undefined) this.frames.cancel(this.tickHandle);
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
  }

  // run
  // One pipeline run, from the latest text to the blit.
  //   frameStart — the animation frame's timestamp
  private run(frameStart: number): void {
    const runStart = performance.now();
    performance.mark('u8g2gl:frame');

    // --- Step 1: Text to diagnostics and scene ---
    const texts = this.workspace.documents.texts();
    const result = runTextPipeline({
      texts,
      cache: this.cache,
      assets: this.assets.current,
      activeFile: this.workspace.activeFile.get(),
    });
    this.assets.ensure(result.model.globals, texts.get('globals.xml') ?? '');
    this.publishDiagnostics([
      ...result.diagnostics,
      ...this.wasm.buildDiagnostics.get(),
      ...this.diagnosticSources.flatMap((source) => source.get()),
    ]);
    this.workspace.selection.reconcile();
    this.canvasEditing.set(result.wellFormed);

    // --- Step 2: Scene to pixels, or the last good frame with the reason ---
    const module = this.wasm.module.get();
    const timings = { ...result.timings, apply: 0, render: 0, blit: 0, frameStart, runStart, drawn: false };
    if (result.scene === undefined || module === undefined || result.screen === undefined) {
      this.markStale(this.staleReason(result.diagnostics, module, result.screen));
    } else {
      let lap = performance.now();
      const applied =
        module.applyScene(result.scene) && module.selectScreen(result.screen) && module.applySampleData(result.subjectValues);
      timings.apply = performance.now() - lap;
      performance.mark('u8g2gl:apply');
      lap = performance.now();
      const buffer = applied ? module.renderFrame(this.now()) : undefined;
      timings.render = performance.now() - lap;
      performance.mark('u8g2gl:render');
      if (buffer === undefined) {
        this.applied = undefined;
        // With errors standing, a refusal is the unbuildable state, said as such;
        // without, it is the Wasm's own complaint.
        this.markStale(
          result.errors > 0 ? this.staleReason(result.diagnostics, module, result.screen) : `The editor Wasm refused the scene: ${module.lastError()}`,
        );
      } else {
        lap = performance.now();
        const { width, height } = module.displaySize();
        this.view?.draw(buffer, width, height);
        timings.blit = performance.now() - lap;
        performance.mark('u8g2gl:blit');
        timings.drawn = true;
        this.applied = module;
        this.drawn += 1;
        const placeholders = module.placeholders();
        const hatched = result.errors > 0 ? this.problemElements(result.diagnostics, result.screenFile, result.bounds) : [];
        this.problemRects = hatched.map(({ rect }) => ({ ...rect, kind: 'problem' }));
        this.hitTargets.set({ file: result.screenFile, targets: result.targets });
        this.drawnPlacements = result.placements;
        this.bounds.set(result.bounds);
        this.frameState.set({
          frame: this.drawn,
          stale: false,
          screen: result.screen,
          display: { width, height },
          placeholders,
          hatched: hatched.map(({ name }) => name),
          lit: countLit(buffer),
        });
        this.view?.setStale(false);
      }
    }
    this.lastRun.set({ result, assets: this.assets.current });
    performance.measure('u8g2gl:run', { start: runStart });
    // The marks and the measure are for a profile recorded meanwhile, which
    // keeps them; the page's own entry buffer would otherwise grow by a dozen
    // entries per run for the life of the session.
    for (const stage of ['frame', ...TEXT_STAGES, ...WASM_STAGES]) performance.clearMarks(`u8g2gl:${stage}`);
    performance.clearMeasures('u8g2gl:run');
    for (const listener of [...this.frameListeners]) listener(timings);
  }

  // tick
  // The animation ticker: between edits, re-render the applied scene each frame.
  // It does nothing while a pipeline run is booked (that run will draw) or the
  // frame is stale (the last good frame is shown as it was).
  private tick(): void {
    this.tickHandle = this.frames.request(() => {
      const module = this.applied;
      if (module !== undefined && module === this.wasm.module.get() && !this.scheduler.pending && !this.frameState.get().stale && !this.frozen.get()) {
        const buffer = module.renderFrame(this.now());
        if (buffer !== undefined) {
          const { width, height } = module.displaySize();
          this.view?.draw(buffer, width, height);
        }
      }
      this.tick();
    });
  }

  // now
  // The time a frame is rendered at: the page clock, or 0 while frozen.
  private now(): number {
    return this.frozen.get() ? 0 : performance.now();
  }

  // markStale
  // Keeps the last good frame, dimmed, and says why. Nothing is hatched on it:
  // the errors are about the text, and the frame is from older text.
  //   banner — the reason
  private markStale(banner: string): void {
    this.problemRects = [];
    this.showOverlay();
    this.frameState.set({ ...this.frameState.get(), stale: true, banner, hatched: [] });
    this.view?.setStale(true);
  }

  // problemElements
  // The elements an error is in, by CST range (EDITOR-DESIGN §3.8): for each
  // error in the drawn screen's file, the innermost named element whose text
  // contains its position, with that element's rectangle. An error in another
  // file, or outside every element, hatches nothing.
  //   diagnostics — the run's
  //   file        — the drawn screen's file
  //   bounds      — the run's rectangles by name
  private problemElements(
    diagnostics: readonly Diagnostic[],
    file: string | undefined,
    bounds: ReadonlyMap<string, Rect>,
  ): { name: string; rect: Rect }[] {
    // --- Step 1: The errors in the drawn screen's file, and its elements ---
    const errors = diagnostics.filter((d) => d.severity === 'error' && d.file === file);
    const text = file === undefined ? undefined : this.workspace.documents.textOf(file);
    if (errors.length === 0 || text === undefined) return [];
    const spans = namedElements(text);
    if (spans === undefined) return [];

    // --- Step 2: Where each line starts, to turn a line and column into an offset ---
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
    }

    // --- Step 3: Each error to the innermost element holding it, once each ---
    const found: { name: string; rect: Rect }[] = [];
    for (const error of errors) {
      const offset = (lineStarts[error.line - 1] ?? 0) + error.column - 1;
      const name = innermostAt(spans, offset)?.name;
      const rect = name === undefined ? undefined : bounds.get(name);
      if (name !== undefined && rect !== undefined && !found.some((f) => f.name === name)) found.push({ name, rect });
    }
    return found;
  }

  // staleReason
  // Why there is no frame for the current text, in the user's terms.
  private staleReason(diagnostics: readonly Diagnostic[], module: EditorModule | undefined, screen: string | undefined): string {
    const malformed = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MALFORMED_XML);
    if (malformed !== undefined) {
      // Line and column, as the editor's own status reads them; the file only
      // when it is not the screen on the canvas.
      const elsewhere = malformed.file === this.hitTargets.get().file ? '' : ` in ${malformed.file}`;
      return `XML not well-formed at ${malformed.line}:${malformed.column}${elsewhere}`;
    }
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    if (errors > 0) {
      return `${errors} error${errors === 1 ? '' : 's'}: showing the last good frame`;
    }
    if (screen === undefined) return 'The project has no screen to show';
    if (module === undefined) return 'No editor Wasm is loaded yet';
    return 'Compiling fonts and images…';
  }

  // publishDiagnostics
  // Problems rows and markers, replaced only when the set of diagnostics changed.
  //   diagnostics — the run's, and the last failed build's
  private publishDiagnostics(diagnostics: readonly Diagnostic[]): void {
    const rows = toProblemRows(diagnostics);
    if (sameProblems(rows, this.workspace.problems.get())) {
      return;
    }
    this.workspace.problems.set(rows);
    this.latestDiagnostics = diagnostics;
    this.publishMarkers(false);
  }

  // publishMarkers
  // The latest diagnostics as markers on every open model. A file that had
  // markers and now has none is cleared.
  //   force — set markers even on files whose set did not change (a model just opened)
  private publishMarkers(force: boolean): void {
    const documents = this.workspace.documents;
    const byFile = markersByFile(this.latestDiagnostics, (file, line, column) => {
      const model = documents.modelOf(file);
      if (model === undefined || line > model.getLineCount()) return undefined;
      return model.getWordAtPosition({ lineNumber: line, column })?.endColumn;
    });
    const files = new Set([...byFile.keys(), ...this.diagnosticFiles, ...(force ? documents.openPaths() : [])]);
    for (const file of files) {
      const model = documents.modelOf(file);
      if (model !== undefined) {
        loadedMonaco()?.editor.setModelMarkers(model, 'u8g2gl', (byFile.get(file) ?? []).map((marker) => ({ ...marker })));
      }
    }
    this.diagnosticFiles = new Set(byFile.keys());
  }
}

// boundingBox
// The smallest rectangle containing every one of `rects`; undefined for none.
function boundingBox(rects: readonly Rect[]): Rect | undefined {
  const [first, ...rest] = rects;
  if (first === undefined) return undefined;
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const rect of rest) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export { TEXT_STAGES, WASM_STAGES };
