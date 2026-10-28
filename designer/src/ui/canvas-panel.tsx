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
 *          moved: drag one, or nudge the selection with the arrow keys. Every
 *          move is an edit to the text, never a position the text does not hold.
 * Description: React renders the toolbar and the two canvases' container; the
 *              pixels are drawn by `CanvasView`, which the edit loop calls
 *              directly, so a frame never passes through React; the selection
 *              gestures are `CanvasGestures`, attached to the frame element for
 *              the panel's life with the edit path they write through
 *              (`CanvasEditor`), and this component never reads the
 *              selection, so selecting or dragging re-renders none of it. The toolbar
 *              sets the zoom (1× to 8×, or fit) and the animation freeze. The
 *              banner says why the frame is the last good one, or what the
 *              renderer cannot draw.
 *
 * Exports:
 * - CanvasPanel:  The component
 */

import { useEffect, useRef, useState } from 'react';
import { CanvasView } from '../canvas/canvas-view';
import { CanvasEditor } from '../editing/canvas-editor';
import { CanvasGestures } from '../selection/canvas-gestures';
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
      placements: () => loop.placements,
      canvasEditing: loop.canvasEditing,
      selection: workspace.selection,
      editor: new CanvasEditor((path) => workspace.documents.open(path)),
      showMarquee: (rect) => shown.setMarquee(rect),
    });
    return () => {
      gestures.dispose();
      loop.attachCanvas(undefined);
      view.current = undefined;
    };
  }, [loop, workspace]);

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
        <div className="canvas-frame" ref={container} data-frame={state.frame} data-lit={state.lit} data-stale={state.stale}>
          <canvas className="frame" ref={frame} aria-label="Canvas" />
          <canvas className="overlay" ref={overlay} />
        </div>
      </div>
    </div>
  );
}
