/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/design-hidden-badge.tsx
 * Purpose: The canvas toolbar's `N hidden · Show all` badge (ui_spec §8). The
 *          canvas promises to draw what the device draws; hiding an element in
 *          the designer breaks that on purpose, so whenever it is broken the
 *          canvas says so, where the author is looking, and offers the way
 *          back. It is the guard against comparing the canvas with a frame the
 *          device never draws.
 * Description: Shown while the drawn screen has any element the author hid in
 *              the designer (`design-hidden.ts`), and the loaded editor Wasm
 *              can hide; N counts the rows the author hid, not what is nested
 *              under them. Show all clears that screen's hidden set, which is
 *              never an edit. It reads the drawn screen's file and that file's
 *              hidden names only, so neither a frame, a keystroke nor a drag
 *              re-renders it; memoised, because the canvas panel re-renders for
 *              every frame it shows.
 *
 * Exports:
 * - DesignHiddenBadge:  The component
 */

import { memo, useSyncExternalStore } from 'react';
import { countRender } from '../perf/render-count';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** @brief The badge, or nothing while the drawn screen hides nothing. */
export const DesignHiddenBadge = memo(function DesignHiddenBadge(): React.JSX.Element | null {
  countRender('DesignHiddenBadge');
  const workspace = useWorkspace();
  const file = useObservable(workspace.canvasFile);
  const hidden = workspace.designHidden;
  const count = useSyncExternalStore(
    (onChange) => hidden.hidden.subscribe(onChange),
    () => (file === undefined ? 0 : hidden.namesIn(file).size),
  );
  const module = workspace.wasm.module;
  const canHide = useSyncExternalStore(
    (onChange) => module.subscribe(onChange),
    () => module.get()?.designHiding === true,
  );
  if (file === undefined || count === 0 || !canHide) return null;
  return (
    <span className="design-hidden-badge" role="status" title="Elements hidden in the designer: the canvas is not the exported view">
      {count} hidden ·{' '}
      <button type="button" className="show-all" onClick={() => hidden.showAll(file)}>
        Show all
      </button>
    </span>
  );
});
