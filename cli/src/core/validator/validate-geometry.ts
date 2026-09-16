/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-geometry.ts
 * Purpose: Pass 6 — holds every element to §7.2's geometry contract and §13.2's
 *          coordinate type: nothing reaches emission with an absent, wrapped or
 *          guessed coordinate. Generated code carries no layout ([D-7]), so an
 *          element this pass lets through with an unresolved `x`, or an `x` that
 *          does not fit `int16_t`, would be emitted wrong with nothing to catch it.
 * Description: Runs the resolver (src/core/resolver/) — the same evaluator and
 *              anchor rules `generate` uses — against one target: the one being
 *              generated (`input.target`), or the project's first. It reports what
 *              the resolver raises (over-constrained anchors, malformed
 *              expressions, unknown or non-integer constants, division by zero,
 *              int32 overflow), then, for every element:
 *              1. Fully positioned (§7.2): where the manifest declares `x` / `y`,
 *                 it must resolve — an under-determined axis (`width` with neither
 *                 `x` nor `right`), a `$prop` that never substitutes, a
 *                 `#parent_*` or anchor whose container has no size, is
 *                 `U8G2GL_UNRESOLVED_GEOMETRY`. A written size must resolve too.
 *              2. Fits `int16_t` (§13.2): a resolved x, y, width or height outside
 *                 it is `U8G2GL_COORDINATE_OUT_OF_RANGE` — checked first, and an
 *                 axis that fails it is not bounds-checked.
 *              3. Inside its container ([D-20]): an element may not start before
 *                 the container's origin, extend past its far edge, or resolve to
 *                 a negative size. The container is the display for a screen's
 *                 top level, otherwise the parent's resolved size.
 *              With no catalogue record for the target the display has no size:
 *              `#screen_*` and anchors against it stay unresolved without a
 *              diagnostic (Pass 3 reports the display), rather than guessed.
 *
 *              Once, never twice. Each composite's `<view>` is resolved as
 *              declared; screens are resolved after composite expansion
 *              (resolver/expand.ts), so a composite's interior measures against
 *              each instance. For checks 1 and 2 each axis of each template
 *              element is judged in exactly one place: in the template when
 *              nothing on that axis depends on an instance — no `$` in its
 *              attributes, nothing deferred, no anchor needing the (unknown)
 *              top-level size — and otherwise on the expanded tree, per instance,
 *              naming it. So a template defect is reported once, however often the
 *              composite is used. Resolver diagnostics and bounds keep WO7's rule:
 *              one inside an instance names the instance unless the template
 *              already raised it word for word.
 *
 *              The [D-20] bound-geometry rule — a container whose own geometry is
 *              bound may not have anchor-positioned children, which would require
 *              reflow — runs on the expanded tree, so it sees through nested
 *              composites (PR-04 WO7 F7). A pair fixed by a template is reported
 *              once; a pair that depends on an instance names it.
 *
 * Exports:
 * - validateGeometry(input): Runs Pass 6 geometry and bounding validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode } from '../schema/widget-node.js';
import {
  INT16_MAX,
  INT16_MIN,
  isCentringOn,
  isRectangular,
  resolveElements,
  withInstantiation,
  type AxisOutcome,
  type DeferredCoordinate,
  type ExpandedElement,
  type ResolvedCoordinate,
  type ResolvedElement,
  type ResolverContext,
} from '../resolver/index.js';
import type { ValidateInput } from './validate.js';
import { pipelineOf } from './shared-model.js';

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

/**
 * One axis's attribute names (§7.2). These name the layout contract, not
 * elements, so they are not element knowledge in [D-17]'s sense.
 */
interface GeometryAxis {
  readonly name: 'horizontal' | 'vertical';
  readonly start: 'x' | 'y';
  readonly size: 'width' | 'height';
  readonly end: 'right' | 'bottom';
  readonly centre: 'hcenter' | 'vcenter';
  /** Container dimension adjective: "wide" or "high". */
  readonly extent: 'wide' | 'high';
}

const AXES: readonly GeometryAxis[] = [
  { name: 'horizontal', start: 'x', size: 'width', end: 'right', centre: 'hcenter', extent: 'wide' },
  { name: 'vertical', start: 'y', size: 'height', end: 'bottom', centre: 'vcenter', extent: 'high' },
];

// sourceText
// What a resolved coordinate was written as: its expression, or the attributes
// an anchor rule derived it from.
function sourceText(coordinate: ResolvedCoordinate): string {
  const { provenance } = coordinate;
  return provenance.kind === 'attribute' ? provenance.expression : provenance.from.join(', ');
}

// describeNode
// "<u8g2gl_label> 'title'", or "<u8g2gl_label>" when unnamed.
function describeNode(node: WidgetNode): string {
  const name = node.attributes.name;
  return typeof name === 'string' && name !== '' ? `<${node.tag}> '${name}'` : `<${node.tag}>`;
}

// ---------------------------------------------------------------------------
// Which axes a template settles
// ---------------------------------------------------------------------------

// isWritten
// Whether a node carries an attribute as text.
function isWritten(node: WidgetNode, attribute: string): boolean {
  return typeof node.attributes[attribute] === 'string';
}

// settledInTemplate
// Whether one axis of an element in a composite's `<view>`, resolved as
// declared, comes out the same in every instance — so checks 1 and 2 judge it
// there, once. Anything an instance can change keeps it for the expanded tree: a
// `$` in the axis's attributes, a deferred value, or an anchor needing a
// container size the template does not know.
//   node    — the template element as declared
//   axis    — the axis
//   outcome — the resolver's outcome for that axis
function settledInTemplate(node: WidgetNode, axis: GeometryAxis, outcome: AxisOutcome): boolean {
  const attributes = [axis.start, axis.size, axis.end, axis.centre];
  if (attributes.some((attribute) => String(node.attributes[attribute] ?? '').includes('$'))) {
    return false;
  }
  if (outcome.deferred.length > 0) {
    return false;
  }
  const usesContainer = isWritten(node, axis.end) || isCentringOn(node.attributes[axis.centre]);
  return outcome.containerKnown || !usesContainer;
}

// ---------------------------------------------------------------------------
// Check 1 — fully positioned (§7.2)
// ---------------------------------------------------------------------------

// deferralReason
// Prose for why a written coordinate has no value.
//   deferred — the deferred attribute
//   element  — the element it is on
function deferralReason(deferred: DeferredCoordinate, element: ResolvedElement, axis?: GeometryAxis): string {
  const reasons = deferred.symbols.map((symbol) => {
    if (symbol.startsWith('$')) {
      return `'${symbol}' is never substituted — a $prop has a value only inside a composite's <view>`;
    }
    if (symbol.startsWith('#parent_')) {
      return `'${symbol}' has no value, because ${element.container.label} has no resolved ${symbol.slice('#parent_'.length)}`;
    }
    return `'${symbol}' has no value for this target`;
  });
  return reasons.length > 0
    ? reasons.join('; ')
    : `it depends on the container's ${axis?.size ?? 'size'}, which is unknown`;
}

// underDetermination
// Prose for an axis whose start cannot be worked out from what is written.
function underDetermination(node: WidgetNode, axis: GeometryAxis, reads: (attribute: string) => boolean): string {
  const size = reads(axis.size);
  const end = reads(axis.end);
  if (isCentringOn(node.attributes[axis.centre]) && !size) {
    return `'${axis.centre}' centres only an element with a '${axis.size}'`;
  }
  if (size && !end) {
    return `it has '${axis.size}' but neither '${axis.start}' nor '${axis.end}'`;
  }
  if (end && !size) {
    return `it has '${axis.end}' but no '${axis.size}'`;
  }
  return `it has none of '${axis.start}', '${axis.end}' or '${axis.centre}'`;
}

// checkPositioned
// Check 1 for one axis of one element: where the manifest declares the axis's
// start, the element must end up with one, and every coordinate written on the
// axis must resolve. Never a silent absence (§7.2).
//   element        — the resolved element
//   axis           — the axis
//   context        — resolution context: manifests, display
//   templateSourced — whether the element was copied from a composite's `<view>`;
//                    its `$` deferrals are then expansion's to report
//   emit           — receives each diagnostic
function checkPositioned(
  element: ResolvedElement,
  axis: GeometryAxis,
  context: ResolverContext,
  templateSourced: boolean,
  emit: ElementDiagnosticSink,
): void {
  const { node, geometry } = element;
  const manifest = context.manifests.get(node.tag);
  const props = manifest?.api.props ?? [];
  const outcome = element.axes[axis.name];

  // --- Step 1: Only an element declaring this axis's start, and not already diagnosed ---
  if (!props.some((prop) => prop.name === axis.start) || outcome.diagnosed) {
    return;
  }
  const displayKnown = context.display[axis.size] !== undefined;

  // --- Step 2: Every written coordinate that never resolved ---
  // A `$` left in a copied template was expansion's error (UNKNOWN_PROP,
  // UNSUBSTITUTED_PROP); a built-in with no display is Pass 3's. Either way
  // something already stands against this axis, so nothing more is inferred.
  let accounted = false;
  for (const deferred of outcome.deferred) {
    accounted = true;
    const placeholder = deferred.symbols.some((symbol) => symbol.startsWith('$'));
    if ((templateSourced && placeholder) || (!displayKnown && !placeholder)) {
      continue;
    }
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY,
        `'${deferred.attribute}' on ${describeNode(node)} cannot be resolved: ${deferralReason(deferred, element, axis)}. ` +
          `Every element must end up fully positioned (§7.2).`,
        deferred.loc ?? node.loc,
        deferred.expression,
      ),
    );
  }
  if (accounted || geometry[axis.start] !== undefined) {
    return;
  }

  // --- Step 3: No start — an anchor with no container size to measure, or too little written ---
  const rectangular = isRectangular(manifest);
  const reads = (attribute: string): boolean =>
    isWritten(node, attribute) &&
    (attribute === axis.end ? rectangular : props.some((prop) => prop.name === attribute));
  const anchor = reads(axis.end) ? axis.end : rectangular && isCentringOn(node.attributes[axis.centre]) ? axis.centre : undefined;
  if (anchor !== undefined && !outcome.containerKnown) {
    if (!displayKnown) {
      return;
    }
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY,
        `'${axis.start}' on ${describeNode(node)} cannot be derived from '${anchor}': ${element.container.label} ` +
          `has no resolved ${axis.size} to measure against. Every element must end up fully positioned (§7.2).`,
        node.attributeLocs?.[anchor] ?? node.loc,
        anchor,
      ),
    );
    return;
  }
  emit(
    node,
    createGeomDiagnostic(
      DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY,
      `${describeNode(node)} is not fully positioned: '${axis.start}' cannot be worked out — ` +
        `${underDetermination(node, axis, reads)}. Give '${axis.start}', or '${axis.end}' with '${axis.size}' (§7.2).`,
      node.attributeLocs?.[axis.size] ?? node.attributeLocs?.[axis.end] ?? node.loc,
      axis.start,
    ),
  );
}

// ---------------------------------------------------------------------------
// Check 2 — fits int16_t (§13.2)
// ---------------------------------------------------------------------------

// outOfInt16
// The axis's resolved start and size that do not fit `int16_t`.
function outOfInt16(element: ResolvedElement, axis: GeometryAxis): { member: string; coordinate: ResolvedCoordinate }[] {
  const failures: { member: string; coordinate: ResolvedCoordinate }[] = [];
  for (const member of [axis.start, axis.size]) {
    const coordinate = element.geometry[member];
    if (coordinate !== undefined && (coordinate.value < INT16_MIN || coordinate.value > INT16_MAX)) {
      failures.push({ member, coordinate });
    }
  }
  return failures;
}

// checkRepresentable
// Check 2 for one axis: reports each coordinate outside `int16_t`.
// Returns whether the axis fits, so bounds are not checked on a value that
// cannot be stored at all.
function checkRepresentable(element: ResolvedElement, axis: GeometryAxis, emit: ElementDiagnosticSink): boolean {
  const failures = outOfInt16(element, axis);
  for (const { member, coordinate } of failures) {
    emit(
      element.node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE,
        `${describeNode(element.node)} resolves to ${member}=${coordinate.value}, outside the int16_t range ` +
          `(${INT16_MIN}..${INT16_MAX}) coordinates are stored in (§13.2).`,
        coordinate.provenance.loc ?? element.node.loc,
        sourceText(coordinate),
      ),
    );
  }
  return failures.length === 0;
}

// ---------------------------------------------------------------------------
// Check 3 — inside the container ([D-20])
// ---------------------------------------------------------------------------

// checkAxisBounds
// Checks one axis of one element against its container's size along that axis.
//   element — resolved element
//   axis    — names for this axis
//   limit   — container size along the axis (known)
//   emit    — receives each diagnostic with the element it is about
function checkAxisBounds(
  element: ResolvedElement,
  axis: GeometryAxis,
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

// ---------------------------------------------------------------------------
// Endpoints and radii — the coordinates outside the rectangle (§6.2)
// ---------------------------------------------------------------------------

// checkExtras
// Checks 1, 2 and 3 for each endpoint and radius the resolver settled. Before
// PR-04 WO8a none of these was resolved at all (WO7b finding 2): an expression
// in `x1` never evaluated, and a value outside the display or outside `int16_t`
// reached emission unremarked, which WO9/WO10 cannot emit a draw call from.
//
// A point is held to its container exactly as `x` is. A length (a radius) is
// checked for representability and for being non-negative, but not against the
// container: what a radius should be measured against needs the
// centre-positioned-element semantics §7.2 defers (WO6 finding 8).
//   element         — the resolved element
//   context         — resolution context, for the display
//   templateSourced — whether the element was copied from a composite's `<view>`
//   emit            — receives each diagnostic
function checkExtras(
  element: ResolvedElement,
  context: ResolverContext,
  templateSourced: boolean,
  emit: ElementDiagnosticSink,
): void {
  const { node } = element;
  // The catalogue record supplies both sizes or neither, so either answers
  // "is there a display?" — the deferral a missing record causes is Pass 3's.
  const displayKnown = context.display.width !== undefined;

  for (const extra of element.extras) {
    // --- Step 1: Written, but never resolved (§7.2) ---
    const { deferred } = extra;
    if (deferred !== undefined) {
      const placeholder = deferred.symbols.some((symbol) => symbol.startsWith('$'));
      if ((templateSourced && placeholder) || (!displayKnown && !placeholder)) {
        continue;
      }
      emit(
        node,
        createGeomDiagnostic(
          DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY,
          `'${deferred.attribute}' on ${describeNode(node)} cannot be resolved: ${deferralReason(deferred, element)}. ` +
            `Every coordinate must resolve to a literal before emission (§7.2, §13.2).`,
          deferred.loc ?? node.loc,
          deferred.expression,
        ),
      );
      continue;
    }
    const { coordinate } = extra;
    if (coordinate === undefined) {
      continue; // The expression was invalid; the evaluator has already said why.
    }

    // --- Step 2: Representable as a stored coordinate (§13.2) ---
    if (coordinate.value < INT16_MIN || coordinate.value > INT16_MAX) {
      emit(
        node,
        createGeomDiagnostic(
          DIAGNOSTIC_CODES.COORDINATE_OUT_OF_RANGE,
          `${describeNode(node)} resolves to ${extra.attribute}=${coordinate.value}, outside the int16_t range ` +
            `(${INT16_MIN}..${INT16_MAX}) coordinates are stored in (§13.2).`,
          coordinate.provenance.loc ?? node.loc,
          sourceText(coordinate),
        ),
      );
      continue; // A value that cannot be stored is not then measured.
    }

    // --- Step 3: A length is non-negative; a point lies inside its container ---
    if (extra.kind === 'length') {
      if (coordinate.value < 0) {
        emit(
          node,
          createGeomDiagnostic(
            DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
            `Element '<${node.tag}>' resolves to ${extra.attribute}=${coordinate.value}, which is negative.`,
            coordinate.provenance.loc ?? node.loc,
            sourceText(coordinate),
          ),
        );
      }
      continue;
    }
    const axis = AXES.find((candidate) => candidate.name === extra.axis);
    if (axis === undefined) {
      continue;
    }
    const limit = element.container[axis.size];
    if (limit === undefined) {
      continue;
    }
    if (coordinate.value < 0 || coordinate.value > limit - 1) {
      emit(
        node,
        createGeomDiagnostic(
          DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
          `Element '<${node.tag}>' has ${extra.attribute}=${coordinate.value}, but ${element.container.label} ` +
            `is ${limit}px ${axis.extent} (0..${limit - 1}).`,
          coordinate.provenance.loc ?? node.loc,
          sourceText(coordinate),
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The per-element walk
// ---------------------------------------------------------------------------

/** How one walk decides which elements and axes it judges. */
interface WalkRules {
  /** Whether this walk judges checks 1 and 2 for the axis — the other walk does otherwise. */
  readonly judges: (element: ResolvedElement, axis: GeometryAxis) => boolean;
  /** Whether the element was copied from a composite's `<view>`. */
  readonly templateSourced: (element: ResolvedElement) => boolean;
}

// checkElements
// Checks 1, 2 and 3 on each resolved element, recursively. An axis whose
// coordinates do not fit int16_t is not bounds-checked, whichever walk judged it.
function checkElements(
  elements: readonly ResolvedElement[],
  rules: WalkRules,
  context: ResolverContext,
  emit: ElementDiagnosticSink,
): void {
  for (const element of elements) {
    for (const axis of AXES) {
      let representable: boolean;
      if (rules.judges(element, axis)) {
        checkPositioned(element, axis, context, rules.templateSourced(element), emit);
        representable = checkRepresentable(element, axis, emit);
      } else {
        representable = outOfInt16(element, axis).length === 0;
      }
      const limit = element.container[axis.size];
      if (representable && limit !== undefined) {
        checkAxisBounds(element, axis, limit, emit);
      }
    }
    checkExtras(element, context, rules.templateSourced(element), emit);
    checkElements(element.children, rules, context, emit);
  }
}

// walkResolved
// Visits resolved elements depth-first in document order.
function walkResolved(elements: readonly ResolvedElement[], visit: (element: ResolvedElement) => void): void {
  for (const element of elements) {
    visit(element);
    walkResolved(element.children, visit);
  }
}

// ---------------------------------------------------------------------------
// [D-20] bound-geometry containers, on the expanded tree
// ---------------------------------------------------------------------------

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

// hasPlaceholder
// Whether an attribute as written carries a `$`-reference.
function hasPlaceholder(node: WidgetNode, attribute: string): boolean {
  return String(node.attributes[attribute] ?? '').includes('$');
}

// checkBoundContainers
// [D-20]: a container whose own geometry is bound may not have anchor-positioned
// children, because anchors resolve once at build time and re-resolving them on
// every binding change would be reflow. Walks the expanded tree, so a container's
// children include its composite template at any depth (PR-04 WO7 F7).
//   elements    — expanded elements, recursively
//   diagnostics — output
//   fixedPairs  — (container source, child source) pairs already reported
function checkBoundContainers(
  elements: readonly ExpandedElement[],
  diagnostics: Diagnostic[],
  fixedPairs: Map<WidgetNode, Set<WidgetNode>>,
): void {
  for (const container of elements) {
    const boundAttr = GEOMETRY_BINDINGS.find((attr) => container.node.attributes[attr] !== undefined);

    if (boundAttr !== undefined) {
      for (const child of container.children) {
        const anchor = anchorOf(child.node);
        if (anchor === undefined) {
          continue;
        }
        // A container written inside a template, binding and anchoring from
        // literals, is the same in every instance: the template's defect, once.
        const fixed =
          container.instantiation.length > 0 &&
          !hasPlaceholder(container.source, boundAttr) &&
          !hasPlaceholder(child.source, anchor);
        if (fixed) {
          const seen = fixedPairs.get(container.source) ?? new Set<WidgetNode>();
          if (seen.has(child.source)) {
            continue;
          }
          seen.add(child.source);
          fixedPairs.set(container.source, seen);
        }
        const containerName = container.node.attributes.name || container.node.tag;
        const childName = child.node.attributes.name || child.node.tag;
        const diagnostic = createGeomDiagnostic(
          DIAGNOSTIC_CODES.BOUND_GEOMETRY_ANCHORED_CHILD,
          `Container '${containerName}' <${container.node.tag}> binds its geometry with '${boundAttr}', ` +
            `so child '${childName}' <${child.node.tag}> may not be anchor-positioned with '${anchor}'. ` +
            `Anchors resolve at build time and are not re-resolved when a binding changes ([D-20]); ` +
            `use absolute coordinates.`,
          child.node.attributeLocs?.[anchor] ?? child.node.loc,
          anchor,
        );
        diagnostics.push(fixed ? diagnostic : withInstantiation(diagnostic, child.instantiation));
      }
    }

    checkBoundContainers(container.children, diagnostics, fixedPairs);
  }
}

/**
 * Validates layout geometry: positioning, int16_t representability and
 * containing-element bounds, against `checkedTarget(input)`.
 */
export function validateGeometry(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { manifests } = input;

  // --- Step 1: The run's shared expansion and resolution, for the target checked ---
  // One expansion and one resolution serve every pass and `generate` (PR-04
  // WO8a). Without a catalogue record the display has no size: `#screen_*` stay
  // deferred and screen-level bounds go unchecked, rather than guessed.
  const pipeline = pipelineOf(input);
  const context = pipeline.context;

  // --- Step 2: Composite templates, as declared ---
  // A defect in a template's own text — a malformed expression, an unknown
  // constant, over-constraint, a nested element overflowing a sized element
  // inside it — is reported here, once, whether the composite is used never or
  // many times. So is every axis that no instance can change (settledInTemplate);
  // the rest wait for Step 3.
  const templateReported = new Set<string>();
  const reportTemplate = (diagnostic: Diagnostic): void => {
    templateReported.add(diagnosticKey(diagnostic));
    diagnostics.push(diagnostic);
  };
  // Template element → the axes judged in its template (lookup only; never iterated).
  const settled = new Map<WidgetNode, ReadonlySet<string>>();
  for (const composite of manifests.declaredComposites) {
    const container = { label: `composite '<${composite.name}>'` };
    const resolved = resolveElements(composite.view?.children ?? [], container, context);
    resolved.diagnostics.forEach(reportTemplate);
    walkResolved(resolved.elements, (element) => {
      const axes = AXES.filter((axis) => settledInTemplate(element.node, axis, element.axes[axis.name]));
      settled.set(element.node, new Set(axes.map((axis) => axis.name)));
    });
    checkElements(
      resolved.elements,
      {
        judges: (element, axis) => settled.get(element.node)?.has(axis.name) ?? false,
        templateSourced: () => true,
      },
      context,
      (_node, diagnostic) => reportTemplate(diagnostic),
    );
  }

  // --- Step 3: Screens, every composite instance expanded ---
  // Expansion gives an instance its template as children, so `#parent_*` and
  // anchors inside it resolve against the instance's own resolved geometry
  // ([D-20], §13.6 step 4). Expansion's own diagnostics are Pass 5's to report.
  // A screen element's diagnostic is reported as it is. One inside an instance
  // names the instance — unless the template already said exactly this, in
  // which case it is a fact about the template, not about this instance.
  const place = (node: WidgetNode, diagnostic: Diagnostic): Diagnostic | undefined => {
    const chain = pipeline.expandedOf(node)?.instantiation ?? [];
    if (chain.length === 0) {
      return diagnostic;
    }
    return templateReported.has(diagnosticKey(diagnostic)) ? undefined : withInstantiation(diagnostic, chain);
  };
  const report = (node: WidgetNode, diagnostic: Diagnostic): void => {
    const kept = place(node, diagnostic);
    if (kept !== undefined) {
      diagnostics.push(kept);
    }
  };
  const sourceOf = (element: ResolvedElement): WidgetNode | undefined => pipeline.expandedOf(element.node)?.source;

  // The resolution is the pipeline's, so it carries each diagnostic with the
  // node it is about and leaves the placing to this pass — the one place that
  // knows a template has already spoken for its instances.
  for (const { node, diagnostic } of pipeline.resolution.raised) {
    report(node, diagnostic);
  }
  for (const resolved of pipeline.resolution.screens) {
    checkElements(
      resolved.elements,
      {
        judges: (element, axis) => {
          const source = sourceOf(element);
          return !(source !== undefined && settled.get(source)?.has(axis.name));
        },
        templateSourced: (element) => {
          const source = sourceOf(element);
          return source !== undefined && settled.has(source);
        },
      },
      context,
      report,
    );
  }

  // --- Step 4: [D-20] bound-geometry containers, on the expanded tree ---
  const fixedPairs = new Map<WidgetNode, Set<WidgetNode>>();
  for (const screen of pipeline.expansion.screens) {
    checkBoundContainers(screen.elements, diagnostics, fixedPairs);
  }

  return diagnostics;
}
