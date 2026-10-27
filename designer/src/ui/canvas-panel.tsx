/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/canvas-panel.tsx
 * Purpose: The canvas: the active screen as the editor Wasm draws it
 *          (ui_spec §8). Read-only in this release; editing on the canvas is a
 *          later step.
 * Description: A stub until the live pipeline renders into it.
 *
 * Exports:
 * - CanvasPanel:  The component
 */

/** @brief The canvas panel. */
export function CanvasPanel(): React.JSX.Element {
  return <div className="panel-empty canvas-stub">The canvas renders once the live pipeline runs.</div>;
}
