/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/monaco/monaco-runtime.ts
 * Purpose: Monaco itself, as the designer bundles it: the editor core, the XML
 *          language and the editor features the shell uses, and nothing else.
 *          It is the one module that imports Monaco's code, and only
 *          `monaco.ts` imports it, dynamically, so it is a chunk of its own the
 *          page loads after the shell has painted and the canvas has drawn.
 * Description: `editor.api` is Monaco's core without any language or feature;
 *              each `features/<name>/register` adds one contribution, chosen
 *              for what the XML editor tabs offer: the editor widget and the
 *              diff editor (Compare); find; hover, which shows the markers;
 *              go to next problem; folding, bracket matching, comment toggling,
 *              multi-cursor, line and word operations, word highlighting,
 *              indentation, clipboard, the context menu and cursor undo; and
 *              the codicon font those widgets draw with. XML is registered as
 *              the only language. The editor worker is bundled by Vite's
 *              `?worker` import — the designer loads nothing from a CDN, so it
 *              works offline and the server can token-check every byte it
 *              serves — and every worker label gets it, since XML needs no
 *              language worker of its own. A dark theme matches the canvas's
 *              dark chrome (ui_spec §8).
 *
 * Exports:
 * - monaco:  The Monaco API, configured
 */

import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/codeEditor/register';
import 'monaco-editor/features/diffEditor/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/hover/register';
import 'monaco-editor/features/gotoError/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/bracketMatching/register';
import 'monaco-editor/features/comment/register';
import 'monaco-editor/features/multicursor/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/wordOperations/register';
import 'monaco-editor/features/wordHighlighter/register';
import 'monaco-editor/features/indentation/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/cursorUndo/register';
import 'monaco-editor/languages/definitions/xml/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { THEME } from './monaco';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
  }
}

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

monaco.editor.defineTheme(THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#1b1d21' },
});

export { monaco };
