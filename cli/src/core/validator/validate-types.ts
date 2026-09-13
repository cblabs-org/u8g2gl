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
 *              accept that subject's type. A binding's accepted types are its
 *              own `type` plus those of every binding sharing its `setter` —
 *              the C++ overload set the generator chooses from, so `bind_text`
 *              accepts an int subject because `bind_text_int` declares
 *              `setter="bind_text"` with `type="int"` (§8.4's own example binds
 *              an int to `bind_text`). Format checks are keyed off the
 *              binding's declared `fmt` attribute. Conditional flag directive
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

// acceptedTypes
// The subject types one binding attribute accepts: its own declared type plus
// those of every binding naming the same setter, in declaration order.
//   binding  — the binding whose attribute is being checked
//   bindings — every binding on the element's effective manifest
function acceptedTypes(binding: BindDef, bindings: readonly BindDef[]): string[] {
  const types = [binding.type];
  for (const other of bindings) {
    if (other.setter === binding.setter && !types.includes(other.type)) {
      types.push(other.type);
    }
  }
  return types;
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

      for (const binding of bindings) {
        const subjectName = node.attributes[binding.name];
        if (typeof subjectName !== 'string' || subjectName.startsWith('$')) {
          continue;
        }
        const subject = subjectMap.get(subjectName);
        if (!subject) {
          continue; // Unknown subject: Pass 2's diagnostic, not a type error.
        }

        // --- Step 1: The subject's type must be one the binding accepts ---
        const accepted = acceptedTypes(binding, bindings);
        if (!accepted.includes(subject.type)) {
          diagnostics.push(
            createTypeDiagnostic(
              DIAGNOSTIC_CODES.TYPE_MISMATCH,
              `Subject '${subject.name}' has type '${subject.type}', which is incompatible with '${binding.name}' on <${node.tag}> (expected ${accepted.map((t) => `'${t}'`).join(' or ')}).`,
              node.attributeLocs?.[binding.name] ?? node.loc,
              subjectName,
            ),
          );
        }

        // --- Step 2: The binding's declared format attribute must fit the subject ---
        if (binding.fmt) {
          const fmt = node.attributes[binding.fmt];
          if (typeof fmt === 'string') {
            diagnostics.push(...checkFormat(node, binding.fmt, fmt, subject));
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
