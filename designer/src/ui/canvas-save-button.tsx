/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/canvas-save-button.tsx
 * Purpose: The canvas toolbar's Save button (ui_spec §8). An edit made on the
 *          canvas is an edit to the screen it draws, and a layout may have no
 *          editor tab at all, so the canvas itself offers to save that screen:
 *          the place the edit was made is the place to save it.
 * Description: Enabled exactly while the drawn screen's file is unsaved. It
 *              reads `Workspace.canvasFile`, which moves only when the drawn
 *              screen's file does, and the dirty set, which moves only when a
 *              file becomes dirty or clean, so neither a keystroke nor a drag
 *              re-renders it. Memoised, because the canvas panel re-renders for
 *              every frame it shows.
 *
 * Exports:
 * - CanvasSaveButton:  The component
 */

import { memo } from 'react';
import { countRender } from '../perf/render-count';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** @brief Saves the screen the canvas draws; disabled while it has nothing unsaved. */
export const CanvasSaveButton = memo(function CanvasSaveButton(): React.JSX.Element {
  countRender('CanvasSaveButton');
  const workspace = useWorkspace();
  const file = useObservable(workspace.canvasFile);
  const dirty = useObservable(workspace.documents.dirty);
  const unsaved = file !== undefined && dirty.has(file);
  let title: string;
  if (file === undefined) title = 'No screen to save';
  else if (unsaved) title = `Save ${file}`;
  else title = `${file} has no unsaved changes`;
  return (
    <button type="button" className="canvas-save" title={title} disabled={!unsaved} onClick={() => file !== undefined && void workspace.save(file)}>
      Save
    </button>
  );
});
