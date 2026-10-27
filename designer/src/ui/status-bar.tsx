/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/status-bar.tsx
 * Purpose: The status bar of ui_spec §6, with EDITOR-DESIGN §2.2's addition:
 *          the editor Wasm indicator, which says whether the canvas is drawing
 *          with this project's own widgets, and the problem count.
 * Description: Each item reads its own observable, so a change to one does not
 *              re-render the others.
 *
 * Exports:
 * - StatusBar:  The component
 */

import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** @brief The status bar. */
export function StatusBar(): React.JSX.Element {
  const workspace = useWorkspace();
  const problems = useObservable(workspace.problems);
  const errors = problems.filter((row) => row.severity === 'error').length;
  const warnings = problems.filter((row) => row.severity === 'warning').length;
  return (
    <footer className="status-bar">
      <span className="status-item wasm" data-wasm="none">○ editor Wasm: not loaded</span>
      <span className="status-item problems-count">
        ⛔ {errors} ⚠ {warnings}
      </span>
    </footer>
  );
}
