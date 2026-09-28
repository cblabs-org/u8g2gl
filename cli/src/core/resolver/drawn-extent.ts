/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/drawn-extent.ts
 * Purpose: What an element actually draws, as a box of device pixels relative to
 *          its container — the Chief Architect's ruling 6 of 2026-09-19 (§7.2):
 *          an element that is not a rectangle is bounds-checked by what it
 *          draws. A pixel is a 1×1 box; a line the box around its endpoints; a
 *          triangle the box around its vertices; a circle or ellipse the box
 *          around the segments its `segments` bits select. Checking a partial
 *          arc against its whole circle would reject a quarter-circle at a
 *          display corner, where every pixel drawn is on the display.
 * Description: One function, `drawnExtent()`, and one data table,
 *              `SEGMENT_EXTENTS`, so the derivation exists once for the validator
 *              and anything else that needs it (the designer's selection box,
 *              later). Everything is read from the resolved model, never from a
 *              list of elements ([D-17]); per axis:
 *              - a start with a size (`x` with `width`) spans `start .. start+size-1`;
 *              - a start with a length spanning the axis (`x` with `radius`) is a
 *                centre, extending by the length on the sides the segments select;
 *              - a start with neither is one pixel (a pixel, or an hline's `y`);
 *              - every point on the axis (`x1`, `x2`, …) is included.
 *              An axis with anything written but not resolved to a literal has no
 *              extent: it is not known at build time, and whatever made it so is
 *              already a diagnostic (or a binding, known only at run time).
 *
 *              How U8G2 draws a quadrant is what the table encodes: its
 *              `u8g2_draw_circle_section` draws upper-right as `(x0 + x, y0 - y)`
 *              for `x, y` in `0..r` (`u8g2_circle.c`), so a quadrant includes the
 *              centre's own row and column and reaches `r` pixels on one side of
 *              each. Ellipses are drawn the same way with `rx` and `ry`.
 *
 * Exports:
 * - ExtentEdge:       One edge of an extent, and the attributes it came from
 * - AxisExtent:       The first and last pixel drawn along one axis (inclusive)
 * - DrawnExtent:      Both axes; either absent when not known at build time
 * - SEGMENT_EXTENTS:  Which sides of its centre each `segments` value draws on
 * - drawnExtent():    The box of pixels an element draws
 */

import type { EffectiveManifest } from '../manifest/manifest-registry.js';
import type { ResolvedCoordinate, ResolvedElement } from './resolve.js';

/** One edge of an extent: a pixel coordinate, and what it was derived from. */
export interface ExtentEdge {
  /** The coordinate, relative to the container, inclusive. */
  readonly value: number;
  /**
   * The resolved coordinates it came from, with their provenance: `[x, radius]`
   * for a circle's reach, `[x2]` for a line's endpoint, `[x, width]` for a span.
   */
  readonly from: readonly ResolvedCoordinate[];
}

/** The first and last pixel an element draws along one axis, inclusive. */
export interface AxisExtent {
  readonly min: ExtentEdge;
  readonly max: ExtentEdge;
}

/**
 * The box of pixels an element draws. An axis is absent when it is not known at
 * build time, or when the element draws nothing along it (a zero size).
 */
export interface DrawnExtent {
  readonly horizontal?: AxisExtent;
  readonly vertical?: AxisExtent;
}

/** How far a segment reaches from its centre, in units of the radius: `[before, after]`. */
type Reach = readonly [before: 0 | 1, after: 0 | 1];

/**
 * Which sides of its centre each `segments` value draws on (§6.2, `u8g2_circle.c`).
 * `before` is left or up, `after` right or down, in device coordinates where `y`
 * grows downward — so the upper quadrants reach up (`before`) and not down.
 *
 * These name the drawing contract of the `segments` attribute, not elements: the
 * values are the ones `u8g2gl_circle.xml` and `u8g2gl_ellipse.xml` declare, and
 * the runtime mirrors U8G2's option bits for them (`u8g2gl_draw_segment_t`).
 */
export const SEGMENT_EXTENTS: Readonly<Record<string, { readonly horizontal: Reach; readonly vertical: Reach }>> = {
  all: { horizontal: [1, 1], vertical: [1, 1] },
  upper_right: { horizontal: [0, 1], vertical: [1, 0] },
  upper_left: { horizontal: [1, 0], vertical: [1, 0] },
  lower_right: { horizontal: [0, 1], vertical: [0, 1] },
  lower_left: { horizontal: [1, 0], vertical: [0, 1] },
};

/** The attribute that selects the segments of an arc (§6.2). */
const SEGMENTS_ATTRIBUTE = 'segments';

/** One axis's attribute names, and which member of the rectangle they are. */
const AXES = [
  { name: 'horizontal', start: 'x', size: 'width' },
  { name: 'vertical', start: 'y', size: 'height' },
] as const;

// edge
// An extent edge at `value`, derived from the coordinates given.
function edge(value: number, from: readonly ResolvedCoordinate[]): ExtentEdge {
  return { value, from };
}

// widen
// The union of an extent so far and one more pixel range; the first edge wins a tie.
function widen(extent: AxisExtent | undefined, min: ExtentEdge, max: ExtentEdge): AxisExtent {
  if (extent === undefined) {
    return { min, max };
  }
  return {
    min: min.value < extent.min.value ? min : extent.min,
    max: max.value > extent.max.value ? max : extent.max,
  };
}

// segmentsOf
// The element's selected segments: as written, else the manifest's default, else
// every segment. Undefined when the value is not one the table knows — an invalid
// enum, which Pass 4 reports, or a `$prop` not yet substituted.
function segmentsOf(element: ResolvedElement, manifest: EffectiveManifest | undefined): string | undefined {
  const written = element.node.attributes[SEGMENTS_ATTRIBUTE];
  const declared = manifest?.api.props.find((prop) => prop.name === SEGMENTS_ATTRIBUTE)?.default;
  const value = typeof written === 'string' ? written : (declared ?? 'all');
  return SEGMENT_EXTENTS[value] !== undefined ? value : undefined;
}

/**
 * @brief The box of pixels an element draws, relative to its container (§7.2,
 *        ruling 6).
 *
 * @param element  The resolved element.
 * @param manifest Its effective manifest, for the `segments` default.
 * @return Each axis's first and last drawn pixel, with the attributes each edge
 *         came from; an axis is absent when it is not known at build time or
 *         nothing is drawn along it.
 */
export function drawnExtent(element: ResolvedElement, manifest: EffectiveManifest | undefined): DrawnExtent {
  const result: { horizontal?: AxisExtent; vertical?: AxisExtent } = {};

  for (const axis of AXES) {
    // --- Step 1: Anything written on this axis that did not resolve leaves it unknown ---
    const extras = element.extras.filter(
      (extra) => extra.axis === axis.name || (extra.spans?.includes(axis.name) ?? false),
    );
    if (extras.some((extra) => extra.coordinate === undefined) || element.axes[axis.name].deferred.length > 0) {
      continue;
    }

    let extent: AxisExtent | undefined;
    const start = element.geometry[axis.start];
    const size = element.geometry[axis.size];

    // --- Step 2: The start, as a span, a centre, or one pixel ---
    if (start !== undefined) {
      const lengths = extras.filter((extra) => extra.kind === 'length');
      if (size !== undefined) {
        if (size.value <= 0) {
          continue; // Nothing is drawn along a zero or negative size.
        }
        extent = widen(extent, edge(start.value, [start]), edge(start.value + size.value - 1, [start, size]));
      } else if (lengths.length > 0) {
        const segments = segmentsOf(element, manifest);
        if (segments === undefined) {
          continue;
        }
        const [before, after] = SEGMENT_EXTENTS[segments]?.[axis.name] ?? [1, 1];
        for (const length of lengths) {
          const radius = length.coordinate;
          if (radius === undefined || radius.value < 0) {
            // Step 1 left no unresolved length here; a negative one is reported
            // as such, and reaches nowhere.
            continue;
          }
          extent = widen(
            extent,
            edge(start.value - before * radius.value, before ? [start, radius] : [start]),
            edge(start.value + after * radius.value, after ? [start, radius] : [start]),
          );
        }
      } else {
        extent = widen(extent, edge(start.value, [start]), edge(start.value, [start]));
      }
    }

    // --- Step 3: Every point on this axis ---
    for (const extra of extras) {
      if (extra.kind === 'point' && extra.coordinate !== undefined) {
        const point = edge(extra.coordinate.value, [extra.coordinate]);
        extent = widen(extent, point, point);
      }
    }

    if (extent !== undefined) {
      result[axis.name] = extent;
    }
  }
  return result;
}
