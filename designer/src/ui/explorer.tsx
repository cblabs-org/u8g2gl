/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer.tsx
 * Purpose: The primary sidebar's project tree (ui_spec §6): every file the
 *          design server lists, grouped the way an author thinks of the
 *          project — screens, widgets, the project's own files, and assets —
 *          rather than as a raw directory listing.
 * Description: Rendered from `ProjectFileSystem.list()` (through
 *              `ProjectDocuments.files`). An XML document opens in an editor
 *              tab; any other file (a widget's C++, a font) is listed but not
 *              opened, because the designer does not edit C++ (ui_spec §14).
 *
 * Exports:
 * - Explorer:       The component
 * - groupFiles():   The listing, grouped
 */

import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** One explorer group: a heading and its files. */
interface FileGroup {
  readonly title: string;
  readonly files: readonly string[];
}

/**
 * @brief Groups a project listing for the explorer.
 *
 * @param files The listing, sorted.
 * @return Screens, widgets, project files and everything else, empty groups omitted.
 */
export function groupFiles(files: readonly string[]): FileGroup[] {
  const groups: { title: string; test: (path: string) => boolean }[] = [
    { title: 'Project', test: (p) => p === 'u8g2gl.xml' || p === 'globals.xml' },
    { title: 'Screens', test: (p) => p.startsWith('screens/') },
    { title: 'Widgets', test: (p) => p.startsWith('widgets/') },
  ];
  const placed = new Set<string>();
  const result: FileGroup[] = groups.map((group) => {
    const matching = files.filter((path) => group.test(path));
    for (const path of matching) placed.add(path);
    return { title: group.title, files: matching };
  });
  result.push({ title: 'Other files', files: files.filter((path) => !placed.has(path)) });
  return result.filter((group) => group.files.length > 0);
}

/** @brief The explorer sidebar. */
export function Explorer(): React.JSX.Element {
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
            {group.files.map((path) => {
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
                    {group.title === 'Project' ? path : path.slice(path.indexOf('/') + 1)}
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
