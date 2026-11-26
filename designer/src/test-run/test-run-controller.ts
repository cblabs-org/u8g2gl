/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/test-run/test-run-controller.ts
 * Purpose: The designer's half of a test run: Run checks
 *          that the real build — the generated firmware code, compiled with
 *          the widgets at -O3 — draws what the live canvas draws. It is a
 *          check, not a second view, so its whole output is a verdict in the
 *          canvas toolbar and, on a mismatch, a diff overlay on the live
 *          canvas. A mismatch is a framework bug ([D-9]), and the controller
 *          offers to save a bug report.
 * Description: On Run, once the edit loop has drawn the latest text:
 *              1. the live frames are rendered from that run's scene, on the
 *                 loaded editor Wasm, from a fresh apply, at TEST_RUN_TIMES,
 *                 for every case: each screen with the initial values, then
 *                 with each sample set, applied as the canvas applies it
 *                 (`applySampleData()` and `applyCollectionData()`), then
 *                 the screen activated as the device activates it, its ring's
 *                 first member focused (§12.2); then the screen deactivated
 *                 and the loop asked to apply the scene afresh, so the
 *                 editing canvas, with no focus, is restored on the next
 *                 frame;
 *              2. every buffer that differs from disk is posted to the
 *                 server's `test-run` job with its version and the screen, so
 *                 the server tests the same text, unsaved, with each set as
 *                 the canvas applied it, which the firmware half applies
 *                 through the subject setters and the widgets' own methods;
 *              3. each case's frames are compared with the job's, first
 *                 differing frame first, and the verdict is reported per set
 *                 and per screen: parity only when every case agrees.
 *              The verdict's staleness is counted in edits: each content
 *              change after the run's snapshot is one, and the diff overlay
 *              clears at the first.
 *
 *              A Run pressed while the editor Wasm is being rebuilt waits for
 *              it; one pressed while another run is in flight is queued, at
 *              most one, and runs with the text current when it starts.
 *
 *              *Run after a pause* (§4.2) is a setting, off by default and
 *              kept per browser: when on, a run starts PAUSE_MS after the
 *              last edit, through the same path as a press, so it waits,
 *              queues and is refused exactly as one would be (silently, when
 *              Run is unavailable: nobody pressed anything).
 *
 * Exports:
 * - TEST_RUN_JOB:         The server's job name
 * - TEST_RUN_REPORT_PATH: The bug-report route
 * - PAUSE_MS:             How long a pause is
 * - AFTER_PAUSE_KEY:      Where the setting is kept
 * - Source:               A read-only observable value
 * - TestRunTarget:        What the controller drives, so tests can fake it
 * - MismatchDetail:       The last mismatch
 * - TestRunController:    The controller
 *
 *     - view:              What the toolbar shows
 *     - availability:      Whether Run can be pressed, and why not
 *     - mismatch:          The last mismatch's detail, for the overlay
 *     - diagnostics:       A failed run's diagnostics, for Problems until the next edit
 *     - reportPath:        Where the last bug report was written
 *     - afterPause:        The *Run after a pause* setting
 *     - setAfterPause():   Change it, and remember it for this browser
 *     - run():             Press Run
 *     - saveReport():      Save the bug report for the last mismatch
 *
 * The self-test hook (end-to-end test build only): with the window property
 * SELF_TEST_FLIP set, one harness pixel is flipped before comparing, so the
 * mismatch path can be shown on demand. It sits behind
 * `__U8G2GL_TEST_HOOKS__`, so a production build drops it, string and all.
 */

/// <reference path="../build-flags.d.ts" />

import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import { parseBuildFailure, TEST_RUN_BUILD_CODE } from '../pipeline/diagnostics';
import type { CompletedRun } from '../pipeline/edit-loop';
import type { DesignSession } from '../session';
import { Observable } from '../state/observable';
import type { EditorModule } from '../wasm/editor-module';
import type { WasmStatus } from '../wasm/editor-wasm-controller';
import { checkSampleSet, collectionDataJson, sampleSetPath, sampleValuesJson, type AppliedSampleSet } from '../samples/sample-set';
import {
  caseLabel,
  compareFrames,
  runAvailability,
  type CaseVerdict,
  TEST_RUN_TIMES,
  type Pixel,
  type RunAvailability,
  type TestRunView,
} from './verdict';

/** The design server's test-run job. */
export const TEST_RUN_JOB = 'test-run';

/** The design server's bug-report route. */
export const TEST_RUN_REPORT_PATH = '/api/test-run/report';

/** How long after the last edit *Run after a pause* starts a run. */
export const PAUSE_MS = 2000;

/** Where this browser remembers the *Run after a pause* setting. */
export const AFTER_PAUSE_KEY = 'u8g2gl.test-run.after-pause';

/** How often a running job's record is polled. */
const POLL_MS = 200;

/**
 * The window property the self-test sets (test build only). Its text is what
 * the production build's no-hook check greps for, so it must appear nowhere
 * else in the designer's source.
 */
const SELF_TEST_FLIP = 'u8g2gl:flip-harness-pixel';

/** A value the controller reads and is told about: an Observable, read-only. */
export interface Source<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

/** What the controller drives: the workspace's parts it reads and asks. */
export interface TestRunTarget {
  readonly session: DesignSession;
  /** The editor Wasm's indicator, for availability. */
  readonly wasmStatus: Source<WasmStatus>;
  /** The module the canvas draws with. */
  readonly module: Source<EditorModule | undefined>;
  /** The latest pipeline run: its scene is what the live frames are rendered from. */
  readonly lastRun: Source<CompletedRun | undefined>;
  /** False while a document is not well-formed. */
  readonly wellFormed: Source<boolean>;
  /** The frame state's placeholder count and staleness. */
  readonly canvas: Source<{ readonly placeholders: readonly unknown[]; readonly stale: boolean }>;
  /** Resolves once the loop has drawn the latest text (now, if nothing is pending). */
  settled(): Promise<void>;
  /** Asks the loop for a normal run: the canvas is restored on the next frame. */
  restoreCanvas(): void;
  /** Every buffer that differs from disk, with the version of its text. */
  dirtyDocuments(): Array<{ path: string; content: string; version: string }>;
  /** Every sample set's name and current text, the run checks each. */
  sampleSets(): ReadonlyArray<{ readonly name: string; readonly text: string }>;
  /** The set the canvas shows, if any: a mismatch with it can be overlaid on the canvas. */
  activeSampleSet(): string | undefined;
  /** Subscribes to every content change; returns the unsubscribe. */
  onEdit(listener: () => void): () => void;
  /** Output panel line. */
  log(line: string): void;
}

/** The last mismatch: what the overlay draws and the bug report sends. */
export interface MismatchDetail {
  readonly runId: string;
  /** The case: its screen, and its sample set (null for the initial values). */
  readonly screen: string;
  readonly set: string | null;
  readonly time: number;
  readonly pixels: readonly Pixel[];
  readonly liveSha256: string;
  readonly harnessSha256: string;
  readonly live: Uint8Array;
  readonly scene: string;
  readonly documents: ReadonlyArray<{ path: string; content: string; version: string }>;
}

/** A test-run record's result, as the server serves it. */
interface RunResult {
  readonly display: { readonly width: number; readonly height: number };
  readonly frames: ReadonlyArray<{ readonly time: number; readonly sha256: string; readonly bytes: string }>;
  /** Every case the server ran; a server that predates sets sends none. */
  readonly runs?: ReadonlyArray<{ readonly screen: string; readonly set: string | null; readonly frames: RunResult['frames'] }>;
}

/** One case's live frames, and what it was. */
interface LiveCase {
  readonly screen: string;
  readonly set: string | null;
  readonly frames: Uint8Array[];
}

/** A build record, as `GET /api/build/<id>` serves it. */
interface Record_ {
  readonly id: string;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed';
  readonly result?: RunResult;
  readonly error?: string;
  readonly code?: string;
}

/** Drives Run and holds its verdict. */
export class TestRunController {
  /** What the toolbar shows about the last run. */
  readonly view = new Observable<TestRunView>({ kind: 'none' });
  /** Whether Run can be pressed now. */
  readonly availability = new Observable<RunAvailability>(
    { state: 'wait', reason: 'the editor Wasm is loading' },
    (a, b) => a.state === b.state && (a.state === 'ready' || a.reason === (b as { reason: string }).reason),
  );
  /** The last mismatch while its overlay is shown; cleared at the next edit. */
  readonly mismatch = new Observable<MismatchDetail | undefined>(undefined);
  /** A failed run's diagnostics, located, for Problems; cleared at the next edit. */
  readonly diagnostics = new Observable<readonly Diagnostic[]>([]);
  /** Where the last bug report was written, once saved. */
  readonly reportPath = new Observable<string | undefined>(undefined);
  /** *Run after a pause in editing*: off unless this browser turned it on. */
  readonly afterPause = new Observable<boolean>(false);
  private readonly target: TestRunTarget;
  private readonly subscriptions: Array<() => void> = [];
  private edits = 0;
  private editsAtSnapshot = 0;
  private inFlight = false;
  private queued = false;
  private waiting = false;
  private deciding = false;
  private lastMismatch: MismatchDetail | undefined;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;

  /** @param target The workspace parts the controller reads and asks. */
  constructor(target: TestRunTarget) {
    this.target = target;
  }

  /** @brief Reads the setting, and subscribes to what decides availability and staleness. */
  start(): void {
    this.afterPause.set(readSetting());
    const update = (): void => this.updateAvailability();
    this.subscriptions.push(
      this.target.wasmStatus.subscribe(update),
      this.target.wellFormed.subscribe(update),
      this.target.canvas.subscribe(update),
      this.target.onEdit(() => this.edited()),
    );
    update();
  }

  /** @brief Stops listening. A run in flight finishes on the server unobserved. */
  dispose(): void {
    if (this.pauseTimer !== undefined) clearTimeout(this.pauseTimer);
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
  }

  /**
   * @brief Turns *Run after a pause* on or off, and remembers it for this browser.
   */
  setAfterPause(on: boolean): void {
    this.afterPause.set(on);
    writeSetting(on);
    if (!on && this.pauseTimer !== undefined) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = undefined;
    }
  }

  /**
   * @brief Presses Run.
   *
   * Runs now when available; waits for a rebuilding editor Wasm; queues
   * behind a run in flight (at most one waits, and it takes the latest text);
   * does nothing while Run is unavailable.
   *
   * @param pressed False when the pause started it: an unavailable Run is
   *                then not reported, since nobody asked.
   */
  run(pressed = true): void {
    // --- Step 1: Coalesce: behind a run in flight, one rerun waits ---
    // Whatever is pressed meanwhile collapses into that one, which snapshots
    // the text when it starts, so it always tests the latest text.
    const availability = this.availability.get();
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    // --- Step 2: Unavailable: nothing runs; said only when someone pressed ---
    if (availability.state === 'unavailable') {
      if (pressed) this.target.log(`test run: unavailable, ${availability.reason}`);
      return;
    }
    // --- Step 3: Parked: the editor Wasm is rebuilding; updateAvailability() resumes it ---
    if (availability.state === 'wait') {
      this.waiting = true;
      this.view.set({ kind: 'waiting', reason: availability.reason });
      return;
    }
    // --- Step 4: Run, then the coalesced rerun if one was asked for ---
    this.inFlight = true;
    this.execute()
      .catch((error: unknown) => {
        this.fail(error instanceof Error ? error.message : String(error), []);
      })
      .finally(() => {
        this.inFlight = false;
        if (this.queued) {
          this.queued = false;
          this.run();
        }
      });
  }

  /** @brief Whether a run is in flight or queued, for tests and the toolbar. */
  get busy(): boolean {
    return this.inFlight || this.queued || this.waiting;
  }

  /**
   * @brief Saves a bug report for the last mismatch; the server writes it to
   *        the build cache and answers its directory, which `reportPath` shows.
   */
  async saveReport(): Promise<void> {
    const detail = this.lastMismatch;
    if (detail === undefined) return;
    const response = await fetch(`${this.target.session.origin}${TEST_RUN_REPORT_PATH}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        run: detail.runId,
        screen: detail.screen,
        set: detail.set,
        time: detail.time,
        live: toBase64(detail.live),
        scene: detail.scene,
        documents: detail.documents,
      }),
    });
    const answer = (await response.json()) as { path?: string; message?: string };
    if (!response.ok || answer.path === undefined) {
      this.target.log(`test run: the bug report was not saved: ${answer.message ?? response.status}`);
      return;
    }
    this.reportPath.set(answer.path);
    this.target.log(`test run: bug report saved to ${answer.path}`);
  }

  // execute
  // One run: snapshot, live frames, the job, the verdict.
  private async execute(): Promise<void> {
    // --- Step 1: The text the canvas shows, and the scene it drew ---
    this.view.set({ kind: 'running' });
    this.reportPath.set(undefined);
    await this.target.settled();
    const run = this.target.lastRun.get();
    const module = this.target.module.get();
    const result = run?.result;
    if (result?.scene === undefined || result.screen === undefined || module === undefined) {
      throw new Error('the canvas has no frame of the current text to compare');
    }
    const documents = this.target.dirtyDocuments();
    this.editsAtSnapshot = this.edits;

    // --- Step 2: Each case's sets, checked as the canvas checks them ---
    const sets = this.target.sampleSets().map(({ name, text }) => ({ name, applied: checkSampleSet(sampleSetPath(name), text, result.sampleShape).applied }));
    const screens = result.model.screens.map((screen) => ({ name: screen.name, file: screen.loc?.file }));

    // --- Step 3: The live frames, from a fresh apply per case, then the canvas restored ---
    const live: LiveCase[] = [];
    let refusal: string | undefined;
    for (const screen of screens) {
      for (const set of [undefined, ...sets]) {
        const values = set === undefined ? result.subjectValues : sampleValuesJson(result.subjectValues, set.applied);
        const rows = set === undefined ? undefined : collectionDataJson(set.applied, screen.file);
        // Activated last, as the firmware boots: data first, then the screen,
        // whose activation focuses its ring's first visible, enabled member
        // (§12.2) — a focused button draws inverted. Without it every screen
        // with a ring differs by that member. A module too old to preview
        // cannot activate, and draws as before.
        const applied =
          module.applyScene(result.scene) &&
          module.selectScreen(screen.name) &&
          module.applySampleData(values) &&
          (rows === undefined || module.applyCollectionData(rows)) &&
          (!module.inputPreview || module.setPreview(true));
        const frames: Uint8Array[] = [];
        for (const time of TEST_RUN_TIMES) {
          const frame = applied ? module.renderFrame(time) : undefined;
          if (frame === undefined) break;
          frames.push(frame.slice());
        }
        if (frames.length !== TEST_RUN_TIMES.length) refusal ??= module.lastError();
        live.push({ screen: screen.name, set: set?.name ?? null, frames });
      }
    }
    const { width, height } = module.displaySize();
    // The editing canvas shows no focus: deactivate before it is restored.
    if (module.inputPreview) module.setPreview(false);
    this.target.restoreCanvas();
    if (refusal !== undefined) {
      throw new Error(`the editor Wasm refused the scene: ${refusal}`);
    }

    // --- Step 4: The firmware target's frames, from the server ---
    const started = performance.now();
    const firmwareSets = sets.map(({ name, applied }) => ({ name, values: applied.values, rows: rowsByScreen(applied, screens) }));
    let record = await this.api<Record_>(`/api/build/${TEST_RUN_JOB}`, {
      method: 'POST',
      body: JSON.stringify({ screen: result.screen, documents, times: TEST_RUN_TIMES, sets: firmwareSets }),
    });
    while (record.status === 'queued' || record.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      record = await this.api<Record_>(`/api/build/${encodeURIComponent(record.id)}`);
    }
    if (record.status === 'failed' || record.result === undefined) {
      const reason = record.error ?? 'the test run failed';
      this.fail(reason, parseBuildFailure(reason, TEST_RUN_BUILD_CODE));
      return;
    }

    // --- Step 5: The verdict, per set and per screen ---
    const runs = record.result.runs ?? [{ screen: result.screen, set: null, frames: record.result.frames }];
    const cases: CaseVerdict[] = [];
    let first: { readonly live: LiveCase; readonly harness: Uint8Array[]; readonly index: number; readonly time: number; readonly pixels: readonly Pixel[] } | undefined;
    for (const own of live) {
      const theirs = runs.find((run) => run.screen === own.screen && run.set === own.set);
      if (theirs === undefined) {
        this.fail(`the server did not run ${caseLabel(own, false)}`, []);
        return;
      }
      const harness = theirs.frames.map((frame) => fromBase64(frame.bytes));
      // `typeof` first, so the unit tests, which have no build flags, run this file.
      if (typeof __U8G2GL_TEST_HOOKS__ !== 'undefined' && __U8G2GL_TEST_HOOKS__) {
        const frame = harness[0];
        if (frame !== undefined && own === live[0] && (window as unknown as Record<string, unknown>)[SELF_TEST_FLIP] === true) {
          frame[0] = (frame[0] ?? 0) ^ 0x01;
        }
      }
      const comparison = compareFrames(TEST_RUN_TIMES, own.frames, harness, width, height);
      if (comparison.kind === 'parity') {
        cases.push({ screen: own.screen, set: own.set, kind: 'parity', pixels: 0, time: 0 });
      } else {
        cases.push({ screen: own.screen, set: own.set, kind: 'mismatch', pixels: comparison.pixels.length, time: comparison.time });
        first ??= { live: own, harness, index: comparison.index, time: comparison.time, pixels: comparison.pixels };
      }
    }
    const finishedAt = performance.now();
    this.diagnostics.set([]);
    const editsSince = this.edits - this.editsAtSnapshot;
    const oneScreen = screens.length <= 1;
    const seconds = ((finishedAt - started) / 1000).toFixed(1);
    for (const verdict of cases) {
      this.target.log(`test run: ${verdict.kind} on ${caseLabel(verdict, false)}${verdict.kind === 'mismatch' ? `, ${verdict.pixels} px at ${verdict.time} ms` : ''}`);
    }
    this.target.log(`test run: ${first === undefined ? 'parity' : 'mismatch'} across ${cases.length} case${cases.length === 1 ? '' : 's'} in ${seconds} s`);
    if (first === undefined) {
      this.lastMismatch = undefined;
      this.mismatch.set(undefined);
      this.view.set({ kind: 'parity', finishedAt, editsSince, cases });
      return;
    }
    const detail: MismatchDetail = {
      runId: record.id,
      screen: first.live.screen,
      set: first.live.set,
      time: first.time,
      pixels: first.pixels,
      liveSha256: await sha256(first.live.frames[first.index] as Uint8Array),
      harnessSha256: await sha256(first.harness[first.index] as Uint8Array),
      live: first.live.frames[first.index] as Uint8Array,
      scene: result.scene,
      documents,
    };
    this.lastMismatch = detail;
    // The overlay is about the text the run checked, as the canvas draws it:
    // if the user typed while the server worked, or the case is another
    // screen or set than the canvas shows, there is nothing to overlay it on.
    const shown = first.live.screen === result.screen && first.live.set === (this.target.activeSampleSet() ?? null);
    this.mismatch.set(editsSince === 0 && shown ? detail : undefined);
    this.view.set({
      kind: 'mismatch',
      finishedAt,
      editsSince,
      pixels: first.pixels.length,
      time: first.time,
      cases,
      ...(cases.length > 1 ? { at: caseLabel(first.live, oneScreen) } : {}),
    });
  }

  // fail
  // A run that produced no verdict: the reason in Output, located diagnostics
  // in Problems. Like the mismatch overlay, the diagnostics are about the text
  // the run checked, so an edit made while the server worked means Problems
  // gets none: they would describe text the editor no longer holds.
  private fail(reason: string, diagnostics: readonly Diagnostic[]): void {
    const editsSince = this.edits - this.editsAtSnapshot;
    this.target.log(`test run: ${reason}`);
    this.diagnostics.set(editsSince === 0 ? diagnostics : []);
    this.lastMismatch = undefined;
    this.mismatch.set(undefined);
    this.view.set({ kind: 'failed', finishedAt: performance.now(), editsSince });
  }

  // edited
  // One content change: the verdict is one edit staler, and the overlay and a
  // failed run's Problems go. Both describe the text the run checked; the
  // verdict line keeps the result visible, with its count of edits since.
  private edited(): void {
    this.edits += 1;
    if (this.afterPause.get()) {
      if (this.pauseTimer !== undefined) clearTimeout(this.pauseTimer);
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = undefined;
        this.run(false);
      }, PAUSE_MS);
    }
    this.mismatch.set(undefined);
    if (this.diagnostics.get().length > 0) this.diagnostics.set([]);
    const view = this.view.get();
    if (view.kind === 'parity' || view.kind === 'mismatch' || view.kind === 'failed') {
      this.view.set({ ...view, editsSince: this.edits - this.editsAtSnapshot });
    }
    this.updateAvailability();
  }

  // updateAvailability
  // Recomputes availability; a Run waiting on a rebuild starts once it can.
  private updateAvailability(): void {
    const status = this.target.wasmStatus.get();
    const canvas = this.target.canvas.get();
    // The canvas may show another target than the first ([U-3]); the test run
    // builds the first, so the two frames would be of different displays.
    // A switch redraws the canvas, whose subscription brings this here.
    // A run that carries no project (a stand-in run) has no target to compare.
    const run = this.target.lastRun.get()?.result;
    const first = run?.model?.project.targets[0];
    const availability = runAvailability({
      cannotBuild: status.kind === 'none' ? status.code : undefined,
      wasm: status.kind,
      placeholders: canvas.placeholders.length,
      wellFormed: this.target.wellFormed.get(),
      live: !canvas.stale,
      defaultTarget: first !== undefined && run?.target !== undefined && run.target !== first ? first.name : undefined,
    });
    this.availability.set(availability);
    if (this.waiting && availability.state !== 'wait' && !this.deciding) {
      // The rebuilt module reaches the canvas on the loop's next run, and
      // until then the canvas still shows the old module's frame (its
      // placeholders, say), so decide once that run has drawn.
      this.deciding = true;
      void this.target.settled().then(() => {
        this.deciding = false;
        const now = this.availability.get();
        if (!this.waiting || now.state === 'wait') return;
        this.waiting = false;
        if (now.state === 'ready') {
          this.run();
        } else {
          this.view.set({ kind: 'none' });
          this.target.log(`test run: not run, ${now.reason}`);
        }
      });
    }
  }

  // api
  // An authorised JSON request to the design server.
  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.target.session.origin}${path}`, { ...init, headers: this.headers() });
    if (!response.ok) {
      throw new Error(`the design server answered ${response.status} to ${path}`);
    }
    return (await response.json()) as T;
  }

  // headers
  // The session token, as every API request carries it.
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.target.session.token}`, 'Content-Type': 'application/json' };
  }
}

// readSetting, writeSetting
// The setting in this browser's storage. Storage can be unavailable (a
// private window, a test page): the setting is then off, and not kept.
function readSetting(): boolean {
  try {
    return globalThis.localStorage?.getItem(AFTER_PAUSE_KEY) === 'on';
  } catch {
    return false;
  }
}
function writeSetting(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(AFTER_PAUSE_KEY, on ? 'on' : 'off');
  } catch {
    // Not kept: see readSetting.
  }
}

// toBase64, fromBase64
// Bytes to and from base64, through the browser's own codec.
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// sha256
// A frame's SHA-256 hex, through Web Crypto, as the server hashes it.
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// rowsByScreen
// A set's rows keyed by screen name, as the firmware half takes them: the
// harness reaches a widget through its screen's descriptor, not its file.
//   applied — the set as the canvas applies it
//   screens — each screen's name and file
function rowsByScreen(
  applied: AppliedSampleSet,
  screens: ReadonlyArray<{ readonly name: string; readonly file: string | undefined }>,
): Record<string, unknown> {
  const rows: Record<string, unknown> = {};
  for (const screen of screens) {
    const byElement = screen.file === undefined ? undefined : applied.rows.get(screen.file);
    if (byElement !== undefined) rows[screen.name] = byElement;
  }
  return rows;
}
