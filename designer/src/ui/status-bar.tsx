/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/status-bar.tsx
 * Purpose: The status bar of ui_spec §6, with one addition for served mode:
 *          the editor Wasm indicator, which says whether the canvas is drawing
 *          with this project's own widgets — and, when it is not, why and what
 *          to do. Clicking it opens Output, where the builds are logged.
 * Description: Each item reads its own observable, so a change to one does not
 *              re-render the others. The selection geometry is its own
 *              component for that reason: a selection change, or a drag that
 *              moves the selection, re-renders it and nothing else here
 *              (EDITOR-DESIGN §3.3). It shows one element's `x,y w×h`, or for
 *              several the box around them with how many there are.
 *
 * Exports:
 * - StatusBar:          The component
 * - describeWasm():     The indicator's text for a state
 * - SelectionGeometry:  Its selection readout
 */

import type { WasmStatus } from '../wasm/editor-wasm-controller';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/**
 * @brief The indicator's text: a glyph, the state, and the hash or reason.
 *
 * @param status       The controller's state.
 * @param placeholders How many elements the canvas shows as placeholders.
 */
export function describeWasm(status: WasmStatus, placeholders: number): string {
  const shown = placeholders > 0 ? ` · ${placeholders} placeholder${placeholders === 1 ? '' : 's'}` : '';
  switch (status.kind) {
    case 'loading':
      return '◌ editor Wasm: loading';
    case 'building':
      return `◐ editor Wasm: building the project renderer${shown}`;
    case 'current':
      return `● editor Wasm: current ${status.hash.slice(0, 8)}${shown}`;
    case 'stale':
      return `◐ editor Wasm: stale ${status.hash.slice(0, 8)}, rebuilding${shown}`;
    case 'none':
      return `○ editor Wasm: no toolchain, project widgets are placeholders. Run 'u8g2gl toolchain install'`;
    case 'failed':
      return `✕ editor Wasm: build failed${status.hash !== undefined ? `, showing ${status.hash.slice(0, 8)}` : ''}${shown}`;
  }
}

/** @brief The status bar. */
export function StatusBar({ onShowOutput }: { readonly onShowOutput: () => void }): React.JSX.Element {
  countRender('StatusBar');
  const workspace = useWorkspace();
  const status = useObservable(workspace.wasm.status);
  const frame = useObservable(workspace.loop.frameState);
  const problems = useObservable(workspace.problems);
  const errors = problems.filter((row) => row.severity === 'error').length;
  const warnings = problems.filter((row) => row.severity === 'warning').length;
  const reason = status.kind === 'none' || status.kind === 'failed' ? status.reason : undefined;
  return (
    <footer className="status-bar">
      <button type="button" className="status-item wasm" data-wasm={status.kind} title={reason ?? 'Open Output'} onClick={onShowOutput}>
        {describeWasm(status, frame.placeholders.length)}
      </button>
      <span className="status-item problems-count">
        ⛔ {errors} ⚠ {warnings}
      </span>
      <span className="status-spacer" />
      <SelectionGeometry />
      {frame.display !== undefined && (
        <span className="status-item">
          {frame.screen} · {frame.display.width}×{frame.display.height}
        </span>
      )}
    </footer>
  );
}

/**
 * @brief The selection's geometry (ui_spec §6): one element's rectangle, or the
 *        box around several, in device pixels. Nothing while nothing drawn is
 *        selected.
 */
export function SelectionGeometry(): React.JSX.Element | null {
  countRender('SelectionGeometry');
  const workspace = useWorkspace();
  const rect = useObservable(workspace.loop.selectionRect);
  const count = useObservable(workspace.loop.selectionCount);
  if (rect === undefined) return null;
  return (
    <span className="status-item selection-geometry" data-count={count}>
      sel {count > 1 ? `${count} · ` : ''}
      {rect.x},{rect.y} {rect.width}×{rect.height}
    </span>
  );
}
