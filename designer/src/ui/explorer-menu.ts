/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer-menu.ts
 * Purpose: What the Explorer's context menu holds for an entry (ui_spec §6):
 *          "View source…" for a widget's files, then "Open in editor", the
 *          platform's reveal, and "Copy path". A pure description, apart from
 *          the component, so which items an entry gets is unit-tested
 *          without a browser.
 * Description: Items are `MenuItem`s whose actions are the caller's
 *              `EntryCommands`, so nothing here talks to the server.
 *
 * Exports:
 * - EntryCommands:  What the menu's items do
 * - entryMenu():    The menu items for an entry
 */

import type { MenuItem } from './menu-item';
import type { ExplorerEntry, ExplorerGroup } from './explorer-groups';
import { isCppSource, revealLabel } from './file-actions';

/** What a menu item does, so `entryMenu()` stays a pure description. */
export interface EntryCommands {
  /** Shows a file: an editor tab for a document, a read-only tab otherwise. */
  readonly view: (path: string) => void;
  readonly openInEditor: (path: string) => void;
  readonly reveal: (path: string) => void;
  readonly copyPath: (path: string) => void;
}

/**
 * @brief The context menu for one Explorer entry.
 *
 * "View source…" lists a widget's files — its manifest and its C++ — and,
 * outside Widgets, a C++ file on its own; an entry with nothing to view has
 * no such item. Viewing goes through `commands.view`, which shows the
 * manifest in its ordinary editor tab — a read-only copy of a document the
 * designer edits could only fall out of step with it — and C++ in a read-only
 * one. The other three act on the file the entry opens.
 *
 * @param entry    The entry.
 * @param group    Its group's title.
 * @param platform The browser's platform, for the reveal label.
 * @param commands What each item does.
 */
export function entryMenu(entry: ExplorerEntry, group: ExplorerGroup['title'], platform: string, commands: EntryCommands): MenuItem[] {
  const viewable = group === 'Widgets' ? entry.files : entry.files.filter(isCppSource);
  const items: MenuItem[] = [];
  if (viewable.length > 0) {
    items.push({
      id: 'view-source',
      label: 'View source…',
      items: viewable.map((path) => ({ id: path, label: path.slice(path.lastIndexOf('/') + 1), onSelect: () => commands.view(path) })),
    });
  }
  items.push(
    { id: 'open-in-editor', label: 'Open in editor', onSelect: () => commands.openInEditor(entry.path) },
    { id: 'reveal', label: revealLabel(platform), onSelect: () => commands.reveal(entry.path) },
    { id: 'copy-path', label: 'Copy path', onSelect: () => commands.copyPath(entry.path) },
  );
  return items;
}
