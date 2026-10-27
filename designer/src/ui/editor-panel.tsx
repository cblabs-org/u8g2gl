/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/editor-panel.tsx
 * Purpose: One editor tab: a Monaco editor on one project document's model.
 *          The model, not the editor, holds the text and its undo stack
 *          ([UD-3]), so closing and reopening a tab, or two views of one file,
 *          never fork the document.
 * Description: Monaco is imperative, so the editor is created once per panel
 *              in an effect that owns its lifecycle and disposes it on unmount;
 *              React renders only the container. The panel tells the workspace
 *              when it becomes the active file, and moves the caret when the
 *              workspace is asked to open its file at a position (a Problems
 *              row, say).
 *
 * Exports:
 * - EditorPanelParams:  Which document the tab shows
 * - EditorPanel:        The component
 */

import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef } from 'react';
import { monaco, THEME } from '../monaco/monaco';
import type { OpenRequest } from '../workspace';
import { useWorkspace } from './workspace-context';

/** The panel's parameters: the document it shows. */
export interface EditorPanelParams {
  readonly path: string;
  /** Where to put the caret when the panel first opens. */
  readonly line?: number;
  readonly column?: number;
}

/** @brief An editor tab. */
export function EditorPanel(props: IDockviewPanelProps<EditorPanelParams>): React.JSX.Element {
  const workspace = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const { path } = props.params;

  useEffect(() => {
    const element = host.current;
    const model = workspace.documents.open(path);
    if (element === null || model === undefined) {
      return undefined;
    }

    // --- Step 1: The editor, on the document's shared model ---
    const editor = monaco.editor.create(element, {
      model,
      theme: THEME,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      // Format on demand only, never by itself (ui_spec §10, principle 5).
      formatOnPaste: false,
      formatOnType: false,
    });

    // --- Step 2: Caret placement, now and on later open requests ---
    const reveal = (request: Pick<OpenRequest, 'line' | 'column'>): void => {
      if (request.line === undefined) return;
      const position = { lineNumber: request.line, column: request.column ?? 1 };
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
    };
    reveal(props.params);
    const unsubscribeOpen = workspace.onOpenFile((request) => {
      if (request.path === path) reveal(request);
    });

    // --- Step 3: Activity: the active tab's file is the one the canvas shows ---
    const activate = (): void => workspace.activeFile.set(path);
    if (props.api.isActive) activate();
    const activeListener = props.api.onDidActiveChange((event) => {
      if (event.isActive) activate();
    });
    const focusListener = editor.onDidFocusEditorText(activate);

    return () => {
      unsubscribeOpen();
      activeListener.dispose();
      focusListener.dispose();
      editor.dispose();
    };
    // The panel shows one path for its whole life; params never change it.
  }, [path]);

  return <div className="editor-host" ref={host} data-editor-path={path} />;
}
