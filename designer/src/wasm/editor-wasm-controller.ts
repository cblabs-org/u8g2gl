/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/wasm/editor-wasm-controller.ts
 * Purpose: Decides which editor Wasm the canvas draws with, and keeps the
 *          project's own one current. The canvas
 *          starts at once with the framework editor Wasm bundled in the
 *          designer — framework elements render, project widgets are
 *          placeholders — and swaps to the project's own build when the design
 *          server has one. Without a toolchain the project still opens, and
 *          the status bar says why its widgets are placeholders.
 * Description: Builds run on the server's queue (`POST /api/build/editor-wasm`),
 *              never in the edit loop. A build is requested on load and when a
 *              file that can change the build changes; a request while one is
 *              running is remembered and run after it, so the last change always
 *              gets a build. The record is polled until it finishes. A succeeded
 *              build whose hash differs from the loaded module's is fetched from
 *              the Wasm route and swapped in; a failed one leaves the last good
 *              module loaded and reports why.
 *
 *              The indicator's states:
 *              - `loading`   the framework module is starting
 *              - `building`  the first project build is running
 *              - `current`   the project's own module is loaded, at its hash
 *              - `stale`     a source changed since the loaded build; rebuilding
 *              - `none`      no toolchain: framework module and placeholders
 *              - `failed`    the build failed; the last good module stays
 *
 * Exports:
 * - WasmStatus:              The indicator's state
 * - BUILD_JOB:               The server's job name
 * - BuildRecord:             A build record, as the server serves it
 * - NO_TOOLCHAIN_CODES:      The failure codes that mean "cannot build here"
 * - isNoToolchain():         Whether a record is that failure
 * - affectsEditorBuild():    Whether a changed file can change the build
 * - EditorWasmController:    The controller
 *
 *     - status, module:       What the indicator and the edit loop read
 *     - isFramework:          Whether the module is the framework's
 *     - buildDiagnostics:     A failed build's diagnostics, for Problems
 *     - start():              Load the framework module and request a build
 *     - fileChanged():        Note a project file change
 *     - dispose():            Stop polling
 */

import type { Diagnostic } from '@u8g2gl/core/schema/diagnostic.js';
import { parseBuildFailure } from '../pipeline/diagnostics';
import type { DesignSession } from '../session';
import { Observable } from '../state/observable';
import { loadEditorModule, type EditorModule } from './editor-module';

/** The editor Wasm indicator's state, as the status bar shows it. */
export type WasmStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'building' }
  | { readonly kind: 'current'; readonly hash: string }
  | { readonly kind: 'stale'; readonly hash: string }
  | { readonly kind: 'none'; readonly reason: string; readonly code: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly hash?: string };

/** The design server's job that builds a project's editor Wasm. */
export const BUILD_JOB = 'editor-wasm';

/** How often a running build's record is polled. */
const POLL_MS = 250;

/** The framework editor Wasm, bundled beside the application (vite.config.ts). */
const FRAMEWORK_DIR = './framework-wasm';

/**
 * @brief Whether a change to this project file can change the editor Wasm build.
 *
 * Widget sources and manifests, the project and globals files (fonts, images
 * and the target's capacities), and any asset outside `screens/`. A screen
 * never does: drawing a screen is the live edit loop's job. A request that
 * turns out not to change the build hash costs the server one `generate`, no
 * compile.
 */
export function affectsEditorBuild(path: string): boolean {
  return !path.startsWith('screens/');
}

/** A build record as `GET /api/build/<id>` serves it. */
export interface BuildRecord {
  readonly id: string;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed';
  readonly result?: { readonly buildHash?: string };
  /** A failure's message: prose, shown to the user, never matched. */
  readonly error?: string;
  /** A failure's stable code, when the server gives one. */
  readonly code?: string;
}

/**
 * The failure codes that mean this machine cannot build the project's editor
 * Wasm — no Emscripten, or no runtime sources beside the CLI — as the server's
 * `editor-wasm` job sets them (`EDITOR_WASM_FAILURE` in the CLI). Either is a
 * normal state, not a defect: the project still opens on the framework module.
 */
export const NO_TOOLCHAIN_CODES: ReadonlySet<string> = new Set(['no-emscripten', 'no-source-tree']);

/** @brief Whether a finished record is the "cannot build here" failure, decided by its code alone. */
export function isNoToolchain(record: BuildRecord): boolean {
  return record.status === 'failed' && record.code !== undefined && NO_TOOLCHAIN_CODES.has(record.code);
}

/** Chooses and loads the editor Wasm, and keeps the project's current. */
export class EditorWasmController {
  /** The indicator's state. */
  readonly status = new Observable<WasmStatus>({ kind: 'loading' });
  /** The module the canvas draws with; undefined until one has loaded. */
  readonly module = new Observable<EditorModule | undefined>(undefined);
  /** Whether that module is the framework's (true) or the project's own. */
  readonly isFramework = new Observable<boolean>(true);
  /** The last failed build's diagnostics, located in the project's files, for Problems. */
  readonly buildDiagnostics = new Observable<readonly Diagnostic[]>([]);

  private readonly session: DesignSession;
  private readonly log: (line: string) => void;
  private loadedHash: string | undefined;
  private building = false;
  private rebuildWanted = false;
  private disposed = false;

  /**
   * @param session The server and its token.
   * @param log     Where build progress is written (the Output panel).
   */
  constructor(session: DesignSession, log: (line: string) => void) {
    this.session = session;
    this.log = log;
  }

  /** @brief Loads the framework module, then asks the server for the project's. */
  async start(): Promise<void> {
    try {
      const framework = await loadEditorModule(`${FRAMEWORK_DIR}/u8g2gl_editor.js`, `${FRAMEWORK_DIR}/u8g2gl_editor.wasm`);
      if (this.module.get() === undefined) {
        this.module.set(framework);
      }
      this.log('editor Wasm: the framework renderer is loaded');
    } catch (error) {
      this.log(`editor Wasm: no framework renderer in this designer build (${describe(error)})`);
    }
    this.status.set({ kind: 'building' });
    this.requestBuild();
  }

  /** @brief Notes a project file change; rebuilds if it can change the build. */
  fileChanged(path: string): void {
    if (!affectsEditorBuild(path)) {
      return;
    }
    if (this.loadedHash !== undefined) {
      this.status.set({ kind: 'stale', hash: this.loadedHash });
    }
    this.requestBuild();
  }

  /** @brief Stops polling; a build in flight finishes on the server unobserved. */
  dispose(): void {
    this.disposed = true;
  }

  // requestBuild
  // Starts a build, or remembers to start one when the running build finishes.
  private requestBuild(): void {
    if (this.building) {
      this.rebuildWanted = true;
      return;
    }
    this.building = true;
    this.runBuild()
      .catch((error: unknown) => {
        this.status.set({ kind: 'failed', reason: describe(error), ...(this.loadedHash !== undefined ? { hash: this.loadedHash } : {}) });
        this.log(`editor Wasm: ${describe(error)}`);
      })
      .finally(() => {
        this.building = false;
        if (this.rebuildWanted && !this.disposed) {
          this.rebuildWanted = false;
          this.requestBuild();
        }
      });
  }

  // runBuild
  // One build, from submission to the module swapped in (or the failure shown).
  private async runBuild(): Promise<void> {
    // --- Step 1: Submit, then poll the record until it finishes ---
    const started = performance.now();
    this.log('editor Wasm: building the project renderer…');
    let record = await this.api<BuildRecord>(`/api/build/${BUILD_JOB}`, { method: 'POST' });
    while ((record.status === 'queued' || record.status === 'running') && !this.disposed) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      record = await this.api<BuildRecord>(`/api/build/${encodeURIComponent(record.id)}`);
    }
    if (this.disposed) {
      return;
    }

    // --- Step 2: A failure: no toolchain is a state, anything else an error ---
    if (record.status === 'failed') {
      const reason = record.error ?? 'the build failed';
      this.log(`editor Wasm: ${reason}`);
      this.setBuildDiagnostics(parseBuildFailure(reason));
      // A missing toolchain is the one failure that is a normal state, not a
      // defect, so the indicator shows it differently: the project still opens
      // without one. The record's code says so; its message is only shown.
      if (isNoToolchain(record) && this.loadedHash === undefined) {
        this.status.set({ kind: 'none', reason, code: record.code ?? '' });
      } else {
        this.status.set({ kind: 'failed', reason, ...(this.loadedHash !== undefined ? { hash: this.loadedHash } : {}) });
      }
      return;
    }

    // --- Step 3: A success: swap the module in unless it is the one loaded ---
    this.setBuildDiagnostics([]);
    const hash = record.result?.buildHash ?? '';
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    if (hash !== '' && hash === this.loadedHash) {
      this.status.set({ kind: 'current', hash });
      this.log(`editor Wasm: current (${hash.slice(0, 8)}), checked in ${seconds} s`);
      return;
    }
    const base = `${this.session.origin}/api/editor-wasm/${encodeURIComponent(record.id)}`;
    const module = await loadEditorModule(`${base}/u8g2gl_editor.js`, `${base}/u8g2gl_editor.wasm`, this.headers());
    this.loadedHash = module.buildHash() ?? hash;
    this.module.set(module);
    this.isFramework.set(false);
    this.status.set({ kind: 'current', hash: this.loadedHash });
    this.log(`editor Wasm: project renderer ${this.loadedHash.slice(0, 8)} loaded after ${seconds} s`);
  }

  // setBuildDiagnostics
  // Replaces the build's diagnostics, but an empty list with an empty list is
  // no change: each notification books a pipeline run.
  private setBuildDiagnostics(diagnostics: readonly Diagnostic[]): void {
    if (diagnostics.length === 0 && this.buildDiagnostics.get().length === 0) return;
    this.buildDiagnostics.set(diagnostics);
  }

  // api
  // An authorised JSON request to the design server.
  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.session.origin}${path}`, { ...init, headers: this.headers() });
    if (!response.ok) {
      throw new Error(`the design server answered ${response.status} to ${path}`);
    }
    return (await response.json()) as T;
  }

  // headers
  // The session token, as every API request carries it.
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.session.token}` };
  }
}

// describe
// An unknown thrown value as a sentence.
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
