/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-types.ts
 * Purpose: Pass 5 — checks that every subject bound to an element has the type
 *          the element's manifest declares for that binding, and that printf
 *          format strings agree with the subject they format (§8, §13.1, §15.1).
 *          Binding types are read from the effective manifest's `<bind>`
 *          entries, never from a list of binding names in code ([D-17]): a
 *          custom element's `bind_level`, or [D-20]'s `bind_width`, is checked
 *          exactly as `bind_text` is.
 * Description: Runs on the expanded tree (resolver/expand.ts), not the screens as
 *              written. A binding inside a composite's `<view>` usually names its
 *              subject through a `$prop`, so its type is knowable only once
 *              expansion has substituted the argument (PR-04 WO7, WO3 finding 4).
 *              A diagnostic at an element inside an instance is located at that
 *              element, in its composite's file, with the instantiation chain
 *              appended. Expansion's own diagnostics — an argument that is not a
 *              declared subject, a `$name` naming no prop — are reported here too;
 *              its missing-required-prop diagnostic is not, because Pass 4 already
 *              reports that condition on every instance.
 *
 *              For each element, each declared binding whose attribute is present
 *              and names a subject must accept that subject's type. An attribute
 *              accepts a subject type if any `<bind>` of that name declares it:
 *              `bind_text` is declared once with `type="string"` and once with
 *              `type="int"` (§8.4's own example binds an int to `bind_text`), and
 *              the registry keeps both by merging bindings on (name, type).
 *              Nothing is inferred from a shared `setter` (PR-04 WO5a), so a
 *              binding declared only for `int` rejects a string subject. Format
 *              checks are keyed off the bindings' declared `fmt` attribute. Every
 *              `<bind_flag_if_*>` must name one of §8.4's two flags (PR-04 WO5a
 *              finding 1), and its comparison value must fit its subject's type.
 *
 * Exports:
 * - validateTypes(input): Runs Pass 5 type compatibility validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode } from '../schema/widget-node.js';
import type { SubjectDecl } from '../schema/globals.js';
import type { BindDef } from '../schema/widget-manifest.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { expandScreens, walkExpanded, withInstantiation } from '../resolver/index.js';
import type { ValidateInput } from './validate.js';

/**
 * The flags a `<bind_flag_if_*>` directive may set (§8.4). Fixed by the spec for
 * every element, not declared per manifest (PR-04 WO3 PA decision), so it names
 * the binding contract, not elements ([D-17]).
 */
const BINDING_FLAGS: readonly string[] = ['hidden', 'disabled'];

function createTypeDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}

// bindingsByAttribute
// Groups an element's effective bindings by attribute name, so an attribute with
// one `<bind>` per accepted subject type is checked once, not once per type.
// Map order is first declaration order, so diagnostics stay deterministic.
//   bindings — every binding on the element's effective manifest
function bindingsByAttribute(bindings: readonly BindDef[]): Map<string, BindDef[]> {
  const grouped = new Map<string, BindDef[]>();
  for (const binding of bindings) {
    const overloads = grouped.get(binding.name);
    if (overloads) {
      overloads.push(binding);
    } else {
      grouped.set(binding.name, [binding]);
    }
  }
  return grouped;
}

// distinct
// The values of `items` with duplicates and undefined removed, in first order.
function distinct(items: readonly (string | undefined)[]): string[] {
  const seen: string[] = [];
  for (const item of items) {
    if (item !== undefined && !seen.includes(item)) {
      seen.push(item);
    }
  }
  return seen;
}

/** printf conversions taking an integer argument, and those taking a string. */
const INT_CONVERSIONS: ReadonlySet<string> = new Set(['d', 'i', 'u', 'x', 'X']);
const STRING_CONVERSIONS: ReadonlySet<string> = new Set(['s']);

// checkFormat
// Checks each conversion in a format string against the subject it formats.
//   node      — the element carrying the format attribute
//   fmtAttr   — the binding's declared `fmt` attribute name
//   fmt       — that attribute's value
//   subject   — the subject the binding names
function checkFormat(
  node: WidgetNode,
  fmtAttr: string,
  fmt: string,
  subject: SubjectDecl,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const specifierRegex = /%[-+0 #]*\d*(?:\.\d+)?[diusxXf]/g;
  for (const spec of fmt.match(specifierRegex) ?? []) {
    const conversion = spec.slice(-1);
    let expected: 'int' | 'string' | undefined;
    if (INT_CONVERSIONS.has(conversion)) {
      expected = 'int';
    } else if (STRING_CONVERSIONS.has(conversion)) {
      expected = 'string';
    }
    if (expected !== undefined && subject.type !== expected) {
      diagnostics.push(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.FORMAT_MISMATCH,
          `Format specifier '${spec}' in '${fmtAttr}' expects ${expected === 'int' ? 'integer' : 'string'}, but subject '${subject.name}' has type '${subject.type}'.`,
          node.attributeLocs?.[fmtAttr] ?? node.loc,
          fmt,
        ),
      );
    }
  }
  return diagnostics;
}

// checkElement
// Every Pass 5 check on one element.
//   node       — the element, `$prop`s already substituted when it came from a template
//   subjectMap — declared subjects by name (lookup only)
//   bindings   — the element's effective bindings
//   report     — receives each diagnostic, located at the element
function checkElement(
  node: WidgetNode,
  subjectMap: ReadonlyMap<string, SubjectDecl>,
  bindings: readonly BindDef[],
  report: (diagnostic: Diagnostic) => void,
): void {
  for (const [attrName, overloads] of bindingsByAttribute(bindings)) {
    const subjectName = node.attributes[attrName];
    if (typeof subjectName !== 'string' || subjectName.startsWith('$')) {
      continue;
    }
    const subject = subjectMap.get(subjectName);
    if (!subject) {
      continue; // Unknown subject: Pass 2's diagnostic, or expansion's for an argument.
    }

    // --- Step 1: Some <bind> of this name must declare the subject's type ---
    const accepted = distinct(overloads.map((b) => b.type));
    if (!accepted.includes(subject.type)) {
      report(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.TYPE_MISMATCH,
          `Subject '${subject.name}' has type '${subject.type}', which is incompatible with '${attrName}' on <${node.tag}> (expected ${accepted.map((t) => `'${t}'`).join(' or ')}).`,
          node.attributeLocs?.[attrName] ?? node.loc,
          subjectName,
        ),
      );
    }

    // --- Step 2: The declared format attribute must fit the subject ---
    // Overloads normally share one `fmt` attribute; each distinct one is
    // checked once so a shared `bind_text_fmt` is not reported twice.
    for (const fmtAttr of distinct(overloads.map((b) => b.fmt))) {
      const fmt = node.attributes[fmtAttr];
      if (typeof fmt === 'string') {
        checkFormat(node, fmtAttr, fmt, subject).forEach(report);
      }
    }
  }

  for (const child of node.children) {
    if (!('kind' in child) || child.kind !== 'binding') {
      continue;
    }

    // --- Step 3: The flag must be one §8.4 defines ---
    // Checked before the subject, because a directive with no usable flag sets
    // nothing whatever its subject is. A `$`-reference still unsubstituted is
    // not yet a flag name.
    const flag = child.flag;
    if (flag === undefined || flag === '') {
      report(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `<${child.type}> on <${node.tag}> has no 'flag'; it must name ${BINDING_FLAGS.map((f) => `'${f}'`).join(' or ')} (§8.4).`,
          child.loc ?? node.loc,
          'flag',
        ),
      );
    } else if (!flag.startsWith('$') && !BINDING_FLAGS.includes(flag)) {
      report(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
          `Unknown flag '${flag}' in <${child.type}> on <${node.tag}>. Expected one of: ${BINDING_FLAGS.join(', ')} (§8.4).`,
          child.loc ?? node.loc,
          flag,
          findClosest(flag, BINDING_FLAGS),
        ),
      );
    }

    // --- Step 4: The comparison value must fit the subject's type ---
    const subject = subjectMap.get(child.subject);
    const cmpVal = child.value ?? child.refValue;
    if (!subject || cmpVal === undefined) {
      continue;
    }
    if (subject.type === 'bool' && !['true', 'false', '0', '1'].includes(cmpVal)) {
      report(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.TYPE_MISMATCH,
          `Comparison value '${cmpVal}' in <${child.type}> does not match 'bool' type of subject '${subject.name}'.`,
          child.loc ?? node.loc,
          cmpVal,
        ),
      );
    } else if (subject.type === 'int' && !/^-?\d+$/.test(cmpVal)) {
      report(
        createTypeDiagnostic(
          DIAGNOSTIC_CODES.TYPE_MISMATCH,
          `Comparison value '${cmpVal}' in <${child.type}> is not a valid integer for subject '${subject.name}'.`,
          child.loc ?? node.loc,
          cmpVal,
        ),
      );
    }
  }
}

/**
 * Validates binding types, flags, format strings and comparison value types in
 * every screen — composite interiors included, once expanded — against the
 * effective manifests in `input.manifests`.
 *
 * @param input Validator input; `globals`, `screens` and `manifests` are read.
 * @return Expansion diagnostics, then diagnostics in screen and expanded document
 *         order. `validate()` sorts the combined result.
 */
export function validateTypes(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { globals, screens, manifests } = input;

  const subjectMap = new Map<string, SubjectDecl>(
    (globals?.subjects ?? []).map((s) => [s.name, s]),
  );

  // --- Step 1: Expand composites, so their interiors are checked with arguments substituted ---
  const expansion = expandScreens({ globals, screens: screens ?? [], manifests });
  for (const diagnostic of expansion.diagnostics) {
    // Pass 4 reports a missing required prop on every instance, at the same
    // place and in the same words; reporting it here too would say it twice.
    if (diagnostic.code !== DIAGNOSTIC_CODES.MISSING_REQUIRED) {
      diagnostics.push(diagnostic);
    }
  }

  // --- Step 2: Check every expanded element, naming its instance when it has one ---
  for (const screen of expansion.screens) {
    walkExpanded(screen.elements, (element) => {
      const bindings = manifests.get(element.node.tag)?.api.bindings ?? [];
      checkElement(element.node, subjectMap, bindings, (diagnostic) => {
        diagnostics.push(withInstantiation(diagnostic, element.instantiation));
      });
    });
  }

  return diagnostics;
}
