/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-identifiers.ts
 * Purpose: Pass 7 — Validates naming rules, reserved identifiers, C++ keywords,
 *          duplicate names, and component-inlining collisions (§13.4, §15.1).
 * Description: Checks that identifier names conform to [a-z][a-z0-9_]*, contain no
 *              double underscores, avoid reserved prefixes (u8g2gl_, ui_, wd_),
 *              and do not collide with C++ keywords. Enforces [U-1] element identity
 *              (every widget element must possess a valid, non-empty name).
 *              Detects duplicate identifiers within screen/component scopes and flags
 *              component-inlining collisions.
 *
 * Exports:
 * - validateIdentifiers(input): Runs Pass 7 identifier validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { ValidateInput } from './validate.js';

const RESERVED_PREFIXES = ['u8g2gl_', 'ui_', 'wd_'] as const;

/** Complete list of standard C++ keywords. */
const CPP_KEYWORDS: ReadonlySet<string> = new Set([
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char8_t',
  'char16_t',
  'char32_t',
  'class',
  'compl',
  'concept',
  'const',
  'consteval',
  'constexpr',
  'constinit',
  'const_cast',
  'continue',
  'co_await',
  'co_return',
  'co_yield',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'reflexpr',
  'register',
  'reinterpret_cast',
  'requires',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
]);

function createIdDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
  };
}

function checkNameRule(
  name: string,
  loc: SourceLocation | undefined,
  context: string,
): Diagnostic | undefined {
  if (!name) {
    return undefined;
  }

  // Must match [a-z][a-z0-9_]*
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return createIdDiagnostic(
      DIAGNOSTIC_CODES.INVALID_NAME,
      `Invalid name '${name}' for ${context}. Names must match [a-z][a-z0-9_]* (lowercase, no leading digits).`,
      loc,
      name,
    );
  }

  // No double underscores
  if (name.includes('__')) {
    return createIdDiagnostic(
      DIAGNOSTIC_CODES.INVALID_NAME,
      `Invalid name '${name}' for ${context}. Names cannot contain double underscores ('__').`,
      loc,
      name,
    );
  }

  // No reserved prefixes
  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return createIdDiagnostic(
        DIAGNOSTIC_CODES.INVALID_NAME,
        `Invalid name '${name}' for ${context}. Names cannot begin with reserved prefix '${prefix}'.`,
        loc,
        name,
      );
    }
  }

  // No C++ keywords
  if (CPP_KEYWORDS.has(name)) {
    return createIdDiagnostic(
      DIAGNOSTIC_CODES.INVALID_NAME,
      `Invalid name '${name}' for ${context}. Cannot use C++ reserved keyword as an identifier.`,
      loc,
      name,
    );
  }

  return undefined;
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
 * Validates naming rules, duplicate identifiers, and inlining collisions.
 */
export function validateIdentifiers(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { globals, screens, components, project } = input;

  const componentMap = new Map((components ?? []).map((c) => [c.name, c]));

  // --- 1. Validate targets in project ---
  for (const target of project?.targets ?? []) {
    const diag = checkNameRule(target.name, target.loc, 'target');
    if (diag) {
      diagnostics.push(diag);
    }
  }

  // --- 2. Validate globals: names and duplicates ---
  const seenSubjects = new Set<string>();
  for (const s of globals?.subjects ?? []) {
    const diag = checkNameRule(s.name, s.loc, 'subject');
    if (diag) {
      diagnostics.push(diag);
    }
    if (s.name && seenSubjects.has(s.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate subject name '${s.name}' in globals.`,
          s.loc,
          s.name,
        ),
      );
    } else if (s.name) {
      seenSubjects.add(s.name);
    }
  }

  const seenConsts = new Set<string>();
  for (const c of globals?.consts ?? []) {
    const diag = checkNameRule(c.name, c.loc, 'constant');
    if (diag) {
      diagnostics.push(diag);
    }
    if (c.name && seenConsts.has(c.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate constant name '${c.name}' in globals.`,
          c.loc,
          c.name,
        ),
      );
    } else if (c.name) {
      seenConsts.add(c.name);
    }
  }

  const seenStyles = new Set<string>();
  for (const st of globals?.styles ?? []) {
    const diag = checkNameRule(st.name, st.loc, 'style');
    if (diag) {
      diagnostics.push(diag);
    }
    if (st.name && seenStyles.has(st.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate style name '${st.name}' in globals.`,
          st.loc,
          st.name,
        ),
      );
    } else if (st.name) {
      seenStyles.add(st.name);
    }
  }

  const seenFonts = new Set<string>();
  for (const f of globals?.fonts ?? []) {
    const diag = checkNameRule(f.name, f.loc, 'font');
    if (diag) {
      diagnostics.push(diag);
    }
    if (f.name && seenFonts.has(f.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate font name '${f.name}' in globals.`,
          f.loc,
          f.name,
        ),
      );
    } else if (f.name) {
      seenFonts.add(f.name);
    }
  }

  const seenImages = new Set<string>();
  for (const img of globals?.images ?? []) {
    const diag = checkNameRule(img.name, img.loc, 'image');
    if (diag) {
      diagnostics.push(diag);
    }
    if (img.name && seenImages.has(img.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate image name '${img.name}' in globals.`,
          img.loc,
          img.name,
        ),
      );
    } else if (img.name) {
      seenImages.add(img.name);
    }
  }

  // --- 3. Validate screens: names, duplicate elements, and inlining collisions ---
  const seenScreenNames = new Set<string>();

  for (const screen of screens ?? []) {
    const screenDiag = checkNameRule(screen.name, screen.loc, 'screen');
    if (screenDiag) {
      diagnostics.push(screenDiag);
    }
    if (screen.name && seenScreenNames.has(screen.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate screen name '${screen.name}'.`,
          screen.loc,
          screen.name,
        ),
      );
    } else if (screen.name) {
      seenScreenNames.add(screen.name);
    }

    const seenElementNames = new Set<string>();
    const directElementMap = new Map<string, SourceLocation | undefined>();
    const componentInstances: { instanceName: string; componentName: string; loc?: SourceLocation }[] =
      [];

    walkNodes(screen.view?.children ?? [], (node) => {
      const name = node.attributes.name;
      if (!name || typeof name !== 'string' || name.trim() === '') {
        diagnostics.push(
          createIdDiagnostic(
            DIAGNOSTIC_CODES.MISSING_NAME,
            `Element <${node.tag}> in screen '${screen.name}' is missing a required 'name' attribute.`,
            node.loc,
            node.tag,
          ),
        );
        return;
      }

      const nameLoc = node.attributeLocs?.name ?? node.loc;
      const diag = checkNameRule(name, nameLoc, 'element');
      if (diag) {
        diagnostics.push(diag);
      }

      if (seenElementNames.has(name)) {
        diagnostics.push(
          createIdDiagnostic(
            DIAGNOSTIC_CODES.DUPLICATE_NAME,
            `Duplicate element name '${name}' in screen '${screen.name}'.`,
            nameLoc,
            name,
          ),
        );
      } else {
        seenElementNames.add(name);
        directElementMap.set(name, nameLoc);
      }

      if (componentMap.has(node.tag)) {
        componentInstances.push({
          instanceName: name,
          componentName: node.tag,
          loc: nameLoc,
        });
      }
    });

    // 3a. Component inlining collision check (§13.4)
    for (const inst of componentInstances) {
      const comp = componentMap.get(inst.componentName);
      if (comp?.view?.children) {
        walkNodes(comp.view.children, (child) => {
          const childName = child.attributes.name;
          if (typeof childName === 'string' && childName) {
            const inlinedName = `${inst.instanceName}_${childName}`;
            if (directElementMap.has(inlinedName)) {
              diagnostics.push(
                createIdDiagnostic(
                  DIAGNOSTIC_CODES.NAME_COLLISION,
                  `Component-inlining name collision: inlined element '${inlinedName}' from component '${inst.componentName}' (instance '${inst.instanceName}') collides with element '${inlinedName}' in screen '${screen.name}'.`,
                  inst.loc,
                  inlinedName,
                ),
              );
            }
          }
        });
      }
    }
  }

  // --- 4. Validate components ---
  const seenComponentNames = new Set<string>();

  for (const comp of components ?? []) {
    const compDiag = checkNameRule(comp.name, comp.loc, 'component');
    if (compDiag) {
      diagnostics.push(compDiag);
    }
    if (comp.name && seenComponentNames.has(comp.name)) {
      diagnostics.push(
        createIdDiagnostic(
          DIAGNOSTIC_CODES.DUPLICATE_NAME,
          `Duplicate component name '${comp.name}'.`,
          comp.loc,
          comp.name,
        ),
      );
    } else if (comp.name) {
      seenComponentNames.add(comp.name);
    }

    for (const prop of comp.api ?? []) {
      const propDiag = checkNameRule(prop.name, prop.loc, 'component property');
      if (propDiag) {
        diagnostics.push(propDiag);
      }
    }

    const seenCompElementNames = new Set<string>();
    walkNodes(comp.view?.children ?? [], (node) => {
      const name = node.attributes.name;
      if (!name || typeof name !== 'string' || name.trim() === '') {
        diagnostics.push(
          createIdDiagnostic(
            DIAGNOSTIC_CODES.MISSING_NAME,
            `Element <${node.tag}> in component '${comp.name}' is missing a required 'name' attribute.`,
            node.loc,
            node.tag,
          ),
        );
        return;
      }

      const nameLoc = node.attributeLocs?.name ?? node.loc;
      const diag = checkNameRule(name, nameLoc, 'element');
      if (diag) {
        diagnostics.push(diag);
      }

      if (seenCompElementNames.has(name)) {
        diagnostics.push(
          createIdDiagnostic(
            DIAGNOSTIC_CODES.DUPLICATE_NAME,
            `Duplicate element name '${name}' in component '${comp.name}'.`,
            nameLoc,
            name,
          ),
        );
      } else {
        seenCompElementNames.add(name);
      }
    });
  }

  return diagnostics;
}
