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
 * Description: For each element instance, each declared binding whose attribute
 *              is present and names a subject (not a `$prop` placeholder) must
 *              accept that subject's type. An attribute accepts a subject type
 *              if any `<bind>` of that name declares it: `bind_text` is declared
 *              once with `type="string"` and once with `type="int"` (§8.4's own
 *              example binds an int to `bind_text`), and the registry keeps both
 *              by merging bindings on (name, type). Nothing is inferred from a
 *              shared `setter` (PR-04 WO5a), so a binding declared only for
 *              `int` rejects a string subject. Format checks are keyed off the
 *              bindings' declared `fmt` attribute. Conditional flag directive
 *              comparison values are checked against their subject's type.
 *
 * Exports:
 * - validateTypes(input): Runs Pass 5 type compatibility validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { SubjectDecl } from '../schema/globals.js';
import type { BindDef } from '../schema/widget-manifest.js';
import type { ValidateInput } from './validate.js';

function createTypeDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
  };
}

function walkNodes(
  children: readonly WidgetNodeChild[],
  visitor: (node: WidgetNode) => void,
): void {
  for (const child of children) {
    if ('tag' in child && typeof child.tag === 'string') {
      visitor(child);
      if (child.children && child.children.length > 0) {
        walkNodes(child.children, visitor);
      }
    }
  }
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

/**
 * Validates binding types, format strings, and comparison value types in every
 * screen, against the effective manifests in `input.manifests`.
 *
 * @param input Validator input; `globals`, `screens` and `manifests` are read.
 * @return Diagnostics in screen and document order.
 */
export function validateTypes(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { globals, screens, manifests } = input;

  const subjectMap = new Map<string, SubjectDecl>(
    (globals?.subjects ?? []).map((s) => [s.name, s]),
  );

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], (node) => {
      const bindings = manifests.get(node.tag)?.api.bindings ?? [];

      for (const [attrName, overloads] of bindingsByAttribute(bindings)) {
        const subjectName = node.attributes[attrName];
        if (typeof subjectName !== 'string' || subjectName.startsWith('$')) {
          continue;
        }
        const subject = subjectMap.get(subjectName);
        if (!subject) {
          continue; // Unknown subject: Pass 2's diagnostic, not a type error.
        }

        // --- Step 1: Some <bind> of this name must declare the subject's type ---
        const accepted = distinct(overloads.map((b) => b.type));
        if (!accepted.includes(subject.type)) {
          diagnostics.push(
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
            diagnostics.push(...checkFormat(node, fmtAttr, fmt, subject));
          }
        }
      }

      // --- Step 3: Conditional flag directive comparison values ---
      for (const child of node.children) {
        if (!('kind' in child) || child.kind !== 'binding') {
          continue;
        }
        const subject = subjectMap.get(child.subject);
        const cmpVal = child.value ?? child.refValue;
        if (!subject || cmpVal === undefined) {
          continue;
        }
        if (subject.type === 'bool' && !['true', 'false', '0', '1'].includes(cmpVal)) {
          diagnostics.push(
            createTypeDiagnostic(
              DIAGNOSTIC_CODES.TYPE_MISMATCH,
              `Comparison value '${cmpVal}' in <${child.type}> does not match 'bool' type of subject '${subject.name}'.`,
              child.loc ?? node.loc,
              cmpVal,
            ),
          );
        } else if (subject.type === 'int' && !/^-?\d+$/.test(cmpVal)) {
          diagnostics.push(
            createTypeDiagnostic(
              DIAGNOSTIC_CODES.TYPE_MISMATCH,
              `Comparison value '${cmpVal}' in <${child.type}> is not a valid integer for subject '${subject.name}'.`,
              child.loc ?? node.loc,
              cmpVal,
            ),
          );
        }
      }
    });
  }

  return diagnostics;
}
