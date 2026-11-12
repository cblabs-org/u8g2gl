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
 * Description: Draws `ACTIVITY_VIEWS` as icon buttons. The shell owns which
 *              view is active and passes it in; a click on a ready view asks
 *              the shell to show it. Each icon is a Lucide `<Icon>`, which takes
 *              the button's text colour, so the active and disabled states read
 *              through the same colour and opacity rules as the text did.
 *
 * Exports:
 * - SidebarView:  The views the primary sidebar can show (from activity-views)
 * - ActivityBar:  The component
 */

import { Icon } from '../icons/icon';
import { countRender } from '../perf/render-count';
import { ACTIVITY_VIEWS, type SidebarView } from './activity-views';

export type { SidebarView } from './activity-views';

/** The icon's size in CSS pixels: Lucide's own 24-pixel grid, centred in the 44-pixel bar. */
const ICON_SIZE = 24;

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
      {ACTIVITY_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={view.id === active ? 'activity active' : 'activity'}
          title={view.ready ? view.label : `${view.label}: not in this release`}
          aria-label={view.label}
          aria-pressed={view.id === active}
          disabled={!view.ready}
          data-view={view.id}
          onClick={() => {
            if (view.id === 'explorer' || view.id === 'palette') onSelect(view.id);
          }}
        >
          <Icon name={view.icon} size={ICON_SIZE} />
        </button>
      ))}
    </nav>
  );
}
