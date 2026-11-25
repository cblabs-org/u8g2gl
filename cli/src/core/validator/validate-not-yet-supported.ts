/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-not-yet-supported.ts
 * Purpose: Pass 8 — names every construct the schema accepts but the generator
 *          does not build yet, and the PR that will build it. Without it a
 *          document using a focus ring would validate cleanly and then either be
 *          refused obscurely by `generate` or, worse, generate without its focus
 *          ring. The Chief Architect's PR-04 decision 1 fixes the set; this
 *          module is the one place that lists it, so each later PR deletes its own
 *          entry here when it lands.
 * Description: The severity is a parameter, not a branch — the same shape as the
 *              [U-1] missing-name policy (ui_spec §16.1). `validate` and the
 *              designer pass `'warning'`, so an author is told without the document
 *              being shown as broken; `generate` passes `'error'` and writes
 *              nothing. Both runs report the same code at the same location, from
 *              this one code path, so the two journeys cannot drift apart.
 *              Reports, in document order:
 *              - `<focus_ring>`, `<event_cb>`, `<screen_load_event>`,
 *                `<screen_back_event>` → PR-09 (decision 1)
 *              - a composite that also has a C++ class (`view` + `extends`)
 *                → a later PR (deferred past PR-08, which delivered collections)
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
import type { WidgetNodeChild } from '../schema/widget-node.js';
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
// A classed composite has no PR yet: nothing that ships needs one, so it is
// deferred to "a later PR" rather than given a number nothing plans for.
const FOCUS_AND_EVENTS_PR = 'PR-09';
const CLASSED_COMPOSITES_PR = 'a later PR';

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

// checkView
// Reports the focus ring and events in one view — a screen's or a
// composite's — walking the element tree in document order.
//   view     — the view to check
//   severity — the policy in force
//   out      — collector
function checkView(
  view: View | undefined,
  severity: RefusalPolicy,
  out: Diagnostic[],
): void {
  if (!view) {
    return;
  }

  // --- Step 1: The focus ring ---
  if (view.focusRing) {
    out.push(
      deferredDiagnostic(
        severity,
        `<focus_ring> is not yet supported: focus navigation (§12.2) — ` +
          `${refusalClause(FOCUS_AND_EVENTS_PR)}.`,
        view.focusRing.loc,
        'focus_ring',
      ),
    );
  }

  // --- Step 2: Events, anywhere in the tree ---
  const walk = (children: readonly WidgetNodeChild[]): void => {
    for (const child of children) {
      if ('kind' in child) {
        if (child.kind === 'event') {
          const what = child.type === 'event_cb' ? 'input events (§12.3)' : 'screen navigation (§12.3)';
          out.push(
            deferredDiagnostic(
              severity,
              `<${child.type}> is not yet supported: ${what} — ${refusalClause(FOCUS_AND_EVENTS_PR)}.`,
              child.loc,
              child.type,
            ),
          );
        }
        continue;
      }

      walk(child.children);
    }
  };
  walk(view.children);
}

/**
 * Reports every construct `generate` does not yet build (Pass 8).
 *
 * @param input Validator input. `input.refusalPolicy` sets the severity of
 *              every diagnostic, defaulting to
 *              {@link DEFAULT_REFUSAL_POLICY}.
 * @return One `U8G2GL_NOT_YET_SUPPORTED` diagnostic per construct: screens, then
 *         declared composites, each in document order. `validate()` sorts the combined result.
 */
export function validateNotYetSupported(input: ValidateInput): readonly Diagnostic[] {
  const severity = input.refusalPolicy ?? DEFAULT_REFUSAL_POLICY;
  const diagnostics: Diagnostic[] = [];

  // --- Step 1: Screens ---
  for (const screen of input.screens ?? []) {
    checkView(screen.view, severity, diagnostics);
  }

  // --- Step 2: Composites — their templates, and a class of their own ---
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
    checkView(composite.view, severity, diagnostics);
  }

  return diagnostics;
}
