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
 * Description: Monaco is loaded after the shell (`monaco/monaco.ts`); a tab
 *              opened before it arrives says so and asks for it. Monaco is
 *              imperative, so the editor is created once per panel, once
 *              Monaco is there, in an effect that owns its lifecycle; React
 *              renders only the container and the conflict bar. "Compare"
 *              swaps the editor for a diff editor — the disk's text on the
 *              left, the buffer on the right, still editable — until the user
 *              chooses.
 *
 *              Selection, both ways (ui_spec §4.3, EDITOR-DESIGN §3.7). The
 *              caret's element becomes the selection, which the canvas outlines;
 *              typing inside an element does not change it, and a caret in text
 *              that does not parse keeps it. The selected elements are
 *              decorated here, and one selected on the canvas is revealed —
 *              scrolled into view only if it is outside it — **without taking
 *              focus**, so the next key still goes to the canvas. Neither
 *              direction edits the text.
 *
 * Exports:
 * - EditorPanelParams:  Which document the tab shows
 * - EditorPanel:        The component
 */

import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { elementAt } from '../documents/element-at';
import type * as monaco from 'monaco-editor/editor/editor.api';
import { loadMonaco, monacoReady, THEME, type Monaco } from '../monaco/monaco';
import type { OpenRequest } from '../workspace';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

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

/**
 * @brief How a selected element's text is decorated: a tint, and a mark in the
 *        overview ruler.
 *
 * @param api Monaco, loaded: the options name its enums.
 */
function selectedElement(api: Monaco): monaco.editor.IModelDecorationOptions {
  return {
    className: 'selected-element',
    stickiness: api.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    overviewRuler: { color: '#4f8cff', position: api.editor.OverviewRulerLane.Left },
  };
}

/** @brief An editor tab. */
export function EditorPanel(props: IDockviewPanelProps<EditorPanelParams>): React.JSX.Element {
  countRender('EditorPanel');
  const workspace = useWorkspace();
  const documents = workspace.documents;
  const host = useRef<HTMLDivElement>(null);
  const { path } = props.params;
  const conflicts = useObservable(documents.conflicts);
  const dirty = useObservable(documents.dirty).has(path);
  const theirs = conflicts.get(path);
  const [comparing, setComparing] = useState(false);
  // Monaco loads after the shell; a tab opened before it has asks for it here.
  const api = useObservable(monacoReady);
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
    if (api === undefined) {
      void loadMonaco();
      return undefined;
    }
    const element = host.current;
    const model = documents.open(path);
    if (element === null || model === undefined) {
      return undefined;
    }
    const selected = selectedElement(api);

    // --- Step 1: The editor (or, comparing, the diff editor) on the shared model ---
    let editor: monaco.editor.IStandaloneCodeEditor;
    let diff: monaco.editor.IStandaloneDiffEditor | undefined;
    let original: monaco.editor.ITextModel | undefined;
    const showing = comparing ? documents.conflicts.get().get(path) : undefined;
    if (showing !== undefined) {
      original = api.editor.createModel(showing.text, 'xml');
      diff = api.editor.createDiffEditor(element, { ...EDITOR_OPTIONS, theme: THEME, originalEditable: false });
      diff.setModel({ original, modified: model });
      // The standalone diff editor's halves are standalone editors at run time;
      // its typings only promise the narrower interface.
      editor = diff.getModifiedEditor() as monaco.editor.IStandaloneCodeEditor;
    } else {
      editor = api.editor.create(element, { ...EDITOR_OPTIONS, model, theme: THEME });
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

    // --- Step 3: The caret's element is the selection the canvas outlines ---
    const select = (explicit: boolean): void => {
      const position = editor.getPosition();
      if (position === null) return;
      const found = elementAt(model.getValue(), model.getOffsetAt(position));
      if (found === 'unparsed') return;
      workspace.selection.caretMoved(path, found?.name, explicit);
    };
    const caretListener = editor.onDidChangeCursorPosition((event) =>
      select(event.reason === api.editor.CursorChangeReason.Explicit),
    );

    // --- Step 4: The selection decorated, and revealed when the canvas chose it ---
    const decorations = editor.createDecorationsCollection();
    const showSelection = (): void => {
      const selection = workspace.selection.current.get();
      if (selection.file !== path) {
        decorations.clear();
        return;
      }
      const ranges = workspace.selection.spans().map((span) => {
        const start = model.getPositionAt(span.start);
        const end = model.getPositionAt(span.end);
        return new api.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      });
      decorations.set(ranges.map((range) => ({ range, options: selected })));
      const first = ranges[0];
      // Reveal only what the canvas selected: the caret's element is already
      // where the user is looking. Never focus — the canvas keeps the keyboard.
      // The element's lines from column 1, so a long line does not scroll the
      // view sideways to its end.
      if (selection.origin === 'canvas' && first !== undefined) {
        const lines = new api.Range(first.startLineNumber, 1, first.endLineNumber, 1);
        editor.revealRangeInCenterIfOutsideViewport(lines, api.editor.ScrollType.Smooth);
      }
    };
    showSelection();
    const unsubscribeSelection = workspace.selection.current.subscribe(showSelection);

    // --- Step 5: Activity: the active tab's file is the one the canvas shows ---
    // Activation selects the caret's element only when the selection is in
    // another file: a tab brought forward to show a canvas selection must not
    // replace it with wherever its caret happens to be.
    const activate = (): void => {
      workspace.activeFile.set(path);
      if (workspace.selection.current.get().file !== path) select(true);
    };
    if (props.api.isActive) activate();
    const activeListener = props.api.onDidActiveChange((event) => {
      if (event.isActive) activate();
    });
    const focusListener = editor.onDidFocusEditorText(activate);

    return () => {
      unsubscribeOpen();
      unsubscribeSelection();
      decorations.clear();
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
    // The panel shows one path for its whole life; comparing swaps the editor;
    // Monaco's arrival creates it.
  }, [path, comparing, api]);

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
      <div className="editor-host" ref={host} data-editor-path={path} data-dirty={dirty}>
        {api === undefined && <p className="editor-loading">Loading the editor…</p>}
      </div>
    </div>
  );
}
