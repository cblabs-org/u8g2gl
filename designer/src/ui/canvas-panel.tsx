/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/canvas-panel.tsx
 * Purpose: The canvas (ui_spec §8): the active screen as the editor Wasm draws
 *          it, at a chosen zoom, on dark chrome so the display bounds read as a
 *          physical panel, and where elements are selected: click, click again
 *          to cycle through overlaps, drag a marquee, Esc, and where they are
 *          moved: drag one, or nudge the selection with the arrow keys; and
 *          where a Palette tag is dropped to insert it. Every move is an edit
 *          to the text, never a position the text does not hold.
 * Description: React renders the toolbar and the two canvases' container; the
 *              pixels are drawn by `CanvasView`, which the edit loop calls
 *              directly, so a frame never passes through React; the selection
 *              gestures are `CanvasGestures`, attached to the frame element for
 *              the panel's life with the edit path they write through
 *              (`CanvasEditor`), and this component never reads the
 *              selection, so selecting or dragging re-renders none of it. The
 *              toolbar sets the zoom (1× to 8×, or fit) and the animation
 *              freeze, and holds the align and distribute buttons
 *              (`align-toolbar.tsx`), which share the gestures' edit path and
 *              subscribe to the selection themselves, and Run with the last
 *              test run's verdict (`test-run-controls.tsx`), whose mismatch
 *              legend sits over the stage. The banner says why the frame is
 *              the last good one, or what the renderer cannot draw.
 *
 * Exports:
 * - CanvasPanel:  The component
 */

import { useEffect, useRef, useState } from 'react';
import { CanvasView } from '../canvas/canvas-view';
import { CanvasEditor } from '../editing/canvas-editor';
import { planInsert } from '../editing/insert-element';
import { projectNames } from '../documents/element-names';
import { CanvasGestures } from '../selection/canvas-gestures';
import { AlignToolbar } from './align-toolbar';
import { TestRunControls, TestRunDiffInfo } from './test-run-controls';
import { useObservable } from './use-observable';
import { useWorkspace } from './workspace-context';
import { countRender } from '../perf/render-count';

/** Zoom choices; 0 means fit to the panel. */
const ZOOMS = [0, 1, 2, 3, 4, 6, 8] as const;

/** @brief The canvas panel. */
export function CanvasPanel(): React.JSX.Element {
  countRender('CanvasPanel');
  const workspace = useWorkspace();
  const loop = workspace.loop;
  const state = useObservable(loop.frameState);
  const frozen = useObservable(loop.frozen);
  const isFramework = useObservable(workspace.wasm.isFramework);
  const [zoom, setZoom] = useState<number>(0);
  const stage = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const view = useRef<CanvasView | undefined>(undefined);
  // One edit path for the gestures and the align toolbar, so a command closes
  // any open nudge group as a gesture does.
  const [editor] = useState(() => new CanvasEditor((path) => workspace.documents.open(path)));

  // --- The view and its gestures: created once, attached for the panel's life ---
  useEffect(() => {
    if (frame.current === null || overlay.current === null || container.current === null) return undefined;
    view.current = new CanvasView(frame.current, overlay.current, container.current);
    loop.attachCanvas(view.current);
    const shown = view.current;
    const gestures = new CanvasGestures({
      element: container.current,
      frame: frame.current,
      targets: loop.hitTargets,
      bounds: loop.bounds,
      placements: () => loop.placements,
      display: () => loop.frameState.get().display,
      canvasEditing: loop.canvasEditing,
      selection: workspace.selection,
      editor,
      showMarquee: (rect) => shown.setMarquee(rect),
      showGuides: (lines) => shown.setGuides(lines),
      planInsert: (tag, file, x, y) => {
        const run = loop.lastRun.get();
        if (run === undefined) return undefined;
        return planInsert({ tag, file, x, y, texts: workspace.documents.texts(), base: run.result, assets: run.assets });
      },
      log: (line) => workspace.log(line),
      takenNames: () => {
        const run = loop.lastRun.get();
        return run === undefined ? new Set<string>() : projectNames(run.result.model);
      },
    });
    return () => {
      gestures.dispose();
      loop.attachCanvas(undefined);
      view.current = undefined;
    };
  }, [loop, workspace, editor]);

  // --- Zoom: a fixed factor, or the largest integer that fits the panel ---
  const display = state.display;
  useEffect(() => {
    const element = stage.current;
    if (element === null || view.current === undefined) return undefined;
    const apply = (): void => {
      if (zoom !== 0 || display === undefined) {
        view.current?.setZoom(zoom === 0 ? 4 : zoom);
        return;
      }
      // Integer factors only: a fractional zoom makes some device pixels wider
      // than others, which misrepresents a 1-bit display.
      const fit = Math.floor(Math.min((element.clientWidth - 40) / display.width, (element.clientHeight - 40) / display.height));
      view.current?.setZoom(Math.max(1, Math.min(8, fit)));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [zoom, display]);

  const placeholderNote =
    state.placeholders.length > 0
      ? `${state.placeholders.length} element${state.placeholders.length === 1 ? '' : 's'} shown as placeholders${isFramework ? ': no project renderer' : ''}`
      : undefined;

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <span className="screen-name">{state.screen ?? 'no screen'}</span>
        {display !== undefined && (
          <span className="dim">
            {display.width}×{display.height}
          </span>
        )}
        <AlignToolbar editor={editor} />
        <TestRunControls />
        <span className="spacer" />
        {placeholderNote !== undefined && <span className="placeholder-note">{placeholderNote}</span>}
        <label>
          Zoom{' '}
          <select aria-label="Zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z === 0 ? 'fit' : `${z}×`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" aria-pressed={frozen} onClick={() => loop.frozen.set(!frozen)} title="Pin animation at t = 0">
          {frozen ? '❚❚ frozen' : '▶ live'}
        </button>
      </div>
      <div className="canvas-stage" ref={stage}>
        {state.stale && state.banner !== undefined && <div className="canvas-banner">{state.banner}</div>}
        <TestRunDiffInfo />
        <div className="canvas-frame" ref={container} data-frame={state.frame} data-lit={state.lit} data-stale={state.stale}>
          <canvas className="frame" ref={frame} aria-label="Canvas" />
          <canvas className="overlay" ref={overlay} />
        </div>
      </div>
    </div>
  );
}
