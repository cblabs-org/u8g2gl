/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer.tsx
 * Purpose: The primary sidebar's project tree (ui_spec §6): the files the
 *          design server lists, grouped by what an author edits — the
 *          project's own files, its screens, its widgets by name, its assets —
 *          rather than as a raw directory listing; and, on any entry, a context
 *          menu for what the designer itself does not do with a file: read a
 *          widget's C++, hand a file to the author's editor or file manager,
 *          copy its path.
 * Description: Rendered from `ProjectFileSystem.list()` (through
 *              `ProjectDocuments.files`), grouped by `groupFiles()`. An XML
 *              document opens in an editor tab; a widget's row opens its
 *              manifest; any other file (a font, a stray file) is listed but
 *              not opened, because the designer does not edit it (ui_spec §14).
 *              Such a row is `aria-disabled` rather than `disabled`, so it can
 *              still take focus and open its menu.
 *              A file with unsaved changes shows a ● after its name.
 *
 *              The menu opens on right-click, Shift+F10 or the context-menu
 *              key; from the keyboard it is placed at the row, not the
 *              pointer. Closing it from the menu (a choice, Escape) returns
 *              focus to the row it was opened on; a click elsewhere keeps the
 *              focus it gave.
 *              What it holds is `entryMenu()`'s.
 *
 *              Each screen has a disclosure ▸ that shows its element rows
 *              nested under it (`element-tree-view.tsx`), built from the
 *              screen's current buffer (`Workspace.elementTrees`). The label
 *              still opens the screen; only the disclosure expands. Which
 *              screens are expanded is remembered per browser
 *              (`explorer-expansion.ts`), and the screen the canvas shows
 *              expands when first shown. A row selects its element through
 *              the `SelectionModel`, opening its screen on the canvas when
 *              another is drawn; the file rows' menu and keys are unchanged,
 *              except that a screen's menu also offers "Show all elements",
 *              for the elements hidden in the designer.
 *
 * Exports:
 * - Explorer:       The component
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { paletteIcon } from '../palette/palette-icons';
import { ContextMenu } from './context-menu';
import { ElementTreeView } from './element-tree-view';
import { ExplorerExpansion } from './explorer-expansion';
import { groupFiles, type ExplorerEntry, type ExplorerGroup } from './explorer-groups';
import { entryMenu, type EntryCommands } from './explorer-menu';
import { FileActions, hostPlatform } from './file-actions';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** An open menu: the entry it is for, and where. */
interface OpenMenu {
  readonly entry: ExplorerEntry;
  readonly group: ExplorerGroup['title'];
  readonly x: number;
  readonly y: number;
  /** The row that opened it, which takes focus back when it closes. */
  readonly row: HTMLElement;
}

/** @brief The explorer sidebar. */
export function Explorer(): React.JSX.Element {
  countRender('Explorer');
  const workspace = useWorkspace();
  const files = useObservable(workspace.documents.files);
  const active = useObservable(workspace.activeFile);
  const name = useObservable(workspace.projectName);
  const dirty = useObservable(workspace.documents.dirty);
  const trees = useObservable(workspace.elementTrees);
  const expansion = useMemo(() => new ExplorerExpansion(name), [name]);
  const expanded = useObservable(expansion.expanded);
  // The registry, not the run, as the Palette reads it: its identity changes
  // only when a manifest does, so a keystroke re-renders nothing here.
  const loop = workspace.loop;
  const registry = useSyncExternalStore(
    (onChange) => loop.lastRun.subscribe(onChange),
    () => loop.lastRun.get()?.result.model.manifests,
  );
  const iconOf = useCallback(
    (tag: string): string => {
      const api = registry?.get(tag)?.declared.api;
      return paletteIcon(api?.icon, api?.category);
    },
    [registry],
  );
  // The screen the canvas shows expands when first shown.
  useEffect(() => {
    const show = (): void => {
      const file = workspace.canvasFile.get();
      if (file !== undefined) expansion.shown(file);
    };
    show();
    return workspace.canvasFile.subscribe(show);
  }, [workspace, expansion]);
  // selectElement
  // A row's click or Enter: select through the SelectionModel, never an edit.
  // A toggle adds or removes the row within its screen, as on the canvas; in
  // another file it starts a new selection, since a selection is one file's.
  const selectElement = useCallback(
    (file: string, element: string, toggle: boolean): void => {
      const current = workspace.selection.current.get();
      const names =
        toggle && current.file === file
          ? current.names.includes(element)
            ? current.names.filter((n) => n !== element)
            : [...current.names, element]
          : [element];
      if (names.length === 0) workspace.selection.clear();
      else workspace.selection.select(file, names, 'tree');
    },
    [workspace],
  );
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const actions = useMemo(() => new FileActions(workspace.session, (line) => workspace.log(line)), [workspace]);
  const commands = useMemo<EntryCommands>(
    () => ({
      view: (path) => workspace.openFile({ path }),
      openInEditor: (path) => void actions.openInEditor(path),
      reveal: (path) => void actions.reveal(path),
      copyPath: (path) => void actions.copyPath(path),
      showAllElements: (path) => workspace.designHidden.showAll(path),
      anyHidden: (path) => workspace.designHidden.namesIn(path).size > 0,
    }),
    [workspace, actions],
  );
  // Stable, so the menu's dismissal listeners are installed once per opening.
  const closeMenu = useCallback((refocus: boolean) => {
    const row = menuRef.current?.row;
    setMenu(undefined);
    if (refocus) row?.focus();
  }, []);

  // openMenu
  // Opens the menu for an entry, at the pointer, or for the keyboard at the
  // row's lower left, as a native tree places it.
  const openMenu = (event: React.MouseEvent | React.KeyboardEvent, entry: ExplorerEntry, group: ExplorerGroup['title']): void => {
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    const box = row.getBoundingClientRect();
    // A context-menu event the keyboard raised has no pointer position.
    const atPointer = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0);
    setMenu({
      entry,
      group,
      row,
      x: atPointer ? event.clientX : box.left + 12,
      y: atPointer ? event.clientY : box.bottom,
    });
  };

  return (
    <aside className="sidebar" aria-label="Explorer">
      <header className="sidebar-title">Explorer{name !== '' ? ` · ${name}` : ''}</header>
      {groupFiles(files).map((group) => (
        <section key={group.title} className="file-group">
          <h2>{group.title}</h2>
          <ul>
            {group.entries.map((entry) => {
              const { label, path } = entry;
              const openable = workspace.documents.isDocument(path);
              const unsaved = dirty.has(path);
              const isScreen = group.title === 'Screens';
              const open = isScreen && expanded.has(path);
              return (
                <li key={path} className={isScreen ? 'screen-entry' : undefined}>
                  {isScreen && (
                    <button
                      type="button"
                      className="disclosure"
                      aria-expanded={open}
                      aria-label={`${open ? 'Hide' : 'Show'} the elements of ${label}`}
                      title={`${open ? 'Hide' : 'Show'} the elements of ${label}`}
                      onClick={() => expansion.setExpanded(path, !open)}
                    >
                      {open ? '▾' : '▸'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`file${path === active ? ' active' : ''}${openable ? '' : ' inert'}${unsaved ? ' dirty' : ''}`}
                    title={openable ? `${path}${unsaved ? ' (unsaved)' : ''}` : `${path} (not edited in the designer)`}
                    data-path={path}
                    aria-disabled={openable ? undefined : true}
                    onClick={() => {
                      if (openable) workspace.openFile({ path });
                    }}
                    onContextMenu={(event) => openMenu(event, entry, group.title)}
                    onKeyDown={(event) => {
                      if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') openMenu(event, entry, group.title);
                    }}
                  >
                    <span className="file-label">{label}</span>
                    {/* The mark is outside the label's ellipsis, so a long name never hides it. */}
                    {unsaved && (
                      <span className="dirty-mark" aria-hidden="true">
                        ●
                      </span>
                    )}
                  </button>
                  {open && (
                    <ElementTreeView
                      file={path}
                      label={label}
                      nodes={trees.get(path) ?? []}
                      selection={workspace.selection.current}
                      designHidden={workspace.designHidden}
                      runtimeHidden={workspace.loop.runtimeHidden}
                      module={workspace.wasm.module}
                      iconOf={iconOf}
                      onSelect={(element, toggle) => selectElement(path, element, toggle)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {menu !== undefined && (
        <ContextMenu
          label={`${menu.entry.label} actions`}
          items={entryMenu(menu.entry, menu.group, hostPlatform(), commands)}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        />
      )}
    </aside>
  );
}
