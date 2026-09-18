/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/screen.ts
 * Purpose: One screen's translation unit — `ui_screen_<name>.cpp` (§13.7) — the
 *          file where realisation's decisions ([D-18], §13.5) and the flat
 *          object model (§13.3) finally become C++ a compiler reads and a human
 *          reviews ([D-11]). Nothing here decides anything: which elements are
 *          objects, their indices, their parents, their bindings and overloads,
 *          and each draw call's build-time visibility were all settled by
 *          realisation (WO8b); every value is spelled by the shared value helper
 *          and every draw call by the shared draw-argument helper (WO9). This
 *          module lays those answers out in the order §13.7 and §13.12 fix.
 *
 *          Two rules are load-bearing and easy to break by "simplifying":
 *          - **Every object renders through `u8g2gl_render_object()`**, never
 *            `obj.render(d)`. The wrapper is what checks effective visibility
 *            (a hidden container hides its children), sets the ancestor-
 *            intersected clip and saves draw state (§11.3). A direct call would
 *            draw a hidden object, unclipped (PR-04 WO4 F7).
 *          - **Draw order is document order** ([D-4]). Objects and draw calls
 *            interleave exactly as the author wrote them; adjacent draw calls
 *            that share a guard may share one `if`, but nothing is ever moved
 *            to create that opportunity (§13.5).
 *
 * Description: The unit holds, in order: the widget headers it uses; the static
 *              objects in array order (a composite's container is a plain
 *              `u8g2gl_obj`, §13.12); the object and parent tables; `init`
 *              (construct → set properties → apply styles → register bindings,
 *              §13.7); `activate`/`deactivate`; `tick`, the minimum deadline
 *              across every object ([D-15]); `render`; and the `u8g2gl_screen`
 *              descriptor `ui_handler()` drives.
 *
 *              Coordinates are converted from the resolver's container-relative
 *              space into the runtime's absolute one through `placement.ts`.
 *
 *              Binding registration ignores the `bool` each `bind_*` returns:
 *              capacities are exact ([D-21] §4), so exhaustion cannot happen in
 *              generated code, and the compile layer's fixture asserts the pool
 *              equals the counted total from inside the library build.
 *
 *              Some defects reach emission because no validator pass looks at
 *              them — a flag directive with no `ref_value`, a comparison the
 *              runtime has no overload for, a `style_*` override the element
 *              cannot take, a style on an element with no object, a drawing
 *              element whose size nothing supplies. Each becomes a
 *              diagnostic that refuses the build, never a guess in committed C++.
 *
 * Exports:
 * - ScreenEmitInput:            What emitting one screen needs
 * - screenUnitPath():           `ui_screen_<name>.cpp`
 * - emitScreenUnit():           Emit one screen's translation unit
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../../schema/diagnostic.js';
import type { SubjectType } from '../../schema/globals.js';
import type { SourceLocation } from '../../schema/source-location.js';
import type { PropDef } from '../../schema/widget-manifest.js';
import type { WidgetNode } from '../../schema/widget-node.js';
import { ROOT_CLASS_MANIFEST, type EffectiveManifest, type ManifestRegistry } from '../../manifest/index.js';
import {
  screenFunctionIdentifier,
  screenTableIdentifier,
  subjectIdentifier,
  type ResolvedElement,
  type ResolvedScreen,
} from '../../resolver/index.js';
import {
  U8G2GL_NO_PARENT,
  type RealisedBinding,
  type RealisedElement,
  type RealisedScreen,
  type VisibilityTerm,
} from '../realise/index.js';
import { boundValueFor, drawCallFor, resolvedLiteralFor, SUBJECT_READ_SUFFIX } from './draw-args.js';
import { absoluteElement, childOrigin, DISPLAY_ORIGIN, type Origin } from './placement.js';
import { includeBlock, section, type EmittedUnit } from './unit.js';
import { cppEnumerator, cppValue } from './value.js';
import { screenDescriptorIdentifier, UI_HEADER } from './ui-hpp.js';

/** Everything emitting one screen needs. */
export interface ScreenEmitInput {
  /** Realisation's answer for this screen: objects, parents, draw order (WO8b). */
  readonly realised: RealisedScreen;
  /** The same screen resolved against the target's display — the same expanded tree. */
  readonly resolved: ResolvedScreen;
  /** Effective manifests, for each element's props, setters and class. */
  readonly manifests: ManifestRegistry;
  /** This file's header stamp, already rendered. */
  readonly stamp: string;
}

/** The runtime header declaring `u8g2gl_draw_*` (§6.2). */
const DRAW_HEADER = '#include "u8g2gl/u8g2gl_draw.h"';

/**
 * The rectangle §7.2's contract names. On a class-backed manifest all four share
 * one setter, `set_coords`, so they are emitted as one call in this order rather
 * than four — the runtime has no single-axis spelling of an initial position
 * that marks dirty once.
 */
const RECTANGLE: readonly ('x' | 'y' | 'width' | 'height')[] = ['x', 'y', 'width', 'height'];

/**
 * What the runtime's `bind_flag_if_*` overloads accept (`u8g2gl_obj.h`), and the
 * comparison that means "this flag is clear" when a draw call reads the subject
 * itself.
 *
 * This mirrors the runtime's overload set rather than any element: an int
 * subject compares four ways, a bool subject only for equality, and a string or
 * time subject not at all. A comparison outside this table has no C++ to call,
 * so it is a diagnostic rather than a compile error in the user's build.
 */
const FLAG_COMPARISONS: Readonly<
  Record<string, { readonly clearWhen: string; readonly subjectTypes: readonly SubjectType[] }>
> = {
  bind_flag_if_eq: { clearWhen: '!=', subjectTypes: ['int', 'bool'] },
  bind_flag_if_not_eq: { clearWhen: '==', subjectTypes: ['int', 'bool'] },
  bind_flag_if_gt: { clearWhen: '<=', subjectTypes: ['int'] },
  bind_flag_if_lt: { clearWhen: '>=', subjectTypes: ['int'] },
};

/** A synthetic declaration for spelling a value of a fixed §13.2 type. */
function typed(name: string, type: PropDef['type']): PropDef {
  return { name, type };
}

/** `ui_screen_home.cpp` (§13.7). */
export function screenUnitPath(screen: string): string {
  return `ui_screen_${screen}.cpp`;
}

/** One element, placed: its manifest and its resolved model in device coordinates. */
interface Placement {
  readonly manifest: EffectiveManifest;
  readonly absolute: ResolvedElement;
}

/** What emitting one screen accumulates. */
interface ScreenContext {
  readonly placements: Map<RealisedElement, Placement>;
  readonly diagnostics: Diagnostic[];
}

// emissionError
// A diagnostic for a defect only emission sees, located at the element. Emitted
// as an error: it refuses the build exactly as a validation error does.
function emissionError(code: string, message: string, loc: SourceLocation | undefined, offendingText: string): Diagnostic {
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
//   elements — realised elements at one level
//   origin   — their container's absolute corner, or undefined when it is bound
//   byNode   — resolved elements by node
//   manifests, context — lookup and accumulation
function placeAll(
  elements: readonly RealisedElement[],
  origin: Origin | undefined,
  byNode: ReadonlyMap<WidgetNode, ResolvedElement>,
  manifests: ManifestRegistry,
  context: ScreenContext,
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
      context.diagnostics.push(
        emissionError(
          DIAGNOSTIC_CODES.UNRESOLVED_GEOMETRY,
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
    context.placements.set(element, { manifest, absolute });
    placeAll(element.children, childOrigin(absolute), byNode, manifests, context);
  }
}

// placementOf
// The placement recorded for an element. Every element was placed before any
// line is emitted, so a miss here means placeAll stopped early on a diagnostic —
// the caller is already refusing the build.
function placementOf(element: RealisedElement, context: ScreenContext): Placement | undefined {
  return context.placements.get(element);
}

// classOf
// The C++ class of an object, and the header that declares it.
//
// By [D-12] an element's tag *is* its class — except a composite, whose
// container is a plain `u8g2gl_obj` (§13.12, corrected): a composite has no C++
// of its own (§6.4). A framework class's header is `u8g2gl/<tag>.h`; a project
// class's is `<tag>.hpp`, beside its manifest, as §6.5 lays a custom element out.
function classOf(manifest: EffectiveManifest): { readonly name: string; readonly include: string } {
  if (manifest.declared.view !== undefined) {
    return { name: ROOT_CLASS_MANIFEST, include: `#include "u8g2gl/${ROOT_CLASS_MANIFEST}.h"` };
  }
  return manifest.origin === 'framework'
    ? { name: manifest.name, include: `#include "u8g2gl/${manifest.name}.h"` }
    : { name: manifest.name, include: `#include "${manifest.name}.hpp"` };
}

// describeObject
// The trailing comment on an object's declaration: its index, and what it is,
// so a reviewer can read the parent table against the declarations (§13.12).
function describeObject(object: RealisedElement, objects: readonly RealisedElement[], manifest: EffectiveManifest): string {
  const index = object.objectIndex ?? 0;
  const parts: string[] = [String(index)];
  if (manifest.declared.view !== undefined) {
    parts.push('composite container');
  }
  if (object.parentIndex !== U8G2GL_NO_PARENT) {
    parts.push(`child of ${objects[object.parentIndex]?.identifier ?? '?'}`);
  }
  return parts.join('  ');
}

// geometryLine
// The one `set_coords` call for an object's rectangle, or undefined when its
// manifest has no rectangle setter.
//
// An axis a binding supplies ([D-20]) may be written without a literal; it is
// emitted as 0 and named in a comment, because the binding applies the subject's
// current value the moment it is registered (u8g2gl_obj::add_value_binding step
// 4) and bindings are registered before the first frame. Any other missing axis
// is a gap in §7.2's "every element fully positioned" rule, so it throws.
function geometryLine(object: RealisedElement, placement: Placement): string | undefined {
  const props = RECTANGLE.map((axis) => placement.manifest.api.props.find((prop) => prop.name === axis));
  const setter = props[0]?.setter;
  if (setter === undefined || props.some((prop) => prop?.setter !== setter)) {
    return undefined;
  }
  const bound: string[] = [];
  const args = RECTANGLE.map((axis, index) => {
    const value = placement.absolute.geometry[axis]?.value;
    if (value !== undefined) {
      return cppValue(props[index] ?? typed(axis, 'int'), String(value));
    }
    // [D-20] names exactly these four bindings, one per axis.
    if (object.bindings.some((binding) => binding.kind === 'attribute' && binding.attribute === `bind_${axis}`)) {
      bound.push(axis);
      return '0';
    }
    throw new Error(
      `'${object.identifier}' has no resolved '${axis}' and no binding supplies it. §7.2 requires every ` +
        `element fully positioned, so validation should have refused this document.`,
    );
  });
  const note = bound.length === 0 ? '' : `  // ${bound.join(', ')}: set by its binding below`;
  return `    ${object.identifier}.${setter}(${args.join(', ')});${note}`;
}

// propertyLines
// Every other written property, as setter calls in manifest declaration order
// (§13.7 "set properties"). Only what the author wrote is emitted: a prop left at
// its default is already that value in a default-constructed object (§13.7), and
// emitting it anyway would make every file restate the manifest.
//
// A composite's own `<api>` props are **template parameters** (§6.4, §13.6):
// expansion has already substituted them into the `<view>`, and the container is
// a plain `u8g2gl_obj` with no such setter. The manifest parser nonetheless
// gives every prop without `setter=` or `draw=` a default `set_<name>`, so
// without this filter `title_subject="…"` would emit `bar.set_title_subject(…)`,
// which does not compile. Only the props the container inherits are its own.
function propertyLines(object: RealisedElement, placement: Placement): string[] {
  const lines: string[] = [];
  const declared = placement.manifest.declared;
  const templateParameters = new Set(
    declared.view === undefined ? [] : declared.api.props.map((prop) => prop.name),
  );
  for (const prop of placement.manifest.api.props) {
    if (
      prop.setter === undefined ||
      (RECTANGLE as readonly string[]).includes(prop.name) ||
      templateParameters.has(prop.name)
    ) {
      continue;
    }
    const literal = resolvedLiteralFor(prop, placement.absolute);
    if (literal === undefined) {
      continue;
    }
    lines.push(`    ${object.identifier}.${prop.setter}(${cppValue(prop, literal)});`);
  }
  return lines;
}

// namedStyles
// The styles an element names, in the order they layer: the `style` attribute,
// then each `<style>` child as written (§10).
function namedStyles(node: WidgetNode): string[] {
  const names: string[] = [];
  if (typeof node.attributes.style === 'string' && node.attributes.style !== '') {
    names.push(node.attributes.style);
  }
  for (const child of node.children) {
    if ('kind' in child && child.kind === 'style' && child.name !== '') {
      names.push(child.name);
    }
  }
  return names;
}

// styleLines
// §13.7's "apply styles" step: each named style merged in order, then the
// element's own `style_*` inline overrides, which §10 defines as overriding.
//
// An override is spelled through the element's own `<prop>` of the same name —
// the setter and type come from the manifest ([D-17]). No validator pass checks
// `style_*` keys or values today, so a key the element does not declare, or a
// value its type cannot spell, is reported here rather than thrown.
function styleLines(object: RealisedElement, placement: Placement, context: ScreenContext): string[] {
  const node = placement.absolute.node;
  const lines = namedStyles(node).map(
    (name) => `    ${object.identifier}.apply_style(${cppValue(typed('style', 'style'), name)});`,
  );
  const overrides = new Map(Object.entries(node.styleOverrides));
  for (const prop of placement.manifest.api.props) {
    const value = overrides.get(prop.name);
    if (value === undefined || prop.setter === undefined) {
      continue;
    }
    overrides.delete(prop.name);
    try {
      lines.push(`    ${object.identifier}.${prop.setter}(${cppValue(prop, value)});`);
    } catch (error) {
      context.diagnostics.push(
        emissionError(
          DIAGNOSTIC_CODES.TYPE_MISMATCH,
          `'style_${prop.name}="${value}"' on <${node.tag}> '${object.identifier}' is not a ${prop.type} value ` +
            `(§10, §13.2). ${error instanceof Error ? error.message : ''}`.trim(),
          node.attributeLocs?.[`style_${prop.name}`] ?? node.loc,
          value,
        ),
      );
    }
  }
  // What is left names a property this element does not declare.
  for (const key of [...overrides.keys()].sort()) {
    context.diagnostics.push(
      emissionError(
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
        `'style_${key}' on <${node.tag}> '${object.identifier}' overrides '${key}', which <${node.tag}> does ` +
          `not declare as a property, so there is no setter to apply it with (§10, [D-17]).`,
        node.attributeLocs?.[`style_${key}`] ?? node.loc,
        `style_${key}`,
      ),
    );
  }
  return lines;
}

// flagComparison
// The runtime comparison a flag directive names, and its `ref_value` spelled for
// the subject's type — or a diagnostic saying why neither exists.
function flagComparison(
  binding: RealisedBinding,
  owner: string,
  tag: string,
): { readonly method: string; readonly clearWhen: string; readonly ref: string; readonly flag: string } | Diagnostic {
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
  // A bool subject accepts `true`/`false` as well as `0`/`1` (Pass 5); the
  // runtime has an overload for each, so each is spelled as its own type.
  const refType = binding.subjectType === 'bool' && (ref === 'true' || ref === 'false') ? 'bool' : 'int';
  return {
    method: binding.attribute,
    clearWhen: comparison.clearWhen,
    ref: cppValue(typed('ref_value', refType), ref),
    flag: cppEnumerator('U8G2GL_FLAG_{VALUE^^}', binding.flag ?? ''),
  };
}

// bindingLines
// §13.7's last init step, and §13.8's spelling. An attribute binding calls the
// method of the overload realisation chose for the subject's type (WO8b) —
// never re-selected by name, because `bind_text` is declared once per type.
function bindingLines(object: RealisedElement, placement: Placement, context: ScreenContext): string[] {
  const node = placement.absolute.node;
  const lines: string[] = [];
  for (const binding of object.bindings) {
    const subject = cppValue(typed('subject', 'subject'), binding.subject);
    if (binding.kind === 'attribute') {
      const declaration = binding.declaration;
      if (declaration === undefined) {
        throw new Error(
          `'${object.identifier}' binds '${binding.subject}' through '${binding.attribute}', but realisation ` +
            `chose no overload for its type. Pass 5 refuses that document, so validation let it through.`,
        );
      }
      const fmt = declaration.fmt === undefined ? undefined : node.attributes[declaration.fmt];
      const fmtArg = typeof fmt === 'string' ? `, ${cppValue(typed(declaration.fmt ?? 'fmt', 'string'), fmt)}` : '';
      lines.push(`    ${object.identifier}.${declaration.setter}(${subject}${fmtArg});`);
      continue;
    }
    const comparison = flagComparison(binding, object.identifier, node.tag);
    if ('code' in comparison) {
      context.diagnostics.push(comparison);
      continue;
    }
    lines.push(`    ${object.identifier}.${comparison.method}(${subject}, ${comparison.ref}, ${comparison.flag});`);
  }
  return lines;
}

// guardOf
// A draw-call element's build-time visibility (§13.5) as one C++ condition, or
// '' when it is unconditional. Ancestors first, outermost first, then its own
// bound `hidden` flags — the order realisation recorded.
function guardOf(element: RealisedElement, tag: string, context: ScreenContext): string {
  const terms: string[] = [];
  for (const term of element.visibility ?? ([] as readonly VisibilityTerm[])) {
    if (term.kind === 'ancestor_visible') {
      terms.push(`!${term.identifier}.is_hidden()`);
      continue;
    }
    const binding = element.bindings.find((candidate) => candidate.directive === term.directive);
    if (binding === undefined) {
      throw new Error(`A visibility term of '${element.identifier}' names a directive it does not carry.`);
    }
    const comparison = flagComparison(binding, element.identifier, tag);
    if ('code' in comparison) {
      context.diagnostics.push(comparison);
      continue;
    }
    terms.push(`${subjectIdentifier(term.subject)}${SUBJECT_READ_SUFFIX} ${comparison.clearWhen} ${comparison.ref}`);
  }
  return terms.join(' && ');
}

/** One statement of a render function, with the condition that guards it. */
interface RenderStep {
  /** '' when unconditional. */
  readonly guard: string;
  readonly line: string;
}

// drawCallStep
// A draw-call element's statement and its guard. (A literal `hidden` never
// reaches here: a drawing manifest declares no `hidden` prop, so Pass 4 refuses
// it; a drawing element is hidden only through a bound flag, which is a guard.)
function drawCallStep(element: RealisedElement, placement: Placement, context: ScreenContext): RenderStep {
  const node = placement.absolute.node;
  // A draw-call element has nothing to apply a style to (§13.5): no object, and
  // the `u8g2gl_draw_*` functions take no style. Dropping it would silently
  // change what the author wrote, so it is refused.
  if (namedStyles(node).length > 0 || Object.keys(node.styleOverrides).length > 0) {
    context.diagnostics.push(
      emissionError(
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
        `<${node.tag}> '${element.identifier}' has a style, but it compiles to a draw call with no object to ` +
          `apply one to (§13.5, §10). Remove the style.`,
        node.loc,
        element.identifier,
      ),
    );
  }
  // Every argument needs a source: bound, written, or a declared default. The
  // drawing manifests stopped marking geometry `required` so that a binding or an
  // anchor could supply it (PR-04 WO10, §8.4), but no validator pass checks that
  // *something* then does — WO7b's positioning rule covers an under-determined
  // start, not a size that is simply absent. So a box with no width and no
  // bind_width reaches here, and is refused rather than thrown on.
  const missing = placement.manifest.api.props.filter(
    (prop) =>
      prop.draw !== undefined &&
      prop.default === undefined &&
      boundValueFor(prop, element.bindings) === undefined &&
      resolvedLiteralFor(prop, placement.absolute) === undefined,
  );
  if (missing.length > 0) {
    for (const prop of missing) {
      context.diagnostics.push(
        emissionError(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `<${node.tag}> '${element.identifier}' has no '${prop.name}': it is not written, no anchor ` +
            `settles it, and no binding supplies it (bind_${prop.name}), so its draw call has no ` +
            `argument to pass (§6.2, §8.4).`,
          node.loc,
          prop.name,
        ),
      );
    }
    return { guard: '', line: '' };
  }
  const call = drawCallFor({ manifest: placement.manifest, resolved: placement.absolute, bindings: element.bindings });
  return {
    guard: guardOf(element, node.tag, context),
    line: `    ${call.fn}(display, ${call.args.join(', ')});  // ${element.identifier}: no object (§13.5)`,
  };
}

// renderBody
// The render function's statements in document order ([D-4]), with adjacent
// draw calls sharing an identical guard hoisted into one block — never reordered
// to create one (§13.5).
function renderBody(steps: readonly RenderStep[]): string[] {
  const lines: string[] = [];
  let index = 0;
  while (index < steps.length) {
    const step = steps[index];
    if (step === undefined) {
      break;
    }
    if (step.guard === '') {
      lines.push(step.line);
      index += 1;
      continue;
    }
    lines.push(`    if (${step.guard}) {`);
    while (index < steps.length && steps[index]?.guard === step.guard) {
      lines.push(`    ${steps[index]?.line ?? ''}`);
      index += 1;
    }
    lines.push('    }');
  }
  return lines;
}

// stepsOrNone
// A step's lines, or a comment saying the step has nothing to do, so every
// init reads with the same four steps whatever the screen holds.
function stepsOrNone(lines: readonly string[], none: string): string[] {
  return lines.length === 0 ? [`    // ${none}`] : [...lines];
}

/**
 * @brief Emits one screen's translation unit (§13.7, §13.12).
 *
 * @param input The screen's realisation and resolution, the manifests, and the
 *              file's stamp.
 * @return The unit, or empty content with the diagnostics that refused it.
 * @throws Error only for a document validation should have refused — a missing
 *         manifest or resolved model, an unpositioned element, or a binding
 *         with no chosen overload.
 */
export function emitScreenUnit(input: ScreenEmitInput): EmittedUnit {
  const { realised, resolved, manifests } = input;
  const name = realised.screen.name;
  const objs = screenTableIdentifier(name, 'objs');
  const parents = screenTableIdentifier(name, 'parents');
  const fn = (which: string): string => screenFunctionIdentifier(name, which);
  const context: ScreenContext = { placements: new Map(), diagnostics: [] };

  // --- Step 1: Place every element in device coordinates ---
  placeAll(realised.elements, DISPLAY_ORIGIN, resolvedByNode(resolved.elements), manifests, context);
  if (context.diagnostics.length > 0) {
    return { content: '', diagnostics: context.diagnostics };
  }
  const placed = (element: RealisedElement): Placement => {
    const placement = placementOf(element, context);
    if (placement === undefined) {
      throw new Error(`'${element.identifier}' was not placed.`);
    }
    return placement;
  };

  const objects = realised.objects;
  const hasObjects = objects.length > 0;

  // --- Step 2: The includes this unit needs, sorted (§13.9) ---
  const includes = objects.map((object) => classOf(placed(object).manifest).include);
  if (realised.drawOrder.some((step) => step.kind === 'draw_calls')) {
    includes.push(DRAW_HEADER);
  }

  // --- Step 3: Each part of the unit, in §13.12's order ---
  const declarations = objects.map((object) => {
    const manifest = placed(object).manifest;
    return `static ${classOf(manifest).name} ${object.identifier};  // ${describeObject(object, objects, manifest)}`;
  });
  const drawnOnly = realised.drawOrder
    .filter((step) => step.kind === 'draw_calls')
    .map((step) => `// "${step.element.identifier}" is not here: no object required (§13.5)`);

  const properties: string[] = [];
  const styles: string[] = [];
  const bindings: string[] = [];
  for (const object of objects) {
    const placement = placed(object);
    const own = [geometryLine(object, placement), ...propertyLines(object, placement)].filter(
      (line): line is string => line !== undefined,
    );
    if (own.length > 0) {
      properties.push(...(properties.length > 0 ? [''] : []), ...own);
    }
    styles.push(...styleLines(object, placement, context));
    bindings.push(...bindingLines(object, placement, context));
  }

  const renderSteps: RenderStep[] = realised.drawOrder.map((step) =>
    step.kind === 'object'
      ? {
          guard: '',
          line: `    u8g2gl_render_object(display, ${objs}, ${parents}, ${step.objectIndex});  // ${step.element.identifier}`,
        }
      : drawCallStep(step.element, placed(step.element), context),
  );
  if (context.diagnostics.length > 0) {
    return { content: '', diagnostics: context.diagnostics };
  }

  // --- Step 4: Lay the unit out ---
  const lines: string[] = [input.stamp.trimEnd(), '', `#include "${UI_HEADER}"`];
  const sortedIncludes = includeBlock(includes);
  if (sortedIncludes !== '') {
    lines.push('', sortedIncludes);
  }

  lines.push('', section('Objects, in document order: index is draw order (§13.3)'));
  if (!hasObjects) {
    lines.push('// This screen has no objects; everything on it is a draw call (§13.5).');
  }
  lines.push(...declarations, ...drawnOnly);

  if (hasObjects) {
    lines.push(
      '',
      section('Object and parent tables (§13.3)'),
      '// Parallel arrays: parents[i] is the index of the object containing objs[i],',
      '// or U8G2GL_NO_PARENT directly under <view>. Visibility and clipping walk',
      '// up this table at render time.',
      `static u8g2gl_obj* const ${objs}[] = {`,
      ...objects.map((object) => `    &${object.identifier},`),
      '};',
      `static const uint8_t ${parents}[] = {`,
      ...objects.map(
        (object) =>
          `    ${object.parentIndex === U8G2GL_NO_PARENT ? 'U8G2GL_NO_PARENT' : String(object.parentIndex)},  // ${object.identifier}`,
      ),
      '};',
    );
  }

  lines.push(
    '',
    section('init: construct, set properties, apply styles, register bindings (§13.7)'),
    `void ${fn('init')}() {`,
    '    // --- Step 1: Construct ---',
    '    // Every object above is a default-constructed static (§13.7); nothing to do.',
    '',
    '    // --- Step 2: Set properties ---',
    ...stepsOrNone(properties, 'No properties to set.'),
    '',
    '    // --- Step 3: Apply styles (§10) ---',
    ...stepsOrNone(styles, 'No styles to apply.'),
    '',
    '    // --- Step 4: Register bindings, last, so no observer fires against a',
    '    // partly configured object (§13.7) ---',
    ...(bindings.length === 0
      ? ['    // No bindings to register.']
      : [
          '    // Each bind_*() returns false only when a pool is full. The pools are',
          '    // sized from exactly these bindings ([D-21]), so the result is not checked.',
          ...bindings,
        ]),
    '}',
    '',
    section('activate / deactivate (§12.4)'),
    '// Nothing to do: events and focus are not generated until PR-09, and',
    '// u8g2gl_set_active_screen() already marks the new screen dirty.',
    `void ${fn('activate')}() {}`,
    '',
    `void ${fn('deactivate')}() {}`,
    '',
    section('tick: the soonest deadline across every object ([D-15])'),
    `uint32_t ${fn('tick')}(uint32_t now_ms) {`,
    ...(hasObjects
      ? [
          '    uint32_t next = U8G2GL_IDLE;',
          ...objects.map((object) => `    next = u8g2gl_min(next, ${object.identifier}.tick(now_ms));`),
          '    return next;',
        ]
      : ['    (void)now_ms;', '    return U8G2GL_IDLE;']),
    '}',
    '',
    section('render: document order, objects and draw calls interleaved ([D-4])'),
    `void ${fn('render')}(U8G2& display) {`,
    '    // Every object goes through u8g2gl_render_object(), never obj.render():',
    '    // the wrapper checks effective visibility, sets the effective clip window',
    '    // and saves and restores draw state, so nothing paints outside its',
    '    // container and a hidden container hides its children (§11.3). A draw',
    '    // call has no object, so its visibility is the build-time guard (§13.5).',
    ...(renderSteps.length === 0 ? ['    (void)display;'] : renderBody(renderSteps)),
    '}',
    '',
    section('The screen descriptor ui_handler() drives (§12.4)'),
    `u8g2gl_screen ${screenDescriptorIdentifier(name)} = {`,
    `    ${hasObjects ? objs : 'nullptr'},`,
    `    ${hasObjects ? parents : 'nullptr'},`,
    `    ${objects.length},`,
    `    ${fn('init')},`,
    `    ${fn('activate')},`,
    `    ${fn('deactivate')},`,
    `    ${fn('tick')},`,
    `    ${fn('render')},`,
    '    false,',
    '};',
    '',
  );

  return { content: lines.join('\n'), diagnostics: [] };
}
