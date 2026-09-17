/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/mangle.ts
 * Purpose: §13.4's identifier mangling — the one place an author-facing XML name
 *          becomes the C++ identifier generated code declares. The mapping must be
 *          total and deterministic, and a collision must be a hard error naming
 *          both sources, never a rename: a silently renamed identifier would make
 *          generated code stop matching the XML the author is reading. Composite
 *          expansion (expand.ts) prefixes children through this module, so the
 *          prefix rule is written once.
 * Description: Spelling helpers for every row of §13.4's table: screen functions
 *              (§13.7) and the screen's object and parent tables (§13.3), objects,
 *              composite children, subjects and their setters, fonts, images and
 *              styles. `mangleIdentifiers()` builds the table for a project from its
 *              expanded screens and checks it:
 *              - a composite child whose prefixed identifier is a C++ keyword,
 *                contains `__`, or begins with a reserved prefix is
 *                `U8G2GL_INVALID_NAME` — joining two valid names can make an invalid
 *                one (`co` + `await`);
 *              - two different sources producing one identifier in one scope is
 *                `U8G2GL_NAME_COLLISION`, located at the later source and naming
 *                both.
 *              Scopes follow the emitted translation units: everything `ui.hpp`
 *              declares is visible to every screen, and each screen's objects and
 *              local styles are visible only in its own unit. An author-written name
 *              breaking §13.4's rules, and a name declared twice, are Pass 7's
 *              (validate-identifiers.ts), not collisions. Isomorphic.
 *
 * Exports:
 * - RESERVED_IDENTIFIER_PREFIXES, CPP_KEYWORDS: §13.4's reserved spellings
 * - SCREEN_FUNCTIONS, SCREEN_TABLES:  Suffixes of each screen's generated symbols
 * - IdentifierKind, IdentifierSource, MangledIdentifier, ScreenIdentifiers,
 *   IdentifierTable, MangleInput:     The table's model
 * - screenFunctionIdentifier(), screenTableIdentifier(), subjectIdentifier(),
 *   subjectSetterIdentifier(), fontIdentifier(), imageIdentifier(),
 *   styleIdentifier(), childIdentifier(): Spell one identifier
 * - mangleIdentifiers():              Build and collision-check a project's table
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Globals } from '../schema/globals.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { ExpandedElement, ExpandedScreen } from './expand.js';
import { formatInstantiation, formatLocation, withInstantiation, type InstantiationSite } from './provenance.js';

/**
 * Prefixes §13.4 reserves: `u8g2gl_` for the framework, `ui_` for generated
 * code.
 *
 * **The one list.** Pass 7 checks author-written names against it and this
 * module checks the identifiers that only exist after prefixing; the two are the
 * same rule, and spelling it twice is how a rule drifts.
 *
 * **`wd_` is deliberately absent** (Chief Architect ruling, 2026-09-16, §13.4).
 * By [D-12] a tag *is* its C++ class name, so `wd_` names classes users write
 * (`wd_service_list`, §6.6) and the generator never produces one — reserving it
 * forbade the very convention §6.6 recommends, and had already cost a fixture
 * its name.
 */
export const RESERVED_IDENTIFIER_PREFIXES: readonly string[] = ['u8g2gl_', 'ui_'];

/**
 * C++ keywords (§13.4). The same list Pass 7 checks author-written names
 * against; here it checks identifiers that only exist after prefixing.
 */
export const CPP_KEYWORDS: ReadonlySet<string> = new Set([
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
  'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
  'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await',
  'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
  'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
  'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
  'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'reflexpr',
  'register', 'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static',
  'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local',
  'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
  'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq',
]);

/** The five functions §13.7 emits per screen: `ui_screen_<name>_<suffix>`. */
export const SCREEN_FUNCTIONS: readonly string[] = ['init', 'activate', 'deactivate', 'tick', 'render'];

/** The object and parent tables §13.3 emits per screen: `ui_screen_<name>_<suffix>`. */
export const SCREEN_TABLES: readonly string[] = ['objs', 'parents'];

/** Which row of §13.4's table an identifier comes from. */
export type IdentifierKind =
  | 'screen_function'
  | 'screen_table'
  | 'object'
  | 'subject'
  | 'subject_setter'
  | 'font'
  | 'image'
  | 'style';

/** What produced an identifier, for diagnostics. */
export interface IdentifierSource {
  readonly kind: IdentifierKind;
  /** Prose naming the source: `<u8g2gl_label> 'location'`, `subject 'temperature'`. */
  readonly description: string;
  /** Where the source is declared — for an object, its `name` attribute. */
  readonly loc?: SourceLocation;
  /** For an object inside a composite instance, the instances, outermost first; otherwise empty. */
  readonly instantiation: readonly InstantiationSite[];
}

/** One generated C++ identifier and its source. */
export interface MangledIdentifier {
  readonly identifier: string;
  readonly source: IdentifierSource;
}

/** The identifiers one screen's translation unit declares itself. */
export interface ScreenIdentifiers {
  /** The screen's name as written. */
  readonly screen: string;
  /** Local styles, then objects in depth-first document order (§13.3). */
  readonly identifiers: readonly MangledIdentifier[];
}

/** A project's complete identifier table. */
export interface IdentifierTable {
  /**
   * Identifiers every translation unit sees through `ui.hpp`: each screen's
   * functions and tables, then subjects with their setters, fonts, images and
   * global styles — each group in declaration order.
   */
  readonly global: readonly MangledIdentifier[];
  /** Per screen, in input order. */
  readonly screens: readonly ScreenIdentifiers[];
  /** `U8G2GL_INVALID_NAME` for mangled composite children, and `U8G2GL_NAME_COLLISION`. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Everything {@link mangleIdentifiers} needs. */
export interface MangleInput {
  readonly globals: Globals;
  /** Screens after composite expansion (expand.ts). */
  readonly screens: readonly ExpandedScreen[];
}

/** `ui_screen_home_init`. */
export function screenFunctionIdentifier(screen: string, fn: string): string {
  return `ui_screen_${screen}_${fn}`;
}

/** `ui_screen_home_objs`. */
export function screenTableIdentifier(screen: string, table: string): string {
  return `ui_screen_${screen}_${table}`;
}

/** `ui_subject_temperature`. */
export function subjectIdentifier(subject: string): string {
  return `ui_subject_${subject}`;
}

/** `ui_set_temperature`. */
export function subjectSetterIdentifier(subject: string): string {
  return `ui_set_${subject}`;
}

/** `ui_font_small_9`. */
export function fontIdentifier(font: string): string {
  return `ui_font_${font}`;
}

/** `ui_image_icon_wifi`. */
export function imageIdentifier(image: string): string {
  return `ui_image_${image}`;
}

/** `ui_style_header`. */
export function styleIdentifier(style: string): string {
  return `ui_style_${style}`;
}

/**
 * @brief A composite child's identifier: the instance's identifier, `_`, the
 *        child's name (§13.4). Applied once per level, so instance `bar` →
 *        instance `clk` → `digits` is `bar_clk_digits`.
 *
 * @param instanceIdentifier The enclosing instance's own identifier.
 * @param name               The child's `name` as written.
 */
export function childIdentifier(instanceIdentifier: string, name: string): string {
  return `${instanceIdentifier}_${name}`;
}

/**
 * One table row awaiting the collision check. `key` identifies the declaration:
 * two rows with one key are the same declaration made twice (Pass 7's
 * DUPLICATE_NAME), not a collision between two sources.
 */
interface Entry {
  readonly mangled: MangledIdentifier;
  readonly key: string;
}

// makeEntry
// One table row.
//   identifier    — the C++ identifier
//   kind          — the §13.4 row
//   description   — prose naming the source
//   loc           — where the source is declared
//   key           — declaration identity, see Entry
//   instantiation — enclosing instances, for an object inside a composite
function makeEntry(
  identifier: string,
  kind: IdentifierKind,
  description: string,
  loc: SourceLocation | undefined,
  key: string,
  instantiation: readonly InstantiationSite[] = [],
): Entry {
  return {
    mangled: { identifier, source: { kind, description, ...(loc ? { loc } : {}), instantiation } },
    key,
  };
}

// describeSource
// "<u8g2gl_label> 'b' at widgets/wd_x/wd_x.xml:4:9, in instance 'a' of <wd_x> at …"
function describeSource(source: IdentifierSource): string {
  const at = formatLocation(source.loc);
  const chain = source.instantiation.length > 0 ? `, ${formatInstantiation(source.instantiation)}` : '';
  return `${source.description}${at ? ` at ${at}` : ''}${chain}`;
}

// checkCollisions
// Adds each entry to `seen`, reporting any identifier already there from a
// different declaration. Entries are visited in the order given, which is
// document order, so the later source is the one located — the same rule a
// reader applies ("this one clashes with the one above").
//   entries     — rows in document order
//   seen        — identifiers already in scope; extended in place (lookup only)
//   diagnostics — output
function checkCollisions(entries: readonly Entry[], seen: Map<string, Entry>, diagnostics: Diagnostic[]): void {
  for (const entry of entries) {
    const { identifier } = entry.mangled;
    const first = seen.get(identifier);
    if (first === undefined) {
      seen.set(identifier, entry);
      continue;
    }
    if (first.key === entry.key) {
      continue; // Declared twice — Pass 7 reports U8G2GL_DUPLICATE_NAME.
    }
    const later = entry.mangled.source;
    diagnostics.push({
      code: DIAGNOSTIC_CODES.NAME_COLLISION,
      severity: 'error',
      file: later.loc?.file ?? '',
      line: later.loc?.line ?? 1,
      column: later.loc?.column ?? 1,
      message:
        `C++ identifier '${identifier}' is generated twice: by ${describeSource(first.mangled.source)}; ` +
        `and by ${describeSource(later)}. The generator never renames an identifier to avoid a ` +
        `collision (§13.4); rename one of the two.`,
      offendingText: identifier,
    });
  }
}

// checkChildIdentifier
// Joining two valid names can make an invalid identifier: `co` + `await` is a
// keyword, `a_` + `b` contains `__` (reserved to the C++ implementation). The
// parts are Pass 7's to check; only the joined identifier is checked here.
//   element     — an element inside at least one composite instance
//   diagnostics — output
function checkChildIdentifier(element: ExpandedElement, diagnostics: Diagnostic[]): void {
  const { identifier, node } = element;
  const reserved = RESERVED_IDENTIFIER_PREFIXES.find((prefix) => identifier.startsWith(prefix));
  let problem: string | undefined;
  if (CPP_KEYWORDS.has(identifier)) {
    problem = 'is a C++ keyword';
  } else if (identifier.includes('__')) {
    problem = "contains a double underscore ('__'), which C++ reserves";
  } else if (reserved !== undefined) {
    problem = `begins with the reserved prefix '${reserved}'`;
  }
  if (problem === undefined) {
    return;
  }
  const loc = node.attributeLocs?.name ?? node.loc;
  diagnostics.push(
    withInstantiation(
      {
        code: DIAGNOSTIC_CODES.INVALID_NAME,
        severity: 'error',
        file: loc?.file ?? '',
        line: loc?.line ?? 1,
        column: loc?.column ?? 1,
        message:
          `Element '${element.name}' <${node.tag}> becomes C++ identifier '${identifier}', which ${problem} ` +
          `(§13.4). Rename the element or the instance.`,
        offendingText: identifier,
      },
      element.instantiation,
    ),
  );
}

// collectObjects
// Adds every named element to `out`, depth-first in document order (§13.3), and
// checks each prefixed identifier. An unnamed element has no identifier — its
// missing name is the parser's or Pass 7's error, and a name is never invented
// ([U-1]).
//   elements    — expanded elements
//   out         — rows, appended in order
//   diagnostics — output
function collectObjects(elements: readonly ExpandedElement[], out: Entry[], diagnostics: Diagnostic[]): void {
  for (const element of elements) {
    if (element.identifier !== '') {
      if (element.instantiation.length > 0) {
        checkChildIdentifier(element, diagnostics);
      }
      const { node } = element;
      const path = [...element.instantiation.map((site) => site.name), element.name].join('/');
      out.push(
        makeEntry(
          element.identifier,
          'object',
          `<${node.tag}> '${element.name}'`,
          node.attributeLocs?.name ?? node.loc,
          `object:${path}`,
          element.instantiation,
        ),
      );
    }
    collectObjects(element.children, out, diagnostics);
  }
}

/**
 * @brief Builds a project's identifier table and checks it for invalid mangled
 *        names and collisions (§13.4).
 *
 * @param input Globals and the expanded screens.
 * @return The table, in a fixed order that depends only on document order, and
 *         its diagnostics. Never throws for user input.
 */
export function mangleIdentifiers(input: MangleInput): IdentifierTable {
  const diagnostics: Diagnostic[] = [];
  const { globals } = input;

  // --- Step 1: Identifiers every translation unit sees through ui.hpp ---
  const global: Entry[] = [];
  for (const { screen } of input.screens) {
    if (!screen.name) {
      continue;
    }
    const description = `screen '${screen.name}'`;
    for (const fn of SCREEN_FUNCTIONS) {
      global.push(makeEntry(screenFunctionIdentifier(screen.name, fn), 'screen_function', description, screen.loc, `screen:${screen.name}`));
    }
    for (const table of SCREEN_TABLES) {
      global.push(makeEntry(screenTableIdentifier(screen.name, table), 'screen_table', description, screen.loc, `screen:${screen.name}`));
    }
  }
  for (const subject of globals?.subjects ?? []) {
    if (subject.name) {
      const description = `subject '${subject.name}'`;
      global.push(makeEntry(subjectIdentifier(subject.name), 'subject', description, subject.loc, `subject:${subject.name}`));
      global.push(makeEntry(subjectSetterIdentifier(subject.name), 'subject_setter', description, subject.loc, `subject:${subject.name}`));
    }
  }
  for (const font of globals?.fonts ?? []) {
    if (font.name) {
      global.push(makeEntry(fontIdentifier(font.name), 'font', `font '${font.name}'`, font.loc, `font:${font.name}`));
    }
  }
  for (const image of globals?.images ?? []) {
    if (image.name) {
      global.push(makeEntry(imageIdentifier(image.name), 'image', `image '${image.name}'`, image.loc, `image:${image.name}`));
    }
  }
  for (const style of globals?.styles ?? []) {
    if (style.name) {
      global.push(makeEntry(styleIdentifier(style.name), 'style', `style '${style.name}'`, style.loc, `style:${style.name}`));
    }
  }
  const globalSeen = new Map<string, Entry>();
  checkCollisions(global, globalSeen, diagnostics);

  // --- Step 2: Each screen's own translation unit — local styles, then objects ---
  const screens = input.screens.map(({ screen, elements }): ScreenIdentifiers => {
    const local: Entry[] = [];
    for (const style of screen.styles ?? []) {
      if (style.name) {
        // Keyed like a global style: a screen style of the same name is the
        // override screen.ts describes, not a second source of one identifier.
        local.push(
          makeEntry(styleIdentifier(style.name), 'style', `style '${style.name}' in screen '${screen.name}'`, style.loc, `style:${style.name}`),
        );
      }
    }
    collectObjects(elements, local, diagnostics);
    checkCollisions(local, new Map(globalSeen), diagnostics);
    return { screen: screen.name, identifiers: local.map((entry) => entry.mangled) };
  });

  return { global: global.map((entry) => entry.mangled), screens, diagnostics };
}
