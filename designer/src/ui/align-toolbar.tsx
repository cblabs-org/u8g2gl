/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/align-toolbar.tsx
 * Purpose: The canvas toolbar's align and distribute buttons (ui_spec §8),
 *          acting on the multi-selection through the canvas's one edit path,
 *          each command one undo stop. A button is enabled only when enough of
 *          the selection can move on its axis, and after a command the toolbar
 *          says which elements stayed and why.
 * Description: Which buttons are enabled depends on the selection, the text
 *              and the drawn frame, so it is worked out outside React and the
 *              component re-renders only when the answer changes. On a
 *              selection change it is worked out at once; after a pipeline run
 *              it is worked out once runs have paused for
 *              {@link SETTLE_MS}, because during a drag a run lands every frame
 *              and the answer cannot change mid-gesture — so a drag costs this
 *              toolbar a timer reset per frame and nothing else.
 *
 * Exports:
 * - SETTLE_MS:      How long runs must pause before availability is rechecked
 * - AlignToolbar:   The component
 */

import { parseCst } from '@u8g2gl/core/cst/index.js';
import { memo, useEffect, useMemo, useState } from 'react';
import { ALIGN_COMMANDS, alignAvailability, alignEdits, type AlignCommand } from '../editing/align';
import type { CanvasEditor } from '../editing/canvas-editor';
import { Observable } from '../state/observable';
import { countRender } from '../perf/render-count';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';

/** Milliseconds without a pipeline run before the buttons' availability is rechecked. */
export const SETTLE_MS = 120;

/**
 * @brief The align and distribute buttons; `editor` is the canvas's edit path.
 *
 * Memoised: the canvas panel re-renders for every frame it shows, and these
 * buttons depend on none of it.
 *
 * @param editor The canvas's edit path, shared with its gestures so a command
 *               closes any open nudge group.
 */
export const AlignToolbar = memo(function AlignToolbar({ editor }: { readonly editor: CanvasEditor }): React.JSX.Element {
  countRender('AlignToolbar');
  const workspace = useWorkspace();
  const loop = workspace.loop;
  // The enabled commands, as one string so an unchanged answer is not news.
  const available = useMemo(() => new Observable<string>(''), []);
  const enabled = useObservable(available);
  const [note, setNote] = useState('');

  // --- Availability: now on a selection change, after runs settle otherwise ---
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      const { file, names } = workspace.selection.current.get();
      const text = file === undefined ? undefined : workspace.documents.textOf(file);
      const commands = text === undefined || names.length < 2 || !loop.canvasEditing.get() ? [] : alignAvailability(parseCst(text, file ?? '').cst, names, loop.bounds.get(), loop.placements);
      available.set(commands.join(' '));
    };
    const settle = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(check, SETTLE_MS);
    };
    check();
    const offSelection = workspace.selection.current.subscribe(() => {
      // The same state again re-renders nothing; a note from the last command goes.
      setNote((current) => (current === '' ? current : ''));
      check();
    });
    const offRun = loop.lastRun.subscribe(settle);
    return () => {
      offSelection();
      offRun();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [workspace, loop, available]);

  // run
  // One command on the selection, as one undo stop.
  const run = (command: AlignCommand): void => {
    const { file, names } = workspace.selection.current.get();
    if (file === undefined) return;
    let refusals: readonly string[] = [];
    editor.apply(file, (text) => {
      const outcome = alignEdits(parseCst(text, file).cst, names, loop.bounds.get(), loop.placements, command);
      refusals = outcome.refusals;
      return outcome.edits;
    });
    setNote(refusals.length === 0 ? '' : `Not moved: ${refusals.join('; ')}`);
  };

  const on = new Set(enabled.split(' '));
  return (
    <span className="align-toolbar" role="group" aria-label="Align">
      {ALIGN_COMMANDS.map(({ command, label, glyph }) => (
        <button key={command} type="button" className="align-button" title={label} aria-label={label} disabled={!on.has(command)} onClick={() => run(command)}>
          {glyph}
        </button>
      ))}
      {note !== '' && (
        <span className="align-note" role="status" title={note}>
          {note}
        </span>
      )}
    </span>
  );
});
