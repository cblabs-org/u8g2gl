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
 *              brought to the front.
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
import { StatusBar } from './status-bar';
import { WorkspaceContext } from './workspace-context';
import { countRender } from '../perf/render-count';
import { PropertyPanel } from '../panel/property-panel';
import { Palette } from '../palette/palette';

/** The Dockview component of each panel kind. */
const COMPONENTS = {
  canvas: CanvasPanel,
  editor: EditorPanel,
  problems: ProblemsPanel,
  output: OutputPanel,
};

/** A file's editor panel id. */
const editorId = (path: string): string => `file:${path}`;

/** @brief The designer shell. */
export function App({ workspace }: { readonly workspace: Workspace }): React.JSX.Element {
  countRender('App');
  const dock = useRef<DockviewApi | undefined>(undefined);
  const [view, setView] = useState<SidebarView>('explorer');

  // --- Opening files: a tab per document, in one group right of the canvas ---
  useEffect(
    () =>
      workspace.onOpenFile((request) => {
        const api = dock.current;
        if (api === undefined) return;
        const existing = api.getPanel(editorId(request.path));
        if (existing !== undefined) {
          existing.api.setActive();
          return;
        }
        const sibling = api.panels.find((panel) => panel.id.startsWith('file:'));
        api.addPanel({
          id: editorId(request.path),
          component: 'editor',
          title: request.path.slice(request.path.lastIndexOf('/') + 1),
          params: { path: request.path, line: request.line, column: request.column },
          position: sibling !== undefined ? { referencePanel: sibling.id, direction: 'within' } : { referencePanel: 'canvas', direction: 'right' },
        });
      }),
    [workspace],
  );

  // --- ⌘S or Ctrl-S anywhere in the shell saves the active document ---
  // --- ⌘↵ or Ctrl+Enter anywhere, Monaco included, presses Run ---
  // One handler, in the capture phase, rather than a Monaco keybinding: Monaco
  // binds its "CtrlCmd" by the user agent's platform, so a browser reporting
  // another platform than the keyboard's would never save. Either modifier
  // works, and the browser's own "Save page" never opens. Capturing at the
  // window also means Monaco never sees ⌘↵, which it binds to Insert Line
  // Below: Run overrides it, and the Run button's tooltip says so.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        void workspace.saveActive();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        workspace.testRun.run();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [workspace]);

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
      <div className="shell">
        <ActivityBar active={view} onSelect={setView} />
        {view === 'explorer' ? <Explorer /> : <Palette />}
        <main className="editor-area">
          <DockviewReact components={COMPONENTS} onReady={onReady} theme={themeDark} />
        </main>
        <PropertyPanel />
        <StatusBar onShowOutput={() => dock.current?.getPanel('output')?.api.setActive()} />
      </div>
    </WorkspaceContext.Provider>
  );
}
