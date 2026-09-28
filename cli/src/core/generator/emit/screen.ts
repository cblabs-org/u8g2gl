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
 *          realisation (WO8b); where each element sits, which properties,
 *          styles and overrides an object sets, the init step order and what a
 *          flag directive compares are settled by `screen-model.ts`; every value
 *          is spelled by the shared value helper and every draw call by the
 *          shared draw-argument helper (WO9). This module is the firmware
 *          target's *spelling* of those answers, in the order §13.7 and §13.12
 *          fix. The editor target (`scene.ts`, PR-04 WO11) spells the same
 *          answers as data, so a change to a decision belongs in
 *          `screen-model.ts`, where both targets see it — never here alone.
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
 *              (construct → apply styles → set properties → register bindings,
 *              §13.7 — styles first so an element's own attributes win, §10); `activate`/`deactivate`; `tick`, the minimum deadline
 *              across every object ([D-15]); `render`; and the `u8g2gl_screen`
 *              descriptor `ui_handler()` drives.
 *
 *              Coordinates are converted from the resolver's container-relative
 *              space into the runtime's absolute one through `placement.ts`, by
 *              `screen-model.ts`'s placeScreen(). init's configuring steps come
 *              from its INIT_STEPS, so the order is stated once for both targets.
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
import { isStyleAttribute, STYLE_ATTRIBUTES } from '../../schema/globals.js';
import { namedStyles } from '../../schema/widget-node.js';
import type { ManifestRegistry } from '../../manifest/index.js';
import {
  screenFunctionIdentifier,
  screenTableIdentifier,
  subjectIdentifier,
  type ResolvedScreen,
} from '../../resolver/index.js';
import { objectIdentifier } from '../../resolver/mangle.js';
import {
  U8G2GL_NO_PARENT,
  type RealisedElement,
  type RealisedScreen,
  type VisibilityTerm,
} from '../../realise/index.js';
import { drawArgumentSources, drawCallFor, SUBJECT_READ_SUFFIX } from './draw-args.js';
import { boundPositionOrigin } from './placement.js';
import {
  classOf,
  emissionError,
  FLAG_ENUMERATOR_PATTERN,
  flagComparison,
  INIT_STEPS,
  placeScreen,
  rectangleOf,
  styleOverridesOf,
  typed,
  writtenProperties,
  type FlagComparison,
  type InitStep,
  type Placement,
} from './screen-model.js';
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
 * The runtime header declaring `u8g2gl_coord_bound()`, which every bound integer
 * draw argument is spelled through (`draw-args.ts`, PR-4R WO4). Emitted with
 * {@link DRAW_HEADER} in every unit that has draw calls, not only where one is
 * bound: deciding that here would re-derive draw-args' rule a second time, and
 * the header holds only inline functions, so an unused include costs nothing.
 * `u8g2gl_draw.h` deliberately does not include it — it forward-declares U8G2
 * rather than pull in `U8g2lib.h`, which this header needs.
 */
const COORD_HEADER = '#include "u8g2gl/u8g2gl_coord.h"';

/** `ui_screen_home.cpp` (§13.7). */
export function screenUnitPath(screen: string): string {
  return `ui_screen_${screen}.cpp`;
}

/** What emitting one screen accumulates. */
interface ScreenContext {
  readonly placements: ReadonlyMap<RealisedElement, Placement>;
  readonly diagnostics: Diagnostic[];
}

// cpp
// An element's C++ object, `ui_obj_<name>` (§13.4). Diagnostics keep the name
// the author wrote; everything that is C++ goes through here.
function cpp(element: { readonly identifier: string }): string {
  return objectIdentifier(element.identifier);
}

// describeObject
// The trailing comment on an object's declaration: its index, and what it is,
// so a reviewer can read the parent table against the declarations (§13.12).
function describeObject(object: RealisedElement, objects: readonly RealisedElement[], placement: Placement): string {
  const index = object.objectIndex ?? 0;
  const parts: string[] = [String(index)];
  if (placement.manifest.declared.view !== undefined) {
    parts.push('composite container');
  }
  if (object.parentIndex !== U8G2GL_NO_PARENT) {
    const parent = objects[object.parentIndex];
    parts.push(`child of ${parent === undefined ? '?' : cpp(parent)}`);
  }
  return parts.join('  ');
}

// geometryLine
// The one `set_coords` call for an object's rectangle (screen-model.ts decides
// it), or undefined when its manifest has no rectangle setter. A bound axis is
// passed as 0 and named in a comment: its binding applies the subject's value
// when it is registered, below.
function geometryLine(object: RealisedElement, placement: Placement): string | undefined {
  const rectangle = rectangleOf(object, placement);
  if (rectangle === undefined) {
    return undefined;
  }
  const bound = rectangle.axes.filter((axis) => axis.value === undefined).map((axis) => axis.axis);
  const args = rectangle.axes.map((axis) =>
    axis.value === undefined ? '0' : cppValue(axis.prop ?? typed(axis.axis, 'int'), String(axis.value)),
  );
  const note = bound.length === 0 ? '' : `  // ${bound.join(', ')}: set by its binding below`;
  return `    ${cpp(object)}.${rectangle.setter}(${args.join(', ')});${note}`;
}

// propertyLines
// Every other written property, as setter calls in manifest declaration order
// (§13.7 "set properties"); which props those are is screen-model.ts's answer.
function propertyLines(object: RealisedElement, placement: Placement): string[] {
  return writtenProperties(placement).map(
    ({ prop, literal }) => `    ${cpp(object)}.${prop.setter ?? ''}(${cppValue(prop, literal)});`,
  );
}

// styleLines
// §13.7's "apply styles" step: each named style merged in order, then the
// element's own `style_*` inline overrides, which §10 defines as overriding.
// It runs before "set properties" (INIT_STEPS), so an attribute the element
// sets itself wins over both.
//
// Pass 4 (checkStyles) refuses these overrides first, and generate() stops on
// its errors, so through the CLI nothing here is reached. Emission still
// reports them, rather than throwing or applying them, because its entry
// points are exported and must never apply an override the validator refuses.
function styleLines(object: RealisedElement, placement: Placement, context: ScreenContext): string[] {
  const node = placement.absolute.node;
  const lines = namedStyles(node).map(
    (name) => `    ${cpp(object)}.apply_style(${cppValue(typed('style', 'style'), name)});`,
  );
  const overrides = styleOverridesOf(placement);
  for (const { prop, value } of overrides.applied) {
    try {
      lines.push(`    ${cpp(object)}.${prop.setter ?? ''}(${cppValue(prop, value)});`);
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
  // What is left was not applied for one of two reasons (PR-4R WO2), and the
  // message says which: the key is not one of §10's nine, whether or not the
  // element has a setter for it; or it is, and the element has no setter to
  // apply it with. The same split, and wording, as Pass 4's checkStyles().
  for (const key of overrides.unknown) {
    const reason = isStyleAttribute(key)
      ? `overrides '${key}', which <${node.tag}> does not declare as a property it sets, so there is no ` +
        `setter to apply it with (§10, [D-17]).`
      : `is not a style override: inline overrides are limited to §10's style properties, ` +
        `${STYLE_ATTRIBUTES.join(', ')}.`;
    context.diagnostics.push(
      emissionError(
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
        `'style_${key}' on <${node.tag}> '${object.identifier}' ${reason}`,
        node.attributeLocs?.[`style_${key}`] ?? node.loc,
        `style_${key}`,
      ),
    );
  }
  return lines;
}

// spelledRef, spelledFlag
// A directive's `ref_value` and flag as C++: the ref as the §13.2 type
// screen-model.ts chose for the subject, the flag through its enumerator pattern.
function spelledRef(comparison: FlagComparison): string {
  return cppValue(typed('ref_value', comparison.refType), comparison.ref);
}
function spelledFlag(comparison: FlagComparison): string {
  return cppEnumerator(FLAG_ENUMERATOR_PATTERN, comparison.flag);
}

// bindingLines
// §13.7's last init step, and §13.8's spelling. An attribute binding calls the
// method of the overload realisation chose for the subject's type (WO8b) —
// never re-selected by name, because `bind_text` is declared once per type. A
// position binding also passes its container's absolute origin as a literal,
// because a bound position is container-relative (§7.2): `bind_x(&s, 40)`.
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
      const origin = boundPositionOrigin(binding.attribute, placement.origin);
      const originArg = origin === undefined ? '' : `, ${cppValue(typed('origin', 'int'), String(origin))}`;
      lines.push(`    ${cpp(object)}.${declaration.setter}(${subject}${fmtArg}${originArg});`);
      continue;
    }
    const comparison = flagComparison(binding, object.identifier, node.tag);
    if ('code' in comparison) {
      context.diagnostics.push(comparison);
      continue;
    }
    lines.push(
      `    ${cpp(object)}.${comparison.method}(${subject}, ${spelledRef(comparison)}, ${spelledFlag(comparison)});`,
    );
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
      terms.push(`!${objectIdentifier(term.identifier)}.is_hidden()`);
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
    terms.push(`${subjectIdentifier(term.subject)}${SUBJECT_READ_SUFFIX} ${comparison.clearWhen} ${spelledRef(comparison)}`);
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
  const missing = drawArgumentSources({
    manifest: placement.manifest,
    resolved: placement.absolute,
    bindings: element.bindings,
    origin: placement.origin,
  })
    .filter((source) => source.kind === 'none')
    .map((source) => source.prop);
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
  const call = drawCallFor({
    manifest: placement.manifest,
    resolved: placement.absolute,
    bindings: element.bindings,
    origin: placement.origin,
  });
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

  // --- Step 1: Place every element in device coordinates ---
  const screenPlacements = placeScreen(realised, resolved, manifests);
  if (screenPlacements.diagnostics.length > 0) {
    return { content: '', diagnostics: [...screenPlacements.diagnostics] };
  }
  const context: ScreenContext = { placements: screenPlacements.placements, diagnostics: [] };
  const placed = (element: RealisedElement): Placement => {
    const placement = context.placements.get(element);
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
    includes.push(DRAW_HEADER, COORD_HEADER);
  }

  // --- Step 3: Each part of the unit, in §13.12's order ---
  const declarations = objects.map((object) => {
    const placement = placed(object);
    return `static ${classOf(placement.manifest).name} ${cpp(object)};  // ${describeObject(object, objects, placement)}`;
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
          line: `    u8g2gl_render_object(display, ${objs}, ${parents}, ${step.objectIndex});  // ${cpp(step.element)}`,
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
      ...objects.map((object) => `    &${cpp(object)},`),
      '};',
      `static const uint8_t ${parents}[] = {`,
      ...objects.map(
        (object) =>
          `    ${object.parentIndex === U8G2GL_NO_PARENT ? 'U8G2GL_NO_PARENT' : String(object.parentIndex)},  // ${cpp(object)}`,
      ),
      '};',
    );
  }

  // The configuring steps in the one order screen-model.ts states (§13.7).
  const stepBlocks: Record<InitStep, { readonly title: string; readonly heading: string[]; readonly body: string[] }> = {
    properties: {
      title: 'set properties',
      heading: ['Set properties ---'],
      body: stepsOrNone(properties, 'No properties to set.'),
    },
    styles: {
      title: 'apply styles',
      heading: ['Apply styles (§10) ---'],
      body: stepsOrNone(styles, 'No styles to apply.'),
    },
    bindings: {
      title: 'register bindings',
      heading: [
        'Register bindings, last, so no observer fires against a',
        '    // partly configured object (§13.7) ---',
      ],
      body:
        bindings.length === 0
          ? ['    // No bindings to register.']
          : [
              '    // Each bind_*() returns false only when a pool is full. The pools are',
              '    // sized from exactly these bindings ([D-21]), so the result is not checked.',
              ...bindings,
            ],
    },
  };
  const initSteps = INIT_STEPS.flatMap((step, index) => {
    const block = stepBlocks[step];
    const [first, ...rest] = block.heading;
    return ['', `    // --- Step ${index + 2}: ${first ?? ''}`, ...rest, ...block.body];
  });
  lines.push(
    '',
    section(`init: construct, ${INIT_STEPS.map((step) => stepBlocks[step].title).join(', ')} (§13.7)`),
    `void ${fn('init')}() {`,
    '    // --- Step 1: Construct ---',
    '    // Every object above is a default-constructed static (§13.7); nothing to do.',
    ...initSteps,
    '}',
    '',
    section('activate / deactivate (§12.4)'),
    '// Nothing to do: this build generates no event or focus handling, and',
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
          ...objects.map((object) => `    next = u8g2gl_min(next, ${cpp(object)}.tick(now_ms));`),
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
