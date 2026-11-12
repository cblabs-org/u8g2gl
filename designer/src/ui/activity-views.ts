/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/activity-views.ts
 * Purpose: The list of views the activity bar offers (ui_spec §6), as data:
 *          each view's label, the Lucide icon that stands for it, and whether
 *          this release has it. Kept apart from the component so a unit test
 *          can check every icon name resolves without a bundler.
 * Description: A static, ordered list. Its order is the bar's, top to bottom.
 *
 * Exports:
 * - SidebarView:     The views the primary sidebar can show
 * - ActivityView:    One entry of the bar
 * - ACTIVITY_VIEWS:  Every entry, in the bar's order
 */

/** The views the primary sidebar can show in this release. */
export type SidebarView = 'explorer' | 'palette';

/** One entry of the activity bar. */
export interface ActivityView {
  readonly id: string;
  /** The tooltip and accessible name. */
  readonly label: string;
  /** A Lucide name, drawn by `<Icon>`. */
  readonly icon: string;
  /** False for a view this release shows but does not have yet. */
  readonly ready: boolean;
}

/** The views ui_spec §6 lists, with whether this release has them. */
export const ACTIVITY_VIEWS: readonly ActivityView[] = [
  { id: 'explorer', label: 'Explorer', icon: 'files', ready: true },
  { id: 'palette', label: 'Palette', icon: 'shapes', ready: true },
  { id: 'assets', label: 'Assets', icon: 'image', ready: false },
  { id: 'fonts', label: 'Fonts', icon: 'type', ready: false },
  { id: 'samples', label: 'Sample data', icon: 'database', ready: false },
  { id: 'flow', label: 'Flow', icon: 'workflow', ready: false },
  { id: 'search', label: 'Search', icon: 'search', ready: false },
];
