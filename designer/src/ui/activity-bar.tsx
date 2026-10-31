/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/activity-bar.tsx
 * Purpose: The activity bar of ui_spec §6: the column of views down the left
 *          edge, which chooses what the primary sidebar shows. The Explorer and
 *          the Palette exist in this release; the others are shown, disabled,
 *          so the layout is the one the specification draws and a person can
 *          see what is coming rather than finding it missing.
 * Description: A static list. The shell owns which view is active and passes
 *              it in; a click on a ready view asks the shell to show it.
 *
 * Exports:
 * - SidebarView:  The views the primary sidebar can show
 * - ActivityBar:  The component
 */

import { countRender } from '../perf/render-count';

/** The views the primary sidebar can show in this release. */
export type SidebarView = 'explorer' | 'palette';

/** The views ui_spec §6 lists, with whether this release has them. */
const VIEWS: readonly { readonly id: string; readonly label: string; readonly glyph: string; readonly ready: boolean }[] = [
  { id: 'explorer', label: 'Explorer', glyph: '▤', ready: true },
  { id: 'palette', label: 'Palette', glyph: '▦', ready: true },
  { id: 'assets', label: 'Assets', glyph: '▣', ready: false },
  { id: 'fonts', label: 'Fonts', glyph: 'A', ready: false },
  { id: 'samples', label: 'Sample data', glyph: '≡', ready: false },
  { id: 'flow', label: 'Flow', glyph: '⇄', ready: false },
  { id: 'search', label: 'Search', glyph: '⌕', ready: false },
];

/**
 * @brief The activity bar.
 *
 * @param active   The view the sidebar shows.
 * @param onSelect Called with a ready view the user chose.
 */
export function ActivityBar({ active, onSelect }: { readonly active: SidebarView; readonly onSelect: (view: SidebarView) => void }): React.JSX.Element {
  countRender('ActivityBar');
  return (
    <nav className="activity-bar" aria-label="Views">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={view.id === active ? 'activity active' : 'activity'}
          title={view.ready ? view.label : `${view.label}: not in this release`}
          aria-label={view.label}
          aria-pressed={view.id === active}
          disabled={!view.ready}
          onClick={() => {
            if (view.id === 'explorer' || view.id === 'palette') onSelect(view.id);
          }}
        >
          {view.glyph}
        </button>
      ))}
    </nav>
  );
}
