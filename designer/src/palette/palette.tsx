/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/palette/palette.tsx
 * Purpose: The Palette view of the primary sidebar (ui_spec §6): the elements
 *          a screen may use, grouped Framework / Project / Drawing and filed by
 *          category within each, as a grid of icon tiles with a filter, each
 *          one dragged from here onto the canvas to insert it.
 * Description: The groups come from the latest pipeline run's manifest
 *              registry (`palette-entries.ts`). The component subscribes to the
 *              registry alone, not to the run: the registry is rebuilt only
 *              when a manifest's parse changes, so a keystroke or a drag
 *              re-renders nothing here. Each entry is a 56 px tile: its icon
 *              (`palette-icons.ts`) over its label, cut short with an ellipsis,
 *              or its tag when it has no label. A category heading is shown
 *              above its tiles, and the uncategorised come last with none.
 *              Each tile is an HTML drag source carrying its tag under
 *              `PALETTE_DRAG_TYPE`, which the canvas accepts.
 *
 *              A tooltip shows the label, the `<tag>` and the description on
 *              hover and on keyboard focus. Its state is the tile's own, so
 *              showing it re-renders that tile and not the Palette. Tiles are
 *              in the tab order, and the arrow keys move between them: ←/→
 *              to the neighbour in reading order, ↑/↓ to the nearest tile in
 *              the row above or below, Home/End to the first and last.
 *
 * Exports:
 * - Palette:  The component
 */

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icons/icon';
import { useWorkspace } from '../ui/workspace-context';
import { countRender } from '../perf/render-count';
import { filterPalette, PALETTE_DRAG_TYPE, paletteGroups, type PaletteEntry } from './palette-entries';
import { paletteIcon } from './palette-icons';

/** The icon's size in a 56 px tile, in CSS pixels: room for a label beneath. */
const TILE_ICON_SIZE = 22;
/** The gap between a tile and its tooltip, in CSS pixels. */
const TOOLTIP_GAP = 6;
/**
 * How far apart two tiles' top edges may be and still share a row, in CSS
 * pixels: layout positions are fractional, and 1 px absorbs the rounding.
 */
const ROW_TOLERANCE = 1;

/** Where a tooltip goes: beside its tile, in viewport pixels. */
interface TooltipAt {
  readonly x: number;
  readonly y: number;
}

// PaletteTile
// One element's tile, its drag, and its tooltip.
//   entry    — the element
//   category — its section's category, for the icon fallback
function PaletteTile({ entry, category }: { readonly entry: PaletteEntry; readonly category: string | undefined }): React.JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipAt | undefined>(undefined);
  const tooltipId = `palette-tooltip-${entry.tag}`;
  const show = (element: HTMLElement): void => {
    const box = element.getBoundingClientRect();
    setTooltip({ x: box.right + TOOLTIP_GAP, y: box.top });
  };
  const hide = (): void => setTooltip(undefined);
  return (
    <li>
      <div
        className="palette-tag"
        draggable
        tabIndex={0}
        role="button"
        aria-label={entry.label ?? entry.tag}
        aria-describedby={tooltip !== undefined ? tooltipId : undefined}
        data-tag={entry.tag}
        onPointerEnter={(event) => show(event.currentTarget)}
        onPointerLeave={hide}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onDragStart={(event) => {
          hide();
          event.dataTransfer.setData(PALETTE_DRAG_TYPE, entry.tag);
          event.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <Icon name={paletteIcon(entry.tag, category)} size={TILE_ICON_SIZE} />
        <span className={entry.label === undefined ? 'palette-label is-tag' : 'palette-label'}>{entry.label ?? entry.tag}</span>
      </div>
      {tooltip !== undefined && (
        <div id={tooltipId} role="tooltip" className="palette-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {entry.label !== undefined && <span className="palette-tooltip-label">{entry.label}</span>}
          <span className="palette-tooltip-tag">&lt;{entry.tag}&gt;</span>
          {entry.description !== undefined && <span className="palette-tooltip-description">{entry.description}</span>}
          <span className="palette-tooltip-hint">Drag onto the canvas to insert it.</span>
        </div>
      )}
    </li>
  );
}

// moveFocus
// The arrow keys between tiles, in the Palette's own element. Reading order is
// the document order of the tiles; a row is the tiles sharing a top edge.
//   root  — the Palette's element
//   event — the key
function moveFocus(root: HTMLElement | null, event: React.KeyboardEvent): void {
  // --- Step 1: The tiles, and which has focus ---
  const current = event.target as HTMLElement;
  if (root === null || !current.classList.contains('palette-tag')) return;
  const tiles = [...root.querySelectorAll<HTMLElement>('.palette-tag')];
  const index = tiles.indexOf(current);

  // --- Step 2: The tile the key moves to ---
  let next: HTMLElement | undefined;
  if (event.key === 'ArrowRight') next = tiles[index + 1];
  else if (event.key === 'ArrowLeft') next = tiles[index - 1];
  else if (event.key === 'Home') next = tiles[0];
  else if (event.key === 'End') next = tiles[tiles.length - 1];
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    // The nearest tile by column in the closest row above or below: rows are
    // not aligned across categories, so "same index in the next row" is not
    // a thing; the nearest centre is.
    const from = current.getBoundingClientRect();
    const down = event.key === 'ArrowDown';
    const candidates = tiles
      .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
      .filter(({ box }) => (down ? box.top > from.top + ROW_TOLERANCE : box.top < from.top - ROW_TOLERANCE));
    if (candidates.length > 0) {
      const rowTop = down ? Math.min(...candidates.map(({ box }) => box.top)) : Math.max(...candidates.map(({ box }) => box.top));
      const centre = from.left + from.width / 2;
      next = candidates
        .filter(({ box }) => Math.abs(box.top - rowTop) <= ROW_TOLERANCE)
        .reduce((best, each) =>
          Math.abs(each.box.left + each.box.width / 2 - centre) < Math.abs(best.box.left + best.box.width / 2 - centre) ? each : best,
        ).tile;
    }
  } else {
    return;
  }

  // --- Step 3: Move focus there, keeping it in view ---
  event.preventDefault();
  next?.focus();
  next?.scrollIntoView({ block: 'nearest' });
}

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
  const root = useRef<HTMLElement>(null);

  return (
    <aside ref={root} className="sidebar palette" aria-label="Palette" onKeyDown={(event) => moveFocus(root.current, event)}>
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
          {group.sections.map((section) => (
            // The uncategorised section is the only one without a category,
            // and a category is never empty, so '' cannot collide with one.
            <div key={section.category ?? ''} className="palette-category" data-category={section.category}>
              {section.category !== undefined && <h3>{section.category}</h3>}
              <ul className="palette-tiles">
                {section.entries.map((entry) => (
                  <PaletteTile key={entry.tag} entry={entry} category={section.category} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </aside>
  );
}
