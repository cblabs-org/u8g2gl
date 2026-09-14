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
 *              its parent's resolved size.
 *
 *              Composites are checked twice over, without saying anything twice.
 *              Each declared `<view>` is resolved as written, so a defect in its
 *              own text is reported once however often it is used. Screens are
 *              resolved after composite expansion (resolver/expand.ts), so a
 *              composite's top level measures against each instance's resolved
 *              size — the check PR-3R WO6 and PR-04 WO6 had to skip because the
 *              size was unknown until instantiation (PR-04 WO7). A diagnostic
 *              inside an instance names the instance, unless the template already
 *              raised it word for word. Also rejects anchor-positioned children of
 *              a container whose own geometry is bound ([D-20], §8.4), which
 *              would require reflow.
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
  expandScreens,
  findTargetDisplay,
  isCentringOn,
  resolveElements,
  walkExpanded,
  withInstantiation,
  type ExpandedElement,
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

// diagnosticKey
// A diagnostic's identity for "already said": the same fields finaliseDiagnostics
// deduplicates on.
function diagnosticKey(diagnostic: Diagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${diagnostic.message}`;
}

/** Receives a diagnostic raised at a resolved element. */
type ElementDiagnosticSink = (node: WidgetNode, diagnostic: Diagnostic) => void;

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
//   element — resolved element
//   axis    — names for this axis
//   limit   — container size along the axis (known)
//   emit    — receives each diagnostic with the element it is about
function checkAxisBounds(
  element: ResolvedElement,
  axis: BoundsAxis,
  limit: number,
  emit: ElementDiagnosticSink,
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
    emit(
      node,
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
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `Element '<${node.tag}>' extends to ${axis.start}=${start.value}, ${range}.`,
        start.provenance.loc ?? node.loc,
        sourceText(start),
      ),
    );
  } else if (farEdge > limit) {
    emit(
      node,
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
function checkBounds(elements: readonly ResolvedElement[], emit: ElementDiagnosticSink): void {
  for (const element of elements) {
    const { container } = element;
    if (container.width !== undefined) {
      checkAxisBounds(element, { start: 'x', size: 'width', extent: 'wide' }, container.width, emit);
    }
    if (container.height !== undefined) {
      checkAxisBounds(element, { start: 'y', size: 'height', extent: 'high' }, container.height, emit);
    }
    checkBounds(element.children, emit);
  }
}

// indexExpanded
// Each expanded node's element, for finding a resolved node's instantiation chain.
// A lookup only; nothing iterates it, so its order never reaches output.
function indexExpanded(elements: readonly ExpandedElement[]): Map<WidgetNode, ExpandedElement> {
  const index = new Map<WidgetNode, ExpandedElement>();
  walkExpanded(elements, (element) => index.set(element.node, element));
  return index;
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

  // --- Step 2: Composite templates, as declared ---
  // A defect in a template's own text — a malformed expression, an unknown
  // constant, over-constraint, a nested element overflowing a sized element
  // inside it — is reported here, once, whether the composite is used never or
  // many times. Its top level has no size until an instance gives it one, so
  // `#parent_*` there stays deferred; Step 3 checks it per instance.
  const templateReported = new Set<string>();
  const reportTemplate = (diagnostic: Diagnostic): void => {
    templateReported.add(diagnosticKey(diagnostic));
    diagnostics.push(diagnostic);
  };
  for (const composite of manifests.declaredComposites) {
    const container = { label: `composite '<${composite.name}>'` };
    const resolved = resolveElements(composite.view?.children ?? [], container, context);
    resolved.diagnostics.forEach(reportTemplate);
    checkBounds(resolved.elements, (_node, diagnostic) => reportTemplate(diagnostic));
  }

  // --- Step 3: Screens, every composite instance expanded ---
  // Expansion gives an instance its template as children, so `#parent_*` and
  // anchors inside it resolve against the instance's own resolved geometry
  // ([D-20], §13.6 step 4) and the bounds check reaches a composite's top level.
  // Expansion's own diagnostics are Pass 5's to report.
  const expansion = expandScreens({ globals, screens: screens ?? [], manifests });
  for (const screen of expansion.screens) {
    const origins = indexExpanded(screen.elements);
    // A screen element's diagnostic is reported as it is. One inside an instance
    // names the instance — unless the template already said exactly this, in
    // which case it is a fact about the template, not about this instance.
    const place = (node: WidgetNode, diagnostic: Diagnostic): Diagnostic | undefined => {
      const chain = origins.get(node)?.instantiation ?? [];
      if (chain.length === 0) {
        return diagnostic;
      }
      return templateReported.has(diagnosticKey(diagnostic)) ? undefined : withInstantiation(diagnostic, chain);
    };
    const resolved = resolveElements(
      screen.elements.map((element) => element.node),
      displayContainer(context),
      context,
      place,
    );
    diagnostics.push(...resolved.diagnostics);
    checkBounds(resolved.elements, (node, diagnostic) => {
      const kept = place(node, diagnostic);
      if (kept !== undefined) {
        diagnostics.push(kept);
      }
    });
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
