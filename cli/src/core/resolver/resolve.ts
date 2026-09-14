/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/resolve.ts
 * Purpose: §13.11 step 3's layout half: turns each element's coordinate
 *          attributes and anchors into literal integers against its containing
 *          element ([D-7], [D-20]). Generated code carries no layout ([D-7]), so
 *          everything a screen's geometry means must be settled here, once, for
 *          the chosen target — and the validator checks bounds on this same
 *          model, so `validate` and `generate` cannot disagree about where an
 *          element is.
 * Description: Walks a view tree. For each axis, two of `{x, width, right}` (or
 *              `{y, height, bottom}`) determine the third, and `hcenter` /
 *              `vcenter` with a size centre within the container, odd remainders
 *              rounding down (§7.2). Over-constraint is diagnosed here and
 *              nowhere else. Each resolved coordinate carries its provenance —
 *              the attribute and expression it came from, or the attributes it
 *              was derived from. `x`, `y`, `width` and `height` are read only
 *              where the element's effective manifest declares them (PR-04 WO3);
 *              the anchors are common to every element. A screen's container is
 *              the display. Composite expansion and `$prop` substitution are
 *              WO7's: a composite instance's `<view>` is not entered, and a
 *              value that names a `$prop` stays unresolved.
 *
 * Exports:
 * - Provenance:              Where a resolved coordinate came from
 * - ResolvedCoordinate:      A literal integer and its provenance
 * - ResolvedGeometry:        An element's resolved x, y, width, height, right, bottom
 * - Container:               The element coordinates are measured against
 * - ResolvedElement:         One element, its container, geometry and children
 * - ResolvedScreen:          One screen resolved against a display
 * - ResolverContext:         Constants, registry and display shared by one resolution
 * - ResolveInput, ResolveResult
 * - isCentringOn():          Whether an `hcenter` / `vcenter` value centres
 * - findTargetDisplay():     A target's display record from the catalogue
 * - createResolverContext(): Build a context for one target
 * - displayContainer():      The screen-level container for a context
 * - resolveElements():       Resolve a view subtree inside a given container
 * - resolveScreens():        Resolve every screen against a display
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { DisplayRecord } from '../schema/display-record.js';
import type { ConstDecl, Globals } from '../schema/globals.js';
import type { Target } from '../schema/project.js';
import type { Screen } from '../schema/screen.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import {
  buildConstantTable,
  evaluateExpression,
  type ContainerSize,
  type EvaluationScope,
} from './expression.js';

/**
 * Where a resolved coordinate came from.
 *
 * - `attribute` — written on the element; `expression` is the text as written.
 * - `derived`   — computed by an anchor rule from the attributes in `from`,
 *                 with the container's size; `loc` is the anchor attribute's.
 */
export type Provenance =
  | {
      readonly kind: 'attribute';
      readonly attribute: string;
      readonly expression: string;
      readonly loc?: SourceLocation;
    }
  | {
      readonly kind: 'derived';
      readonly attribute: string;
      readonly from: readonly string[];
      readonly loc?: SourceLocation;
    };

/** A literal integer coordinate and the source it resolved from. */
export interface ResolvedCoordinate {
  readonly value: number;
  readonly provenance: Provenance;
}

/**
 * An element's geometry after resolution. A member is absent when the element
 * does not declare it, it is under-determined, or its expression was invalid
 * (diagnosed) or deferred (not yet knowable). `right` and `bottom` are distances
 * from the container's far edge, present only when the container's size is known.
 */
export interface ResolvedGeometry {
  readonly x?: ResolvedCoordinate;
  readonly y?: ResolvedCoordinate;
  readonly width?: ResolvedCoordinate;
  readonly height?: ResolvedCoordinate;
  readonly right?: ResolvedCoordinate;
  readonly bottom?: ResolvedCoordinate;
}

/**
 * The element coordinates are measured against ([D-20]): the display at screen
 * level, otherwise the parent element. A size is absent while unknown — a
 * composite's top level before WO7 supplies the instantiation size, or a parent
 * whose own size did not resolve.
 */
export interface Container extends ContainerSize {
  /** Names the container in diagnostics: "display", or "containing element '<tag>'". */
  readonly label: string;
}

/** One element after resolution. */
export interface ResolvedElement {
  /** The source node, unchanged. */
  readonly node: WidgetNode;
  /** What this element's coordinates were measured against. */
  readonly container: Container;
  readonly geometry: ResolvedGeometry;
  /** Nested elements, in document order (§13.9). */
  readonly children: readonly ResolvedElement[];
}

/** One screen resolved against a display. */
export interface ResolvedScreen {
  readonly screen: Screen;
  /** The display — the container of the screen's top-level elements. */
  readonly container: Container;
  /** Top-level elements, in document order. */
  readonly elements: readonly ResolvedElement[];
}

/** What one resolution shares across every element. */
export interface ResolverContext {
  /** `globals.xml` constants by name. */
  readonly constants: ReadonlyMap<string, ConstDecl>;
  /** Effective manifests, to find which geometry properties an element has. */
  readonly manifests: ManifestRegistry;
  /** The target's display; sizes are absent when the target has no catalogue record. */
  readonly display: ContainerSize;
}

/** Everything {@link resolveScreens} needs. */
export interface ResolveInput {
  readonly globals: Globals;
  readonly screens: readonly Screen[];
  readonly manifests: ManifestRegistry;
  /** The selected target's display record, if the catalogue has one. */
  readonly display?: DisplayRecord;
}

/** Resolved screens and the diagnostics resolution raised. */
export interface ResolveResult {
  readonly screens: readonly ResolvedScreen[];
  readonly diagnostics: readonly Diagnostic[];
}

/** The attributes that position and size an element along one axis (§7.2). */
interface Axis {
  readonly name: 'horizontal' | 'vertical';
  readonly start: 'x' | 'y';
  readonly size: 'width' | 'height';
  readonly end: 'right' | 'bottom';
  readonly centre: 'hcenter' | 'vcenter';
}

const HORIZONTAL: Axis = { name: 'horizontal', start: 'x', size: 'width', end: 'right', centre: 'hcenter' };
const VERTICAL: Axis = { name: 'vertical', start: 'y', size: 'height', end: 'bottom', centre: 'vcenter' };

/** One axis's resolved start, size and far-edge distance. */
interface AxisResult {
  readonly start?: ResolvedCoordinate;
  readonly size?: ResolvedCoordinate;
  readonly end?: ResolvedCoordinate;
}

/**
 * @brief Whether an `hcenter` / `vcenter` value turns centring on.
 *
 * They are boolean switches, so an explicit `"false"` centres nothing; any other
 * present value does. The [D-20] bound-container check uses this same predicate.
 */
export function isCentringOn(value: string | boolean | undefined): boolean {
  return value !== undefined && value !== 'false' && value !== false;
}

/**
 * @brief Finds a target's display in the catalogue.
 *
 * @return The record whose `setup` the target names, or undefined when there is
 *         no target or no such record (Pass 3 reports an unknown setup).
 */
export function findTargetDisplay(
  target: Target | undefined,
  catalogue: readonly DisplayRecord[],
): DisplayRecord | undefined {
  if (target?.setup === undefined) {
    return undefined;
  }
  return catalogue.find((record) => record.setup === target.setup);
}

/**
 * @brief Builds the context for resolving against one display.
 *
 * @param display The target's display record, or undefined — `#screen_*` and
 *                screen-level anchors then stay unresolved, without diagnostics.
 */
export function createResolverContext(
  globals: Globals,
  manifests: ManifestRegistry,
  display: DisplayRecord | undefined,
): ResolverContext {
  return {
    constants: buildConstantTable(globals),
    manifests,
    display: display ? { width: display.width, height: display.height } : {},
  };
}

/**
 * @brief The container of a screen's top-level elements: the display (§7.2 —
 *        at screen level `#parent_width` and `#screen_width` coincide).
 */
export function displayContainer(context: ResolverContext): Container {
  return { label: 'display', ...context.display };
}

// geometryText
// The text of one geometry attribute, if the element has that property. The
// anchors are common to every element; x/y/width/height are properties, and are
// read only where the effective manifest declares them — Pass 4 reports them as
// unknown anywhere else, and laying an element out from an attribute the
// validator rejects would give it geometry it does not have (PR-04 WO3). An
// unknown tag (Pass 2's error) therefore has none.
//   node      — the element
//   attribute — geometry attribute name
//   context   — for the manifest registry
function geometryText(node: WidgetNode, attribute: string, context: ResolverContext): string | undefined {
  const value = node.attributes[attribute];
  if (typeof value !== 'string') {
    return undefined;
  }
  if (attribute === 'right' || attribute === 'bottom') {
    return value;
  }
  const declared = context.manifests.get(node.tag)?.api.props.some((prop) => prop.name === attribute) ?? false;
  return declared ? value : undefined;
}

// floorHalf
// Half of an integer, rounded down (toward negative infinity): §7.2's "odd
// remainders round down", applied the same way when a child is wider than its
// container and the remainder is negative. Integer operations only (§13.9).
function floorHalf(value: number): number {
  const remainder = ((value % 2) + 2) % 2;
  return (value - remainder) / 2;
}

// elementLabel
// "'width' on <u8g2gl_label> 'title'" — the subject of an expression diagnostic.
function elementLabel(node: WidgetNode, attribute: string): string {
  const name = typeof node.attributes.name === 'string' && node.attributes.name !== '' ? ` '${node.attributes.name}'` : '';
  return `'${attribute}' on <${node.tag}>${name}`;
}

// overconstrained
// The existing OVERCONSTRAINED diagnostic, with the message Pass 6 has always given.
function overconstrained(message: string, loc: SourceLocation | undefined, offendingText: string): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.OVERCONSTRAINED,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
  };
}

// resolveAxis
// Resolves one axis of one element.
//   node          — the element
//   axis          — HORIZONTAL or VERTICAL
//   containerSize — the container's extent along this axis, if known
//   scope         — expression scope for this element
//   context       — shared resolution context
//   diagnostics   — output
function resolveAxis(
  node: WidgetNode,
  axis: Axis,
  containerSize: number | undefined,
  scope: EvaluationScope,
  context: ResolverContext,
  diagnostics: Diagnostic[],
): AxisResult {
  const locOf = (attribute: string): SourceLocation | undefined => node.attributeLocs?.[attribute] ?? node.loc;

  // --- Step 1: Which attributes position this axis ---
  const startText = geometryText(node, axis.start, context);
  const sizeText = geometryText(node, axis.size, context);
  const endText = geometryText(node, axis.end, context);
  const centred = isCentringOn(node.attributes[axis.centre]);

  // --- Step 2: Over-constraint — more positions than one edge can take ---
  let overConstrainedAxis = false;
  if (startText !== undefined && sizeText !== undefined && endText !== undefined) {
    overConstrainedAxis = true;
    diagnostics.push(
      overconstrained(
        `Element '<${node.tag}>' has over-constrained ${axis.name} anchors: ` +
          `'${axis.start}', '${axis.size}', and '${axis.end}' are all specified.`,
        node.attributeLocs?.[axis.end] ?? node.attributeLocs?.[axis.size] ?? node.attributeLocs?.[axis.start] ?? node.loc,
        `${axis.start}, ${axis.size}, ${axis.end}`,
      ),
    );
  } else if (centred && (startText !== undefined || endText !== undefined)) {
    // Centring places the start edge, so an explicit start or far-edge anchor
    // alongside it gives the element two positions (PR-04 WO6 decision).
    const other = startText !== undefined ? axis.start : axis.end;
    overConstrainedAxis = true;
    diagnostics.push(
      overconstrained(
        `Element '<${node.tag}>' has over-constrained ${axis.name} anchors: ` +
          `'${axis.centre}' and '${other}' are both specified.`,
        locOf(axis.centre),
        `${axis.centre}, ${other}`,
      ),
    );
  }

  // --- Step 3: Evaluate every attribute written, so each reports its own errors ---
  const evaluate = (attribute: string, text: string | undefined): ResolvedCoordinate | undefined => {
    if (text === undefined) {
      return undefined;
    }
    const loc = locOf(attribute);
    const result = evaluateExpression(text, scope, { ...(loc ? { loc } : {}), subject: elementLabel(node, attribute) });
    if (result.kind === 'invalid') {
      diagnostics.push(...result.diagnostics);
      return undefined;
    }
    if (result.kind === 'deferred') {
      return undefined;
    }
    return {
      value: result.value,
      provenance: { kind: 'attribute', attribute, expression: text, ...(loc ? { loc } : {}) },
    };
  };
  const start = evaluate(axis.start, startText);
  const size = evaluate(axis.size, sizeText);
  const end = evaluate(axis.end, endText);

  if (overConstrainedAxis || containerSize === undefined) {
    return { ...(start ? { start } : {}), ...(size ? { size } : {}), ...(end ? { end } : {}) };
  }

  // --- Step 4: Derive the missing member from the container ---
  // Exclusions test what was *written*, inputs test what *resolved*: an attribute
  // that was written but invalid or deferred must not be replaced by a derived
  // value, or the element would silently be laid out without it.
  const derived = (attribute: string, value: number, from: readonly string[], anchor: string): ResolvedCoordinate => {
    const loc = locOf(anchor);
    return { value, provenance: { kind: 'derived', attribute, from, ...(loc ? { loc } : {}) } };
  };
  const C = containerSize;

  if (centred && size) {
    const startValue = floorHalf(C - size.value);
    return {
      start: derived(axis.start, startValue, [axis.centre, axis.size], axis.centre),
      size,
      end: derived(axis.end, C - startValue - size.value, [axis.centre, axis.size], axis.centre),
    };
  }
  if (start && size) {
    return { start, size, end: derived(axis.end, C - start.value - size.value, [axis.start, axis.size], axis.size) };
  }
  if (size && end && startText === undefined) {
    return { start: derived(axis.start, C - end.value - size.value, [axis.size, axis.end], axis.end), size, end };
  }
  if (start && end && sizeText === undefined) {
    return { start, size: derived(axis.size, C - start.value - end.value, [axis.start, axis.end], axis.end), end };
  }
  return { ...(start ? { start } : {}), ...(size ? { size } : {}), ...(end ? { end } : {}) };
}

// resolveNode
// Resolves one element and, recursively, its nested elements; the element's own
// resolved size becomes its children's container.
function resolveNode(
  node: WidgetNode,
  container: Container,
  context: ResolverContext,
  diagnostics: Diagnostic[],
): ResolvedElement {
  // --- Step 1: Resolve both axes against the container ---
  const scope: EvaluationScope = {
    constants: context.constants,
    screen: context.display,
    parent: { ...(container.width !== undefined ? { width: container.width } : {}), ...(container.height !== undefined ? { height: container.height } : {}) },
  };
  const h = resolveAxis(node, HORIZONTAL, container.width, scope, context, diagnostics);
  const v = resolveAxis(node, VERTICAL, container.height, scope, context, diagnostics);
  const geometry: ResolvedGeometry = {
    ...(h.start ? { x: h.start } : {}),
    ...(v.start ? { y: v.start } : {}),
    ...(h.size ? { width: h.size } : {}),
    ...(v.size ? { height: v.size } : {}),
    ...(h.end ? { right: h.end } : {}),
    ...(v.end ? { bottom: v.end } : {}),
  };

  // --- Step 2: This element contains its children, per axis it has a size on ---
  const childContainer: Container = {
    label: `containing element '<${node.tag}>'`,
    ...(geometry.width ? { width: geometry.width.value } : {}),
    ...(geometry.height ? { height: geometry.height.value } : {}),
  };
  const children = resolveChildren(node.children, childContainer, context, diagnostics);

  return { node, container, geometry, children };
}

// resolveChildren
// Resolves the elements among `nodes`, skipping bindings, events and styles.
function resolveChildren(
  nodes: readonly WidgetNodeChild[],
  container: Container,
  context: ResolverContext,
  diagnostics: Diagnostic[],
): ResolvedElement[] {
  const elements: ResolvedElement[] = [];
  for (const child of nodes) {
    if ('tag' in child && typeof child.tag === 'string') {
      elements.push(resolveNode(child, container, context, diagnostics));
    }
  }
  return elements;
}

/**
 * @brief Resolves a view subtree inside a given container.
 *
 * The building block for both screens and, in the validator, a composite's own
 * `<view>` — whose top-level container has no size until WO7 instantiates it.
 *
 * @param nodes     The subtree's children; non-element children are skipped.
 * @param container What the top-level elements are measured against.
 * @param context   Shared context from {@link createResolverContext}.
 * @return Elements in document order, and the diagnostics resolution raised:
 *         expression errors and over-constraint. Deferred values raise nothing.
 */
export function resolveElements(
  nodes: readonly WidgetNodeChild[],
  container: Container,
  context: ResolverContext,
): { readonly elements: readonly ResolvedElement[]; readonly diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const elements = resolveChildren(nodes, container, context, diagnostics);
  return { elements, diagnostics };
}

/**
 * @brief Resolves every screen against one display.
 *
 * @param input Globals, screens, registry and the target's display record.
 * @return Screens in input order, and every diagnostic raised.
 */
export function resolveScreens(input: ResolveInput): ResolveResult {
  const context = createResolverContext(input.globals, input.manifests, input.display);
  const container = displayContainer(context);
  const diagnostics: Diagnostic[] = [];
  const screens = input.screens.map((screen) => {
    const resolved = resolveElements(screen.view?.children ?? [], container, context);
    diagnostics.push(...resolved.diagnostics);
    return { screen, container, elements: resolved.elements };
  });
  return { screens, diagnostics };
}
