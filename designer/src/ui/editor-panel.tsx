/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/editor-panel.tsx
 * Purpose: One editor tab: a Monaco editor on one project document's model.
 *          The model, not the editor, holds the text and its undo stack
 *          ([UD-3]), so closing and reopening a tab never forks the document.
 *          The tab is also where the save rules meet the user: the dirty
 *          marker and the three-way choice when the file changed on disk
 *          under unsaved edits.
 * Description: Monaco is imperative, so the editor is created once per panel
 *              in an effect that owns its lifecycle; React renders only the
 *              container and the conflict bar. "Compare" swaps the editor for a
 *              diff editor — the disk's text on the left, the buffer on the
 *              right, still editable — until the user chooses. The caret's
 *              element becomes the workspace selection, which the canvas
 *              highlights (XML to canvas, ui_spec §4.3); a caret in text that does not
 *              parse keeps the previous selection.
 *
 * Exports:
 * - EditorPanelParams:  Which document the tab shows
 * - EditorPanel:        The component
 */

import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { elementAt } from '../documents/element-at';
import { monaco, THEME } from '../monaco/monaco';
import type { OpenRequest } from '../workspace';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** The panel's parameters: the document it shows. */
export interface EditorPanelParams {
  readonly path: string;
  /** Where to put the caret when the panel first opens. */
  readonly line?: number;
  readonly column?: number;
}

/** Options every editor in the designer shares. */
const EDITOR_OPTIONS: monaco.editor.IEditorOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  // Format on demand only, never by itself (ui_spec §10, principle 5).
  formatOnPaste: false,
  formatOnType: false,
};

/** @brief An editor tab. */
export function EditorPanel(props: IDockviewPanelProps<EditorPanelParams>): React.JSX.Element {
  const workspace = useWorkspace();
  const documents = workspace.documents;
  const host = useRef<HTMLDivElement>(null);
  const { path } = props.params;
  const conflicts = useObservable(documents.conflicts);
  const dirty = useObservable(documents.dirty).has(path);
  const theirs = conflicts.get(path);
  const [comparing, setComparing] = useState(false);
  const title = path.slice(path.lastIndexOf('/') + 1);

  // --- The tab's title carries the dirty marker ---
  useEffect(() => {
    props.api.setTitle(dirty ? `● ${title}` : title);
  }, [dirty, title, props.api]);

  // --- A resolved conflict ends the comparison ---
  useEffect(() => {
    if (theirs === undefined) setComparing(false);
  }, [theirs]);

  useEffect(() => {
    const element = host.current;
    const model = documents.open(path);
    if (element === null || model === undefined) {
      return undefined;
    }

    // --- Step 1: The editor (or, comparing, the diff editor) on the shared model ---
    let editor: monaco.editor.IStandaloneCodeEditor;
    let diff: monaco.editor.IStandaloneDiffEditor | undefined;
    let original: monaco.editor.ITextModel | undefined;
    const showing = comparing ? documents.conflicts.get().get(path) : undefined;
    if (showing !== undefined) {
      original = monaco.editor.createModel(showing.text, 'xml');
      diff = monaco.editor.createDiffEditor(element, { ...EDITOR_OPTIONS, theme: THEME, originalEditable: false });
      diff.setModel({ original, modified: model });
      // The standalone diff editor's halves are standalone editors at run time;
      // its typings only promise the narrower interface.
      editor = diff.getModifiedEditor() as monaco.editor.IStandaloneCodeEditor;
    } else {
      editor = monaco.editor.create(element, { ...EDITOR_OPTIONS, model, theme: THEME });
    }

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

    // --- Step 3: The caret's element is the selection the canvas highlights ---
    const select = (): void => {
      const position = editor.getPosition();
      if (position === null) return;
      const found = elementAt(model.getValue(), model.getOffsetAt(position));
      if (found === 'unparsed') return;
      workspace.selection.set(found === undefined ? undefined : { file: path, name: found.name });
    };
    const caretListener = editor.onDidChangeCursorPosition(select);

    // --- Step 4: Activity: the active tab's file is the one the canvas shows ---
    const activate = (): void => {
      workspace.activeFile.set(path);
      select();
    };
    if (props.api.isActive) activate();
    const activeListener = props.api.onDidActiveChange((event) => {
      if (event.isActive) activate();
    });
    const focusListener = editor.onDidFocusEditorText(activate);

    return () => {
      unsubscribeOpen();
      caretListener.dispose();
      activeListener.dispose();
      focusListener.dispose();
      if (diff !== undefined) {
        diff.dispose();
        original?.dispose();
      } else {
        editor.dispose();
      }
    };
    // The panel shows one path for its whole life; comparing swaps the editor.
  }, [path, comparing]);

  return (
    <div className="editor-panel">
      {theirs !== undefined && (
        <div className="conflict-bar" role="alert">
          <span className="text">This file changed on disk while you were editing it. Nothing has been overwritten.</span>
          <button type="button" onClick={() => documents.keepMine(path)}>
            Keep mine
          </button>
          <button type="button" onClick={() => documents.takeTheirs(path)}>
            Take theirs
          </button>
          <button type="button" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
            {comparing ? 'Stop comparing' : 'Compare'}
          </button>
        </div>
      )}
      <div className="editor-host" ref={host} data-editor-path={path} data-dirty={dirty} />
    </div>
  );
}
