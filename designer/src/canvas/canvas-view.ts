/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/canvas/canvas-view.ts
 * Purpose: Draws the editor Wasm's frame onto the page, outside React's
 *          reconciler: the frame changes up to sixty times a second and must
 *          never wait for, or cause, a component render (typescript.md §8).
 *          1-bit pixels stay crisp at every zoom (ui_spec §8: never smoothed,
 *          because a blurred pixel misrepresents the display).
 * Description: Two stacked canvases. The frame canvas is the display's own
 *              size, filled by `putImageData` — the blit — and scaled by CSS
 *              with `image-rendering: pixelated`, so a zoom costs the browser
 *              nothing per frame. The overlay canvas carries what is drawn
 *              *about* the frame rather than in it: each selected element's
 *              outline, eight handles and an `x, y, w×h` badge, the marquee
 *              while one is dragged, the alignment guides a drag has
 *              snapped to, the outlines of placeholder widgets, and
 *              the hatching over an element an error is in (§3.8: the frame
 *              stays live, and the problem is marked over it, not in it).
 *              It is never part of the framebuffer, so nothing it draws can be
 *              mistaken for a pixel the display would light.
 *
 *              The overlay extends {@link OVERLAY_MARGIN} CSS pixels past the
 *              frame on every side, so an element at the display's edge still
 *              shows its outline, handles and badge; and its backing store is
 *              the CSS size times the device pixel ratio, so lines and text are
 *              crisp on a high-density screen at every zoom.
 *
 * Exports:
 * - OVERLAY_MARGIN: CSS pixels the overlay extends past the frame
 * - HANDLE_SIZE:   A selection handle's side, in CSS pixels
 * - OverlayRect:  A rectangle to draw on the overlay, and how
 * - GuideLine:    An alignment guide to draw
 * - CanvasView:   The two canvases
 *
 *     - draw():        Blit a frame
 *     - setZoom():     Change the scale
 *     - setOverlay():  Replace what the overlay shows
 *     - setMarquee():  Show or hide the marquee being dragged
 *     - setGuides():   Show the alignment guides a drag lies on
 *     - setStale():    Dim the frame while the document has an error
 */

import { blitFrame } from './framebuffer';

/**
 * A rectangle, in whichever pixels its use says: device pixels for what is
 * drawn about, CSS pixels for where on the overlay it is drawn. A local alias
 * rather than the pipeline's `Rect`, so the canvas does not depend on the pipeline.
 */
type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** A rectangle on the overlay, in device pixels. */
export interface OverlayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * `selection` a selected element; `placeholder` a widget the Wasm cannot
   * draw; `problem` an element an error is in, hatched (EDITOR-DESIGN §3.8).
   */
  readonly kind: 'selection' | 'placeholder' | 'problem';
}

/** The overlay's colour for each kind. */
const OVERLAY_COLOUR: Readonly<Record<OverlayRect['kind'], string>> = {
  selection: '#4f8cff',
  placeholder: 'rgba(230, 180, 80, 0.7)',
  problem: '#ff5a5f',
};

/** The order kinds are drawn in: hatching and placeholders under, selection on top. */
const OVERLAY_ORDER: Readonly<Record<OverlayRect['kind'], number>> = { problem: 0, placeholder: 1, selection: 2 };

/** An alignment guide: a vertical line at device x, or a horizontal one at device y. */
export interface GuideLine {
  readonly axis: 'vertical' | 'horizontal';
  readonly at: number;
}

/** The guides' colour: apart from the selection's blue and the hatch's red. */
const GUIDE_COLOUR = '#ff4fd8';

/** The hatch's line spacing, in CSS pixels, whatever the zoom. */
const HATCH_SPACING = 6;

/**
 * CSS pixels the overlay extends past the frame on each side: room for an edge
 * element's handles and badge. It matches the frame's padding (styles.css), so
 * the overlay never reaches past the frame's own box.
 */
export const OVERLAY_MARGIN = 10;

/** A selection handle's side, in CSS pixels, whatever the zoom. */
export const HANDLE_SIZE = 6;

/** The badge's font and height, in CSS pixels. */
const BADGE_FONT = '10px ui-monospace, Menlo, monospace';
const BADGE_HEIGHT = 14;

/** The frame and overlay canvases of one canvas panel. */
export class CanvasView {
  private readonly frame: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private image: ImageData | undefined;
  private pixels: Uint32Array | undefined;
  private zoom = 4;
  /** Backing-store pixels per CSS pixel on the overlay, as last sized. */
  private ratio = 1;
  private overlayRects: readonly OverlayRect[] = [];
  private marquee: Box | undefined;
  private guides: readonly GuideLine[] = [];

  /**
   * @param frame     The frame canvas.
   * @param overlay   The overlay canvas, stacked over it.
   * @param container Their common parent, which carries the `stale` class.
   */
  constructor(frame: HTMLCanvasElement, overlay: HTMLCanvasElement, container: HTMLElement) {
    this.frame = frame;
    this.overlay = overlay;
    this.container = container;
    const context = frame.getContext('2d');
    if (context === null) throw new Error('no 2D canvas context');
    this.context = context;
  }

  /**
   * @brief Blits a U8G2 frame: the last step of the edit loop.
   *
   * @param buffer The editor Wasm's tile buffer.
   * @param width  Display width.
   * @param height Display height.
   */
  draw(buffer: Uint8Array, width: number, height: number): void {
    // --- Step 1: Size, once per display, and the reused pixel buffer ---
    if (this.image === undefined || this.image.width !== width || this.image.height !== height) {
      this.frame.width = width;
      this.frame.height = height;
      this.image = this.context.createImageData(width, height);
      this.pixels = new Uint32Array(this.image.data.buffer);
      this.applyZoom();
    }
    // --- Step 2: Convert and blit ---
    blitFrame(buffer, width, height, this.pixels as Uint32Array);
    this.context.putImageData(this.image, 0, 0);
  }

  /** @brief Sets the zoom: device pixels per frame pixel. */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.applyZoom();
  }

  /** @brief Replaces the overlay's rectangles and redraws it. */
  setOverlay(rects: readonly OverlayRect[]): void {
    this.overlayRects = rects;
    this.drawOverlay();
  }

  /**
   * @brief Shows the marquee being dragged, in device pixels; undefined hides it.
   *        Drawn on the overlay only: a marquee selects, it never draws.
   */
  setMarquee(rect: Box | undefined): void {
    if (rect === undefined && this.marquee === undefined) return;
    this.marquee = rect;
    this.drawOverlay();
  }

  /**
   * @brief Shows the alignment guides a drag lies on, in device pixels; an
   *        empty list hides them. Drawn across the whole frame, on the overlay.
   */
  setGuides(lines: readonly GuideLine[]): void {
    if (lines.length === 0 && this.guides.length === 0) return;
    if (lines.length === this.guides.length && lines.every((line, i) => line.axis === this.guides[i]?.axis && line.at === this.guides[i]?.at)) return;
    this.guides = lines;
    this.drawOverlay();
  }

  /** @brief Dims the frame: the last good one, shown while the document cannot render. */
  setStale(stale: boolean): void {
    this.container.classList.toggle('stale', stale);
  }

  // applyZoom
  // Scales the frame by CSS and resizes the overlay to match: the frame's size
  // plus the margin on each side, its backing store at the device pixel ratio.
  private applyZoom(): void {
    const width = this.frame.width * this.zoom;
    const height = this.frame.height * this.zoom;
    this.frame.style.width = `${width}px`;
    this.frame.style.height = `${height}px`;
    const ratio = window.devicePixelRatio || 1;
    this.ratio = ratio;
    const cssWidth = width + 2 * OVERLAY_MARGIN;
    const cssHeight = height + 2 * OVERLAY_MARGIN;
    this.overlay.width = Math.round(cssWidth * ratio);
    this.overlay.height = Math.round(cssHeight * ratio);
    this.overlay.style.width = `${cssWidth}px`;
    this.overlay.style.height = `${cssHeight}px`;
    this.drawOverlay();
  }

  // drawOverlay
  // Everything drawn about the frame, in CSS pixels with the frame's top left
  // at (OVERLAY_MARGIN, OVERLAY_MARGIN). Outlines sit on the pixel boundary
  // outside the element, so they never cover one of its pixels.
  private drawOverlay(): void {
    const context = this.overlay.getContext('2d');
    if (context === null) return;

    // --- Step 1: Clear, and draw in CSS pixels from the frame's corner ---
    const ratio = this.ratio;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.overlay.width, this.overlay.height);
    context.setTransform(ratio, 0, 0, ratio, OVERLAY_MARGIN * ratio, OVERLAY_MARGIN * ratio);

    // --- Step 2: Hatching and placeholder outlines under, selections over ---
    const order = [...this.overlayRects].sort((a, b) => OVERLAY_ORDER[a.kind] - OVERLAY_ORDER[b.kind]);
    for (const rect of order) {
      const box = this.screenBox(rect);
      if (rect.kind === 'problem') {
        this.drawHatch(context, box);
        continue;
      }
      context.strokeStyle = OVERLAY_COLOUR[rect.kind];
      context.lineWidth = rect.kind === 'selection' ? 2 : 1;
      context.setLineDash(rect.kind === 'placeholder' ? [3, 3] : []);
      context.strokeRect(box.x, box.y, box.width, box.height);
      if (rect.kind === 'selection') {
        this.drawHandles(context, box);
        this.drawBadge(context, rect, box);
      }
    }

    // --- Step 3: The guides a drag lies on, across the frame, on the pixel boundary ---
    if (this.guides.length > 0) {
      const width = this.frame.width * this.zoom;
      const height = this.frame.height * this.zoom;
      context.setLineDash([]);
      context.lineWidth = 1;
      context.strokeStyle = GUIDE_COLOUR;
      context.beginPath();
      for (const guide of this.guides) {
        const at = Math.round(guide.at * this.zoom) - 0.5;
        if (guide.axis === 'vertical') {
          context.moveTo(at, -OVERLAY_MARGIN);
          context.lineTo(at, height + OVERLAY_MARGIN);
        } else {
          context.moveTo(-OVERLAY_MARGIN, at);
          context.lineTo(width + OVERLAY_MARGIN, at);
        }
      }
      context.stroke();
    }

    // --- Step 4: The marquee, while one is dragged ---
    if (this.marquee !== undefined) {
      const box = this.screenBox(this.marquee);
      context.setLineDash([4, 3]);
      context.lineWidth = 1;
      context.strokeStyle = OVERLAY_COLOUR.selection;
      context.fillStyle = 'rgba(79, 140, 255, 0.12)';
      context.fillRect(box.x, box.y, box.width, box.height);
      context.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    }
    context.setLineDash([]);
  }

  // screenBox
  // A device-pixel rectangle as the CSS-pixel box just outside it: one CSS
  // pixel past each edge, so a 2-pixel stroke centred on it clears the element.
  private screenBox(rect: Box): Box {
    return { x: rect.x * this.zoom - 1, y: rect.y * this.zoom - 1, width: rect.width * this.zoom + 2, height: rect.height * this.zoom + 2 };
  }

  // drawHatch
  // Diagonal lines across the element's box, clipped to it, and its outline:
  // the frame's pixels show through between the lines.
  private drawHatch(context: CanvasRenderingContext2D, box: Box): void {
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();
    context.setLineDash([]);
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 90, 95, 0.75)';
    context.beginPath();
    for (let offset = -box.height; offset < box.width; offset += HATCH_SPACING) {
      context.moveTo(box.x + offset, box.y + box.height);
      context.lineTo(box.x + offset + box.height, box.y);
    }
    context.stroke();
    context.restore();
    context.strokeStyle = OVERLAY_COLOUR.problem;
    context.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
  }

  // drawHandles
  // Eight handles — the corners and the edges' midpoints — the same size at
  // every zoom, so they stay grabbable at 1× and small at 8×.
  private drawHandles(context: CanvasRenderingContext2D, box: Box): void {
    const half = HANDLE_SIZE / 2;
    context.setLineDash([]);
    context.lineWidth = 1;
    context.fillStyle = '#ffffff';
    context.strokeStyle = OVERLAY_COLOUR.selection;
    for (const fx of [0, 0.5, 1]) {
      for (const fy of [0, 0.5, 1]) {
        if (fx === 0.5 && fy === 0.5) continue;
        const x = Math.round(box.x + fx * box.width - half);
        const y = Math.round(box.y + fy * box.height - half);
        context.fillRect(x, y, HANDLE_SIZE, HANDLE_SIZE);
        context.strokeRect(x + 0.5, y + 0.5, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
      }
    }
  }

  // drawBadge
  // The element's `x, y, w×h` in device pixels, above its top-left corner, or
  // below its bottom edge when there is no room above, kept inside the overlay.
  private drawBadge(
    context: CanvasRenderingContext2D,
    rect: OverlayRect,
    box: Box,
  ): void {
    const text = `${rect.x}, ${rect.y}, ${rect.width}×${rect.height}`;
    context.font = BADGE_FONT;
    const width = Math.ceil(context.measureText(text).width) + 8;
    const limitX = this.frame.width * this.zoom + OVERLAY_MARGIN - width;
    const limitY = this.frame.height * this.zoom + OVERLAY_MARGIN - BADGE_HEIGHT;
    const x = Math.max(-OVERLAY_MARGIN, Math.min(limitX, Math.round(box.x)));
    const above = Math.round(box.y) - BADGE_HEIGHT - HANDLE_SIZE / 2;
    const y = above >= -OVERLAY_MARGIN ? above : Math.min(limitY, Math.round(box.y + box.height + HANDLE_SIZE / 2));
    context.fillStyle = OVERLAY_COLOUR.selection;
    context.fillRect(x, y, width, BADGE_HEIGHT);
    context.fillStyle = '#ffffff';
    context.textBaseline = 'middle';
    context.fillText(text, x + 4, y + BADGE_HEIGHT / 2 + 0.5);
  }
}
