/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/realise/model.ts
 * Purpose: The vocabulary realisation speaks, kept apart from the analysis that
 *          fills it in. §13.5 decides per instance whether an element becomes a
 *          C++ object or a sequence of draw calls, and §13.3 flattens what is
 *          left into the array-with-parent-index the runtime walks. Both answers
 *          are consumed by code that must not re-derive them — WO9's project
 *          emission, WO10's screen emission, WO11's editor target and §18's
 *          budget — so the shapes they agree on live in one file with no logic
 *          in it.
 * Description: A realised element carries its outcome, **every** condition of
 *              the realisation rule that held (not merely the first, and not
 *              merely the ones that can fire today), its bindings with the
 *              manifest overload already chosen, and its place in the flattened
 *              screen. A realised screen carries the object array, the parallel
 *              parent table, and the draw order objects and draw calls share.
 *
 *              Nothing here is spelled as C++. A visibility conjunction is a
 *              list of terms, not an `if`, because emission is WO9's and an
 *              editor target spells the same terms differently ([UD-4]).
 *
 * Exports:
 * - U8G2GL_NO_PARENT:      The parent-table sentinel for a view-level object (§13.3)
 * - MAX_OBJECTS_PER_SCREEN: The structural object ceiling ([A-3], [D-21])
 * - RealisationReason:     One condition of §13.5's rule
 * - REALISATION_REASONS:   Every reason, in the fixed order they are reported in
 * - Realisation:           The outcome — an object, or draw calls
 * - RealisedBinding:       One binding, with the overload its subject's type chose
 * - VisibilityTerm:        One conjunct of a draw-call element's build-time visibility
 * - RealisedElement:       One element's realisation and its place in the flat model
 * - DrawStep:              One step of a screen's draw order
 * - RealisedScreen:        One screen flattened (§13.3)
 * - RealisationResult:     Every screen, and what realisation refused
 */

import type { Diagnostic } from '../../schema/diagnostic.js';
import type { SubjectType } from '../../schema/globals.js';
import type { Screen } from '../../schema/screen.js';
import type { SourceLocation } from '../../schema/source-location.js';
import type { BindDef } from '../../schema/widget-manifest.js';
import type { BindingChild } from '../../schema/widget-node.js';
import type { ExpandedElement } from '../../resolver/index.js';

/**
 * The parent-table value marking an object directly under `<view>` (§13.3).
 *
 * `UINT8_MAX`, matching `u8g2gl_types.h`'s `U8G2GL_NO_PARENT`. It is repeated
 * here rather than derived because the CLI cannot read a C++ header, and a
 * disagreement would put every object under the wrong parent; the runtime's
 * value is the contract and this is a copy of it.
 */
export const U8G2GL_NO_PARENT = 255;

/**
 * The structural object ceiling ([A-3], [D-21]): `parent_index_` is a `uint8_t`
 * and {@link U8G2GL_NO_PARENT} consumes one of its values, so a screen holds at
 * most this many objects.
 *
 * This is the **only** object count in the codebase (PR-04 WO8c). Pass 1 used to
 * keep a second, structural one, and the two had drifted: written before [D-18],
 * it skipped composite containers and counted `draw=`-only elements, so it could
 * report fewer objects than a screen really has and a 256-object screen passed
 * both `validate` and `generate` in silence. `validate-realisation.ts` now
 * enforces the ceiling against the length of the object array below, which is
 * exactly what emission writes a `uint8_t` parent table for.
 */
export const MAX_OBJECTS_PER_SCREEN = 254;

/**
 * One condition of §13.5's realisation rule.
 *
 * Every condition that holds is recorded, including those that cannot fire in
 * PR-04, so that the reason reported in the §18 budget and in `--json` ([D-16])
 * is **true** rather than merely sufficient:
 *
 * - `class_backed`        — the element's manifest declares a C++ class. Under
 *                           [D-18]'s 2026-09-13 amendment this alone makes an
 *                           object, interim, until a stateless draw function and
 *                           per-property state knowledge exist.
 * - `binding`             — it carries a binding **and** its class is the thing
 *                           that must observe the subject. A drawing element
 *                           compiles the binding into its call instead, so this
 *                           condition does not hold there (§13.5).
 * - `event`               — it carries an `<event_cb>` or navigation event
 *                           (§12.3). Refused until PR-09; modelled here.
 * - `focus_ring_member`   — a `<focus_ring>` names it (§12.2). Refused until
 *                           PR-09; modelled here.
 * - `composite`           — it is a composite instance, so it is a real
 *                           container object with its own box ([D-18]).
 * - `has_children`        — something is nested inside it, so it is the thing
 *                           they are positioned and clipped against.
 * - `typed_child_pointer` — its enclosing composite has a C++ class of its own,
 *                           whose generated code holds a typed member pointer to
 *                           it ([D-6] as [D-18] amends it). Refused until PR-08;
 *                           modelled here.
 */
export type RealisationReason =
  | 'class_backed'
  | 'binding'
  | 'event'
  | 'focus_ring_member'
  | 'composite'
  | 'has_children'
  | 'typed_child_pointer';

/**
 * Every reason, in the order a realised element reports the ones that held.
 *
 * A fixed order, so two runs over one document report reasons identically
 * (§13.9) — the list is iterated, never a `Set` of what was found.
 */
export const REALISATION_REASONS: readonly RealisationReason[] = [
  'class_backed',
  'binding',
  'event',
  'focus_ring_member',
  'composite',
  'has_children',
  'typed_child_pointer',
];

/** What an instance becomes (§13.5). */
export type Realisation = 'object' | 'draw_calls';

/**
 * One binding an element declares, with the manifest overload already chosen.
 *
 * Choosing here rather than at emission is the point (PR-04 WO5a finding 4): a
 * binding attribute may be declared once per accepted subject type — `bind_text`
 * for `string` and again for `int` (§8.4) — so an emitter selecting by name
 * alone would take whichever came first and could spell the wrong call. The
 * subject's declared type picks the declaration once, and WO10 and WO11 emit
 * from that choice.
 *
 * Each binding is exactly one `add_binding()`, one pool slot and one observer —
 * the invariant WO2 pinned in the runtime and [D-21]'s capacities count against.
 */
export interface RealisedBinding {
  /**
   * How the binding is written: `attribute` for a `bind_*` attribute,
   * `flag` for a `<bind_flag_if_*>` directive child (§8.4).
   */
  readonly kind: 'attribute' | 'flag';
  /** The attribute for an attribute binding; the directive's tag for a flag. */
  readonly attribute: string;
  /** The subject bound, as written after substitution. */
  readonly subject: string;
  /** The subject's declared type; absent when no subject of that name is declared (Pass 2's error). */
  readonly subjectType?: SubjectType;
  /**
   * The `<bind>` whose `type` matches the subject's, for an attribute binding.
   * Absent when the element's manifest declares no overload accepting that type
   * — Pass 5's `U8G2GL_TYPE_MISMATCH`, which refuses the build before emission.
   */
  readonly declaration?: BindDef;
  /** The flag a directive sets, for `kind: 'flag'`. */
  readonly flag?: string;
  /** The directive itself, for `kind: 'flag'`. */
  readonly directive?: BindingChild;
  readonly loc?: SourceLocation;
}

/**
 * One conjunct of a draw-call element's build-time visibility (§13.5).
 *
 * An element with no object cannot be walked up the parent chain at render
 * time, because it is not in the parent table. The generator therefore walks it
 * **at build time** and emits one conjunction, which §13.5 notes is strictly
 * cheaper than the runtime walk it replaces. The terms are structural, not C++:
 * WO10 spells them as `!bar.is_hidden() && ui_subject_wifi.value`, and WO11's
 * editor target spells the same terms its own way ([UD-4]).
 */
export type VisibilityTerm =
  | {
      /** An ancestor object must not be hidden. */
      readonly kind: 'ancestor_visible';
      /** That ancestor's index in the screen's object array. */
      readonly objectIndex: number;
      /**
       * That ancestor's mangled name (§13.4) — **not** its C++ variable, which
       * is this value prefixed with `ui_obj_` (see `emit/screen.ts`'s
       * `objectIdentifier()`).
       */
      readonly identifier: string;
    }
  | {
      /** One of this element's own `<bind_flag_if_*>` directives must not have set `hidden`. */
      readonly kind: 'flag_clear';
      readonly directive: BindingChild;
      readonly subject: string;
    };

/** One element, realised and placed in the flattened screen. */
export interface RealisedElement {
  /** The expanded element this decision is about — its source, name and instantiation chain. */
  readonly element: ExpandedElement;
  /**
   * Its mangled name (§13.4): the author's `name`, prefixed by each enclosing
   * composite instance. Empty when unnamed. This is **not** the emitted C++
   * variable — that is this value prefixed with `ui_obj_`, applied by
   * `emit/screen.ts`'s `objectIdentifier()`. Grepping generated C++ for this
   * string alone will not find the declaration.
   */
  readonly identifier: string;
  /** What it becomes (§13.5). */
  readonly realisation: Realisation;
  /**
   * Every condition of the rule that held, in {@link REALISATION_REASONS}
   * order. Empty only for an element whose tag no manifest declares — Pass 2's
   * error, which refuses the build before emission.
   */
  readonly reasons: readonly RealisationReason[];
  /**
   * Whether §13.5's rule **itself** requires an object — that is, whether any
   * reason other than `class_backed` held.
   *
   * `realisation` is the interim outcome under [D-18]'s amendment, where a
   * class-backed element is always an object. This field is the unamended
   * answer, computed by the same pass, so demotion can be switched on later by
   * changing the outcome rather than by rewriting the analysis. An element with
   * `realisation: 'object'` and `requiredByRule: false` is one the amendment is
   * paying for, and §18 must say so ([D-18] amendment).
   */
  readonly requiredByRule: boolean;
  /** Its bindings, in attribute-declaration order then directive order. */
  readonly bindings: readonly RealisedBinding[];
  /** Its index in the screen's object array; absent when it is draw calls. */
  readonly objectIndex?: number;
  /**
   * The object index of its nearest **object** ancestor, or
   * {@link U8G2GL_NO_PARENT} at view level (§13.3). Meaningful for an object;
   * for a draw-call element it names the object its coordinates and visibility
   * are measured against.
   */
  readonly parentIndex: number;
  /**
   * The conjunction guarding its draw calls, outermost ancestor first, then its
   * own bound flags. Present only when it is draw calls; empty means
   * unconditional.
   */
  readonly visibility?: readonly VisibilityTerm[];
  /** Nested elements, in document order (§13.9). */
  readonly children: readonly RealisedElement[];
}

/**
 * One step of a screen's render function, in document order ([D-4]).
 *
 * Draw calls keep their position among the objects rather than being hoisted to
 * either end — §13.12's worked example renders `rule` between two objects, and
 * reordering would change what overlaps what.
 */
export type DrawStep =
  | { readonly kind: 'object'; readonly objectIndex: number; readonly element: RealisedElement }
  | { readonly kind: 'draw_calls'; readonly element: RealisedElement };

/** One screen flattened (§13.3). */
export interface RealisedScreen {
  readonly screen: Screen;
  /** Top-level elements, tree shape preserved, in document order. */
  readonly elements: readonly RealisedElement[];
  /**
   * The objects, depth-first in document order — index is emission order and
   * therefore draw order ([D-4], §13.3 step 2).
   */
  readonly objects: readonly RealisedElement[];
  /** The parent table, parallel to {@link objects} (§13.3 steps 3–4). */
  readonly parents: readonly number[];
  /** Objects and draw calls together, in document order. */
  readonly drawOrder: readonly DrawStep[];
}

/** Everything realisation decided, and what it refused. */
export interface RealisationResult {
  /** Screens in input order. */
  readonly screens: readonly RealisedScreen[];
  /**
   * `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` for an element with no class that
   * something requires an object of. Never throws for user input.
   */
  readonly diagnostics: readonly Diagnostic[];
}
