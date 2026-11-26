/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/input-preview-controls.tsx
 * Purpose: The canvas toolbar's input preview (§12): a toggle, then
 *          buttons — each with a key — for next, previous, press, long press
 *          and back, so the author can step focus through a screen, toggle a
 *          bound switch and follow a load to another screen and back, all on
 *          the canvas, running the device's own code through the bridge. A
 *          callback is shown (its name, target and trigger), never run.
 * Description: The state is the edit loop's (`EditLoop.preview`); this renders
 *              it and sends each action to the loop. While the preview runs,
 *              the keys are taken in the capture phase, before the canvas's
 *              nudge keys, except where the author is typing (a form control
 *              or the XML editor):
 *              - → or ↓: next (BUTTON_NEXT)
 *              - ← or ↑: previous (BUTTON_PREV)
 *              - Enter: press (BUTTON_PRESS)
 *              - Shift+Enter: long press (BUTTON_LONG_PRESS)
 *              - Backspace: back
 *              - Esc: stop the preview
 *
 * Exports:
 * - InputPreviewControls: The toolbar group
 * - PREVIEW_KEYS:         Each action's key, as the buttons show it
 */

import { useEffect } from 'react';
import { INPUT_EVENTS } from '@u8g2gl/core/schema/input-model.js';
import { countRender } from '../perf/render-count';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** Each preview action's key, as its button names it. */
export const PREVIEW_KEYS = {
  next: '→',
  prev: '←',
  press: 'Enter',
  longPress: 'Shift+Enter',
  back: 'Backspace',
  stop: 'Esc',
} as const;

// typingIn
// Whether a key event is the author typing: in a form control, or in the XML
// editor, where the preview must not take the key.
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('input, select, textarea, [contenteditable="true"], .monaco-editor') !== null;
}

/** @brief The input preview's toggle and step buttons. */
export function InputPreviewControls(): React.JSX.Element {
  countRender('InputPreviewControls');
  const loop = useWorkspace().loop;
  const preview = useObservable(loop.preview);
  const running = preview !== undefined;

  // --- The keys, while the preview runs ---
  useEffect(() => {
    if (!running) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (typingIn(event.target)) return;
      let handled = true;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') loop.dispatch(INPUT_EVENTS.button_next);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') loop.dispatch(INPUT_EVENTS.button_prev);
      else if (event.key === 'Enter' && event.shiftKey) loop.dispatch(INPUT_EVENTS.button_long_press);
      else if (event.key === 'Enter') loop.dispatch(INPUT_EVENTS.button_press);
      else if (event.key === 'Backspace') loop.back();
      else if (event.key === 'Escape') loop.stopPreview();
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [running, loop]);

  if (!running) {
    return (
      <button type="button" className="input-preview-toggle" aria-pressed={false} onClick={() => loop.startPreview()} title="Run the screen's focus ring and events as the device does">
        ◎ Preview input
      </button>
    );
  }
  const calls = preview.callbacks.map((call) => `${call.callback}(${call.element}, ${call.trigger})`);
  return (
    <span className="input-preview" role="group" aria-label="Input preview">
      <button type="button" className="input-preview-toggle" aria-pressed={true} onClick={() => loop.stopPreview()} title={`Stop the preview (${PREVIEW_KEYS.stop})`}>
        ◎ Stop preview
      </button>
      <button type="button" aria-label="Previous" title={`Previous (${PREVIEW_KEYS.prev})`} onClick={() => loop.dispatch(INPUT_EVENTS.button_prev)}>
        ◀ Prev
      </button>
      <button type="button" aria-label="Next" title={`Next (${PREVIEW_KEYS.next})`} onClick={() => loop.dispatch(INPUT_EVENTS.button_next)}>
        Next ▶
      </button>
      <button type="button" aria-label="Press" title={`Press (${PREVIEW_KEYS.press})`} onClick={() => loop.dispatch(INPUT_EVENTS.button_press)}>
        Press
      </button>
      <button type="button" aria-label="Long press" title={`Long press (${PREVIEW_KEYS.longPress})`} onClick={() => loop.dispatch(INPUT_EVENTS.button_long_press)}>
        Long
      </button>
      <button type="button" aria-label="Back" title={`Back (${PREVIEW_KEYS.back})`} disabled={preview.depth === 0} onClick={() => loop.back()}>
        ↩ Back
      </button>
      <span className="input-preview-state" data-focused={preview.focused ?? ''} data-screen={preview.screen ?? ''} data-depth={preview.depth}>
        {preview.focused === null ? 'nothing focused' : `focus: ${preview.focused}`}
      </span>
      {calls.length > 0 && (
        <span className="input-preview-callbacks" role="status" title="Recorded, not run: the device would call these">
          {`callback ${calls.join(', ')}`}
        </span>
      )}
    </span>
  );
}
