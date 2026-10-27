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
 *              nothing per frame. The overlay canvas is the zoomed size and
 *              carries what is drawn *about* the frame rather than in it: the
 *              selection highlight and the outlines of placeholder widgets.
 *
 * Exports:
 * - OverlayRect:  A rectangle to draw on the overlay, and how
 * - CanvasView:   The two canvases
 *
 *     - draw():        Blit a frame
 *     - setZoom():     Change the scale
 *     - setOverlay():  Replace what the overlay shows
 *     - setStale():    Dim the frame while the document has an error
 */

import { blitFrame } from './framebuffer';

/** A rectangle on the overlay, in device pixels. */
export interface OverlayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** `selection` is the element under the caret; `placeholder` a widget the Wasm cannot draw. */
  readonly kind: 'selection' | 'placeholder';
}

/** The overlay's colour for each kind. */
const OVERLAY_COLOUR: Readonly<Record<OverlayRect['kind'], string>> = {
  selection: '#4f8cff',
  placeholder: 'rgba(230, 180, 80, 0.7)',
};

/** The frame and overlay canvases of one canvas panel. */
export class CanvasView {
  private readonly frame: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private image: ImageData | undefined;
  private pixels: Uint32Array | undefined;
  private zoom = 4;
  private overlayRects: readonly OverlayRect[] = [];

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

  /** @brief Dims the frame: the last good one, shown while the document cannot render. */
  setStale(stale: boolean): void {
    this.container.classList.toggle('stale', stale);
  }

  // applyZoom
  // Scales the frame by CSS and resizes the overlay to match.
  private applyZoom(): void {
    const width = this.frame.width * this.zoom;
    const height = this.frame.height * this.zoom;
    this.frame.style.width = `${width}px`;
    this.frame.style.height = `${height}px`;
    this.overlay.width = width;
    this.overlay.height = height;
    this.overlay.style.width = `${width}px`;
    this.overlay.style.height = `${height}px`;
    this.drawOverlay();
  }

  // drawOverlay
  // Each rectangle outlined on the zoomed overlay. Lines sit on the pixel
  // boundary outside the element, so the outline never covers its pixels.
  private drawOverlay(): void {
    const context = this.overlay.getContext('2d');
    if (context === null) return;
    context.clearRect(0, 0, this.overlay.width, this.overlay.height);
    for (const rect of this.overlayRects) {
      context.strokeStyle = OVERLAY_COLOUR[rect.kind];
      context.lineWidth = rect.kind === 'selection' ? 2 : 1;
      context.setLineDash(rect.kind === 'placeholder' ? [3, 3] : []);
      context.strokeRect(rect.x * this.zoom - 1, rect.y * this.zoom - 1, rect.width * this.zoom + 2, rect.height * this.zoom + 2);
    }
  }
}
