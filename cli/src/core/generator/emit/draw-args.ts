/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/draw-args.ts
 * Purpose: The second of the two shared emission helpers: a drawing element's
 *          `u8g2gl_draw_*` call, assembled once. A drawing element has no class
 *          ([D-18]), so it reaches the display as a positional call — and a
 *          positional call is the most dangerous thing a generator emits,
 *          because an argument in the wrong place still compiles. Putting the
 *          order in one function means the firmware emitter (WO10) and the
 *          editor's draw-by-name table (WO11) cannot disagree about it, and
 *          WO11's parity test is what holds them to that.
 * Description: The argument order **is the manifest's declaration order**, which
 *              is the order WO2's cross-test proved matches each runtime free
 *              function's parameter list — so the mapping needs no translation
 *              table ([D-17], and `u8g2gl_draw.h`'s own header says the same
 *              from the runtime's side). Each argument is spelled through
 *              {@link cppValue}, so §13.2 is applied in exactly one place.
 *
 *              Three sources, in this order of precedence per prop:
 *              1. **bound** ([D-20]) — the value is read from the subject at
 *                 draw time, because a full-frame redraw ([D-4]) means a
 *                 stateless element need not store it (§13.5);
 *              2. **written** — the literal the resolver settled, taken from
 *                 whichever of the resolved geometry, endpoints/radii or `int`
 *                 properties holds it, never re-parsed from the attribute text;
 *              3. **declared default** — the manifest's.
 *
 *              The leading `U8G2& display` parameter is *not* returned: it is
 *              not a prop, and the caller emitting the statement supplies it.
 *              Isomorphic; deterministic (§13.9).
 *
 * Exports:
 * - SUBJECT_READ_SUFFIX: How a bound value is read at draw time
 * - DrawCall:            A free function and its argument list
 * - DrawCallInput:       What assembling one needs
 * - DrawFunction:        A drawing element's function and argument props
 * - DrawArgumentSource:  Where one argument comes from — bound, written, default
 * - drawFunctionOf():    The function and argument order (shared with the editor registry)
 * - drawArgumentSources(): Each argument's source, by the one precedence rule
 * - drawCallFor():       Assemble a drawing element's call
 * - bindingFor():        The binding driving a prop, if any
 * - resolvedLiteralFor(): The settled literal for one prop (shared with object setters)
 * - boundValueFor():     The draw-time subject read for one prop, if a binding drives it
 */

import type { EffectiveManifest } from '../../manifest/manifest-registry.js';
import type { PropDef } from '../../schema/widget-manifest.js';
import { subjectIdentifier, type ResolvedElement } from '../../resolver/index.js';
import type { RealisedBinding } from '../realise/index.js';
import { cppValue } from './value.js';

/**
 * How generated code reads a bound value at draw time.
 *
 * `get()`, the accessor every `u8g2gl_subject_*_base` declares. design_spec
 * §13.5's illustration writes `ui_subject_level.value`, but no subject class
 * exposes a public `value` member — it is private, behind `get()` — so the
 * spec's example would not compile. The runtime API is followed and the
 * disagreement is recorded rather than resolved here.
 */
export const SUBJECT_READ_SUFFIX = '.get()';

/** One `u8g2gl_draw_*` call, ready for a caller to spell as a statement. */
export interface DrawCall {
  /** The free function, e.g. `u8g2gl_draw_box` (§6.2). */
  readonly fn: string;
  /**
   * Its arguments in manifest declaration order, **excluding** the leading
   * `U8G2& display`.
   */
  readonly args: readonly string[];
}

/** A drawing element's free function and its argument props, in order. */
export interface DrawFunction {
  /** The free function, e.g. `u8g2gl_draw_box` (§6.2). */
  readonly fn: string;
  /** The `draw=` props, in declaration order — which is parameter order (WO2). */
  readonly props: readonly PropDef[];
}

/**
 * Where one argument of a draw call comes from. `none` is a prop with no binding,
 * no written value and no default — a gap in validation, which the firmware
 * emitter refuses before spelling the call.
 */
export type DrawArgumentSource =
  | { readonly prop: PropDef; readonly kind: 'bound'; readonly binding: RealisedBinding }
  | { readonly prop: PropDef; readonly kind: 'written' | 'default'; readonly literal: string }
  | { readonly prop: PropDef; readonly kind: 'none' };

/** Everything {@link drawCallFor} needs about one drawing element. */
export interface DrawCallInput {
  /** The element's effective manifest — the source of the props and their order. */
  readonly manifest: EffectiveManifest;
  /** Its resolved geometry, endpoints, radii and `int` properties. */
  readonly resolved: ResolvedElement;
  /** Its bindings, with the overload realisation already chose (WO8b). */
  readonly bindings: readonly RealisedBinding[];
}

// argumentError
// The programmer error for an argument that cannot be produced. Emission runs
// only on a validated document, so reaching here means validation let something
// through — not that the author made a mistake.
function argumentError(manifest: EffectiveManifest, prop: PropDef, why: string): Error {
  return new Error(
    `Cannot emit the '${prop.name}' argument of <${manifest.name}>'s draw call: ${why}. Emission runs ` +
      `only on a validated document, so this is a gap in validation (§13.1, §13.2).`,
  );
}

/**
 * @brief The draw-time read for a prop a subject drives, or undefined when none
 *        does.
 *
 * On a drawing manifest a `<bind>`'s `setter=` names a **prop**, not a method —
 * `<bind name="bind_width" setter="width" />` — which is the two-meanings
 * ambiguity §13.1 criticises, kept for PR-04 by the Chief Architect's ruling and
 * recorded as Q-9 for the next schema bump. It is read that way here because
 * that is what the shipped manifests mean.
 *
 * Exported (PR-04 WO10) with {@link resolvedLiteralFor}, so the screen emitter
 * can tell before assembling a call whether an argument has any source at all,
 * by the same rule this module applies. Behaviour is unchanged.
 *
 * @param prop     The prop being emitted.
 * @param bindings The element's realised bindings.
 * @return The subject read, e.g. `ui_subject_level.get()`.
 */
export function boundValueFor(prop: PropDef, bindings: readonly RealisedBinding[]): string | undefined {
  const bound = bindingFor(prop, bindings);
  return bound === undefined ? undefined : `${subjectIdentifier(bound.subject)}${SUBJECT_READ_SUFFIX}`;
}

/**
 * @brief The binding that drives a drawing element's prop, or undefined when
 *        none does.
 *
 * The lookup {@link boundValueFor} spells as a subject read, kept separate
 * (PR-04 WO11) so the editor's scene description names the same binding without
 * a second copy of the rule that a drawing manifest's `setter=` names a prop.
 *
 * @param prop     The prop being emitted.
 * @param bindings The element's realised bindings.
 * @return The attribute binding whose declaration drives `prop`.
 */
export function bindingFor(prop: PropDef, bindings: readonly RealisedBinding[]): RealisedBinding | undefined {
  return bindings.find((binding) => binding.kind === 'attribute' && binding.declaration?.setter === prop.name);
}

/**
 * @brief The literal the resolver settled for a prop, as text, or undefined when
 *        the author wrote nothing.
 *
 * Read from the resolved model rather than from the attribute, always: the
 * attribute may have been an expression or an anchor, and the resolver is the
 * one thing that knows what it came to ([D-7]). A prop is in exactly one of the
 * three places, by what kind of value it is.
 *
 * Exported (PR-04 WO10) because an object's setter arguments are read exactly
 * the same way as a draw call's, and a second copy of this lookup in the screen
 * emitter would be a second place for the two to disagree — the duplication
 * PROJECT.md's sharing decision exists to prevent. Behaviour is unchanged.
 *
 * @param prop     The prop being emitted.
 * @param resolved The resolved element.
 * @return The value as text, ready for {@link cppValue}.
 */
export function resolvedLiteralFor(prop: PropDef, resolved: ResolvedElement): string | undefined {
  // --- Step 1: The rectangle (§7.2) ---
  if (prop.name === 'x' || prop.name === 'y' || prop.name === 'width' || prop.name === 'height') {
    return resolved.geometry[prop.name]?.value?.toString();
  }

  // --- Step 2: An endpoint or radius outside it (§6.2) ---
  const extra = resolved.extras.find((candidate) => candidate.attribute === prop.name);
  if (extra !== undefined) {
    return extra.coordinate?.value.toString();
  }

  // --- Step 3: A non-coordinate `int` property (§13.2, PR-04 WO9) ---
  const property = resolved.properties.find((candidate) => candidate.attribute === prop.name);
  if (property !== undefined) {
    return property.value?.value.toString();
  }

  // --- Step 4: Anything else is text the author wrote, checked as written ---
  // A bool, enum, colour, font, image or string needs no resolution; Pass 4 and
  // Pass 2 have already held it to its declared type and to what exists.
  const written = resolved.node.attributes[prop.name];
  if (typeof written === 'boolean') {
    // The parser turns `hidden` into a real boolean (parse-widget-tree.ts).
    return written ? 'true' : 'false';
  }
  return typeof written === 'string' ? written : undefined;
}

/**
 * @brief A drawing element's free function and the props that are its
 *        arguments, in parameter order (§6.2, §13.1).
 *
 * Declaration order, which is parameter order (WO2). A drawing element declares
 * no `extends`, so its effective props are its own and nothing is inherited into
 * the middle of the argument list.
 *
 * Separated from {@link drawCallFor} in PR-04 WO11, behaviour unchanged, so the
 * editor's draw-by-name table takes its function and argument order from the
 * same place the firmware call does.
 *
 * @param manifest The element's effective manifest.
 * @return The function and its argument props, in order.
 * @throws Error if the manifest declares no `draw=` prop (the element is not a
 *         drawing element), or if its `draw=` props name more than one function.
 */
export function drawFunctionOf(manifest: EffectiveManifest): DrawFunction {
  // --- Step 1: The props that reach the display as call arguments ---
  const drawProps = manifest.api.props.filter((prop) => prop.draw !== undefined);
  const first = drawProps[0];
  if (first?.draw === undefined) {
    throw new Error(
      `<${manifest.name}> has no 'draw=' props, so it is not a drawing element and has no ` +
        `u8g2gl_draw_* call to emit ([D-18], §6.2).`,
    );
  }

  // --- Step 2: One element, one free function ---
  // A manifest whose props named two different functions would have no single
  // call to emit. Pass 1 does not check this, so it is checked where it matters.
  const fn = first.draw;
  const disagreeing = drawProps.find((prop) => prop.draw !== fn);
  if (disagreeing !== undefined) {
    throw new Error(
      `<${manifest.name}> declares two draw functions — '${fn}' on '${first.name}' and ` +
        `'${disagreeing.draw}' on '${disagreeing.name}'. A drawing element compiles to one call (§6.2).`,
    );
  }
  return { fn, props: drawProps };
}

/**
 * @brief Where each argument of a drawing element's call comes from: bound,
 *        then written, then the declared default (§13.5, [D-20]).
 *
 * The precedence rule, stated once. {@link drawCallFor} spells each source as
 * C++; the editor's scene description names each as data (PR-04 WO11), so the
 * two targets cannot choose different sources for one argument.
 *
 * @param input The element's manifest, resolved model and realised bindings.
 * @return One source per argument prop, in parameter order.
 * @throws Error as {@link drawFunctionOf} does.
 */
export function drawArgumentSources(input: DrawCallInput): readonly DrawArgumentSource[] {
  const { manifest, resolved, bindings } = input;
  return drawFunctionOf(manifest).props.map((prop): DrawArgumentSource => {
    const bound = bindingFor(prop, bindings);
    if (bound !== undefined) {
      return { prop, kind: 'bound', binding: bound };
    }
    const literal = resolvedLiteralFor(prop, resolved);
    if (literal !== undefined) {
      return { prop, kind: 'written', literal };
    }
    return prop.default !== undefined ? { prop, kind: 'default', literal: prop.default } : { prop, kind: 'none' };
  });
}

/**
 * @brief Assembles a drawing element's `u8g2gl_draw_*` call (§6.2, §13.1).
 *
 * @param input The element's manifest, resolved model and realised bindings.
 * @return The free function and its arguments, in manifest declaration order.
 * @throws Error if the manifest declares no `draw=` prop (the element is not a
 *         drawing element), if its `draw=` props name more than one function, or
 *         if a prop yields no value at all. All three are programmer errors —
 *         see {@link argumentError}.
 */
export function drawCallFor(input: DrawCallInput): DrawCall {
  const { manifest } = input;
  const { fn } = drawFunctionOf(manifest);

  // Each argument from its source: bound, then written, then the declared default.
  const args = drawArgumentSources(input).map((source) => {
    switch (source.kind) {
      case 'bound':
        return `${subjectIdentifier(source.binding.subject)}${SUBJECT_READ_SUFFIX}`;
      case 'written':
      case 'default':
        return cppValue(source.prop, source.literal);
      case 'none':
        throw argumentError(
          manifest,
          source.prop,
          'nothing is bound to it, the author wrote no value the resolver settled, and its manifest ' +
            'declares no default',
        );
    }
  });

  return { fn, args };
}
