/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/tooltip.tsx
 * Purpose: The designer's one tooltip, so the Palette's tiles and the
 *          property panel's fields explain themselves the same way: the same
 *          look, the same timing, and the same accessibility. Before this
 *          module the tooltip was the Palette's own; a second copy in the
 *          panel would have drifted from it.
 * Description: `useTooltip()` holds whether a tooltip is open and where, as
 *              the anchor's own state, so opening it re-renders the anchor's
 *              component and nothing else. It opens on pointer-enter and
 *              focus and closes on pointer-leave and blur (`tooltipTriggers()`),
 *              and on Escape: while open it listens on the window in the
 *              capture phase, so Escape closes the tooltip and reaches no
 *              other handler — the canvas would clear the selection on it.
 *              `<Tooltip>` is the bubble: `role="tooltip"`, placed fixed in
 *              the viewport, so a scrolling sidebar does not clip it, and
 *              never taking the pointer. Its anchor names it with
 *              `aria-describedby` while it is open.
 *
 * Exports:
 * - TOOLTIP_GAP:         The gap between an anchor and its tooltip
 * - TooltipAt:           Where a tooltip goes, in viewport pixels
 * - rightOf():           The place beside a box, to its right
 * - leftOf():            The place beside a box, to its left
 * - TooltipHandle:       An open-or-closed tooltip, and how to open and close it
 * - useTooltip():        A tooltip's state, owned by its anchor
 * - TooltipTriggers:     The anchor's pointer and focus handlers
 * - tooltipTriggers():   Those handlers for a tooltip
 * - Tooltip:             The bubble
 */

import { useEffect, useState, type ReactNode } from 'react';

/** The gap between an anchor and its tooltip, in CSS pixels. */
export const TOOLTIP_GAP = 6;

/**
 * Where a tooltip goes, in viewport pixels: its top, and either its left edge
 * or, for one placed to the left of its anchor, its right edge's distance from
 * the viewport's right, so its own width never has to be measured.
 */
export interface TooltipAt {
  readonly top: number;
  readonly left?: number;
  readonly right?: number;
}

/** The parts of a box a placement reads. */
interface Edges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/** @brief The place beside `box`, to its right, level with its top. */
export function rightOf(box: Edges): TooltipAt {
  return { left: box.right + TOOLTIP_GAP, top: box.top };
}

/**
 * @brief The place beside `box`, to its left, level with its top: for an
 *        anchor at the viewport's right, where a tooltip to its right would
 *        fall off the page.
 */
export function leftOf(box: Edges): TooltipAt {
  return { right: document.documentElement.clientWidth - box.left + TOOLTIP_GAP, top: box.top };
}

/** An open-or-closed tooltip, and how to open and close it. */
export interface TooltipHandle {
  /** Where it is shown; undefined while it is closed. */
  readonly at: TooltipAt | undefined;
  /** Opens it, placed against `anchor`. */
  readonly show: (anchor: HTMLElement) => void;
  readonly hide: () => void;
}

/**
 * @brief A tooltip's state, owned by the component that renders its anchor,
 *        so showing it re-renders that component alone.
 *
 * @param place Where the tooltip goes for an anchor; beside it, to its right,
 *              unless given.
 * @return The handle. While it is open, Escape closes it and is consumed.
 */
export function useTooltip(place: (anchor: HTMLElement) => TooltipAt = (anchor) => rightOf(anchor.getBoundingClientRect())): TooltipHandle {
  const [at, setAt] = useState<TooltipAt | undefined>(undefined);
  const open = at !== undefined;
  useEffect(() => {
    if (!open) return undefined;
    // The window, in the capture phase, runs before any element's handler,
    // so the Escape that closes a tooltip never also clears the selection.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setAt(undefined);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open]);
  return { at, show: (anchor) => setAt(place(anchor)), hide: () => setAt(undefined) };
}

/** The handlers that open and close a tooltip from its anchor. */
export interface TooltipTriggers {
  readonly onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onFocus: (event: React.FocusEvent<HTMLElement>) => void;
  readonly onBlur: () => void;
}

/**
 * @brief An anchor's handlers: open on pointer-enter and focus, close on
 *        pointer-leave and blur. An anchor that only takes focus, inside one
 *        already hovered for the same tooltip, spreads `onFocus` and `onBlur`.
 *
 * @param tooltip The handle from `useTooltip()`.
 */
export function tooltipTriggers(tooltip: TooltipHandle): TooltipTriggers {
  return {
    onPointerEnter: (event) => tooltip.show(event.currentTarget),
    onPointerLeave: tooltip.hide,
    onFocus: (event) => tooltip.show(event.currentTarget),
    onBlur: tooltip.hide,
  };
}

/**
 * @brief The bubble, shown at `at`.
 *
 * @param id        Its element id, which the anchor's `aria-describedby` names.
 * @param at        Where it goes (`TooltipHandle.at` while open).
 * @param className A class for its content's own styles, beside `tooltip`.
 * @param children  What it says.
 */
export function Tooltip({
  id,
  at,
  className,
  children,
}: {
  readonly id: string;
  readonly at: TooltipAt;
  readonly className?: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div id={id} role="tooltip" className={className === undefined ? 'tooltip' : `tooltip ${className}`} style={{ left: at.left, right: at.right, top: at.top }}>
      {children}
    </div>
  );
}
