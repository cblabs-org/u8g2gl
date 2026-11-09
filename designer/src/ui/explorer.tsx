/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer.tsx
 * Purpose: The primary sidebar's project tree (ui_spec §6): the files the
 *          design server lists, grouped by what an author edits — the
 *          project's own files, its screens, its widgets by name, its assets —
 *          rather than as a raw directory listing.
 * Description: Rendered from `ProjectFileSystem.list()` (through
 *              `ProjectDocuments.files`), grouped by `groupFiles()`. An XML
 *              document opens in an editor tab; a widget's row opens its
 *              manifest; any other file (a font, a stray file) is listed but
 *              not opened, because the designer does not edit it (ui_spec §14).
 *
 * Exports:
 * - Explorer:       The component
 */

import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { groupFiles } from './explorer-groups';
import { countRender } from '../perf/render-count';

/** @brief The explorer sidebar. */
export function Explorer(): React.JSX.Element {
  countRender('Explorer');
  const workspace = useWorkspace();
  const files = useObservable(workspace.documents.files);
  const active = useObservable(workspace.activeFile);
  const name = useObservable(workspace.projectName);
  const dirty = useObservable(workspace.documents.dirty);
  return (
    <aside className="sidebar" aria-label="Explorer">
      <header className="sidebar-title">Explorer{name !== '' ? ` · ${name}` : ''}</header>
      {groupFiles(files).map((group) => (
        <section key={group.title} className="file-group">
          <h2>{group.title}</h2>
          <ul>
            {group.entries.map(({ label, path }) => {
              const openable = workspace.documents.isDocument(path);
              return (
                <li key={path}>
                  <button
                    type="button"
                    className={`file${path === active ? ' active' : ''}${openable ? '' : ' inert'}${dirty.has(path) ? ' dirty' : ''}`}
                    title={openable ? path : `${path} (not edited in the designer)`}
                    data-path={path}
                    disabled={!openable}
                    onClick={() => workspace.openFile({ path })}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}
