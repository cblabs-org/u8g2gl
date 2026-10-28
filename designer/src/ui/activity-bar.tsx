/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/activity-bar.tsx
 * Purpose: The activity bar of ui_spec §6: the column of views down the left
 *          edge. Only the Explorer exists in this release; the others are shown,
 *          disabled, so the layout is the one the specification draws and a
 *          person can see what is coming rather than finding it missing.
 * Description: A static list; the Explorer is always the active view.
 *
 * Exports:
 * - ActivityBar:  The component
 */

import { countRender } from '../perf/render-count';

/** The views ui_spec §6 lists, with whether this release has them. */
const VIEWS: readonly { readonly id: string; readonly label: string; readonly glyph: string; readonly ready: boolean }[] = [
  { id: 'explorer', label: 'Explorer', glyph: '▤', ready: true },
  { id: 'palette', label: 'Palette', glyph: '▦', ready: false },
  { id: 'assets', label: 'Assets', glyph: '▣', ready: false },
  { id: 'fonts', label: 'Fonts', glyph: 'A', ready: false },
  { id: 'samples', label: 'Sample data', glyph: '≡', ready: false },
  { id: 'flow', label: 'Flow', glyph: '⇄', ready: false },
  { id: 'search', label: 'Search', glyph: '⌕', ready: false },
];

/** @brief The activity bar. */
export function ActivityBar(): React.JSX.Element {
  countRender('ActivityBar');
  return (
    <nav className="activity-bar" aria-label="Views">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={view.ready ? 'activity active' : 'activity'}
          title={view.ready ? view.label : `${view.label}: not in this release`}
          aria-label={view.label}
          disabled={!view.ready}
        >
          {view.glyph}
        </button>
      ))}
    </nav>
  );
}
