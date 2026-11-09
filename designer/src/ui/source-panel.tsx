/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/source-panel.tsx
 * Purpose: A read-only tab on a file the designer does not edit — a widget's
 *          C++, chiefly — so an author can read the code behind a widget, and
 *          land on the line a build error names, without leaving the designer.
 *          The designer does not edit C++ (ui_spec §14): the tab says
 *          read-only in its title and refuses keystrokes, and "Open in editor"
 *          is where editing happens.
 * Description: The text is read through the project file system, which is the
 *              server's existing `GET /api/file`, and read again whenever the
 *              file changes on disk, so the tab never shows stale code. The
 *              model is the tab's own — not a project document, so nothing
 *              here can be saved — with C++ highlighting for C++ files. A later
 *              open request for the same path moves the caret to its line.
 *
 * Exports:
 * - SourcePanelParams:   Which file the tab shows, and where
 * - SourcePanel:         The component
 */

import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { loadMonaco, monacoReady, THEME } from '../monaco/monaco';
import { isCppSource, sourceTitle } from './file-actions';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** The panel's parameters. */
export interface SourcePanelParams {
  readonly path: string;
  /** Where to put the caret when the tab first opens. */
  readonly line?: number;
  readonly column?: number;
}

// languageOf
// Monaco's language for a path: C++ for C++ source, XML for XML, else plain.
function languageOf(path: string): string {
  if (isCppSource(path)) return 'cpp';
  return path.toLowerCase().endsWith('.xml') ? 'xml' : 'plaintext';
}

/** @brief A read-only source tab. */
export function SourcePanel(props: IDockviewPanelProps<SourcePanelParams>): React.JSX.Element {
  countRender('SourcePanel');
  const workspace = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const { path } = props.params;
  const api = useObservable(monacoReady);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  useEffect(() => {
    props.api.setTitle(sourceTitle(path));
  }, [path, props.api]);

  useEffect(() => {
    if (api === undefined) {
      void loadMonaco();
      return undefined;
    }
    const element = host.current;
    if (element === null) return undefined;
    const fs = workspace.documents.fileSystem;

    // --- Step 1: A model of the tab's own, and a read-only editor on it ---
    // A scheme of its own, so the model never collides with a project
    // document's (`u8g2gl:`) or receives that document's markers.
    const model = api.editor.createModel('', languageOf(path), api.Uri.from({ scheme: 'u8g2gl-source', path: `/${path}` }));
    const editor = api.editor.create(element, {
      model,
      theme: THEME,
      readOnly: true,
      readOnlyMessage: { value: 'The designer does not edit C++. Use Open in editor from the Explorer.' },
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
    });

    // --- Step 2: Caret placement, once the text is in, and on later requests ---
    let pending: Pick<SourcePanelParams, 'line' | 'column'> | undefined = props.params;
    const reveal = (request: Pick<SourcePanelParams, 'line' | 'column'>): void => {
      if (request.line === undefined) return;
      const position = { lineNumber: request.line, column: request.column ?? 1 };
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
    };
    const unsubscribeOpen = workspace.onOpenFile((request) => {
      if (request.path !== path) return;
      if (model.getValueLength() === 0) pending = request;
      else reveal(request);
    });

    // --- Step 3: The text, through GET /api/file, now and on every change on disk ---
    let disposed = false;
    const load = async (): Promise<void> => {
      const result = await fs.read(path);
      if (disposed) return;
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      setFailure(undefined);
      // Replaced only when the text differs: setValue resets the caret, and a
      // touch that changes nothing should not move it.
      if (result.text !== model.getValue()) model.setValue(result.text);
      if (pending !== undefined) {
        reveal(pending);
        pending = undefined;
      }
    };
    void load();
    const unwatch = fs.watch((event) => {
      if (event.path === path && event.kind !== 'removed') void load();
    });

    return () => {
      disposed = true;
      unwatch();
      unsubscribeOpen();
      editor.dispose();
      model.dispose();
    };
    // The tab shows one path for its whole life; Monaco's arrival creates it.
  }, [path, api]);

  return (
    <div className="editor-panel">
      {failure !== undefined && (
        <div className="conflict-bar" role="alert">
          <span className="text">{failure}</span>
        </div>
      )}
      <div className="editor-host" ref={host} data-source-path={path}>
        {api === undefined && <p className="editor-loading">Loading the editor…</p>}
      </div>
    </div>
  );
}
