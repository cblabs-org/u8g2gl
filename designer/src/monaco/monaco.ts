/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/monaco/monaco.ts
 * Purpose: The one place Monaco is imported and configured, so every other
 *          module gets the same instance, with its worker wired up before any
 *          editor exists. Monaco owns the document text and its one undo stack
 *          ([UD-3]); this module only makes it available.
 * Description: Monaco's ESM build, with its editor worker bundled by Vite's
 *              `?worker` import — the designer loads nothing from a CDN, so it
 *              works offline and the server can token-check every byte it
 *              serves. XML is the only language the designer edits, and it
 *              needs no language worker of its own, so every worker label gets
 *              the editor worker. A dark theme matches the canvas's dark
 *              chrome (ui_spec §8).
 *
 * Exports:
 * - monaco:        The Monaco API
 * - THEME:         The theme name every editor uses
 */

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
  }
}

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

/** The theme every editor in the designer uses. */
export const THEME = 'u8g2gl-dark';

monaco.editor.defineTheme(THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#1b1d21' },
});

export { monaco };
