/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-not-yet-supported.ts
 * Purpose: Pass 8 — names every construct the schema accepts but the generator
 *          does not build yet. Without it such a document would validate
 *          cleanly and then either be refused obscurely by `generate` or, worse,
 *          generate without the construct. This module is the one place that
 *          lists the set, so a construct's entry is deleted here when the
 *          generator learns to build it.
 * Description: The severity is a parameter, not a branch — the same shape as the
 *              [U-1] missing-name policy (ui_spec §16.1). `validate` and the
 *              designer pass `'warning'`, so an author is told without the document
 *              being shown as broken; `generate` passes `'error'` and writes
 *              nothing. Both runs report the same code at the same location, from
 *              this one code path, so the two journeys cannot drift apart.
 *              Reports, in document order:
 *              - a composite that also has a C++ class (`view` + `extends`)
 *                → a later PR (deferred past PR-08, which delivered collections)
 *              - a `<focus_ring>` in a composite's own template → a later PR.
 *                A ring is a screen's (§12.2) and names elements written in
 *                that screen; what a widget's own ring would mean inside the
 *                screen's is not defined, so it stays refused rather than
 *                being silently dropped. A screen's ring and every event are
 *                built (§12).
 *              A declared static child (`<column>`, an `<element>` of its
 *              parent's manifest, §6.5) is no longer refused: schema 0.7's
 *              generator builds it.
 *
 * Exports:
 * - RefusalPolicy:                'warning' (authoring) or 'error' (build)
 * - DEFAULT_REFUSAL_POLICY:       'warning' — see its doc comment for why
 * - validateNotYetSupported(input):     Runs Pass 8
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { View } from '../schema/screen.js';
import type { ValidateInput } from './validate.js';

/**
 * What a **build refusal** costs the caller: a document that is valid as
 * authored but that `generate` will not build yet (PR-04 decision 1). Two kinds
 * of refusal share it — this pass's not-yet-supported constructs, and
 * realisation's (`U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT`, Pass 9) — which is why
 * it is no longer named for the first alone (PR-04 WO11b, WO8c finding 3; it was
 * `NotYetSupportedPolicy`, and `ValidateInput.refusalPolicy` was
 * `notYetSupported`).
 *
 * - `'warning'` — the authoring journey (`validate`, the designer). The document
 *   is valid as authored; the author learns which construct the build refuses.
 * - `'error'` — the build journey (`generate`). Emitting code without the
 *   construct would silently drop part of the UI, so the build refuses instead.
 *
 * A genuine error is never a refusal: it is an error under either policy, so
 * both journeys agree on it.
 */
export type RefusalPolicy = 'warning' | 'error';

/**
 * The policy `validate()` applies when the caller chooses none.
 *
 * `'warning'`, unlike the missing-name policy's safe default of `'error'`,
 * because here the unsafe journey cannot inherit the default by accident:
 * `generate()` sets `'error'` itself and offers no way to override it. Every
 * other caller is authoring, where decision 1 requires a warning so the editor
 * never shows as broken a document that is merely ahead of the generator.
 */
export const DEFAULT_REFUSAL_POLICY: RefusalPolicy = 'warning';

// The PR that delivers each deferred construct. Named once so the messages
// cannot disagree with each other, and so each PR finds its own entries here.
// Neither has a PR yet: nothing that ships needs one, so each is deferred to
// "a later PR" rather than given a number nothing plans for.
const CLASSED_COMPOSITES_PR = 'a later PR';
const COMPOSITE_FOCUS_RING_PR = 'a later PR';

// deferredDiagnostic
// Builds one NOT_YET_SUPPORTED diagnostic at the caller's policy severity.
//   severity      — the policy in force; never decided here
//   message       — prose naming the construct and the PR that delivers it
//   loc           — where the construct is declared
//   offendingText — the construct's tag or name, for the caret
function deferredDiagnostic(
  severity: RefusalPolicy,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.NOT_YET_SUPPORTED,
    severity,
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
  };
}

/** The sentence every message ends with, so both journeys read the same. */
function refusalClause(pr: string): string {
  return `it is delivered in ${pr}, and 'u8g2gl generate' refuses it until then`;
}

// checkCompositeRing
// Reports a focus ring in a composite's own template.
//   view     — the composite's view
//   name     — the composite's tag
//   severity — the policy in force
//   out      — collector
function checkCompositeRing(view: View | undefined, name: string, severity: RefusalPolicy, out: Diagnostic[]): void {
  if (view?.focusRing === undefined) {
    return;
  }
  out.push(
    deferredDiagnostic(
      severity,
      `<focus_ring> in composite <${name}> is not yet supported: a focus ring belongs to a screen and ` +
        `names elements written in it (§12.2) — ${refusalClause(COMPOSITE_FOCUS_RING_PR)}. Put the ring ` +
        "in the screen, listing the composite's instances.",
      view.focusRing.loc,
      'focus_ring',
    ),
  );
}

/**
 * Reports every construct `generate` does not yet build (Pass 8).
 *
 * @param input Validator input. `input.refusalPolicy` sets the severity of
 *              every diagnostic, defaulting to
 *              {@link DEFAULT_REFUSAL_POLICY}.
 * @return One `U8G2GL_NOT_YET_SUPPORTED` diagnostic per construct, declared
 *         composites in document order. `validate()` sorts the combined result.
 */
export function validateNotYetSupported(input: ValidateInput): readonly Diagnostic[] {
  const severity = input.refusalPolicy ?? DEFAULT_REFUSAL_POLICY;
  const diagnostics: Diagnostic[] = [];

  for (const composite of input.manifests.declaredComposites) {
    // Checked on the declared manifest: the registry gives every composite
    // u8g2gl_obj as its base, so only a declared `extends` means the author
    // wrote a C++ class for it.
    if (composite.view !== undefined && composite.extends !== undefined) {
      diagnostics.push(
        deferredDiagnostic(
          severity,
          `Composite <${composite.name}> also extends C++ class '${composite.extends}': a composite ` +
            `with a C++ class of its own — ${refusalClause(CLASSED_COMPOSITES_PR)}.`,
          composite.loc,
          composite.name,
        ),
      );
    }
    checkCompositeRing(composite.view, composite.name, severity, diagnostics);
  }

  return diagnostics;
}
