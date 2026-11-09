/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/menu-item.ts
 * Purpose: The shape of a context menu's entries, apart from the component
 *          that draws them, so a module that only says what a menu holds
 *          (`explorer-menu.ts`) — and its unit test — need no JSX.
 * Description: One type.
 *
 * Exports:
 * - MenuItem:  One entry: an action, or a submenu
 */

/** One menu entry: chosen with `onSelect`, or opening the submenu `items`. */
export interface MenuItem {
  readonly label: string;
  /** What choosing the entry does; the menu closes first. */
  readonly onSelect?: () => void;
  /** A submenu, shown beside the entry. */
  readonly items?: readonly MenuItem[];
  /** A stable hook for tests and styles, as `data-item`. */
  readonly id?: string;
}
