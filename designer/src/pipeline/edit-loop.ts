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
 *              While the Outlines toggle is on, every drawn element's box is
 *              outlined too, from the same rectangles; on a stale frame the
 *              last outlines stay, as the selection does.
 *
 *              Each run's stage timings are handed to `onFrame` listeners, which
 *              is how a keystroke measurement attributes a keystroke's cost.
 *
 *              Before each `applyScene` the module is given every font and
 *              image the project declares (`asset-injector.ts`), since the
 *              editor Wasm compiles in none (design_spec §9). That costs a key
 *              comparison unless the assets changed. While a built-in font is
 *              still being fetched the run draws nothing and keeps the last
 *              frame as it is, rather than drawing the fallback font for a
 *              frame; the fetch's arrival books the next run, and `settled()`
 *              waits for it.
 *
 *              The elements the author hid in the designer (`design-hidden.ts`)
 *              are left out of the frame by the editor Wasm itself, after each
 *              of this loop's own `applyScene`, which forgets them; a test
 *              run's fresh apply therefore draws the exported view. A hidden
 *              element is not a hit target and has no outline, so a click
 *              lands on what is beneath it; selected from the tree or the XML,
 *              it is outlined dashed and without handles. After each run the
 *              elements the runtime's own rules left out (a binding's `hidden`,
 *              a shape's guards, with the current sample data) are published
 *              for the Explorer's "hidden by data" marker.
 *
 *              Input preview (§12): while it runs, the bridge runs
 *              the drawn screen's focus ring, dispatch and screen stack — the
 *              device's own code — and a run whose scene is the one the
 *              preview started on draws without applying it again, which
 *              would end the preview. A load or a back opens the screen it
 *              lands on, so the canvas follows. Any other scene (an edit) ends
 *              the preview; stopping it reapplies the scene and returns to
 *              the screen it started on, restoring the editing state.
 *
 *              The canvas draws the active sample set (`samples/`): its values
 *              over the declared ones, and its rows for the drawn screen, both
 *              applied after each `applyScene`, which clears them. Every set's
 *              problems join the run's in Problems.
 *
 * Exports:
 * - FrameState:       What the canvas panel and status bar show about the frame
 * - selectionOverlay(): The selection's overlay rectangles, with or without box handles
 * - DrawnTargets:     The drawn frame's hit targets
 * - RuntimeHidden:    What a frame left out by the runtime's own rules
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
 *     - shownBounds:      `bounds` without what the designer hid, for the gestures
 *     - shownPlacements:  `placements` without what the designer hid, for the gestures
 *     - runtimeHidden:    What the last run's frame left out by the runtime's rules
 *     - outlines:         Whether every element's box is outlined (remembered)
 *     - overlay:          The overlay's rectangles as last composed
 *     - placements:       The drawn elements' placements, for canvas edits
 *     - canvasEditing:    False while a document is not well-formed (§3.8)
 *     - lastRun:          The latest run, for the property panel
 *
 *     Input preview (§12):
 *     - preview:          The preview's state while it runs, observable
 *     - startPreview(), stopPreview(): Start or stop it on the drawn screen
 *     - dispatch():       One input event, as the device's ui_dispatch() takes it
 *     - back():           Back through the device's screen stack
 *
 *     Test run:
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
import { outlineRects, readOutlines, writeOutlines } from '../canvas/outlines';
import { isLineShaped } from '../editing/line-ends';
import { ProjectAssets } from '../project/project-assets';
import { ProjectModelCache } from '../project/project-model';
import { Observable } from '../state/observable';
import { AssetInjector, type InjectionState } from '../wasm/asset-injector';
import type { EditorModule, InputState, Placeholder } from '../wasm/editor-module';
import type { EditorWasmController } from '../wasm/editor-wasm-controller';
import type { HitTarget } from '../selection/hit-test';
import type { Placement } from '@u8g2gl/core/generator/emit/screen-model.js';
import type { Workspace } from '../workspace';
import { innermostAt, namedElements } from '../documents/element-at';
import { effectiveHidden } from '../canvas/design-hidden';
import { markersByFile, sameProblems, toProblemRows, withoutBuildRepeats } from './diagnostics';
import { BROWSER_FRAMES, FrameScheduler, type FrameSource } from './frame-scheduler';
import { sampleSetPath } from '../samples/sample-set';
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
  /**
   * What the status bar says about the frame's fonts and images, when there is
   * something to say: the editor Wasm's warning for a font that is not loaded
   * (drawn in its fallback), or that the loaded module draws the fonts it was
   * built with because it takes no injection.
   */
  readonly assetNote?: string;
}

/** The drawn frame's hit targets, and the file whose names they carry. */
export interface DrawnTargets {
  readonly file: string | undefined;
  readonly targets: readonly HitTarget[];
}

/** The elements a drawn screen's frame left out by the runtime's own rules. */
export interface RuntimeHidden {
  /** The drawn screen's file; undefined before a frame. */
  readonly file: string | undefined;
  /** Their names, as the scene names them. */
  readonly names: ReadonlySet<string>;
}

/** No names: shared, so an empty set is one object. */
const NO_NAMES: ReadonlySet<string> = new Set();

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
  /**
   * Whether every drawn element's box is outlined on the overlay (ui_spec §4's
   * Outlines toggle). Off unless this browser remembers it on; each change is
   * remembered. Overlay only: the frame's pixels never change with it.
   */
  readonly outlines = new Observable<boolean>(readOutlines());
  /** The selectable element rectangles of the drawn screen, by name. */
  readonly bounds = new Observable<ReadonlyMap<string, Rect>>(new Map());
  /**
   * {@link bounds} without the elements the designer hid: what the canvas's
   * gestures offer handles on and move, since a hidden element cannot be
   * grabbed on the canvas.
   */
  readonly shownBounds = new Observable<ReadonlyMap<string, Rect>>(new Map());
  /**
   * The elements the drawn frame left out by the runtime's own rules — a
   * `hidden` flag, an ancestor's, a shape's guards — with the current sample
   * data. Published once per run, never per frame, and only when it changes.
   * Empty when the loaded Wasm does not report it.
   */
  readonly runtimeHidden = new Observable<RuntimeHidden>(
    { file: undefined, names: NO_NAMES },
    (a, b) => a.file === b.file && a.names.size === b.names.size && [...a.names].every((name) => b.names.has(name)),
  );
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
  /** Gives each module the project's fonts and images before a scene is applied. */
  readonly injector: AssetInjector;
  /** Whether the last run drew nothing because a built-in font was still on its way. */
  private waitingForAssets = false;
  private readonly cache = new ProjectModelCache();
  private readonly scheduler: FrameScheduler;
  private readonly frames: FrameSource;
  private readonly frameListeners = new Set<(timings: FrameTimings) => void>();
  private readonly subscriptions: Array<() => void> = [];
  private view: CanvasView | undefined;
  /**
   * The overlay's selection outlines, its hatching and its element outlines,
   * kept apart so each can change alone.
   */
  private selectionRects: readonly OverlayRect[] = [];
  private problemRects: readonly OverlayRect[] = [];
  private outlineOverlay: readonly OverlayRect[] = [];
  private composedOverlay: readonly OverlayRect[] = [];
  private drawnPlacements: ReadonlyMap<string, Placement> = new Map();
  /** The drawn screen's effectively hidden names (design-hidden.ts), as of the last frame. */
  private hiddenNow: ReadonlySet<string> = NO_NAMES;
  private applied: EditorModule | undefined;
  /** The scene the applied module was last given, so a preview knows when the text moved on. */
  private appliedScene: string | undefined;
  /** The file the canvas showed when the preview started, to return to. */
  private previewReturn: string | undefined;
  private tickHandle: number | undefined;
  private drawn = 0;
  /** The bridge's last refusal of the active set's rows, so it is logged once. */
  private sampleRefusal: string | undefined;
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
    this.injector = new AssetInjector(workspace.session, () => this.scheduler.request(), (line) => workspace.log(line));
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
      // Switching the target re-resolves every screen at its display ([U-3]).
      this.workspace.activeTarget.name.subscribe(request),
      // Switching the sample set redraws with its values and rows.
      this.workspace.activeSampleSet.name.subscribe(request),
      this.wasm.module.subscribe(request),
      this.wasm.buildDiagnostics.subscribe(request),
      this.frozen.subscribe(request),
      // Hiding is applied in the run, after its own applyScene.
      this.workspace.designHidden.hidden.subscribe(request),
      this.workspace.documents.onDidChangeOnDisk((path) => {
        if (!this.workspace.documents.isDocument(path)) this.assets.assetChanged();
        request();
      }),
    );
    this.subscriptions.push(
      this.workspace.selection.current.subscribe(() => this.highlightSelection()),
      // New bounds recompose the outlines before the selection draws the
      // overlay, so a run redraws it once, not twice.
      this.bounds.subscribe(() => {
        this.composeOutlines();
        this.highlightSelection();
      }),
      this.outlines.subscribe(() => {
        writeOutlines(this.outlines.get());
        this.composeOutlines();
        this.showOverlay();
      }),
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
    const rects = drawn ? selectionOverlay(selection.names, this.bounds.get(), this.drawnPlacements, this.hiddenNow) : [];
    this.selectionRect.set(boundingBox(rects));
    this.selectionCount.set(rects.length);
    this.selectionRects = rects;
    this.showOverlay();
  }

  // composeOutlines
  // Every drawn element's box while the Outlines toggle is on, none while it
  // is off. Composed only; the caller shows the overlay.
  private composeOutlines(): void {
    this.outlineOverlay = this.outlines.get() ? outlineRects(this.shownBounds.get()) : [];
  }

  /**
   * The drawn screen's elements' placements by name, as of the frame on the
   * canvas: what a canvas gesture reads to know which attributes place an
   * element. Read when a gesture needs it, so not observable.
   */
  get placements(): ReadonlyMap<string, Placement> {
    return this.drawnPlacements;
  }

  /**
   * {@link placements} without the elements the designer hid: what the
   * gestures read, so a hidden element shows no vertex or end handles.
   */
  get shownPlacements(): ReadonlyMap<string, Placement> {
    return this.hiddenNow.size === 0 ? this.drawnPlacements : without(this.drawnPlacements, this.hiddenNow);
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
    if (!this.scheduler.pending && !this.waitingForAssets) return Promise.resolve();
    return new Promise((resolve) => {
      // A run that waited for a built-in font drew nothing: the one after it,
      // which its arrival books, is the one that shows the text.
      const unsubscribe = this.onFrame(() => {
        if (this.waitingForAssets) return;
        unsubscribe();
        resolve();
      });
    });
  }

  /**
   * The input preview (§12), while it runs: the screen, focus, stack depth and
   * the callbacks the last event reached. Undefined while editing.
   */
  readonly preview = new Observable<InputState | undefined>(undefined, sameInputState);

  /**
   * @brief Starts previewing input on the drawn screen: the canvas then runs
   *        the device's own focus ring, dispatch and screen stack, through the
   *        bridge (§12.3).
   *
   * @return False, with the reason in Output, when the frame is not live or
   *         the loaded Wasm cannot preview.
   */
  startPreview(): boolean {
    const module = this.applied;
    if (module === undefined || this.frameState.get().stale) {
      this.workspace.log('input preview needs a live frame');
      return false;
    }
    if (!module.inputPreview) {
      this.workspace.log("input preview needs the project's editor Wasm to be rebuilt");
      return false;
    }
    if (!module.setPreview(true)) {
      this.workspace.log(`input preview refused: ${module.lastError()}`);
      return false;
    }
    this.previewReturn = this.workspace.activeFile.get();
    this.preview.set(module.inputState());
    this.scheduler.request();
    return true;
  }

  /**
   * @brief One input event on the preview, as the device's ui_dispatch() takes
   *        it; a load or a back switches the canvas to the screen it shows.
   *
   * @param event A u8g2gl_event_t value (INPUT_EVENTS).
   */
  dispatch(event: number): void {
    this.previewStep((module) => module.dispatchEvent(event));
  }

  /** @brief Back through the device's screen stack (§12.3), on the preview. */
  back(): void {
    this.previewStep((module) => module.previewBack());
  }

  /**
   * @brief Stops the preview and restores the editing state: the screen the
   *        canvas showed, and every subject as the text and sample set say,
   *        by applying the scene afresh.
   */
  stopPreview(): void {
    this.endPreview(undefined);
  }

  // previewStep
  // One preview action: then the state it left, a switch of the canvas's
  // screen when a load or back changed it, and a frame.
  //   step — the module call
  private previewStep(step: (module: EditorModule) => number): void {
    const module = this.applied;
    if (module === undefined || this.preview.get() === undefined) return;
    if (step(module) < 0) {
      this.workspace.log(`input preview: ${module.lastError()}`);
    }
    const state = module.inputState();
    this.preview.set(state);
    const shown = this.frameState.get().screen;
    if (state?.screen !== null && state?.screen !== undefined && state.screen !== shown) {
      const file = this.lastRun.get()?.result.model.screens.find((screen) => screen.name === state.screen)?.loc?.file;
      if (file !== undefined) this.workspace.openFile({ path: file });
    }
    this.scheduler.request();
  }

  // endPreview
  // Leaves the preview, saying why in Output when it was not asked for, and
  // books a run that applies the scene afresh.
  //   reason — why it ended on its own; undefined when the author stopped it
  private endPreview(reason: string | undefined): void {
    if (this.preview.get() === undefined) return;
    this.applied?.setPreview(false);
    this.preview.set(undefined);
    this.appliedScene = undefined;
    if (reason !== undefined) this.workspace.log(`input preview: ${reason}`);
    const back = this.previewReturn;
    this.previewReturn = undefined;
    if (reason === undefined && back !== undefined && back !== this.workspace.activeFile.get()) {
      this.workspace.openFile({ path: back });
    }
    this.scheduler.request();
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

  /**
   * The overlay's rectangles as last composed, whether or not a view is
   * attached: hatching, element outlines and selection, in no draw order
   * (the view orders them). For tests and the curious.
   */
  get overlay(): readonly OverlayRect[] {
    return this.composedOverlay;
  }

  // showOverlay
  // The overlay's hatching, element outlines and selection outlines, to the
  // view if attached.
  private showOverlay(): void {
    this.composedOverlay = [...this.problemRects, ...this.outlineOverlay, ...this.selectionRects];
    this.view?.setOverlay(this.composedOverlay);
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
      targetName: this.workspace.activeTarget.name.get(),
      sampleSet: activeSetPath(this.workspace.activeSampleSet.name.get()),
    });
    this.assets.ensure(result.model.globals, texts.get('globals.xml') ?? '');
    // A build's or a test run's diagnostics that repeat a live one are dropped:
    // both run `generate`, which fails on the errors already reported here.
    this.publishDiagnostics(
      withoutBuildRepeats([
        ...result.diagnostics,
        ...result.sampleProblems,
        ...this.wasm.buildDiagnostics.get(),
        ...this.diagnosticSources.flatMap((source) => source.get()),
      ]),
    );
    this.workspace.selection.reconcile();
    this.workspace.refreshElementTrees();
    this.canvasEditing.set(result.wellFormed);

    // --- Step 2: Scene to pixels, or the last good frame with the reason ---
    const module = this.wasm.module.get();
    const timings = { ...result.timings, apply: 0, render: 0, blit: 0, frameStart, runStart, drawn: false };
    const injection: InjectionState = module === undefined || result.scene === undefined ? 'ready' : this.injector.prepare(module, result.model.globals, this.assets.current);
    this.waitingForAssets = injection === 'waiting';
    if (result.scene === undefined || module === undefined || result.screen === undefined) {
      this.markStale(this.staleReason(result.diagnostics, module, result.screen));
    } else if (injection === 'waiting') {
      // The last frame stays as it is; the font's arrival books the next run.
    } else {
      let lap = performance.now();
      const hidden = this.hiddenFor(result, module);
      // While input is previewed on the scene it was started on, the bridge
      // already holds the screen the preview is on, rebuilt by a load or a
      // back: applying again would end the preview. Any other scene, or
      // another module, ends it, and the run applies as usual.
      const previewing = this.preview.get() !== undefined && module === this.applied && result.scene === this.appliedScene;
      if (!previewing && this.preview.get() !== undefined) {
        this.endPreview('the text changed, so the preview ended');
      }
      const applied =
        previewing ||
        (module.applyScene(result.scene) && module.selectScreen(result.screen) && module.applySampleData(result.sampleValues));
      if (applied && !previewing) this.appliedScene = result.scene;
      // The active set's rows, which the rebuild just cleared. They were
      // checked as the bridge checks them, so a refusal here means the loaded
      // Wasm is older than its widgets' <data> (or lacks their class): the
      // frame is drawn without rows rather than lost.
      // Said in Output once per new refusal, not once per frame.
      if (applied && !previewing) {
        const refusal =
          result.collectionData === undefined || module.applyCollectionData(result.collectionData) ? undefined : module.lastError();
        if (refusal !== undefined && refusal !== this.sampleRefusal) this.workspace.log(`the sample set's rows were not applied: ${refusal}`);
        this.sampleRefusal = refusal;
      }
      // After the apply, which forgets the set. Only this loop sets it: a test
      // run applies afresh and so renders the exported view.
      if (applied && hidden.size > 0) module.setDesignHidden(bridgeNames(hidden, result.drawnBy));
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
        // A hidden element is not drawn, so it is not hit: a click lands beneath it.
        this.hiddenNow = hidden;
        this.hitTargets.set({
          file: result.screenFile,
          targets: hidden.size === 0 ? result.targets : result.targets.filter((target) => !hidden.has(target.name)),
        });
        this.drawnPlacements = result.placements;
        this.shownBounds.set(hidden.size === 0 ? result.bounds : without(result.bounds, hidden));
        this.bounds.set(result.bounds);
        const runtime = module.runtimeHidden();
        this.runtimeHidden.set({ file: result.screenFile, names: runtime === undefined || runtime.length === 0 ? NO_NAMES : new Set(runtime) });
        this.frameState.set({
          frame: this.drawn,
          stale: false,
          screen: result.screen,
          display: { width, height },
          placeholders,
          hatched: hatched.map(({ name }) => name),
          lit: countLit(buffer),
          ...assetNoteOf(injection, module.lastError()),
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

  // hiddenFor
  // The drawn screen's effectively hidden names: what the author hid in its
  // file and everything nested under it. None when the loaded Wasm cannot
  // hide, so the canvas never treats as hidden what it still draws.
  //   result — the run's
  //   module — the loaded editor Wasm
  private hiddenFor(result: TextPipelineResult, module: EditorModule): ReadonlySet<string> {
    const file = result.screenFile;
    if (file === undefined || !module.designHiding) return NO_NAMES;
    const names = this.workspace.designHidden.namesIn(file);
    if (names.size === 0) return NO_NAMES;
    return effectiveHidden(this.workspace.elementTrees.get().get(file) ?? [], names);
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

/**
 * @brief The overlay's `selection` rectangles for the selected names that are
 *        drawn, in selection order. A single selected line-shaped element
 *        (`line-ends.ts`) keeps its outline and badge but not its eight box
 *        handles: its handles are its two ends. Several selected keep every
 *        box's handles, a line's included.
 *
 * @param names      The selected names, in the drawn screen's file.
 * @param bounds     The drawn elements' rectangles by name.
 * @param placements The drawn elements' placements by name.
 */
export function selectionOverlay(
  names: readonly string[],
  bounds: ReadonlyMap<string, Rect>,
  placements: ReadonlyMap<string, Placement>,
  hidden: ReadonlySet<string> = NO_NAMES,
): OverlayRect[] {
  const shown = names.filter((name) => bounds.has(name));
  const [only] = shown;
  const handles = !(shown.length === 1 && only !== undefined && isLineShaped(placements.get(only)));
  return shown.flatMap((name) => {
    const rect = bounds.get(name);
    if (rect === undefined) return [];
    // Hidden in the designer: where it is, dashed, with nothing to grab.
    return [hidden.has(name) ? { ...rect, kind: 'selection' as const, handles: false, dashed: true } : { ...rect, kind: 'selection' as const, handles }];
  });
}

// bridgeNames
// The scene element names the editor Wasm must leave out for some hidden
// names: each name, and every element expanded from a hidden composite
// instance, whose scene names are its parts' own.
//   hidden  — the effectively hidden names, as written in the screen
//   drawnBy — the run's scene identifier → written name
function bridgeNames(hidden: ReadonlySet<string>, drawnBy: ReadonlyMap<string, string>): string[] {
  const names = new Set(hidden);
  for (const [identifier, name] of drawnBy) {
    if (hidden.has(name)) names.add(identifier);
  }
  return [...names];
}

// without
// A map without some keys.
function without<T>(map: ReadonlyMap<string, T>, keys: ReadonlySet<string>): Map<string, T> {
  return new Map([...map].filter(([key]) => !keys.has(key)));
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

// assetNoteOf
// The frame's note about its fonts and images, as the status bar shows it.
// After a frame, the module's last error is its warning, if any: a font not
// loaded and drawn in the fallback.
//   injection — what the injector found for the module
//   warning   — the module's lastError() after renderFrame
function assetNoteOf(injection: InjectionState, warning: string): { readonly assetNote?: string } {
  if (injection === 'own-table') {
    return { assetNote: 'this editor Wasm predates font injection, so it draws the fonts and images it was built with' };
  }
  return warning === '' ? {} : { assetNote: warning };
}

// activeSetPath
// The project path of the chosen sample set, if one is chosen.
//   name — the set's name, as the browser remembers it
function activeSetPath(name: string | undefined): string | undefined {
  return name === undefined ? undefined : sampleSetPath(name);
}

// sameInputState
// Two preview states that show the same.
function sameInputState(a: InputState | undefined, b: InputState | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
