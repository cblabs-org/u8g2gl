/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-types.ts
 * Purpose: Pass 5 — Validates reactive data binding types and printf format specifiers (§8, §15.1).
 * Description: Checks that subjects bound to `bind_text` and `bind_value` are type-compatible,
 *              verifies comparison value types in conditional flag directives, and ensures
 *              `bind_text_fmt` conversion specifiers (%d, %s) align with subject types.
 *
 * Exports:
 * - validateTypes(input): Runs Pass 5 type compatibility validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { SubjectDecl } from '../schema/globals.js';
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

/**
 * Validates binding types, format strings, and comparison value types.
 */
export function validateTypes(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { globals, screens } = input;

  const subjectMap = new Map<string, SubjectDecl>(
    (globals?.subjects ?? []).map((s) => [s.name, s]),
  );

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], (node) => {
      // 1. Validate bind_text subject type
      const bindText = node.attributes.bind_text;
      if (typeof bindText === 'string' && !bindText.startsWith('$')) {
        const subject = subjectMap.get(bindText);
        if (subject && subject.type !== 'string' && subject.type !== 'int') {
          const loc = node.attributeLocs?.bind_text ?? node.loc;
          diagnostics.push(
            createTypeDiagnostic(
              DIAGNOSTIC_CODES.TYPE_MISMATCH,
              `Subject '${subject.name}' has type '${subject.type}', which is incompatible with 'bind_text' (expected 'string' or 'int').`,
              loc,
              bindText,
            ),
          );
        }
      }

      // 2. Validate bind_value subject type
      const bindValue = node.attributes.bind_value;
      if (typeof bindValue === 'string' && !bindValue.startsWith('$')) {
        const subject = subjectMap.get(bindValue);
        if (subject && subject.type !== 'int') {
          const loc = node.attributeLocs?.bind_value ?? node.loc;
          diagnostics.push(
            createTypeDiagnostic(
              DIAGNOSTIC_CODES.TYPE_MISMATCH,
              `Subject '${subject.name}' has type '${subject.type}', which is incompatible with 'bind_value' (expected 'int').`,
              loc,
              bindValue,
            ),
          );
        }
      }

      // 3. Validate format string specifiers against bound subject
      const fmt = node.attributes.bind_text_fmt;
      if (typeof fmt === 'string' && typeof bindText === 'string') {
        const subject = subjectMap.get(bindText);
        if (subject) {
          const specifierRegex = /%[-+0 #]*\d*(?:\.\d+)?[diusxXf]/g;
          const matches = fmt.match(specifierRegex) ?? [];

          for (const spec of matches) {
            const specType = spec.slice(-1);
            if (['d', 'i', 'u', 'x', 'X'].includes(specType)) {
              if (subject.type !== 'int') {
                const loc = node.attributeLocs?.bind_text_fmt ?? node.loc;
                diagnostics.push(
                  createTypeDiagnostic(
                    DIAGNOSTIC_CODES.FORMAT_MISMATCH,
                    `Format specifier '${spec}' in 'bind_text_fmt' expects integer, but subject '${subject.name}' has type '${subject.type}'.`,
                    loc,
                    fmt,
                  ),
                );
              }
            } else if (specType === 's') {
              if (subject.type !== 'string') {
                const loc = node.attributeLocs?.bind_text_fmt ?? node.loc;
                diagnostics.push(
                  createTypeDiagnostic(
                    DIAGNOSTIC_CODES.FORMAT_MISMATCH,
                    `Format specifier '${spec}' in 'bind_text_fmt' expects string, but subject '${subject.name}' has type '${subject.type}'.`,
                    loc,
                    fmt,
                  ),
                );
              }
            }
          }
        }
      }

      // 4. Validate conditional binding directive value types
      for (const child of node.children) {
        if ('kind' in child && child.kind === 'binding') {
          const subject = subjectMap.get(child.subject);
          if (subject) {
            const cmpVal = child.value ?? child.refValue;
            if (cmpVal !== undefined) {
              if (subject.type === 'bool') {
                const validBoolValues = ['true', 'false', '0', '1'];
                if (!validBoolValues.includes(cmpVal)) {
                  diagnostics.push(
                    createTypeDiagnostic(
                      DIAGNOSTIC_CODES.TYPE_MISMATCH,
                      `Comparison value '${cmpVal}' in <${child.type}> does not match 'bool' type of subject '${subject.name}'.`,
                      child.loc ?? node.loc,
                      cmpVal,
                    ),
                  );
                }
              } else if (subject.type === 'int') {
                if (!/^-?\d+$/.test(cmpVal)) {
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
            }
          }
        }
      }
    });
  }

  return diagnostics;
}
