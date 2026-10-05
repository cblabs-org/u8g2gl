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
 *                 it must resolve or be bound (`bind_x` supplies `x`, PR-04
 *                 WO11b) — an under-determined axis (`width` with neither `x` nor
 *                 `right`), a `$prop` that never substitutes, a `#parent_*` or
 *                 anchor whose container has no size, is
 *                 `U8G2GL_UNRESOLVED_GEOMETRY`. A written size must resolve too.
 *              1b. Fully sized (PR-04 WO11b, WO10 SR2): where the manifest
 *                 declares `width` / `height`, something must supply it —
 *                 written, anchor-derived, bound, or a `draw=` prop's default —
 *                 or it is `U8G2GL_MISSING_REQUIRED`, the code `generate` used.
 *              2. Fits `int16_t` (§13.2): a resolved x, y, width or height outside
 *                 it is `U8G2GL_COORDINATE_OUT_OF_RANGE` — checked first, and an
 *                 axis that fails it is not bounds-checked.
 *              3. Inside its container ([D-20]): an element may not start before
 *                 the container's origin, extend past its far edge, or resolve to
 *                 a negative size. The container is the display for a screen's
 *                 top level, otherwise the parent's resolved size.
 *              3b. What is drawn (§7.2, the Chief Architect's ruling 6): along an
 *                 axis the element has no size on, the pixels it draws must lie
 *                 inside the container — a pixel as 1×1, a line or triangle by
 *                 its points, a circle or ellipse by the segments it draws. The
 *                 box is the resolver's `drawnExtent()`, the one derivation.
 *              3c. A radius fits its element's own size: `2*r` within its
 *                 literal width and height, whether it is written as an attribute,
 *                 an inline `style_radius` or a named style (§10), and whether the
 *                 element is a drawing element or an object. Measured against the pinned U8G2
 *                 (PR-4R WO3): past it `u8g2_box.c`'s band `w - r - r` wraps and
 *                 U8G2 draws outside the box; up to it, including the capsule
 *                 `2*r == min`, nothing is drawn outside. The runtime clamps to
 *                 the same bound at draw time (`u8g2gl_coord_corner_radius()`).
 *              4. Every **non-coordinate `int` property** resolved too (§13.2,
 *                 PR-04 WO9): `scroll_px_per_sec="#speed"` used never to be
 *                 evaluated at all and reached emission as text (WO8a finding
 *                 5). These are held to `int32_t` rather than `int16_t` and are
 *                 not bounds-checked — a scroll speed has no container — so they
 *                 are checked apart from the geometry, in `checkProperties`.
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
 *              The [D-20] bound-geometry rules run on the expanded tree, so they
 *              see through nested composites (PR-04 WO7 F7): a container whose
 *              own **position** is bound may have no children at all (ruling 1c,
 *              `U8G2GL_BOUND_POSITION_HAS_CHILDREN`, pointing to §21 Q-16); one
 *              whose **size** is bound may not have anchor-positioned children,
 *              which would require reflow. A container or pair fixed by a
 *              template is reported once; one that depends on an instance names
 *              it.
 *
 * Exports:
 * - validateGeometry(input): Runs Pass 6 geometry and bounding validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode } from '../schema/widget-node.js';
import {
  boundGeometryOf,
  drawnExtent,
  geometryBindingFor,
  INT16_MAX,
  INT16_MIN,
  isCentringOn,
  isRectangular,
  resolveElements,
  withInstantiation,
  type AxisExtent,
  type AxisOutcome,
  type ExtentEdge,
  type DeferredCoordinate,
  type ExpandedElement,
  type ResolvedCoordinate,
  type ResolvedElement,
  type ResolverContext,
} from '../resolver/index.js';
import type { ValidateInput } from './validate.js';
import { pipelineOf } from './shared-model.js';
import { configuredRadius } from './configured-radius.js';
import { styleScope, type StyleScope } from './validate-widget-props.js';

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
        DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
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

  // --- Step 2b: A binding supplies the start ([D-20]) ---
  // `bind_x` positions the element at run time, relative to its container
  // (§7.2), so a literal `x` beside it would only be overwritten (PR-04 WO11b,
  // WO10b finding 1). The screen model passes a bound axis as 0 and lets the
  // binding apply it; placement adds the container's origin.
  if (node.attributes[geometryBindingFor(axis.start).binding] !== undefined) {
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
        DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
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
      DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
      `${describeNode(node)} is not fully positioned: '${axis.start}' cannot be worked out — ` +
        `${underDetermination(node, axis, reads)}. Give '${axis.start}', or '${axis.end}' with '${axis.size}' (§7.2).`,
      node.attributeLocs?.[axis.size] ?? node.attributeLocs?.[axis.end] ?? node.loc,
      axis.start,
    ),
  );
}

// checkSized
// Check 1b for one axis of one element: where the manifest declares the axis's
// size, something must supply it — written, anchor-derived, bound, or (for a
// draw-call argument) the manifest's own default. PR-04 WO10 dropped `required`
// on drawing geometry a binding or anchor can supply, and nothing then caught a
// size that none of them supplies (WO10 stop-and-report 2): `validate` passed a
// box with no `width` that `generate` refused with MISSING_REQUIRED, and an
// object with no `width` reached the screen model, which throws. Same code as
// that refusal, so both journeys name it alike.
//
// A default counts only on a `draw=` prop: a draw call passes it, while an
// object's rectangle is one `set_coords` call whose four arguments the screen
// model takes from a literal or a binding and nowhere else.
//   element — the resolved element
//   axis    — the axis
//   context — resolution context: manifests, display
//   emit    — receives each diagnostic
function checkSized(
  element: ResolvedElement,
  axis: GeometryAxis,
  context: ResolverContext,
  emit: ElementDiagnosticSink,
): void {
  const { node, geometry } = element;
  const manifest = context.manifests.get(node.tag);
  const prop = manifest?.api.props.find((candidate) => candidate.name === axis.size);
  const outcome = element.axes[axis.name];

  // --- Step 1: Only a declared size nothing has already spoken for ---
  // A deferred or invalid coordinate on this axis is checkPositioned's or the
  // evaluator's to report; a bound size is supplied at run time ([D-20]).
  if (
    prop === undefined ||
    outcome.diagnosed ||
    outcome.deferred.length > 0 ||
    geometry[axis.size] !== undefined ||
    node.attributes[geometryBindingFor(axis.size).binding] !== undefined ||
    (prop.draw !== undefined && prop.default !== undefined)
  ) {
    return;
  }

  // --- Step 2: An anchor that could derive it, measured against nothing ---
  // `x` with `right` derives `width` from the container; with no container size
  // that is a container fact, said as such — or Pass 3's, with no display.
  if (isRectangular(manifest) && isWritten(node, axis.end) && !outcome.containerKnown) {
    if (context.display[axis.size] === undefined) {
      return;
    }
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
        `'${axis.size}' on ${describeNode(node)} cannot be derived from '${axis.end}': ${element.container.label} ` +
          `has no resolved ${axis.size} to measure against. Every element must end up fully positioned (§7.2).`,
        node.attributeLocs?.[axis.end] ?? node.loc,
        axis.end,
      ),
    );
    return;
  }

  // --- Step 3: Nothing supplies it ---
  emit(
    node,
    createGeomDiagnostic(
      DIAGNOSTIC_CODES.MISSING_REQUIRED,
      `${describeNode(node)} has no '${axis.size}': it is not written, no anchor settles it, and no binding ` +
        `supplies it (${geometryBindingFor(axis.size).binding}). Every element must end up fully sized (§7.2, §8.4).`,
      node.loc,
      axis.size,
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
          DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
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

    // --- Step 3: A length is non-negative ---
    // Whether a point, or the reach of a length from its centre, lies inside the
    // container is what the element draws, and checkDrawnAxis judges that from
    // the one drawn-extent function (ruling 6).
    if (extra.kind === 'length' && coordinate.value < 0) {
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
  }
}

// ---------------------------------------------------------------------------
// Check 3b — what is drawn, inside the container (§7.2, ruling 6)
// ---------------------------------------------------------------------------

// describeEdge
// How an edge was reached, for a message: `has x2=140`, or
// `draws to x=-3 (x - radius, segments 'all')`.
function describeEdge(edge: ExtentEdge, element: ResolvedElement, axis: GeometryAxis, before: boolean): string {
  const [first, second] = edge.from.map((coordinate) => coordinate.provenance.attribute);
  if (second === undefined) {
    return `has ${first ?? axis.start}=${edge.value}`;
  }
  const segments = element.node.attributes.segments;
  const which = typeof segments === 'string' ? `, segments '${segments}'` : '';
  return `draws to ${axis.start}=${edge.value} (${first} ${before ? '-' : '+'} ${second}${which})`;
}

// checkDrawnAxis
// Check 3 for an axis the element has no size on: the pixels it actually draws
// must lie inside the container (§7.2, the Chief Architect's ruling 6 of
// 2026-09-19). A pixel is one pixel; a line or triangle spans its points; a
// circle or ellipse spans the segments it draws, so a quarter-circle at a
// display corner passes while the whole circle would not. The derivation is
// the resolver's `drawnExtent()`, the one copy; this only compares. Radii are
// judged here too — `radius="500"` on a circle used to validate (WO8a f1).
//   element — the resolved element
//   axis    — the axis
//   extent  — what it draws along the axis, when known at build time
//   limit   — the container's size along the axis
//   emit    — receives each diagnostic
function checkDrawnAxis(
  element: ResolvedElement,
  axis: GeometryAxis,
  extent: AxisExtent,
  limit: number,
  emit: ElementDiagnosticSink,
): void {
  const { node, container } = element;
  const range = `${container.label} is ${limit}px ${axis.extent} (0..${limit - 1})`;
  const report = (edge: ExtentEdge, before: boolean): void => {
    // Located at the coordinate that carries the edge past the container: the
    // length for a centre's reach, otherwise the one coordinate.
    const culprit = edge.from[edge.from.length - 1];
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `Element '<${node.tag}>' ${describeEdge(edge, element, axis, before)}, but ${range}.` +
          (edge.from.length > 1 ? ' What is drawn must lie inside its container (§7.2).' : ''),
        culprit?.provenance.loc ?? node.loc,
        culprit === undefined ? undefined : sourceText(culprit),
      ),
    );
  };
  if (extent.min.value < 0) {
    report(extent.min, true);
  }
  if (extent.max.value > limit - 1) {
    report(extent.max, false);
  }
}

// checkCornerRadius
// A rounded rectangle's radius against its own size. The bound is
// `2*r <= w` and `2*r <= h` — measured, not reasoned (PR-4R WO3; harness and
// full output in .agents/skills/principal-architect-workspace/pr-4r-corrections/
// evidence/rbox-bound/). u8g2_DrawRBox and u8g2_DrawRFrame (u8g2_box.c at
// 2.36.18: lines 121–123 and 134–136, and 183–188) compute the band between the
// corners as `ww = w - r - r` and `hh = h - r - r` in `u8g2_uint_t`. Once
// `2*r > w` that wraps, the `ww >= 3` test that follows passes, and U8G2 draws a
// box of the wrapped width, clipped only by the display. Measured across sizes
// and every radius, each `r` with `2*r <= min(w, h)` draws nothing outside the
// box and each `r` past it does (70 to 1753 stray pixels): exact in both
// directions. test/test_rbox_bound.cpp keeps that measurement against the pinned
// U8G2. `2*r == min` is a capsule — the corner discs meet — which is the
// intended look, so it is accepted with no diagnostic of any severity. (WO11b
// required `2*(r+1)`, which refused capsules that draw cleanly.) Ruling 6 does
// not catch this: the bounding box of the corners never leaves the box.
//
// The runtime clamps to the same bound at draw time
// (`u8g2gl_coord_corner_radius()`, include/u8g2gl/u8g2gl_coord.h), which is
// what covers a bound width or height, known only at run time and not judged
// here. This check exists so a literal the author can fix is reported to them
// rather than silently clamped.
//
// Any element whose effective manifest declares `radius` — as a `draw=` prop (the
// box) or a `setter=` prop (every object) — read from the manifest, never by
// name ([D-17]). The radius is the one the element is configured with at init,
// from whichever source wins (configuredRadius(): attribute, inline
// `style_radius`, named style), so a radius a style supplies is judged exactly
// as one written on the element. A radius of 0 or none constrains nothing; a
// width or height that is bound or unresolved is skipped, which is what the
// runtime clamp is for. An object does not draw a rounded shape with the
// author's radius alone — a label inherits `radius` and draws none — so a
// literal past the bound is refused there too, one rule for every element.
//   element — the resolved element
//   context — resolution context, for the manifest
//   styles  — the named styles in scope for this element
//   emit    — receives each diagnostic
function checkCornerRadius(
  element: ResolvedElement,
  context: ResolverContext,
  styles: StyleScope,
  emit: ElementDiagnosticSink,
): void {
  const { node, geometry } = element;
  const props = context.manifests.get(node.tag)?.api.props ?? [];
  const configured = configuredRadius(element, props, styles);
  const value = configured?.value;
  if (configured === undefined || value === undefined || value <= 0) {
    return;
  }
  const drawn = props.some((prop) => prop.name === 'radius' && prop.draw !== undefined);
  const needed = 2 * value;
  const from =
    configured.source.kind === 'inline'
      ? ' (from style_radius)'
      : configured.source.kind === 'style'
        ? ` (from style '${configured.source.name}')`
        : '';
  for (const size of [geometry.width, geometry.height]) {
    if (size === undefined || size.value >= needed) {
      continue; // Bound, unresolved, or large enough.
    }
    emit(
      node,
      createGeomDiagnostic(
        DIAGNOSTIC_CODES.OUT_OF_BOUNDS,
        `${describeNode(node)} has radius=${value}${from}, too large for its ${size.provenance.attribute}=` +
          `${size.value}: a rounded box needs 2*radius = ${needed} <= ${size.provenance.attribute}, or ` +
          (drawn
            ? 'U8G2 draws outside the box (u8g2_box.c)'
            : 'the runtime silently clamps it (u8g2gl_coord_corner_radius())') +
          `. Use radius <= ${Math.max(0, Math.floor(size.value / 2))}.`,
        configured.loc ?? node.loc,
        configured.text,
      ),
    );
  }
}

// representableAlong
// Whether every coordinate an element has along an axis fits `int16_t`; one that
// does not is reported by check 2 and is not then measured.
function representableAlong(element: ResolvedElement, axis: GeometryAxis): boolean {
  const values = [
    element.geometry[axis.start]?.value,
    ...element.extras
      .filter((extra) => extra.axis === axis.name || (extra.spans?.includes(axis.name) ?? false))
      .map((extra) => extra.coordinate?.value),
  ];
  return values.every((value) => value === undefined || (value >= INT16_MIN && value <= INT16_MAX));
}

// ---------------------------------------------------------------------------
// Non-coordinate `int` properties (§13.2)
// ---------------------------------------------------------------------------

// checkProperties
// Check 1 for every `int` property that is not a coordinate: it too must reach
// emission as a literal. The resolver now evaluates these through the same
// evaluator as `x` (PR-04 WO9, closing WO8a finding 5) — before that,
// `scroll_px_per_sec="#speed"` was never evaluated at all and arrived at the
// §13.2 value helper as the text `#speed`.
//
// An invalid expression has already been reported by the evaluator itself, so
// what is left here is the case it deliberately treats as "not yet knowable": a
// value that never resolved. Two codes, because they are two different facts —
// a `$prop` written where nothing can substitute it, and a value whose
// container or target is simply unknown.
//
// Deliberately **not** held to `int16_t`, and not bounds-checked: §13.2 gives
// that width to a *coordinate* and leaves other `int` properties at `int32_t`
// (which `set_time(uint32_t)` needs), and a scroll speed has no container to lie
// inside. The evaluator's own int32 range check is the whole type rule.
//   element         — the resolved element
//   context         — resolution context, for the display
//   templateSourced — whether the element was copied from a composite's `<view>`
//   emit            — receives each diagnostic
function checkProperties(
  element: ResolvedElement,
  context: ResolverContext,
  templateSourced: boolean,
  emit: ElementDiagnosticSink,
): void {
  const { node } = element;
  const displayKnown = context.display.width !== undefined;

  for (const property of element.properties) {
    const { deferred } = property;
    if (deferred === undefined) {
      continue;
    }
    // A `$` left in a copied template was expansion's error (UNKNOWN_PROP); a
    // built-in with no display is Pass 3's. Either way something already stands
    // against this value, so nothing more is inferred.
    const placeholder = deferred.symbols.some((symbol) => symbol.startsWith('$'));
    if ((templateSourced && placeholder) || (!displayKnown && !placeholder)) {
      continue;
    }
    emit(
      node,
      createGeomDiagnostic(
        placeholder ? DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP : DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
        `'${deferred.attribute}' on ${describeNode(node)} cannot be resolved: ` +
          `${deferralReason(deferred, element)}. Every 'int' property must resolve to a literal ` +
          `before emission (§13.2).`,
        deferred.loc ?? node.loc,
        deferred.expression,
      ),
    );
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
  /** The named styles in scope for an element (§10): a template sees the globals only. */
  readonly styles: (element: ResolvedElement) => StyleScope;
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
    const manifest = context.manifests.get(element.node.tag);
    const drawn = drawnExtent(element, manifest);
    for (const axis of AXES) {
      let representable: boolean;
      if (rules.judges(element, axis)) {
        checkPositioned(element, axis, context, rules.templateSourced(element), emit);
        checkSized(element, axis, context, emit);
        representable = checkRepresentable(element, axis, emit);
      } else {
        representable = outOfInt16(element, axis).length === 0;
      }
      const limit = element.container[axis.size];
      if (!representable || limit === undefined) {
        continue;
      }
      // An axis the element has a size on is a rectangle's (check 3); any other
      // is judged by what the element draws along it (check 3b, ruling 6).
      const sized = manifest?.api.props.some((prop) => prop.name === axis.size) ?? false;
      const extent = drawn[axis.name];
      if (sized) {
        checkAxisBounds(element, axis, limit, emit);
      } else if (extent !== undefined && representableAlong(element, axis)) {
        checkDrawnAxis(element, axis, extent, limit, emit);
      }
    }
    checkExtras(element, context, rules.templateSourced(element), emit);
    checkCornerRadius(element, context, rules.styles(element), emit);
    checkProperties(element, context, rules.templateSourced(element), emit);
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
 * The anchor attributes (§7.2) that resolve against a container at build time.
 * These name the layout contract, not elements, so they are not element
 * knowledge in [D-17]'s sense. The geometry bindings are the resolver's one
 * table, `GEOMETRY_BINDINGS` (PR-04 WO11b).
 */
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
  fixedContainers: Set<WidgetNode>,
): void {
  for (const container of elements) {
    const boundPosition = boundGeometryOf(container.node, ['position'])?.binding;
    const boundAttr = boundGeometryOf(container.node)?.binding;

    if (boundPosition !== undefined && container.children.length > 0) {
      // Ruling 1c: no children at all, which subsumes the anchored-child rule.
      checkBoundPosition(container, boundPosition, diagnostics, fixedContainers);
    } else if (boundAttr !== undefined) {
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

    checkBoundContainers(container.children, diagnostics, fixedPairs, fixedContainers);
  }
}

// checkBoundPosition
// Ruling 1c (Chief Architect, 2026-09-19; §7.2, §21 Q-16): a container whose own
// position is bound may have no children in schema 0.4. Reported once per
// container, at its binding. A container fixed by a template — written inside a
// composite's `<view>` and bound from a literal — is the template's defect,
// reported once however often the composite is used; one whose binding comes
// through a `$prop` names its instance.
//
// Before this, the validator demanded a literal `x` beside `bind_x`, so a bound
// container's children were placed against that literal and left behind when
// the binding moved it (WO10 finding 3); generate refused only when no literal
// was written. Both journeys now refuse it, with this one diagnostic.
//   container       — the expanded container, with at least one child
//   binding         — the position binding it writes
//   diagnostics     — output
//   fixedContainers — template containers already reported
function checkBoundPosition(
  container: ExpandedElement,
  binding: string,
  diagnostics: Diagnostic[],
  fixedContainers: Set<WidgetNode>,
): void {
  const fixed = container.instantiation.length > 0 && !hasPlaceholder(container.source, binding);
  if (fixed) {
    if (fixedContainers.has(container.source)) {
      return;
    }
    fixedContainers.add(container.source);
  }
  const { node } = container;
  const name = typeof node.attributes.name === 'string' && node.attributes.name !== '' ? node.attributes.name : node.tag;
  const first = container.children[0]?.node;
  const childName =
    first === undefined ? '' : typeof first.attributes.name === 'string' && first.attributes.name !== '' ? first.attributes.name : first.tag;
  const count = container.children.length;
  const diagnostic = createGeomDiagnostic(
    DIAGNOSTIC_CODES.BOUND_POSITION_HAS_CHILDREN,
    `Container '${name}' <${node.tag}> binds its position with '${binding}', so in schema 0.4 it may have no ` +
      `children, and it has ${count} (the first is '${childName}'${first === undefined ? '' : ` <${first.tag}>`}). ` +
      `Children are positioned at build time and there is no reflow yet, so they could not follow the container ` +
      `when the binding moves it (§7.2). Bind the children's own positions instead, or see §21 Q-16 for how ` +
      `children that follow their container may be allowed later.`,
    node.attributeLocs?.[binding] ?? node.loc,
    binding,
  );
  diagnostics.push(fixed ? diagnostic : withInstantiation(diagnostic, container.instantiation));
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
  const globalStyles = styleScope(input.globals, undefined);
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
        styles: () => globalStyles,
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
    const screenStyles = styleScope(input.globals, resolved.screen);
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
        styles: (element) => {
          const source = sourceOf(element);
          return source !== undefined && settled.has(source) ? globalStyles : screenStyles;
        },
      },
      context,
      report,
    );
  }

  // --- Step 4: [D-20] bound-geometry containers, on the expanded tree ---
  const fixedPairs = new Map<WidgetNode, Set<WidgetNode>>();
  const fixedContainers = new Set<WidgetNode>();
  for (const screen of pipeline.expansion.screens) {
    checkBoundContainers(screen.elements, diagnostics, fixedPairs, fixedContainers);
  }

  return diagnostics;
}
