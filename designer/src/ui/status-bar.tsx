/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/status-bar.tsx
 * Purpose: The status bar of ui_spec §6, with EDITOR-DESIGN §2.2's addition:
 *          the editor Wasm indicator, which says whether the canvas is drawing
 *          with this project's own widgets — and, when it is not, why and what
 *          to do. Clicking it opens Output, where the builds are logged.
 * Description: Each item reads its own observable, so a change to one does not
 *              re-render the others.
 *
 * Exports:
 * - StatusBar:      The component
 * - describeWasm(): The indicator's text for a state
 */

import type { WasmStatus } from '../wasm/editor-wasm-controller';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

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
  const workspace = useWorkspace();
  const status = useObservable(workspace.wasm.status);
  const frame = useObservable(workspace.loop.frameState);
  const problems = useObservable(workspace.problems);
  const errors = problems.filter((row) => row.severity === 'error').length;
  const warnings = problems.filter((row) => row.severity === 'warning').length;
  const selection = useObservable(workspace.loop.selectionRect);
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
      {selection !== undefined && (
        <span className="status-item selection-geometry">
          sel {selection.x},{selection.y} {selection.width}×{selection.height}
        </span>
      )}
      {frame.display !== undefined && (
        <span className="status-item">
          {frame.screen} · {frame.display.width}×{frame.display.height}
        </span>
      )}
    </footer>
  );
}
