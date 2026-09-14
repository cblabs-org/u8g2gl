/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-geometry.ts
 * Purpose: Pass 6 — Validates element geometry, layout anchor constraints,
 *          and containing-element bounding box limits (§7.2, §15.1, [D-20]).
 * Description: Runs the resolver (src/core/resolver/) — the same evaluator and
 *              anchor rules `generate` uses — against the project's first
 *              target, and reports what it raises: over-constrained anchors,
 *              malformed expressions, unknown or non-integer constants, division
 *              by zero and int32 overflow. It then checks every resolved element
 *              against its container: an element may not start before the
 *              container's origin, extend past its far edge, or resolve to a
 *              negative size. Per [D-20] the container is the display only for a
 *              screen's top-level elements; a nested element is checked against
 *              its parent's resolved size. A composite's own `<view>` top level
 *              has no container size until WO7 instantiates it, so it gets no
 *              absolute check; anything nested inside it still does. Also rejects
 *              anchor-positioned children of a container whose own geometry is
 *              bound ([D-20], §8.4), which would require reflow.
 *
 * Exports:
 * - validateGeometry(input): Runs Pass 6 geometry and bounding validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import {
  createResolverContext,
  displayContainer,
  findTargetDisplay,
  isCentringOn,
  resolveElements,
  type ResolvedCoordinate,
  type ResolvedElement,
} from '../resolver/index.js';
import type { ValidateInput } from './validate.js';

function createGeomDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
  };
}

// sourceText
// What a resolved coordinate was written as: its expression, or the attributes
// an anchor rule derived it from.
function sourceText(coordinate: ResolvedCoordinate): string {
  const { provenance } = coordinate;
  return provenance.kind === 'attribute' ? provenance.expression : provenance.from.join(', ');
}

/** One axis's names, for bounds messages. */
interface BoundsAxis {
  readonly start: 'x' | 'y';
  readonly size: 'width' | 'height';
  /** Container dimension adjective: "wide" or "high". */
  readonly extent: 'wide' | 'high';
}

// checkAxisBounds
// Checks one axis of one element against its container's size along that axis.
//   element     — resolved element
//   axis        — names for this axis
//   limit       — container size along the axis (known)
//   diagnostics — output
function checkAxisBounds(
  element: ResolvedElement,
  axis: BoundsAxis,
  limit: number,
  diagnostics: Diagnostic[],
): void {
  const { node, container, geometry } = element;
  const start = geometry[axis.start];
  const size = geometry[axis.size];
  if (start === undefined || size === undefined) {
    return;
  }
  const range = `${container.label} is ${limit}px ${axis.extent} (0..${limit - 1})`;

  // --- Step 1: A negative size — only an anchor rule or a negative expression gives one ---
  if (size.value < 0) {
    diagnostics.push(
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `Element '<${node.tag}>' resolves to ${axis.size}=${size.value}, which is negative; ${range}.`,
        size.provenance.loc ?? node.loc,
        sourceText(size),
      ),
    );
    return;
  }

  // --- Step 2: Starts before the container's origin, or ends past its far edge ---
  const farEdge = start.value + size.value;
  if (start.value < 0) {
    diagnostics.push(
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `Element '<${node.tag}>' extends to ${axis.start}=${start.value}, ${range}.`,
        start.provenance.loc ?? node.loc,
        sourceText(start),
      ),
    );
  } else if (farEdge > limit) {
    diagnostics.push(
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `Element '<${node.tag}>' extends to ${axis.start}=${farEdge}, ${range}.`,
        size.provenance.loc ?? start.provenance.loc ?? node.loc,
        sourceText(size),
      ),
    );
  }
}

// checkBounds
// Checks each resolved element against its own container, recursively. An axis
// whose container size, start or size did not resolve is not checked — an
// invalid expression has already been diagnosed, and a deferred one cannot be.
function checkBounds(elements: readonly ResolvedElement[], diagnostics: Diagnostic[]): void {
  for (const element of elements) {
    const { container } = element;
    if (container.width !== undefined) {
      checkAxisBounds(element, { start: 'x', size: 'width', extent: 'wide' }, container.width, diagnostics);
    }
    if (container.height !== undefined) {
      checkAxisBounds(element, { start: 'y', size: 'height', extent: 'high' }, container.height, diagnostics);
    }
    checkBounds(element.children, diagnostics);
  }
}

/**
 * Geometry binding attributes ([D-20]) and the anchor attributes (§7.2) that
 * resolve against a container at build time. These name the layout contract,
 * not elements, so they are not element knowledge in [D-17]'s sense.
 */
const GEOMETRY_BINDINGS: readonly string[] = ['bind_x', 'bind_y', 'bind_width', 'bind_height'];
const ANCHOR_ATTRIBUTES: readonly string[] = ['right', 'bottom', 'hcenter', 'vcenter'];

// anchorOf
// The first anchor attribute positioning a node, or undefined. `hcenter` and
// `vcenter` are boolean switches, decided by the resolver's own predicate.
//   node — the candidate child
function anchorOf(node: WidgetNode): string | undefined {
  return ANCHOR_ATTRIBUTES.find((attr) => {
    const value = node.attributes[attr];
    if (attr === 'hcenter' || attr === 'vcenter') {
      return isCentringOn(value);
    }
    return value !== undefined;
  });
}

// checkBoundContainers
// [D-20]: a container whose own geometry is bound may not have anchor-positioned
// children, because anchors resolve once at build time and re-resolving them on
// every binding change would be reflow. A container's children are its nested
// elements and, for a composite instance, the top-level elements of its <view>.
//   nodes       — the elements to check, recursively
//   manifests   — registry, to find a composite instance's <view>
//   diagnostics — output
function checkBoundContainers(
  nodes: readonly WidgetNodeChild[],
  manifests: ValidateInput['manifests'],
  diagnostics: Diagnostic[],
): void {
  for (const child of nodes) {
    if (!('tag' in child) || typeof child.tag !== 'string') {
      continue;
    }
    const node: WidgetNode = child;
    const boundAttr = GEOMETRY_BINDINGS.find((attr) => node.attributes[attr] !== undefined);

    if (boundAttr !== undefined) {
      const nested = node.children.filter((c): c is WidgetNode => 'tag' in c);
      const templated = (manifests.get(node.tag)?.view?.children ?? []).filter(
        (c): c is WidgetNode => 'tag' in c,
      );
      for (const inner of [...nested, ...templated]) {
        const anchor = anchorOf(inner);
        if (anchor === undefined) {
          continue;
        }
        const containerName = node.attributes.name || node.tag;
        const childName = inner.attributes.name || inner.tag;
        diagnostics.push(
          createGeomDiagnostic(
            DIAGNOSTIC_CODES.BOUND_GEOMETRY_ANCHORED_CHILD,
            `Container '${containerName}' <${node.tag}> binds its geometry with '${boundAttr}', ` +
              `so child '${childName}' <${inner.tag}> may not be anchor-positioned with '${anchor}'. ` +
              `Anchors resolve at build time and are not re-resolved when a binding changes ([D-20]); ` +
              `use absolute coordinates.`,
            inner.attributeLocs?.[anchor] ?? inner.loc,
            anchor,
          ),
        );
      }
    }

    checkBoundContainers(node.children, manifests, diagnostics);
  }
}

/**
 * Validates layout geometry constraints and containing-element boundary limits.
 */
export function validateGeometry(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { project, globals, screens, catalogue, manifests } = input;

  // --- Step 1: Resolve against the first target's display, as `validate` always has ---
  // Without a catalogue record the display has no size: `#screen_*` stay
  // deferred and screen-level bounds go unchecked, rather than guessed.
  const display = findTargetDisplay(project?.targets?.[0], catalogue ?? []);
  const context = createResolverContext(globals, manifests, display);

  // --- Step 2: Screens — top-level elements measure against the display ([D-20]) ---
  for (const screen of screens ?? []) {
    const resolved = resolveElements(screen.view?.children ?? [], displayContainer(context), context);
    diagnostics.push(...resolved.diagnostics);
    checkBounds(resolved.elements, diagnostics);
  }

  // --- Step 3: Composite templates — the top level has no size until WO7 ---
  // A composite is instantiated at whatever size its caller gives it, which this
  // manifest does not know, so `#parent_*` at its top level stay deferred and
  // those elements get no absolute check. Anything nested inside one of them
  // still measures against that element's resolved size, exactly as in a screen.
  for (const composite of manifests.declaredComposites) {
    const container = { label: `composite '<${composite.name}>'` };
    const resolved = resolveElements(composite.view?.children ?? [], container, context);
    diagnostics.push(...resolved.diagnostics);
    checkBounds(resolved.elements, diagnostics);
  }

  // --- Step 4: [D-20] bound-geometry containers, in screens and in composite templates ---
  for (const screen of screens ?? []) {
    checkBoundContainers(screen.view?.children ?? [], manifests, diagnostics);
  }
  for (const composite of manifests.declaredComposites) {
    checkBoundContainers(composite.view?.children ?? [], manifests, diagnostics);
  }

  return diagnostics;
}
