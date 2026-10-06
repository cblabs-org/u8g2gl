/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/configured-radius.ts
 * Purpose: The one answer to "which corner radius is this element configured
 *          with at init, and where did it come from" (§10), so the build-time
 *          radius bound is judged against the radius the firmware will apply
 *          whichever way the author wrote it.
 * Description: Four places can supply a radius. In order of precedence they
 *              are the element's own `radius` attribute, its inline
 *              `style_radius`, the last named style in scope that declares
 *              `radius`, and nothing. This is the order `styleLines()` and the
 *              INIT_STEPS sequence apply them in (cli/src/core/generator/emit/
 *              screen.ts): named styles in written order, later winning, then
 *              inline overrides, then the element's own attributes through
 *              their setters. Which names are in scope is `styleScope()`
 *              (validate-widget-props.ts); which attribute a style sets is
 *              `styleProperties()` (schema/globals.ts) — read here, never
 *              restated.
 *
 *              A style, named or inline, is applied through the element's own
 *              setter ([D-17]), so it reaches only a manifest whose `radius`
 *              prop has one; a `draw=` radius takes the attribute alone.
 *
 * Exports:
 * - RadiusSource:       Where a configured radius was written
 * - ConfiguredRadius:   The winning radius, its value if literal, and its location
 * - configuredRadius(): The radius an element is configured with at init
 */

import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode } from '../schema/widget-node.js';
import { namedStyles } from '../schema/widget-node.js';
import { styleProperties } from '../schema/globals.js';
import type { PropDef } from '../schema/widget-manifest.js';
import type { ResolvedElement } from '../resolver/index.js';
import type { StyleScope } from './validate-widget-props.js';

/** Where a configured radius was written. */
export type RadiusSource =
  | { readonly kind: 'attribute' }
  | { readonly kind: 'inline' }
  | { readonly kind: 'style'; readonly name: string };

/** The radius an element is configured with at init, and where it came from. */
export interface ConfiguredRadius {
  /** Which of the sources won. */
  readonly source: RadiusSource;
  /** The literal value; absent when the winning source is not a known integer. */
  readonly value?: number;
  /** Where the winning source is written. */
  readonly loc?: SourceLocation;
  /** The text to point at: the expression, the inline value, or the style name. */
  readonly text: string;
}

// namedStyleLoc
// Where a named style is referenced on an element: the `style` attribute, or the
// `<style>` child it came from. Follows namedStyles()'s order — the attribute
// first, then each non-empty child as written — so the index lines up.
//   node  — the element
//   index — the position in namedStyles(node)
function namedStyleLoc(node: WidgetNode, index: number): SourceLocation | undefined {
  const fromAttribute = typeof node.attributes.style === 'string' && node.attributes.style !== '' ? 1 : 0;
  if (index < fromAttribute) {
    return node.attributeLocs?.style ?? node.loc;
  }
  const children = node.children.filter((child) => 'kind' in child && child.kind === 'style' && child.name !== '');
  const child = children[index - fromAttribute];
  return (child !== undefined && 'loc' in child ? child.loc : undefined) ?? node.loc;
}

// configuredRadius
// The radius an element is configured with at init. Returns undefined when the
// manifest declares no `radius` or nothing supplies one. A source that wins but
// is not a known integer (an unresolved expression, a `$` reference) is returned
// without a `value`: it still hides the lower-precedence ones.
//   element — the resolved element
//   props   — the effective manifest's props
//   styles  — the named styles in scope for this element
export function configuredRadius(
  element: ResolvedElement,
  props: readonly PropDef[],
  styles: StyleScope,
): ConfiguredRadius | undefined {
  const { node } = element;
  const declared = props.find((prop) => prop.name === 'radius');
  if (declared === undefined) {
    return undefined;
  }

  // --- Step 1: The element's own attribute wins over every style ---
  const written = element.extras.find((extra) => extra.attribute === 'radius');
  if (written !== undefined) {
    const loc = written.coordinate?.provenance.loc ?? written.deferred?.loc ?? node.attributeLocs?.radius ?? node.loc;
    return {
      source: { kind: 'attribute' },
      ...(written.coordinate !== undefined ? { value: written.coordinate.value } : {}),
      ...(loc !== undefined ? { loc } : {}),
      text: String(node.attributes.radius ?? ''),
    };
  }

  // --- Step 2: A style reaches the element only through its setter ([D-17]) ---
  if (declared.setter === undefined) {
    return undefined;
  }

  // --- Step 3: The inline override beats every named style ---
  const inline = node.styleOverrides.radius;
  if (inline !== undefined) {
    const literal = /^\s*-?\d+\s*$/.test(inline) ? Number(inline) : undefined;
    const loc = node.attributeLocs?.style_radius ?? node.loc;
    return {
      source: { kind: 'inline' },
      ...(literal !== undefined ? { value: literal } : {}),
      ...(loc !== undefined ? { loc } : {}),
      text: inline,
    };
  }

  // --- Step 4: The last named style in scope that declares a radius ---
  let winner: ConfiguredRadius | undefined;
  namedStyles(node).forEach((name, index) => {
    const loc = namedStyleLoc(node, index);
    if (name.startsWith('$')) {
      // A reference a composite has not substituted: it may name any style, so
      // nothing before it can be said to win.
      winner = { source: { kind: 'style', name }, ...(loc !== undefined ? { loc } : {}), text: name };
      return;
    }
    const declaration = styles.get(name);
    const radius = declaration === undefined ? undefined : styleProperties(declaration).find((p) => p.attribute === 'radius');
    if (radius !== undefined && typeof radius.value === 'number') {
      winner = { source: { kind: 'style', name }, value: radius.value, ...(loc !== undefined ? { loc } : {}), text: name };
    }
  });
  return winner;
}
