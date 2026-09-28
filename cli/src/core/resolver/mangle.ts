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
 *              styles.
 *
 *              **Every emitted object is `ui_obj_<name>`** (Chief Architect,
 *              2026-09-19, §13.4): a bare `clock` collided with `<time.h>`'s
 *              `clock()`, and no list of reserved C names can be complete. An
 *              element's *name* — `name`, joined to its enclosing instances' names
 *              by `_` (`bar_location`) — is what the author reads and what
 *              realisation and diagnostics carry; `objectIdentifier()` is the one
 *              place that name becomes the C++ object, and the collision table
 *              checks the prefixed spelling, because that is what is declared.
 *
 *              `mangleIdentifiers()` builds the table for a project from its
 *              expanded screens and checks it:
 *              - a composite child whose joined name is a C++ keyword, contains
 *                `__`, or begins with a reserved prefix is `U8G2GL_INVALID_NAME` —
 *                joining two valid names can make an invalid one (`co` + `await`);
 *              - two different sources producing one identifier in one scope is
 *                `U8G2GL_NAME_COLLISION`, located at the later source and naming
 *                both.
 *              Scopes follow the emitted translation units: everything `ui.hpp`
 *              declares is visible to every screen, and each screen's objects and
 *              local styles are visible only in its own unit. The table is total
 *              (PR-04 WO11b): each screen's descriptor and every fixed name —
 *              `ui_init`, `ui_subjects_init`, `ui_styles_init`, the editor
 *              registry, the runtime's `ui_handler` — are in it as well as each
 *              screen's functions and tables, and the
 *              `ui_obj_` family is checked in each screen's scope against all of
 *              them. An author-written name
 *              breaking §13.4's rules, and a name declared twice, are Pass 7's
 *              (validate-identifiers.ts), not collisions. Isomorphic.
 *
 * Exports:
 * - RESERVED_IDENTIFIER_PREFIXES: §13.4's reserved prefixes
 * - CPP_KEYWORDS:                     §13.4's reserved keywords (re-exported from schema/cpp-keywords.ts)
 * - SCREEN_FUNCTIONS, SCREEN_TABLES:  Suffixes of each screen's generated symbols
 * - IdentifierKind, IdentifierSource, MangledIdentifier, ScreenIdentifiers,
 *   IdentifierTable, MangleInput:     The table's model
 * - OBJECT_IDENTIFIER_PREFIX:          `ui_obj_`, the emitted objects' family
 * - EDITOR_REGISTRY_FUNCTION, UI_INIT_FUNCTION, SUBJECTS_INIT_FUNCTION,
 *   STYLES_INIT_FUNCTION, RUNTIME_HANDLER_FUNCTION: the fixed names in the `ui_`
 *   namespace, each spelled once and each in the collision table
 * - screenFunctionIdentifier(), screenTableIdentifier(), screenDescriptorIdentifier(), subjectIdentifier(),
 *   subjectSetterIdentifier(), fontIdentifier(), imageIdentifier(),
 *   styleIdentifier(), objectIdentifier(), childIdentifier(): Spell one identifier
 * - mangleIdentifiers():              Build and collision-check a project's table
 */

import { CPP_KEYWORDS } from '../schema/cpp-keywords.js';
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

// C++ keywords (§13.4) are the schema's one list, which Pass 7 checks
// author-written names against too; here they check the identifiers that only
// exist after prefixing. Re-exported so the resolver's public surface keeps
// `CPP_KEYWORDS` where it has always been (PR-4R WO1).
export { CPP_KEYWORDS };

/** The five functions §13.7 emits per screen: `ui_screen_<name>_<suffix>`. */
export const SCREEN_FUNCTIONS: readonly string[] = ['init', 'activate', 'deactivate', 'tick', 'render'];

/** The object and parent tables §13.3 emits per screen: `ui_screen_<name>_<suffix>`. */
export const SCREEN_TABLES: readonly string[] = ['objs', 'parents'];

/** Which row of §13.4's table an identifier comes from. */
export type IdentifierKind =
  | 'screen_function'
  | 'screen_table'
  | 'screen_descriptor'
  | 'fixed'
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

/**
 * The family every emitted object belongs to (§13.4, 2026-09-19). A fixed
 * family rather than the screen's name: a screen called `subject` or `style`
 * would otherwise put its objects among `ui_subject_*` and `ui_style_*`, and
 * each screen's objects are `static` in its own unit, so the screen's name would
 * add no uniqueness.
 */
export const OBJECT_IDENTIFIER_PREFIX = 'ui_obj_';

/** `ui_screen_home_init`. */
export function screenFunctionIdentifier(screen: string, fn: string): string {
  return `ui_screen_${screen}_${fn}`;
}

/**
 * @brief A screen's `u8g2gl_screen` descriptor: `ui_screen_home` — what an
 *        application hands to `u8g2gl_set_active_screen()` (§12.4).
 *
 * Spelled here, beside §13.4's other screen identifiers, and registered in the
 * collision table (PR-04 WO11b, WO10 finding 5): screen `a_objs`'s descriptor
 * is `ui_screen_a_objs`, which is screen `a`'s object table. `ui.hpp` declares
 * it and the screen's unit defines it through this one function.
 */
export function screenDescriptorIdentifier(screen: string): string {
  return `ui_screen_${screen}`;
}

/**
 * The editor target's registry function, `ui_editor_registry()` ([UD-4]). A
 * fixed name rather than a family, registered in the collision table so the
 * mapping is total (PR-04 WO11b, WO11 finding 6).
 */
export const EDITOR_REGISTRY_FUNCTION = 'ui_editor_registry';

/** `ui_init()`, the application's one entry point (§13.7). */
export const UI_INIT_FUNCTION = 'ui_init';

/** `ui_subjects_init()`, which applies string subjects' initial values (§8.2). */
export const SUBJECTS_INIT_FUNCTION = 'ui_subjects_init';

/** `ui_styles_init()`, which applies each style's declared properties (§10). */
export const STYLES_INIT_FUNCTION = 'ui_styles_init';

/**
 * `ui_handler()` — not generated: the runtime declares it (`u8g2gl_core.h`), and
 * it is the one call an application makes each loop. It sits in the `ui_`
 * namespace §13.4 reserves for generated code, so it is in the table too.
 */
export const RUNTIME_HANDLER_FUNCTION = 'ui_handler';

/**
 * Every fixed, project-level name in the `ui_` namespace, with what it is: the
 * generated functions a project always has (§13.7), the editor target's
 * registry ([UD-4]) and the runtime's handler. Registered in the collision table
 * beside the families, so the table is total (PR-04 WO11b follow-up, finding 9).
 * Each name is spelled once, in the constants above; the emitters import them.
 */
const FIXED_IDENTIFIERS: readonly { readonly identifier: string; readonly description: string }[] = [
  { identifier: UI_INIT_FUNCTION, description: 'the generated ui_init()' },
  { identifier: SUBJECTS_INIT_FUNCTION, description: 'the generated ui_subjects_init()' },
  { identifier: STYLES_INIT_FUNCTION, description: 'the generated ui_styles_init()' },
  { identifier: EDITOR_REGISTRY_FUNCTION, description: 'the editor registry' },
  { identifier: RUNTIME_HANDLER_FUNCTION, description: "the runtime's ui_handler()" },
];

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

/**
 * @brief A font's alias: `ui_font_` + its name, **verbatim** —
 *        `ui_font_small_9`, and `ui_font_u8g2_font_helvR08_tr`.
 *
 * **The mangling rule for a `<builtin>` is the identity, and that is a decision**
 * (PR-04 WO14). The owner ruled on 2026-09-28 that every U8G2 font must be
 * usable, so the 522 bundled names carrying capitals reach this function, and
 * something has to guarantee `ui_font_<name>` is still a legal C++ identifier.
 * Three properties are required of whatever rule is chosen — deterministic,
 * total over the catalogue, and injective across it — and the identity is the
 * only candidate that gets all three for free:
 *
 * - **Total and legal, by construction.** A U8G2 font name *is* a C identifier:
 *   it is the very symbol `u8g2.h` declares the array with, so it already
 *   matches `[A-Za-z_][A-Za-z0-9_]*` and contains no `__`. Prefixing `ui_font_`
 *   preserves both. `mangle.test.ts` asserts this over all 2039 names rather
 *   than trusting the argument.
 * - **Injective, unconditionally.** The identity cannot map two names together.
 *   Every folding rule can, and the obvious one — lowercasing — is safe on
 *   today's catalogue only by luck: it survives 2039 names with no collision,
 *   but `u8g2_font_helvR08_tr` and a future `..._helvr08_tr` would fold onto one
 *   alias, and the failure would arrive as a U8G2 release rather than as
 *   anything in this repository. A rule whose correctness depends on a
 *   dependency not adding a name is not a rule.
 * - **Readable, which is §13.4's whole purpose.** The alias names the U8G2 array
 *   it points at, letter for letter, so a reader matches `<builtin
 *   name="u8g2_font_helvR08_tr">` to `ui_font_u8g2_font_helvR08_tr =
 *   u8g2_font_helvR08_tr` by eye. A case-folded alias would be the one place in
 *   generated code where the C++ stops spelling the XML.
 *
 * A collision is still never resolved by renaming: two fonts producing one alias
 * goes through {@link mangleIdentifiers}'s table as `U8G2GL_NAME_COLLISION`
 * naming both, exactly as for any other identifier.
 *
 * An author-chosen name — a `<bdf>`'s — reaches here having passed §13.4 in
 * Pass 7, so the identity is right for it too.
 */
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
 * @brief The C++ object an element is emitted as: `ui_obj_` + its name (§13.4).
 *
 * `title` → `ui_obj_title`; composite child `bar_location` →
 * `ui_obj_bar_location`. The one spelling of an object's C++ name: every
 * emitter that declares or calls an object spells it through here.
 *
 * @param name The element's name, joined to its enclosing instances' names by
 *             {@link childIdentifier}.
 */
export function objectIdentifier(name: string): string {
  return `${OBJECT_IDENTIFIER_PREFIX}${name}`;
}

/**
 * @brief A composite child's name: the instance's name, `_`, the child's name
 *        (§13.4). Applied once per level, so instance `bar` → instance `clk` →
 *        `digits` is `bar_clk_digits`, emitted as `ui_obj_bar_clk_digits`
 *        through {@link objectIdentifier}.
 *
 * @param instanceIdentifier The enclosing instance's own joined name.
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
  /**
   * The text a diagnostic underlines: the identifier, except for an object,
   * whose `ui_obj_` prefix the author never wrote — there it is the name.
   */
  readonly written: string;
}

// makeEntry
// One table row.
//   identifier    — the C++ identifier
//   kind          — the §13.4 row
//   description   — prose naming the source
//   loc           — where the source is declared
//   key           — declaration identity, see Entry
//   instantiation — enclosing instances, for an object inside a composite
//   written       — the text to underline, when it is not the identifier
function makeEntry(
  identifier: string,
  kind: IdentifierKind,
  description: string,
  loc: SourceLocation | undefined,
  key: string,
  instantiation: readonly InstantiationSite[] = [],
  written: string = identifier,
): Entry {
  return {
    mangled: { identifier, source: { kind, description, ...(loc ? { loc } : {}), instantiation } },
    key,
    written,
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
      offendingText: entry.written,
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
          `Element '${element.name}' <${node.tag}> is named '${identifier}' once joined to its instance, ` +
          `which ${problem} (§13.4). Rename the element or the instance.`,
        offendingText: identifier,
      },
      element.instantiation,
    ),
  );
}

// collectObjects
// Adds every named element to `out` as the object it is emitted as
// (`ui_obj_<name>`), depth-first in document order (§13.3), and checks each
// joined name. An unnamed element has no identifier — its
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
          objectIdentifier(element.identifier),
          'object',
          `<${node.tag}> '${element.name}'`,
          node.attributeLocs?.name ?? node.loc,
          `object:${path}`,
          element.instantiation,
          element.identifier,
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
    global.push(
      makeEntry(screenDescriptorIdentifier(screen.name), 'screen_descriptor', description, screen.loc, `screen:${screen.name}`),
    );
  }
  for (const fixed of FIXED_IDENTIFIERS) {
    global.push(makeEntry(fixed.identifier, 'fixed', fixed.description, undefined, `fixed:${fixed.identifier}`));
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
