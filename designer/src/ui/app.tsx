/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/app.tsx
 * Purpose: The designer's shell, laid out as ui_spec §6 draws it: the activity
 *          bar and the primary sidebar (the Explorer or the Palette) down the
 *          left, the editor area — canvas beside the XML — in the middle, the
 *          property panel on the right, Problems and Output below, and the
 *          status bar along the bottom. Dockview owns the editor area and
 *          bottom panel, so tabs split, move and resize as in an IDE; the
 *          fixed chrome around it is plain React.
 * Description: The activity bar chooses the sidebar's view; the Explorer is
 *              shown first. On Dockview's ready event the default layout is
 *              built: canvas, then Problems and Output beneath it. Editor tabs
 *              open to the canvas's right, all in one group, when the
 *              workspace is asked to open a file; a file already open is
 *              brought to the front. A file that is not a project document —
 *              a widget's C++, from View source or a Problems row — opens in
 *              a read-only source tab instead, in the same group.
 *
 *              When the design session ends, a banner shows above it all
 *              (`session-banner.tsx`), and while any buffer is unsaved the
 *              browser asks before the page is reloaded or closed.
 *
 * Exports:
 * - App:  The shell
 */

import { DockviewReact, themeDark, type DockviewApi, type DockviewReadyEvent } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../workspace';
import { ActivityBar, type SidebarView } from './activity-bar';
import { CanvasPanel } from './canvas-panel';
import { EditorPanel } from './editor-panel';
import { Explorer } from './explorer';
import { OutputPanel } from './output-panel';
import { ProblemsPanel } from './problems-panel';
import { sourceTitle } from './file-actions';
import { SourcePanel } from './source-panel';
import { StatusBar } from './status-bar';
import { WorkspaceContext } from './workspace-context';
import { countRender } from '../perf/render-count';
import { PropertyPanel } from '../panel/property-panel';
import { SessionBanner } from './session-banner';
import { useUnsavedGuard } from './use-unsaved-guard';
import { Palette } from '../palette/palette';

/** The Dockview component of each panel kind. */
const COMPONENTS = {
  canvas: CanvasPanel,
  editor: EditorPanel,
  source: SourcePanel,
  problems: ProblemsPanel,
  output: OutputPanel,
};

/** A file's editor panel id. */
const editorId = (path: string): string => `file:${path}`;
/** A file's read-only source panel id; a prefix of its own, so closing one never closes a document. */
const sourceId = (path: string): string => `source:${path}`;

/** @brief The designer shell. */
export function App({ workspace }: { readonly workspace: Workspace }): React.JSX.Element {
  countRender('App');
  const dock = useRef<DockviewApi | undefined>(undefined);
  const [view, setView] = useState<SidebarView>('explorer');

  // --- Opening files: a tab per file, in one group right of the canvas ---
  // A project document gets an editor; anything else (a widget's C++) a
  // read-only source tab, since the designer edits only the documents.
  useEffect(
    () =>
      workspace.onOpenFile((request) => {
        const api = dock.current;
        if (api === undefined) return;
        const isDocument = workspace.documents.isDocument(request.path);
        const id = isDocument ? editorId(request.path) : sourceId(request.path);
        const existing = api.getPanel(id);
        if (existing !== undefined) {
          existing.api.setActive();
          return;
        }
        const sibling = api.panels.find((panel) => panel.id.startsWith('file:') || panel.id.startsWith('source:'));
        api.addPanel({
          id,
          component: isDocument ? 'editor' : 'source',
          title: isDocument ? request.path.slice(request.path.lastIndexOf('/') + 1) : sourceTitle(request.path),
          params: { path: request.path, line: request.line, column: request.column },
          position: sibling !== undefined ? { referencePanel: sibling.id, direction: 'within' } : { referencePanel: 'canvas', direction: 'right' },
        });
      }),
    [workspace],
  );

  // --- ⌘S or Ctrl-S anywhere in the shell saves the active document, else the canvas's screen ---
  // --- ⌘⌥S or Ctrl-Alt-S saves every unsaved document ---
  // --- ⌘↵ or Ctrl+Enter anywhere, Monaco included, presses Run ---
  // One handler, in the capture phase, rather than a Monaco keybinding: Monaco
  // binds its "CtrlCmd" by the user agent's platform, so a browser reporting
  // another platform than the keyboard's would never save. Either modifier
  // works, and the browser's own "Save page" never opens. Capturing at the
  // window also means Monaco never sees ⌘↵, which it binds to Insert Line
  // Below: Run overrides it, and the Run button's tooltip says so.
  // The S key is matched by its code as well as its character, because with
  // Option held a Mac keyboard reports the character ß, not s.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
      const isS = event.code === 'KeyS' || event.key.toLowerCase() === 's';
      if (isS) {
        event.preventDefault();
        event.stopPropagation();
        void (event.altKey ? workspace.saveAll() : workspace.saveActive());
      } else if (event.key === 'Enter' && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        workspace.testRun.run();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [workspace]);

  // --- Requests to bring Output to the front, as after a failed save ---
  useEffect(() => workspace.onShowOutput(() => dock.current?.getPanel('output')?.api.setActive()), [workspace]);

  // --- The unsaved-changes guard: armed exactly while a buffer is dirty ---
  useUnsavedGuard(workspace.documents.dirty);

  // onReady
  // The default layout: the canvas, with Problems and Output tabbed beneath.
  const onReady = (event: DockviewReadyEvent): void => {
    dock.current = event.api;
    event.api.addPanel({ id: 'canvas', component: 'canvas', title: 'Canvas' });
    event.api.addPanel({
      id: 'problems',
      component: 'problems',
      title: 'Problems',
      position: { referencePanel: 'canvas', direction: 'below' },
      initialHeight: 170,
    });
    event.api.addPanel({ id: 'output', component: 'output', title: 'Output', position: { referencePanel: 'problems', direction: 'within' }, inactive: true });
    event.api.onDidRemovePanel((panel) => {
      if (panel.id.startsWith('file:')) {
        const path = panel.id.slice('file:'.length);
        workspace.documents.close(path);
        if (workspace.activeFile.get() === path) workspace.activeFile.set(undefined);
      }
    });
  };

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="window">
        <SessionBanner />
        <div className="shell">
          <ActivityBar active={view} onSelect={setView} />
          {view === 'explorer' ? <Explorer /> : <Palette />}
          <main className="editor-area">
            <DockviewReact components={COMPONENTS} onReady={onReady} theme={themeDark} />
          </main>
          <PropertyPanel />
          <StatusBar onShowOutput={() => workspace.showOutput()} />
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
