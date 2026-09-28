/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/geometry-bindings.ts
 * Purpose: [D-20]'s four geometry bindings, stated once. `x`, `y`, `width` and
 *          `height` bind like any other property (§8.4), and three places need to
 *          know which binding supplies which coordinate: the validator (a bound
 *          coordinate satisfies §7.2's "fully positioned" rule, and a container
 *          whose position is bound may have no children), the screen model (an
 *          object's rectangle passes a bound axis as 0), and placement (a bound
 *          *position* is container-relative, so it carries its container's
 *          origin). Until PR-04 WO11b each spelled the set itself (WO10b
 *          finding 2): `GEOMETRY_BINDINGS` in the validator, `` `bind_${axis}` ``
 *          in `screen-model.ts`, and `POSITION_BINDINGS` in `placement.ts`.
 * Description: One data table. Like §7.2's axis names and the anchors, these name
 *              the **layout contract**, not elements, so they are not element
 *              knowledge in [D-17]'s sense: which elements declare a `bind_x` is
 *              read from each manifest, exactly as which declare an `x` is. A
 *              binding's name is the same on an object's manifest
 *              (`setter="bind_x"`) and a drawing element's (`setter="x"`), so the
 *              name is the key. Isomorphic.
 *
 * Exports:
 * - GeometryAttribute:      `x`, `y`, `width` or `height`
 * - GeometryBinding:        One binding, the coordinate it supplies, and what kind
 * - PositionBinding:        A geometry binding that moves its element
 * - GEOMETRY_BINDINGS:      The four, in the rectangle's own order
 * - geometryBindingNamed(): The binding of a given name, if it is one of the four
 * - geometryBindingFor():   The binding that supplies a given coordinate
 * - isPositionBinding():    Whether a binding moves its element
 * - boundGeometryOf():      The first geometry binding an element writes
 */

import type { WidgetNode } from '../schema/widget-node.js';

/** A coordinate of §7.2's rectangle. */
export type GeometryAttribute = 'x' | 'y' | 'width' | 'height';

/**
 * One [D-20] geometry binding. `position` moves the element and is relative to
 * its container (§7.2), so it carries the container's origin at run time;
 * `size` is a length and moves with nothing.
 */
export type GeometryBinding =
  | {
      /** The binding attribute as written: `bind_x`. */
      readonly binding: string;
      readonly kind: 'position';
      /** The coordinate it supplies. */
      readonly attribute: 'x' | 'y';
      /** The axis it lies on. */
      readonly axis: 'horizontal' | 'vertical';
    }
  | {
      readonly binding: string;
      readonly kind: 'size';
      readonly attribute: 'width' | 'height';
      readonly axis: 'horizontal' | 'vertical';
    };

/** A geometry binding that moves its element. */
export type PositionBinding = Extract<GeometryBinding, { readonly kind: 'position' }>;

/** The four geometry bindings, in `set_coords` order (§7.2, [D-20]). */
export const GEOMETRY_BINDINGS: readonly GeometryBinding[] = [
  { binding: 'bind_x', attribute: 'x', axis: 'horizontal', kind: 'position' },
  { binding: 'bind_y', attribute: 'y', axis: 'vertical', kind: 'position' },
  { binding: 'bind_width', attribute: 'width', axis: 'horizontal', kind: 'size' },
  { binding: 'bind_height', attribute: 'height', axis: 'vertical', kind: 'size' },
];

/**
 * @brief The geometry binding of a given name.
 *
 * @param name A binding attribute, e.g. `bind_x` or `bind_text`.
 * @return Its entry, or undefined when it is not one of [D-20]'s four.
 */
export function geometryBindingNamed(name: string): GeometryBinding | undefined {
  return GEOMETRY_BINDINGS.find((entry) => entry.binding === name);
}

/**
 * @brief The binding that supplies a coordinate.
 *
 * @param attribute `x`, `y`, `width` or `height`.
 * @return Its entry; every coordinate of the rectangle has exactly one.
 */
export function geometryBindingFor(attribute: GeometryAttribute): GeometryBinding {
  const entry = GEOMETRY_BINDINGS.find((candidate) => candidate.attribute === attribute);
  if (entry === undefined) {
    throw new Error(`No geometry binding supplies '${attribute}'; GEOMETRY_BINDINGS names one per coordinate.`);
  }
  return entry;
}

/**
 * @brief Whether a geometry binding moves its element (a type guard).
 *
 * @param entry A geometry binding.
 * @return True for `bind_x` and `bind_y`.
 */
export function isPositionBinding(entry: GeometryBinding): entry is PositionBinding {
  return entry.kind === 'position';
}

/**
 * @brief The first geometry binding an element writes, of the kinds asked for.
 *
 * Reads the attribute as written; whether the element's manifest declares the
 * binding is Pass 4's to judge, and whether its subject exists is Pass 2's.
 *
 * @param node  The element.
 * @param kinds Which kinds count; both by default.
 * @return The binding, or undefined when the element binds no such coordinate.
 */
export function boundGeometryOf(
  node: WidgetNode,
  kinds: readonly GeometryBinding['kind'][] = ['position', 'size'],
): GeometryBinding | undefined {
  return GEOMETRY_BINDINGS.find(
    (entry) => kinds.includes(entry.kind) && node.attributes[entry.binding] !== undefined,
  );
}
