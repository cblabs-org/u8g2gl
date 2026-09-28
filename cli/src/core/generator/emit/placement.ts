/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/placement.ts
 * Purpose: Converts between the two coordinate spaces the programme uses, in
 *          one place. The resolver settles every coordinate **relative to its
 *          container** — that is what §13.6 step 4 and §7.2 mean by resolving
 *          anchors and `#parent_*` "against the container's declared geometry",
 *          and it is how every bounds diagnostic is worded ("containing element
 *          is 100px wide (0..99)"). The runtime takes **absolute** device
 *          coordinates: `u8g2gl_obj::set_coords()` says so, and
 *          `u8g2gl_effective_clip()` intersects an object's bounds with its
 *          ancestors' as they are stored, which only means anything if both are
 *          in the same space. Emission is where one becomes the other.
 *
 *          It is a translation, not a second resolution: no expression is
 *          evaluated and no anchor re-solved. A container's own settled origin
 *          is added to each coordinate that is a *position*; sizes and radii
 *          are lengths and are left alone. Kept apart from the screen emitter so
 *          WO11's editor target, which needs the same absolute positions, calls
 *          the same function rather than growing a second copy.
 *
 *          **Bound positions are container-relative too** (§7.2, the [D-20]
 *          amendment of 2026-09-19): `bind_x="offset"` inside a container at
 *          x=40 puts the element at 40 + offset. A bound value is only known at
 *          run time, so the origin cannot be added here; instead this module
 *          says *which* origin a position binding carries, and the emitters
 *          spell it — added into a draw call's argument, or passed to the
 *          object's `bind_x(subject, origin)` / `bind_y(subject, origin)`.
 *
 * Description: `absoluteElement()` returns a copy of a resolved element with its
 *              position coordinates moved by an origin; `childOrigin()` gives the
 *              origin an element's own children are measured from;
 *              `boundPositionOrigin()` gives the origin a position binding adds
 *              at run time. A container whose position is not a build-time
 *              literal — bound through `bind_x`/`bind_y` ([D-20]) — has no
 *              absolute origin to add, and that is reported rather than guessed
 *              as zero.
 *
 * Exports:
 * - Origin:            An absolute device-pixel offset
 * - DISPLAY_ORIGIN:    The origin of a screen's top-level elements
 * - absoluteElement(): Move a resolved element's positions into device space
 * - childOrigin():     The origin an element's children are measured from
 * - POSITION_BINDINGS: The bindings that set a position, and their axes
 * - boundPositionOrigin(): The origin a position binding adds to its subject
 */

import {
  GEOMETRY_BINDINGS,
  isPositionBinding,
  type ResolvedCoordinate,
  type ResolvedElement,
  type ResolvedExtra,
} from '../../resolver/index.js';

/** An absolute offset in device pixels. */
export interface Origin {
  readonly x: number;
  readonly y: number;
}

/** A screen's top-level elements are measured from the display's own corner. */
export const DISPLAY_ORIGIN: Origin = { x: 0, y: 0 };

// shifted
// A resolved coordinate moved by `by`, keeping its provenance so a reader of the
// model can still see where the value came from.
function shifted(coordinate: ResolvedCoordinate | undefined, by: number): ResolvedCoordinate | undefined {
  return coordinate === undefined || by === 0 ? coordinate : { ...coordinate, value: coordinate.value + by };
}

// shiftedExtra
// An endpoint moves with the origin along its own axis; a radius or other length
// is a distance from a centre and does not move at all.
function shiftedExtra(extra: ResolvedExtra, origin: Origin): ResolvedExtra {
  if (extra.kind !== 'point' || extra.coordinate === undefined) {
    return extra;
  }
  const by = extra.axis === 'vertical' ? origin.y : origin.x;
  return { ...extra, coordinate: shifted(extra.coordinate, by) };
}

/**
 * The [D-20] bindings that set a **position**, and the axis each moves along.
 * `bind_width` and `bind_height` are absent: a size is a length, and moves with
 * nothing. Keyed by binding name, which is the same on an object's manifest
 * (`setter="bind_x"`) and a drawing element's (`setter="x"`), so the draw-call
 * argument, the object call and the editor's thunk all ask this one table.
 *
 * Derived from the resolver's `GEOMETRY_BINDINGS` rather than spelled here
 * (PR-04 WO11b, closing WO10b finding 2): the validator and the screen model
 * read the same table, so the three cannot disagree about which binding moves
 * an element.
 */
export const POSITION_BINDINGS: Readonly<Record<string, 'x' | 'y'>> = Object.fromEntries(
  GEOMETRY_BINDINGS.filter(isPositionBinding).map((entry) => [entry.binding, entry.attribute]),
);

/**
 * @brief The origin a binding adds to its subject's value, or undefined when it
 *        does not set a position.
 *
 * A bound position means what a literal one means: a place inside the
 * element's container (§7.2). The container's absolute corner is a build-time
 * constant, so the generator emits it as a literal and the runtime adds it —
 * 0 for an element directly on the screen.
 *
 * @param binding The binding's name, e.g. `bind_x`.
 * @param origin  The absolute corner of the element's container.
 * @return The origin along the binding's axis; undefined for any other binding.
 */
export function boundPositionOrigin(binding: string, origin: Origin): number | undefined {
  const axis = POSITION_BINDINGS[binding];
  return axis === undefined ? undefined : origin[axis];
}

/**
 * @brief A resolved element with its position coordinates in device space.
 *
 * `x`, `y` and every endpoint move by `origin`; `width`, `height` and radii do
 * not, because they are lengths. Children are left as they are — each is placed
 * against its own container's origin by the caller, which walks the tree.
 *
 * @param resolved The element as the resolver settled it, container-relative.
 * @param origin   The absolute position of its container's top-left corner.
 * @return A shallow copy in device coordinates; `resolved` itself is untouched.
 */
export function absoluteElement(resolved: ResolvedElement, origin: Origin): ResolvedElement {
  if (origin.x === 0 && origin.y === 0) {
    return resolved;
  }
  const geometry = { ...resolved.geometry };
  const x = shifted(resolved.geometry.x, origin.x);
  const y = shifted(resolved.geometry.y, origin.y);
  return {
    ...resolved,
    geometry: {
      ...geometry,
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
    },
    extras: resolved.extras.map((extra) => shiftedExtra(extra, origin)),
  };
}

/**
 * @brief The absolute origin an element's children are measured from.
 *
 * Its own absolute top-left corner. Only an object can contain anything —
 * `has_children` forces one (§13.5) — so this is always an object's corner.
 *
 * @param absolute The element already moved into device space by
 *                 {@link absoluteElement}.
 * @return Its corner, or `undefined` when `x` or `y` is not a build-time literal
 *         — a container positioned by a binding ([D-20]), whose children have
 *         no absolute position until the program runs.
 */
export function childOrigin(absolute: ResolvedElement): Origin | undefined {
  const x = absolute.geometry.x?.value;
  const y = absolute.geometry.y?.value;
  return x === undefined || y === undefined ? undefined : { x, y };
}
