/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/section-tree-view.tsx
 * Purpose: A project file's section rows in the Explorer (ruling 2): the parts
 *          of `u8g2gl.xml` and `globals.xml`, nested under the file as a
 *          screen's element rows are, so what a project file holds is seen
 *          without opening it, and each part is one click away.
 * Description: The element rows' WAI-ARIA tree (`element-tree-view.tsx`):
 *              `role="tree"` per file, a `treeitem` per row with `aria-level`
 *              and, on a row with children, `aria-expanded`; the same classes,
 *              so they look alike; and the same keys: Up and Down move, Home
 *              and End go to the ends, Right expands or enters, Left collapses
 *              or goes to the parent, and Enter opens the row, as a click
 *              does. One row is in the tab order (a roving tabindex). A row
 *              opens its file with its form scrolled to that section, which
 *              is never an edit. Which rows are collapsed is this view's own
 *              state; every row starts expanded.
 *
 * Exports:
 * - SectionTreeView:  The component
 */

import { useRef, useState } from 'react';
import { countRender } from '../perf/render-count';
import type { SectionRow } from '../forms/form-sections';

/** Pixels each nesting level indents a row by, as the element rows do. */
const INDENT_PX = 12;
/** Pixels before a top-level row's content, matching the Explorer's file rows. */
const ROW_START_PX = 26;

// findRow
// A row by key, anywhere in the tree.
function findRow(rows: readonly SectionRow[], key: string): SectionRow | undefined {
  for (const row of rows) {
    if (row.key === key) return row;
    const found = findRow(row.children, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * @brief One project file's section rows, as a tree.
 *
 * @param file   The file's project path.
 * @param rows   Its rows (`Workspace.projectSections`).
 * @param onOpen Opens the file at a row's section.
 */
export function SectionTreeView({
  file,
  rows,
  onOpen,
}: {
  readonly file: string;
  readonly rows: readonly SectionRow[];
  readonly onOpen: (key: string) => void;
}): React.JSX.Element {
  countRender('SectionTree');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const tree = useRef<HTMLUListElement>(null);
  const tabStop = focused !== undefined && findRow(rows, focused) !== undefined ? focused : rows[0]?.key;

  const toggle = (key: string, collapse: boolean): void => {
    const next = new Set(collapsed);
    if (collapse) next.add(key);
    else next.delete(key);
    setCollapsed(next);
  };

  // onKeyDown
  // The tree's keys, as the element rows have them. Rows are found in the DOM,
  // so a collapsed row's children, which are not rendered, are skipped.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'treeitem' || tree.current === null) return;
    const key = target.dataset['key'] ?? '';
    const items = [...tree.current.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const index = items.indexOf(target);
    const row = findRow(rows, key);
    const hasChildren = row !== undefined && row.children.length > 0;
    const isCollapsed = collapsed.has(key);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = items[index + 1];
        break;
      case 'ArrowUp':
        next = items[index - 1];
        break;
      case 'Home':
        next = items[0];
        break;
      case 'End':
        next = items[items.length - 1];
        break;
      case 'ArrowRight':
        if (hasChildren && isCollapsed) toggle(key, false);
        else if (hasChildren) next = items[index + 1];
        break;
      case 'ArrowLeft':
        if (hasChildren && !isCollapsed) toggle(key, true);
        else next = target.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? undefined;
        break;
      case 'Enter':
        onOpen(key);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  };

  // renderRows
  // A level of rows, each with its children nested in a group.
  const renderRows = (list: readonly SectionRow[], level: number): React.JSX.Element[] =>
    list.map((row) => {
      const hasChildren = row.children.length > 0;
      const open = hasChildren && !collapsed.has(row.key);
      return (
        <li
          key={row.key}
          role="treeitem"
          aria-label={row.label}
          aria-level={level}
          aria-expanded={hasChildren ? open : undefined}
          data-key={row.key}
          tabIndex={row.key === tabStop ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocused(row.key);
          }}
        >
          <div
            className="element-row section-row"
            style={{ paddingLeft: ROW_START_PX + (level - 1) * INDENT_PX }}
            title={`Show ${row.label} in the ${file} form`}
            onClick={(event) => {
              (event.currentTarget.parentElement as HTMLElement).focus();
              onOpen(row.key);
            }}
          >
            {hasChildren ? (
              <span
                className="element-twisty"
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(row.key, open);
                }}
              >
                {open ? '▾' : '▸'}
              </span>
            ) : (
              <span className="element-twisty" aria-hidden="true" />
            )}
            <span className="element-name">{row.label}</span>
          </div>
          {open && <ul role="group">{renderRows(row.children, level + 1)}</ul>}
        </li>
      );
    });

  return (
    <ul ref={tree} role="tree" aria-label={`Sections of ${file}`} className="element-tree section-tree" data-file={file} onKeyDown={onKeyDown}>
      {renderRows(rows, 1)}
    </ul>
  );
}
