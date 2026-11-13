/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/context-menu.tsx
 * Purpose: A context menu that behaves as a desktop one does, from the mouse
 *          and from the keyboard alike: the Explorer's right-click menu is
 *          the first user, and the keyboard path is not an afterthought,
 *          because a menu reachable only by right-click shuts out anyone who
 *          does not use a mouse. Generic over its items, so the Explorer says
 *          what its menu holds and nothing here knows about files.
 * Description: A fixed-position `role="menu"` of `role="menuitem"` buttons,
 *              nested one level per submenu. Focus moves into the menu when it
 *              opens. ↑/↓ move (wrapping), Home/End jump, → or Enter opens a
 *              submenu, ← or Escape closes one, Escape at the top closes the
 *              menu, and Enter or a click chooses. A pointer-down anywhere
 *              outside the menu, or focus leaving the window, closes it. The
 *              opener decides where focus returns, since only it knows what
 *              invoked the menu.
 *
 * Exports:
 * - ContextMenu:  The component (its items are `MenuItem`s, `menu-item.ts`)
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MenuItem } from './menu-item';

/** The {@link ContextMenu}'s properties. */
interface ContextMenuProps {
  /** The menu's accessible name. */
  readonly label: string;
  /** The entries, top to bottom; an entry with `items` opens a submenu. */
  readonly items: readonly MenuItem[];
  /** Where the menu's top-left corner goes, in viewport pixels. */
  readonly x: number;
  readonly y: number;
  /**
   * Called when the menu closes. `refocus` is true when it closed from the
   * menu itself (chosen, Escape, Tab), so focus should go back to what opened
   * it; false when dismissed by a pointer-down elsewhere or the window losing
   * focus, where the user has already put focus somewhere and taking it back
   * would undo their click.
   */
  readonly onClose: (refocus: boolean) => void;
}

/** @brief A context menu at (x, y). */
export function ContextMenu(props: ContextMenuProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const { onClose } = props;

  // Dismissal: a pointer-down outside, or the window losing focus. Capture
  // phase, so a click that lands on something that stops propagation still
  // closes the menu first.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) onClose(false);
    };
    const onBlur = (): void => onClose(false);
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  const close = (): void => onClose(true);
  return (
    <div ref={root} className="context-menu-layer">
      <MenuList label={props.label} items={props.items} x={props.x} y={props.y} autoFocus onClose={close} onBack={close} />
    </div>
  );
}

/** One level of the menu. */
interface MenuListProps {
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly x: number;
  readonly y: number;
  /**
   * Whether the level takes focus: always at the top; for a submenu only when
   * opened from the keyboard, so pointing at a parent item shows its submenu
   * without taking focus from the item under the mouse.
   */
  readonly autoFocus: boolean;
  /** Closes the whole menu. */
  readonly onClose: () => void;
  /** Leaves this level: closes a submenu, or at the top the whole menu. */
  readonly onBack: () => void;
}

// MenuList
// One level: its items, roving focus among them, and at most one open submenu.
function MenuList(props: MenuListProps): React.JSX.Element {
  const { items, onClose, onBack, autoFocus } = props;
  const list = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState<{ readonly index: number; readonly focus: boolean } | undefined>(undefined);
  const [position, setPosition] = useState({ x: props.x, y: props.y });

  // --- Step 1: Kept inside the viewport, then focused on its first item ---
  // Measured before paint, so a menu opened near an edge never flashes
  // half off screen before it moves.
  useLayoutEffect(() => {
    const box = list.current?.getBoundingClientRect();
    if (box !== undefined) {
      setPosition({
        x: Math.max(0, Math.min(props.x, window.innerWidth - box.width)),
        y: Math.max(0, Math.min(props.y, window.innerHeight - box.height)),
      });
    }
    if (autoFocus) buttons.current[0]?.focus();
  }, [props.x, props.y, autoFocus]);

  // focusAt
  // Moves focus to item `index`, wrapping at both ends.
  const focusAt = (index: number): void => {
    const count = items.length;
    buttons.current[((index % count) + count) % count]?.focus();
  };

  // choose
  // Opens an item's submenu, or closes the menu and runs its action.
  const choose = (index: number, fromKeyboard: boolean): void => {
    const item = items[index];
    if (item === undefined || item.disabled === true) return;
    if (item.items !== undefined) {
      setOpen({ index, focus: fromKeyboard });
      return;
    }
    onClose();
    item.onSelect?.();
  };

  // --- Step 2: The keyboard ---
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const current = buttons.current.findIndex((button) => button === document.activeElement);
    const handled = ((): boolean => {
      switch (event.key) {
        case 'ArrowDown':
          focusAt(current + 1);
          return true;
        case 'ArrowUp':
          focusAt(current < 0 ? -1 : current - 1);
          return true;
        case 'Home':
          focusAt(0);
          return true;
        case 'End':
          focusAt(items.length - 1);
          return true;
        case 'ArrowRight':
          if (current >= 0 && items[current]?.items !== undefined) choose(current, true);
          return true;
        case 'Enter':
        case ' ':
          if (current >= 0) choose(current, true);
          return true;
        case 'ArrowLeft':
        case 'Escape':
          onBack();
          return true;
        case 'Tab':
          // Tab leaves a menu, as it does a native one: the menu closes.
          onClose();
          return false;
        default:
          return false;
      }
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const sub = open === undefined ? undefined : items[open.index];
  const anchor = open === undefined ? undefined : buttons.current[open.index]?.getBoundingClientRect();
  return (
    <div
      ref={list}
      role="menu"
      aria-label={props.label}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <button
          key={item.id ?? item.label}
          ref={(button) => {
            buttons.current[index] = button;
          }}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="context-menu-item"
          data-item={item.id}
          aria-disabled={item.disabled === true ? true : undefined}
          aria-haspopup={item.items !== undefined ? 'menu' : undefined}
          aria-expanded={item.items !== undefined ? open?.index === index : undefined}
          onClick={() => choose(index, false)}
          onPointerEnter={() => {
            buttons.current[index]?.focus();
            if (item.items !== undefined) setOpen({ index, focus: false });
            else setOpen(undefined);
          }}
        >
          {item.label}
          {item.items !== undefined && <span className="context-menu-arrow">›</span>}
        </button>
      ))}
      {sub?.items !== undefined && anchor !== undefined && open !== undefined && (
        // The submenu sits inside this level's element, so its keys would
        // bubble here; it handles its own, and this wrapper stops the rest.
        <div className="context-submenu" onKeyDown={(event) => event.stopPropagation()}>
          <MenuList
            label={sub.label}
            items={sub.items}
            x={anchor.right}
            y={anchor.top}
            autoFocus={open.focus}
            onClose={onClose}
            onBack={() => {
              const index = open.index;
              setOpen(undefined);
              buttons.current[index]?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
