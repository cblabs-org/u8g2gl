/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/explorer-menu.ts
 * Purpose: What the Explorer's context menu holds for an entry (ui_spec §6):
 *          "View source…" for a widget's files, then "Open in editor" (for
 *          source and asset types only), the platform's reveal, and "Copy
 *          path"; and, on a screen, "Show all elements", which shows every
 *          element hidden in the designer. A pure description, apart from the component, so which
 *          items an entry gets is unit-tested without a browser.
 * Description: Items are `MenuItem`s whose actions are the caller's
 *              `EntryCommands`, so nothing here talks to the server.
 *
 * Exports:
 * - EntryCommands:  What the menu's items do
 * - entryMenu():    The menu items for an entry
 */

import { isOpenablePath } from '@u8g2gl/core/project-fs/openable-files.js';
import type { MenuItem } from './menu-item';
import type { ExplorerEntry, ExplorerGroup } from './explorer-groups';
import { isCppSource, revealLabel } from './file-actions';

/** What a menu item does, so `entryMenu()` stays a pure description. */
export interface EntryCommands {
  /** Shows a file: an editor tab for a document, a read-only tab otherwise. */
  readonly view: (path: string) => void;
  /** Hands the entry's own file (its `path`) to the author's editor. */
  readonly openInEditor: (path: string) => void;
  /** Shows the entry's own file in the file manager. */
  readonly reveal: (path: string) => void;
  /** Copies the entry's own file's project-relative path. */
  readonly copyPath: (path: string) => void;
  /** Shows every element of a screen hidden in the designer. */
  readonly showAllElements: (path: string) => void;
  /** Whether a screen has any element hidden in the designer. */
  readonly anyHidden: (path: string) => boolean;
}

/**
 * @brief The context menu for one Explorer entry.
 *
 * "View source…" lists a widget's files — its manifest and its C++ — and,
 * outside Widgets, a C++ file on its own; an entry with nothing to view has
 * no such item. Viewing goes through `commands.view`, which shows the
 * manifest in its ordinary editor tab — a read-only copy of a document the
 * designer edits could only fall out of step with it — and C++ in a read-only
 * one. The other three act on the file the entry opens. A screen also gets
 * "Show all elements", disabled while none of its elements is hidden. "Open in editor" is
 * offered only for a file type the server will open (`isOpenablePath`): an
 * executable type is refused there, so offering it here would be a dead item.
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
  if (isOpenablePath(entry.path)) {
    items.push({ id: 'open-in-editor', label: 'Open in editor', onSelect: () => commands.openInEditor(entry.path) });
  }
  items.push(
    { id: 'reveal', label: revealLabel(platform), onSelect: () => commands.reveal(entry.path) },
    { id: 'copy-path', label: 'Copy path', onSelect: () => commands.copyPath(entry.path) },
  );
  if (group === 'Screens') {
    items.push({
      id: 'show-all-elements',
      label: 'Show all elements',
      disabled: !commands.anyHidden(entry.path),
      onSelect: () => commands.showAllElements(entry.path),
    });
  }
  return items;
}
