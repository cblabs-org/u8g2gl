/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/screen-model.ts
 * Purpose: The decisions a screen's emission makes, made once, so the two
 *          generation targets ([UD-4], design_spec §13.1) cannot disagree about
 *          them. The firmware target spells each decision as C++ in
 *          `ui_screen_<name>.cpp` (`screen.ts`); the editor target spells the
 *          same decisions as a scene description the editor host builds from at
 *          run time (`scene.ts`, ui_spec §4.1 step 6). PROJECT.md's sharing
 *          decision is "one pipeline, two thin backends": which properties an
 *          object sets, in what order, with which rectangle, which styles and
 *          overrides it applies and which flag comparison a directive makes are
 *          answered here and nowhere else. WO11's parity test is what holds the
 *          two backends to that.
 *
 *          Nothing here is spelled as C++ or JSON. Values stay as the resolver
 *          settled them; spelling is the backend's job, through `value.ts`.
 *
 * Description: Extracted from `screen.ts` in PR-04 WO11 without changing what the
 *              firmware emits — the WO9/WO10 goldens and the committed compile
 *              fixture regenerate byte-identically. `placeScreen()` pairs every
 *              realised element with its manifest and its resolved model moved
 *              into device coordinates (`placement.ts`); the per-object helpers
 *              then answer §13.7's four init steps, and `flagComparison()` the
 *              `<bind_flag_if_*>` directives both an object's bindings and a draw
 *              call's guard use.
 *
 * Exports:
 * - Placement:            One element with its manifest and device-space model
 * - ScreenPlacements:     Every element of a screen, placed, and what placing found
 * - RECTANGLE:            The four axes §7.2's rectangle names, in set_coords order
 * - FLAG_ENUMERATOR_PATTERN: How a flag name becomes its `U8G2GL_FLAG_*` enumerator
 * - InitStep, INIT_STEPS: The order init configures objects in (§13.7)
 * - FlagComparison:       One directive, understood
 * - RectangleAxis, Rectangle, WrittenProperty, StyleOverrides
 * - typed():              A synthetic declaration for a fixed §13.2 type
 * - emissionError():      A located diagnostic for a defect only emission sees
 * - classOf():            An object's C++ class and the header declaring it
 * - placeScreen():        Place every element of a screen in device coordinates
 * - rectangleSetterOf():  The setter a manifest's four rectangle axes share
 * - rectangleOf():        The one rectangle-setter call an object makes
 * - writtenProperties():  The setter props the author wrote, in manifest order
 * - styleOverridesOf():   An element's `style_*` overrides, resolved to props
 * - flagComparison():     A directive's method, comparison, ref and flag
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../../schema/diagnostic.js';
import type { SourceLocation } from '../../schema/source-location.js';
import type { PropDef } from '../../schema/widget-manifest.js';
import { isStyleAttribute } from '../../schema/globals.js';
import { FLAG_COMPARISONS, type WidgetNode } from '../../schema/widget-node.js';
import { ROOT_CLASS_MANIFEST, type EffectiveManifest, type ManifestRegistry } from '../../manifest/index.js';
import { geometryBindingFor, type ResolvedElement, type ResolvedScreen } from '../../resolver/index.js';
import type { RealisedBinding, RealisedElement, RealisedScreen } from '../../realise/index.js';
import { resolvedLiteralFor } from './draw-args.js';
import { absoluteElement, childOrigin, DISPLAY_ORIGIN, type Origin } from './placement.js';

/** One element, placed: its manifest and its resolved model in device coordinates. */
export interface Placement {
  readonly manifest: EffectiveManifest;
  readonly absolute: ResolvedElement;
  /**
   * The absolute corner of the element's container — the display's for a
   * screen-level element. A bound position is relative to it (§7.2), so it is
   * what a `bind_x`/`bind_y` adds at run time (`placement.ts`).
   */
  readonly origin: Origin;
}

/** Every element of one screen, placed, and what placing it found. */
export interface ScreenPlacements {
  readonly placements: ReadonlyMap<RealisedElement, Placement>;
  /**
   * Non-empty when an element has no absolute position at build time — it sits
   * inside a container a binding positions ([D-20]). The build is refused.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The rectangle §7.2's contract names. On a class-backed manifest all four share
 * one setter, `set_coords`, so they are emitted as one call in this order rather
 * than four — the runtime has no single-axis spelling of an initial position
 * that marks dirty once.
 */
export const RECTANGLE: readonly ('x' | 'y' | 'width' | 'height')[] = ['x', 'y', 'width', 'height'];

/** One configuring step of a screen's `init`, after construction (§13.7). */
export type InitStep = 'properties' | 'styles' | 'bindings';

/**
 * The order `init` configures objects in, after construction (§13.7). Stated
 * once: the firmware screen unit lays its steps out in this order and the
 * scene description carries it for the editor host to follow, so both targets
 * obey one list.
 *
 * **Styles before properties** (Chief Architect, 2026-09-19, §10): an
 * element's own attribute is the more specific statement of intent, so it must
 * win over a named style — `font=` over the style's font — and the setter that
 * runs last is the one that wins. The `styles` step also applies the element's
 * inline `style_*` overrides, after its named styles, so an override beats the
 * style it overrides too. **Bindings stay last** so no observer fires against a
 * partly configured object, and a bound text wins over a literal one because
 * the runtime reads the binding first (PR-04 WO10b).
 */
export const INIT_STEPS: readonly InitStep[] = ['styles', 'properties', 'bindings'];

/** How a directive's `flag` becomes its enumerator, through `cppEnumerator()`. */
export const FLAG_ENUMERATOR_PATTERN = 'U8G2GL_FLAG_{VALUE^^}';

/** One `<bind_flag_if_*>` directive, understood but not yet spelled. */
export interface FlagComparison {
  /** The runtime method, e.g. `bind_flag_if_eq`. */
  readonly method: string;
  /** The C++ comparison meaning "the flag is clear" (`!=`, `==`, `<=`, `>=`). */
  readonly clearWhen: string;
  /**
   * The §13.2 type `ref` is spelled as: the subject's own. The runtime has one
   * comparison overload per subject type, and a bool subject's takes a bool;
   * an integer literal there converts to `bool` and to the platform's `int32_t`
   * at the same rank wherever `int32_t` is not `int` (it is `long` on xtensa).
   */
  readonly refType: 'bool' | 'int';
  /**
   * `ref_value` as written, except that a bool subject's `0`/`1` — which Pass 5
   * accepts beside `true`/`false` — is normalised to `false`/`true`.
   */
  readonly ref: string;
  /** The flag name, e.g. `hidden`. */
  readonly flag: string;
}

/** One axis of an object's rectangle. */
export interface RectangleAxis {
  readonly axis: 'x' | 'y' | 'width' | 'height';
  /** The axis's own declaration, when the manifest declares it. */
  readonly prop: PropDef | undefined;
  /**
   * The device-space literal, or `undefined` when a binding supplies the axis
   * ([D-20]); it is then passed as 0, and the binding applies the subject's
   * value the moment it is registered.
   */
  readonly value: number | undefined;
}

/** The one rectangle-setter call an object makes. */
export interface Rectangle {
  /** The setter all four axes share, e.g. `set_coords`. */
  readonly setter: string;
  /** The four axes, in {@link RECTANGLE} order. */
  readonly axes: readonly RectangleAxis[];
}

/** One setter prop the author wrote, with the literal the resolver settled. */
export interface WrittenProperty {
  readonly prop: PropDef;
  /** The value as text, ready for `cppValue()`. */
  readonly literal: string;
}

/** An element's `style_*` overrides (§10), resolved against its manifest. */
export interface StyleOverrides {
  /** Overrides naming one of §10's nine that is a setter prop, in manifest declaration order. */
  readonly applied: readonly { readonly prop: PropDef; readonly value: string }[];
  /** Every other key — not one of §10's nine, or no setter prop the element declares — sorted (§13.9). */
  readonly unknown: readonly string[];
}

/** A synthetic declaration for spelling a value of a fixed §13.2 type. */
export function typed(name: string, type: PropDef['type']): PropDef {
  return { name, type };
}

/**
 * @brief A diagnostic for a defect only emission sees, located at the element.
 *
 * Emitted as an error: it refuses the build exactly as a validation error does.
 */
export function emissionError(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
  };
}

// resolvedByNode
// Every resolved element keyed by the expanded node it was resolved from.
// Realisation and resolution are two views of one expanded tree — the resolver
// is handed exactly `element.node` (pipeline.ts) — so the node is the join key,
// and a lookup that misses is a broken pipeline rather than a user error.
function resolvedByNode(elements: readonly ResolvedElement[]): Map<WidgetNode, ResolvedElement> {
  const byNode = new Map<WidgetNode, ResolvedElement>();
  const visit = (nodes: readonly ResolvedElement[]): void => {
    for (const node of nodes) {
      byNode.set(node.node, node);
      visit(node.children);
    }
  };
  visit(elements);
  return byNode;
}

// placeAll
// Pairs every realised element with its manifest and its resolved model moved
// into device coordinates, walking down so each child is placed against its
// container's absolute corner.
//   elements    — realised elements at one level
//   origin      — their container's absolute corner, or undefined when it is bound
//   byNode      — resolved elements by node
//   manifests   — the effective manifests
//   placements, diagnostics — accumulation
function placeAll(
  elements: readonly RealisedElement[],
  origin: Origin | undefined,
  byNode: ReadonlyMap<WidgetNode, ResolvedElement>,
  manifests: ManifestRegistry,
  placements: Map<RealisedElement, Placement>,
  diagnostics: Diagnostic[],
): void {
  for (const element of elements) {
    const manifest = manifests.get(element.element.node.tag);
    const resolved = byNode.get(element.element.node);
    if (manifest === undefined || resolved === undefined) {
      throw new Error(
        `Screen emission found <${element.element.node.tag}> '${element.identifier}' without a ` +
          `${manifest === undefined ? 'manifest' : 'resolved model'}. Emission runs only on a validated, ` +
          `resolved document, so the pipeline has lost an element.`,
      );
    }
    if (origin === undefined) {
      // Reported once, at the first child; the parent's own binding is the cause.
      diagnostics.push(
        emissionError(
          DIAGNOSTIC_CODES.UNRESOLVED_VALUE,
          `'${element.identifier}' sits inside a container whose position is bound to a subject ([D-20]), ` +
            `so it has no absolute position at build time. Give the container a literal x and y, or move ` +
            `this element out of it.`,
          element.element.node.loc,
          element.identifier,
        ),
      );
      return;
    }
    const absolute = absoluteElement(resolved, origin);
    placements.set(element, { manifest, absolute, origin });
    placeAll(element.children, childOrigin(absolute), byNode, manifests, placements, diagnostics);
  }
}

/**
 * @brief Places every element of a screen in device coordinates.
 *
 * @param realised  Realisation's answer for the screen (WO8b).
 * @param resolved  The same screen resolved against the target's display.
 * @param manifests The effective manifests.
 * @return Every element's placement, and a diagnostic per element with no
 *         absolute position at build time.
 * @throws Error if an element has no manifest or no resolved model — a broken
 *         pipeline, never a user error.
 */
export function placeScreen(
  realised: RealisedScreen,
  resolved: ResolvedScreen,
  manifests: ManifestRegistry,
): ScreenPlacements {
  const placements = new Map<RealisedElement, Placement>();
  const diagnostics: Diagnostic[] = [];
  placeAll(realised.elements, DISPLAY_ORIGIN, resolvedByNode(resolved.elements), manifests, placements, diagnostics);
  return { placements, diagnostics };
}

/**
 * @brief The C++ class of an object, and the header that declares it.
 *
 * By [D-12] an element's tag *is* its class — except a composite, whose
 * container is a plain `u8g2gl_obj` (§13.12, corrected): a composite has no C++
 * of its own (§6.4). A framework class's header is `u8g2gl/<tag>.h`; a project
 * class's is `<tag>.hpp`, beside its manifest, as §6.5 lays a custom element out.
 *
 * @param manifest The element's effective manifest.
 * @return The class name and its `#include` line.
 */
export function classOf(manifest: EffectiveManifest): { readonly name: string; readonly include: string } {
  if (manifest.declared.view !== undefined) {
    return { name: ROOT_CLASS_MANIFEST, include: `#include "u8g2gl/${ROOT_CLASS_MANIFEST}.h"` };
  }
  return manifest.origin === 'framework'
    ? { name: manifest.name, include: `#include "u8g2gl/${manifest.name}.h"` }
    : { name: manifest.name, include: `#include "${manifest.name}.hpp"` };
}

/**
 * @brief The setter all four rectangle axes share, or undefined when the
 *        manifest declares no such single setter.
 *
 * Decided from the manifest alone, so the editor registry generates a
 * rectangle thunk for exactly the classes whose objects the firmware sets with
 * one call.
 *
 * @param manifest An effective manifest.
 * @return The shared setter, e.g. `set_coords`.
 */
export function rectangleSetterOf(manifest: EffectiveManifest): string | undefined {
  const props = RECTANGLE.map((axis) => manifest.api.props.find((prop) => prop.name === axis));
  const setter = props[0]?.setter;
  return setter === undefined || props.some((prop) => prop?.setter !== setter) ? undefined : setter;
}

/**
 * @brief The one rectangle-setter call an object makes, or undefined when its
 *        manifest has no single setter shared by all four axes.
 *
 * An axis a binding supplies ([D-20]) may be written without a literal; its
 * value is `undefined` and it is passed as 0, because the binding applies the
 * subject's current value the moment it is registered
 * (u8g2gl_obj::add_value_binding step 4) and bindings are registered before the
 * first frame.
 *
 * @param object    The realised object.
 * @param placement Its manifest and device-space model.
 * @return The setter and the four axes.
 * @throws Error if an axis has neither a literal nor a binding — a gap in
 *         §7.2's "every element fully positioned" rule, which validation should
 *         have refused.
 */
export function rectangleOf(object: RealisedElement, placement: Placement): Rectangle | undefined {
  const setter = rectangleSetterOf(placement.manifest);
  if (setter === undefined) {
    return undefined;
  }
  const props = RECTANGLE.map((axis) => placement.manifest.api.props.find((prop) => prop.name === axis));
  const axes = RECTANGLE.map((axis, index): RectangleAxis => {
    const value = placement.absolute.geometry[axis]?.value;
    if (value !== undefined) {
      return { axis, prop: props[index], value };
    }
    // [D-20] names exactly these four bindings, one per axis: the resolver's
    // one table says which (PR-04 WO11b).
    const supplier = geometryBindingFor(axis).binding;
    if (object.bindings.some((binding) => binding.kind === 'attribute' && binding.attribute === supplier)) {
      return { axis, prop: props[index], value: undefined };
    }
    throw new Error(
      `'${object.identifier}' has no resolved '${axis}' and no binding supplies it. §7.2 requires every ` +
        `element fully positioned, so validation should have refused this document.`,
    );
  });
  return { setter, axes };
}

/**
 * @brief Every other written property, in manifest declaration order (§13.7
 *        "set properties").
 *
 * Only what the author wrote: a prop left at its default is already that value
 * in a default-constructed object (§13.7), and restating it would make every
 * file restate the manifest.
 *
 * A composite's own `<api>` props are **template parameters** (§6.4, §13.6):
 * expansion has already substituted them into the `<view>`, and the container is
 * a plain `u8g2gl_obj` with no such setter. The manifest parser nonetheless
 * gives every prop without `setter=` or `draw=` a default `set_<name>`, so
 * without this filter `title_subject="…"` would emit `bar.set_title_subject(…)`,
 * which does not compile. Only the props the container inherits are its own.
 *
 * @param placement The object's manifest and device-space model.
 * @return Each written setter prop with the literal the resolver settled.
 */
export function writtenProperties(placement: Placement): readonly WrittenProperty[] {
  const written: WrittenProperty[] = [];
  const declared = placement.manifest.declared;
  const templateParameters = new Set(declared.view === undefined ? [] : declared.api.props.map((prop) => prop.name));
  for (const prop of placement.manifest.api.props) {
    if (
      prop.setter === undefined ||
      (RECTANGLE as readonly string[]).includes(prop.name) ||
      templateParameters.has(prop.name)
    ) {
      continue;
    }
    const literal = resolvedLiteralFor(prop, placement.absolute);
    if (literal !== undefined) {
      written.push({ prop, literal });
    }
  }
  return written;
}

/**
 * @brief An element's `style_*` inline overrides, resolved to its own props.
 *
 * An override is applied through the element's own `<prop>` of the same name —
 * the setter and type come from the manifest ([D-17]) — and only if it names
 * one of §10's nine style properties (`isStyleAttribute`, PR-4R WO2): the same
 * rule Pass 4 refuses by, so neither the firmware nor the editor target can
 * apply an override the validator refused. Any other key, including a setter
 * prop outside the nine such as `text`, is returned in `unknown` for the caller
 * to report rather than dropped.
 *
 * @param placement The element's manifest and model.
 * @return The applied overrides in manifest order, and the unknown keys, sorted.
 */
export function styleOverridesOf(placement: Placement): StyleOverrides {
  const overrides = new Map(Object.entries(placement.absolute.node.styleOverrides));
  const applied: { prop: PropDef; value: string }[] = [];
  for (const prop of placement.manifest.api.props) {
    const value = overrides.get(prop.name);
    if (value === undefined || prop.setter === undefined || !isStyleAttribute(prop.name)) {
      continue;
    }
    overrides.delete(prop.name);
    applied.push({ prop, value });
  }
  return { applied, unknown: [...overrides.keys()].sort() };
}

/**
 * @brief The runtime comparison a flag directive names, and its `ref_value`
 *        typed for the subject — or a diagnostic saying why neither exists.
 *
 * @param binding The directive, realised (`kind: 'flag'`).
 * @param owner   The element's identifier, for the message.
 * @param tag     The element's tag, for the message.
 * @return The directive understood, or the diagnostic refusing it.
 */
export function flagComparison(binding: RealisedBinding, owner: string, tag: string): FlagComparison | Diagnostic {
  const directive = binding.directive;
  const loc = binding.loc;
  const comparison = FLAG_COMPARISONS[binding.attribute];
  if (comparison === undefined) {
    return emissionError(
      DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      `<${binding.attribute}> on <${tag}> '${owner}' is not a binding the runtime provides; §8.4's variants ` +
        `are ${Object.keys(FLAG_COMPARISONS).join(', ')}.`,
      loc,
      binding.attribute,
    );
  }
  if (binding.subjectType === undefined || !comparison.subjectTypes.includes(binding.subjectType)) {
    return emissionError(
      DIAGNOSTIC_CODES.TYPE_MISMATCH,
      `<${binding.attribute}> on <${tag}> '${owner}' compares subject '${binding.subject}' ` +
        `(${binding.subjectType ?? 'undeclared'}), but the runtime compares ${binding.attribute} only for ` +
        `${comparison.subjectTypes.join(' and ')} subjects (§8.4).`,
      loc,
      binding.subject,
    );
  }
  const ref = directive?.refValue ?? directive?.value;
  if (ref === undefined || ref === '') {
    return emissionError(
      DIAGNOSTIC_CODES.MISSING_REQUIRED,
      `<${binding.attribute}> on <${tag}> '${owner}' has no 'ref_value', so there is nothing to compare ` +
        `subject '${binding.subject}' against (§8.4).`,
      loc,
      'ref_value',
    );
  }
  // A bool subject's ref is always a bool: Pass 5 accepts `0`/`1` beside
  // `true`/`false`, and the runtime's one bool overload takes a bool, so an
  // integer literal must never reach it (see FlagComparison.refType).
  const isBool = binding.subjectType === 'bool';
  return {
    method: binding.attribute,
    clearWhen: comparison.clearWhen,
    refType: isBool ? 'bool' : 'int',
    ref: isBool ? boolRef(ref) : ref,
    flag: binding.flag ?? '',
  };
}

// boolRef
// A bool subject's `ref_value` as `true`/`false`. Pass 5 admits only those and
// `0`/`1` (validate-types.ts), so anything else passes through unchanged for
// cppValue() to refuse rather than being guessed at here.
//   ref — the attribute as written
function boolRef(ref: string): string {
  if (ref === '0') {
    return 'false';
  }
  if (ref === '1') {
    return 'true';
  }
  return ref;
}
