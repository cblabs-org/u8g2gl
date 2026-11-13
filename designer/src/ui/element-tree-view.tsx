/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/element-tree-view.tsx
 * Purpose: One screen's element rows in the Explorer (ui_spec §6), so every
 *          element is visible and clickable even where elements are layered
 *          on top of each other on the canvas. A row selects its element,
 *          exactly as a click on the canvas does, and a selection made on the
 *          canvas or in the XML lights its rows. Selecting is never an edit.
 * Description: A WAI-ARIA tree: `role="tree"` per screen, a `treeitem` per
 *              element with `aria-level`, `aria-selected` and, on a row with
 *              children, `aria-expanded`. Rows are in document order, which is
 *              draw order: a later row draws over an earlier one. A row shows
 *              the tag's Palette icon, the element's name and the tag.
 *
 *              One row at a time is in the tab order (a roving tabindex): the
 *              first selected row, else the row last focused, else the first.
 *              Up and Down move between visible rows, Home and End to the ends,
 *              Right expands a row or enters it, Left collapses it or goes to
 *              its parent, and Enter selects. A click selects; Shift-, Cmd- or
 *              Ctrl-click adds or removes the row within this screen, as on the
 *              canvas. Which element rows are collapsed is this view's own
 *              state: it is not remembered, and every row starts expanded.
 *
 *              The view subscribes to the selection itself, and only to this
 *              screen's part of it, so a selection change re-renders the tree
 *              that shows it and not the Explorer around it; nothing here
 *              changes per frame. A selection the tree did not make scrolls its
 *              first row into view, without taking focus.
 *
 * Exports:
 * - ElementTreeView:  The component
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { findNode, type ElementNode } from '../documents/element-tree';
import { Icon } from '../icons/icon';
import { countRender } from '../perf/render-count';
import { NO_SELECTION, type Selection } from '../selection/selection-model';
import type { Observable } from '../state/observable';

/** The {@link ElementTreeView}'s properties. */
interface ElementTreeViewProps {
  /** The screen's project path. */
  readonly file: string;
  /** The screen's label in the Explorer, for the tree's accessible name. */
  readonly label: string;
  /** Its element rows. */
  readonly nodes: readonly ElementNode[];
  /** The selection; the view shows it when it is in this screen. */
  readonly selection: Observable<Selection>;
  /** A tag's icon name. */
  readonly iconOf: (tag: string) => string;
  /**
   * Selects `name` in this screen; `toggle` adds or removes it from the
   * selection rather than replacing it.
   */
  readonly onSelect: (name: string, toggle: boolean) => void;
}

/** Pixels each nesting level indents a row by. */
const INDENT_PX = 12;
/** Pixels before a top-level row's content, matching the Explorer's file rows. */
const ROW_START_PX = 26;

/** @brief One screen's element rows, as a tree. */
export function ElementTreeView({ file, label, nodes, selection, iconOf, onSelect }: ElementTreeViewProps): React.JSX.Element {
  countRender('ElementTree');
  // This screen's selection, or none: a selection in another file is the same
  // snapshot here, so it re-renders nothing.
  const shown = useSyncExternalStore(
    (onChange) => selection.subscribe(onChange),
    () => {
      const current = selection.get();
      return current.file === file ? current : NO_SELECTION;
    },
  );
  const selected = shown.names;
  const origin = shown.origin;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const tree = useRef<HTMLUListElement>(null);
  const selectedSet = new Set(selected);

  // --- A selection made elsewhere scrolls its first row into view ---
  // Scrolling only: focus stays where the author has it.
  const first = selected[0];
  useEffect(() => {
    if (origin === 'tree' || first === undefined) return;
    const row = tree.current?.querySelector<HTMLElement>(`[role="treeitem"][data-name="${CSS.escape(first)}"] > .element-row`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [first, origin, selected]);

  // The row in the tab order: the first selected one shown, else the last
  // focused one still present, else the first.
  const present = (name: string | undefined): boolean => name !== undefined && findNode(nodes, name) !== undefined;
  const tabStop = selected.find((name) => present(name)) ?? (present(focused) ? focused : nodes[0]?.name);

  const toggleCollapsed = (name: string, collapse: boolean): void => {
    const next = new Set(collapsed);
    if (collapse) next.add(name);
    else next.delete(name);
    setCollapsed(next);
  };

  // onKeyDown
  // The tree's keys, on whichever row has focus. Rows are found in the DOM, so
  // a collapsed row's children, which are not rendered, are skipped.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'treeitem' || tree.current === null) return;
    const name = target.dataset['name'] ?? '';
    const rows = [...tree.current.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const index = rows.indexOf(target);
    const node = findNode(nodes, name);
    const hasChildren = node !== undefined && node.children.length > 0;
    const isCollapsed = collapsed.has(name);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = rows[index + 1];
        break;
      case 'ArrowUp':
        next = rows[index - 1];
        break;
      case 'Home':
        next = rows[0];
        break;
      case 'End':
        next = rows[rows.length - 1];
        break;
      case 'ArrowRight':
        if (hasChildren && isCollapsed) toggleCollapsed(name, false);
        else if (hasChildren) next = rows[index + 1];
        break;
      case 'ArrowLeft':
        if (hasChildren && !isCollapsed) toggleCollapsed(name, true);
        else next = target.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? undefined;
        break;
      case 'Enter':
        onSelect(name, event.shiftKey || event.metaKey || event.ctrlKey);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  };

  // renderNodes
  // A level of rows, each with its children nested in a group.
  //   level — 1 for the screen's top-level elements
  const renderNodes = (list: readonly ElementNode[], level: number): React.JSX.Element[] =>
    list.map((node) => {
      const hasChildren = node.children.length > 0;
      const open = hasChildren && !collapsed.has(node.name);
      const isSelected = selectedSet.has(node.name);
      return (
        <li
          key={node.name}
          role="treeitem"
          aria-label={node.name}
          aria-level={level}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? open : undefined}
          data-name={node.name}
          tabIndex={node.name === tabStop ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocused(node.name);
          }}
        >
          <div
            className={`element-row${isSelected ? ' selected' : ''}`}
            style={{ paddingLeft: ROW_START_PX + (level - 1) * INDENT_PX }}
            title={`${node.name} <${node.tag}>`}
            onClick={(event) => {
              // Focus the row as a native tree does, then select it.
              (event.currentTarget.parentElement as HTMLElement).focus();
              onSelect(node.name, event.shiftKey || event.metaKey || event.ctrlKey);
            }}
          >
            {hasChildren ? (
              <span
                className="element-twisty"
                aria-hidden="true"
                onClick={(event) => {
                  // The twisty only expands and collapses; it never selects.
                  event.stopPropagation();
                  toggleCollapsed(node.name, open);
                }}
              >
                {open ? '▾' : '▸'}
              </span>
            ) : (
              <span className="element-twisty" aria-hidden="true" />
            )}
            <Icon name={iconOf(node.tag)} size={14} className="element-icon" />
            <span className="element-name">{node.name}</span>
            <span className="element-tag">{node.tag}</span>
          </div>
          {open && <ul role="group">{renderNodes(node.children, level + 1)}</ul>}
        </li>
      );
    });

  return (
    <ul ref={tree} role="tree" aria-label={`Elements of ${label}`} aria-multiselectable="true" className="element-tree" data-file={file} onKeyDown={onKeyDown}>
      {nodes.length === 0 ? (
        <li className="element-empty" role="none">
          No named elements
        </li>
      ) : (
        renderNodes(nodes, 1)
      )}
    </ul>
  );
}
