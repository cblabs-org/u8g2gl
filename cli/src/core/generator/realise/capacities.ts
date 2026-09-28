/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/realise/capacities.ts
 * Purpose: [D-21] — counts every static capacity the runtime needs from what
 *          realisation decided, so the pools are sized by arithmetic rather than
 *          by a guess in `u8g2gl_config.h`. Exceeding a capacity becomes a build
 *          -time fact; `add_binding()` cannot fail in generated code, because the
 *          pool was sized from the very bindings being added.
 * Description: Four figures go into `u8g2gl_generated_config.h` (WO9 emits them,
 *              this module counts them): objects on the busiest screen, bindings
 *              on the busiest object, **total** bindings and styles. The totals
 *              are maxima across all screens, not per screen, because the pools
 *              are shared; and the binding total is the true sum rather than
 *              `objects × bindings`, which over-allocates whenever the worst-case
 *              object is not the typical one ([D-21]).
 *
 *              Counting rests on WO2's invariant — **one binding, one pool slot,
 *              one observer** — which a runtime test holds all thirteen binding
 *              methods to. So an object's binding count is simply how many
 *              bindings it declares, and a draw-call element contributes none:
 *              it registers nothing on any object and reads its subject at draw
 *              time instead (§13.5).
 *
 *              Per-subject observer counts are the same invariant seen from the
 *              subject's end, and they size the `_n<N>` subject types. A subject
 *              needs one observer per object binding that observes it, **plus
 *              exactly one frame-dirty observer if any draw-call element binds
 *              it** — one per subject, not one per binding and not one per
 *              screen, because `u8g2gl_mark_dirty()` marks whichever screen is
 *              active and activating a screen marks it dirty anyway (§13.5).
 *              Undercounting here is the failure this module exists to prevent:
 *              a full subject drops a binding, and the widget silently never
 *              updates.
 *
 *              Deterministic: subjects in declaration order, styles in
 *              declaration order, screens in document order; the counters are
 *              `Map`s that are read but never iterated (§13.9).
 *
 * Exports:
 * - SubjectObservers:    One subject's observer count, and what makes it up
 * - Capacities:          Every generated capacity ([D-21], §18.1)
 * - CapacitiesInput:     What counting needs
 * - computeCapacities(): Count them
 */

import type { Globals, SubjectDecl } from '../../schema/globals.js';
import { walkRealised } from './realise.js';
import type { RealisedScreen } from './model.js';

/**
 * One subject's observer capacity — the `N` in its generated `_n<N>` type.
 *
 * Split into its two parts rather than reported as a total alone, because the
 * parts are what make the total checkable: the frame-dirty observer is the one
 * that has been lost before (the PR-01 constraint), and it is invisible in a
 * sum.
 */
export interface SubjectObservers {
  readonly subject: SubjectDecl;
  /** Object bindings observing this subject, across every screen. */
  readonly objectBindings: number;
  /** Whether any draw-call element binds it, which costs exactly one more observer (§13.5). */
  readonly frameDirty: boolean;
  /** `objectBindings` plus one when `frameDirty` — the capacity the subject is generated with. */
  readonly observers: number;
  /** Usable characters, for a `string` subject (§8.2). */
  readonly maxLen?: number;
}

/** Every static capacity the generator emits ([D-21], reported by §18.1). */
export interface Capacities {
  /** `U8G2GL_MAX_OBJECTS_PER_SCREEN` — the most any one screen needs. */
  readonly maxObjectsPerScreen: number;
  /** The screen that needs it; absent when the project has no screens. */
  readonly busiestScreen?: string;
  /** `U8G2GL_MAX_BINDINGS_PER_OBJ` — the most any one object needs. */
  readonly maxBindingsPerObject: number;
  /**
   * The object that needs it, by mangled name (§13.4) — the XML element's name,
   * **not** the emitted C++ variable, which is this value prefixed with
   * `ui_obj_`. Reported verbatim in the generated config's note.
   */
  readonly busiestObject?: string;
  /** `U8G2GL_MAX_TOTAL_BINDINGS` — the true sum, never objects × max ([D-21]). */
  readonly totalBindings: number;
  /** `U8G2GL_MAX_STYLES` — distinct style identifiers the project emits. */
  readonly styles: number;
  /** Those style names, in declaration order, for the §18 report. */
  readonly styleNames: readonly string[];
  /** Every declared subject, in declaration order, with its observer count. */
  readonly subjects: readonly SubjectObservers[];
}

/** Everything {@link computeCapacities} needs. */
export interface CapacitiesInput {
  readonly globals: Globals;
  /** Screens already realised and flattened. */
  readonly screens: readonly RealisedScreen[];
}

// styleNamesOf
// Distinct style identifiers the project emits, in declaration order: the
// global styles, then each screen's local ones. A screen style repeating a
// global name is the override screen.ts describes, so it is the same
// `ui_style_<name>` and the same pool slot — which is exactly how mangle.ts
// keys it, and the two must not disagree.
//   input — globals and the realised screens
function styleNamesOf(input: CapacitiesInput): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string): void => {
    if (name !== '' && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  for (const style of input.globals?.styles ?? []) {
    add(style.name);
  }
  for (const screen of input.screens) {
    for (const style of screen.screen.styles ?? []) {
      add(style.name);
    }
  }
  return names;
}

/**
 * @brief Counts every generated capacity from what realisation decided ([D-21]).
 *
 * @param input Globals and the realised screens.
 * @return The capacities, and every subject's observer count. Deterministic for
 *         a given document (§13.9).
 */
export function computeCapacities(input: CapacitiesInput): Capacities {
  // --- Step 1: Objects per screen, and bindings per object ---
  // The maxima are across all screens because the pools are shared; the first
  // screen or object reaching a maximum keeps it, so ties resolve in document
  // order rather than by whichever was visited last.
  let maxObjectsPerScreen = 0;
  let busiestScreen: string | undefined;
  let maxBindingsPerObject = 0;
  let busiestObject: string | undefined;
  let totalBindings = 0;

  // Per-subject counters. Read by name; output order comes from the subject
  // declaration list, never from these (§13.9).
  const objectBindingCount = new Map<string, number>();
  const frameDirtySubjects = new Set<string>();

  for (const screen of input.screens) {
    if (screen.objects.length > maxObjectsPerScreen) {
      maxObjectsPerScreen = screen.objects.length;
      busiestScreen = screen.screen.name;
    }

    // --- Step 2: Objects pay for their bindings; draw-call elements do not ---
    // A draw-call element registers nothing on any object — it has no object —
    // so its bindings cost no pool slot and no per-object observer. They still
    // cost the subject one frame-dirty observer, counted in step 3.
    walkRealised(screen.elements, (element) => {
      if (element.objectIndex === undefined) {
        for (const binding of element.bindings) {
          frameDirtySubjects.add(binding.subject);
        }
        return;
      }
      const count = element.bindings.length;
      totalBindings += count;
      if (count > maxBindingsPerObject) {
        maxBindingsPerObject = count;
        busiestObject = element.identifier;
      }
      for (const binding of element.bindings) {
        objectBindingCount.set(binding.subject, (objectBindingCount.get(binding.subject) ?? 0) + 1);
      }
    });
  }

  // --- Step 3: Observers per subject — object bindings, plus one frame-dirty ---
  // Exactly one frame-dirty observer however many draw-call elements bind the
  // subject (§13.5): the observer marks the frame, not the widget, so a second
  // one would mark an already-marked frame. This is the PR-01 constraint, and
  // undercounting it silently drops a binding at runtime.
  const subjects: SubjectObservers[] = (input.globals?.subjects ?? []).map((subject) => {
    const objectBindings = objectBindingCount.get(subject.name) ?? 0;
    const frameDirty = frameDirtySubjects.has(subject.name);
    return {
      subject,
      objectBindings,
      frameDirty,
      observers: objectBindings + (frameDirty ? 1 : 0),
      ...(subject.maxLen !== undefined ? { maxLen: subject.maxLen } : {}),
    };
  });

  const styleNames = styleNamesOf(input);
  return {
    maxObjectsPerScreen,
    ...(busiestScreen !== undefined ? { busiestScreen } : {}),
    maxBindingsPerObject,
    ...(busiestObject !== undefined ? { busiestObject } : {}),
    totalBindings,
    styles: styleNames.length,
    styleNames,
    subjects,
  };
}
