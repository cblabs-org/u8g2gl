/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette.tsx
 * Purpose: The Palette view of the primary sidebar (ui_spec §6): the element
 *          tags a screen may use, grouped Framework / Project / Drawing, with a
 *          filter, each one dragged from here onto the canvas to insert it.
 * Description: The groups come from the latest pipeline run's manifest
 *              registry (`palette-entries.ts`). The component subscribes to the
 *              registry alone, not to the run: the registry is rebuilt only
 *              when a manifest's parse changes, so a keystroke or a drag
 *              re-renders nothing here. Each tag is an HTML drag source
 *              carrying its tag under `PALETTE_DRAG_TYPE`, which the canvas
 *              accepts.
 *
 * Exports:
 * - Palette:  The component
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useWorkspace } from '../ui/workspace-context';
import { countRender } from '../perf/render-count';
import { filterPalette, PALETTE_DRAG_TYPE, paletteGroups } from './palette-entries';

/** @brief The Palette sidebar view. */
export function Palette(): React.JSX.Element {
  countRender('Palette');
  const loop = useWorkspace().loop;
  // The registry, not the run: its identity changes only when a manifest does.
  const registry = useSyncExternalStore(
    (onChange) => loop.lastRun.subscribe(onChange),
    () => loop.lastRun.get()?.result.model.manifests,
  );
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => (registry === undefined ? [] : paletteGroups(registry)), [registry]);
  const shown = filterPalette(groups, filter);

  return (
    <aside className="sidebar palette" aria-label="Palette">
      <header className="sidebar-title">Palette</header>
      <input
        className="palette-filter"
        type="search"
        placeholder="Filter elements"
        aria-label="Filter elements"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {registry === undefined && <p className="palette-note">Loading the project's elements…</p>}
      {registry !== undefined && shown.length === 0 && <p className="palette-note">No element matches “{filter}”.</p>}
      {shown.map((group) => (
        <section key={group.title} className="file-group palette-group" data-group={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {group.tags.map((tag) => (
              <li key={tag}>
                <div
                  className="palette-tag"
                  draggable
                  data-tag={tag}
                  title={`Drag <${tag}> onto the canvas to insert it`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PALETTE_DRAG_TYPE, tag);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {tag}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
