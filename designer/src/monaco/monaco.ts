/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/monaco/monaco.ts
 * Purpose: Monaco on demand. Monaco is most of the designer's code, and the
 *          shell and the canvas need none of it to paint and run, so it is
 *          loaded after them: this module is how every other module reaches
 *          it, without importing it. Monaco owns the open documents' text and
 *          their one undo stack ([UD-3]); until it has loaded, no document is
 *          open, the canvas draws the disk's text, and a canvas edit waits for
 *          it as it waits for an open document.
 * Description: `loadMonaco()` imports `monaco-runtime.ts` once — a separate
 *              chunk — and publishes the API on `monacoReady` when it arrives;
 *              `loadedMonaco()` is the API if it has. The entry point starts the
 *              load after the canvas's first frame; an editor tab opened sooner
 *              starts it itself. Types are imported as types only, which
 *              brings in no code.
 *
 * Exports:
 * - Monaco:          The Monaco API's type
 * - THEME:           The theme name every editor uses
 * - monacoReady:     The API once loaded, observable
 * - loadMonaco():    Load it, once
 * - loadedMonaco():  The API, if loaded
 */

import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { Observable } from '../state/observable';

/** The Monaco API's type. */
export type Monaco = typeof MonacoApi;

/** The theme every editor in the designer uses (defined by the runtime as it loads). */
export const THEME = 'u8g2gl-dark';

/** The Monaco API once it has loaded; undefined until then. */
export const monacoReady = new Observable<Monaco | undefined>(undefined);

let loading: Promise<Monaco> | undefined;

/**
 * @brief Loads Monaco, once; later calls return the same promise.
 *
 * @return The API, also published on {@link monacoReady}.
 */
export function loadMonaco(): Promise<Monaco> {
  loading ??= import('./monaco-runtime').then(({ monaco }) => {
    monacoReady.set(monaco);
    return monaco;
  });
  return loading;
}

/** @brief The Monaco API if it has loaded, else undefined. */
export function loadedMonaco(): Monaco | undefined {
  return monacoReady.get();
}
