/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/cpp-header.ts
 * Purpose: Reads the runtime's public C++ surface straight out of its headers so
 *          the manifest cross-test can check a manifest against the code it
 *          names, rather than against a hand-copied list that drifts the way
 *          TIER1_PRIMITIVES did. Test-only: the generator never parses C++.
 * Description: A deliberately small extractor for the house header style —
 *              comments and preprocessor lines stripped, inline bodies and
 *              brace blocks collapsed, then declarations split on `;`. It finds
 *              a class's public method declarations (access specifiers
 *              honoured, class default private) and file-scope free-function
 *              declarations, each with parameter types and names. It is not a
 *              C++ parser; the cross-test self-checks it against known
 *              declarations so a header reformat that defeats it fails loudly
 *              instead of making every check vacuous.
 *
 * Exports:
 * - CppParam:              One parameter: its type text and name ('' if unnamed)
 * - CppFunction:           A declaration's name and parameters
 * - publicMethodsOf():     Public method declarations of a named class
 * - freeFunctionsOf():     File-scope free-function declarations
 * - subjectTypesOf():      Subject type names from u8g2gl_subject.h's _base classes
 */

/** One declared parameter. */
export interface CppParam {
  /** Type text with whitespace normalised, e.g. `u8g2gl_subject_time_base*`. */
  readonly type: string;
  /** Parameter name, or '' when the declaration leaves it unnamed. */
  readonly name: string;
}

/** A function or method declaration. */
export interface CppFunction {
  readonly name: string;
  readonly params: readonly CppParam[];
}

// stripNoise
// Removes comments, string literals and preprocessor lines — everything that can
// contain braces, semicolons or parentheses that are not declarations.
//   source — raw header text
function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/^\s*#.*$/gm, ' ');
}

// collapseBraces
// Replaces every brace block with `;`, innermost first, so an inline method body
// or an enum body ends its declaration instead of hiding further ones.
//   text — noise-stripped text
function collapseBraces(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/\{[^{}]*\}/g, ';');
  } while (current !== previous);
  return current;
}

// normaliseType
// Canonical spelling of a type: single spaces, none around `*` and `&`.
//   type — raw type text
function normaliseType(type: string): string {
  return type.replace(/\s+/g, ' ').replace(/\s*([*&])\s*/g, '$1').trim();
}

// parseParams
// Splits a parameter list into typed, named parameters, dropping default values.
//   list — text between the declaration's parentheses
function parseParams(list: string): CppParam[] {
  const trimmed = list.trim();
  if (trimmed === '' || trimmed === 'void') {
    return [];
  }
  return trimmed.split(',').map((raw) => {
    const withoutDefault = raw.split('=')[0]!.trim();
    const match = /^(.*?[\s*&])([A-Za-z_]\w*)$/.exec(withoutDefault);
    // No trailing identifier after a type (e.g. `U8G2&`), or the whole thing is
    // one word (a bare type): the parameter is unnamed.
    if (!match || /^(const|unsigned|signed)?\s*$/.test(match[1]!.trim())) {
      return { type: normaliseType(withoutDefault), name: '' };
    }
    return { type: normaliseType(match[1]!), name: match[2]! };
  });
}

// declarationsIn
// Every `name(params)` declaration among `;`-separated statements, skipping
// destructors and operators.
//   statements — brace-collapsed declaration text
function declarationsIn(statements: string): CppFunction[] {
  const found: CppFunction[] = [];
  for (const statement of statements.split(';')) {
    const match = /(~?[A-Za-z_]\w*)\s*\(([^()]*)\)/.exec(statement);
    if (!match || match[1]!.startsWith('~') || match[1] === 'operator') {
      continue;
    }
    found.push({ name: match[1]!, params: parseParams(match[2]!) });
  }
  return found;
}

/**
 * Public method declarations of `className` in `header`.
 *
 * @param header    Header source text.
 * @param className Class to read, e.g. `u8g2gl_clock`.
 * @return Public declarations in header order (overloads repeat a name), or
 *         undefined if the header declares no such class.
 */
export function publicMethodsOf(header: string, className: string): CppFunction[] | undefined {
  // --- Step 1: Find the class body by brace matching ---
  const text = stripNoise(header);
  const opening = new RegExp(`\\bclass\\s+${className}\\b[^;{]*\\{`).exec(text);
  if (!opening) {
    return undefined;
  }
  let depth = 1;
  let index = opening.index + opening[0].length;
  const bodyStart = index;
  while (index < text.length && depth > 0) {
    const ch = text[index];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    index++;
  }
  const body = collapseBraces(text.slice(bodyStart, index - 1));

  // --- Step 2: Keep only the public sections; a class starts private ---
  const sections = body.split(/\b(public|protected|private)\s*:/);
  let access = 'private';
  const publicText: string[] = [];
  sections.forEach((section, i) => {
    if (i % 2 === 1) {
      access = section;
    } else if (access === 'public') {
      publicText.push(section);
    }
  });

  // --- Step 3: Read the declarations ---
  return declarationsIn(publicText.join(';'));
}

/**
 * File-scope free-function declarations in `header`.
 *
 * Only meaningful for a header without classes, such as u8g2gl_draw.h.
 *
 * @param header Header source text.
 * @return Declarations in header order.
 */
export function freeFunctionsOf(header: string): CppFunction[] {
  return declarationsIn(collapseBraces(stripNoise(header)));
}

/**
 * Subject type names, from the `u8g2gl_subject_<type>_base` classes a subject
 * header declares — the set a `<bind type=>` may name (§8.1).
 *
 * @param header Source text of u8g2gl_subject.h.
 * @return Type names in header order, e.g. `['int', 'string', 'bool', 'time']`.
 */
export function subjectTypesOf(header: string): string[] {
  const text = stripNoise(header);
  return Array.from(text.matchAll(/\bclass\s+u8g2gl_subject_([a-z]+)_base\b/g), (m) => m[1]!);
}
