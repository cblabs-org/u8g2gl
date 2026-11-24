/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/realise/handles.ts
 * Purpose: The identifiers the generator composes for an application to use,
 *          beyond §13.4's own table: a typed handle to every named object
 *          (§9.2), so firmware can reach `services` to fill it although the
 *          object itself stays `static` in its screen's unit. These names are
 *          composed from two author-written ones — `ui_<screen>_<element>` —
 *          so two can meet where no author-written name does, and one can meet
 *          a name §13.4's table already holds. Both must be errors naming both
 *          sources, never a silent overwrite or a rename (§13.4).
 *
 *          It lives in `realise/` because which elements get a handle is a
 *          realisation fact (an object, not a draw call) and because both
 *          journeys need it: Pass 9 reports a collision while authoring, and
 *          emission spells exactly these names. One spelling, read by both,
 *          rather than a copy in each layer (SKILL §4).
 *
 * Description: `handledElements()` says which objects of a screen get a handle:
 *              every named object written in the screen itself. A drawing
 *              element has no object (§13.5) and an element expanded out of a
 *              composite's template is not written in the screen, so neither
 *              gets one. `checkGeneratedNames()` builds every composed name,
 *              then checks it against §13.4's table (each name `ui.hpp`
 *              declares, every screen's own objects and styles, and each
 *              `<bdf>`'s array) and against the other composed names.
 *              A handle is declared in `ui.hpp`, so it is visible in every
 *              translation unit, and is checked against every screen's names.
 *
 *              A collection's storage (§9.2) is composed the same way:
 *              `ui_rows_<element>_<data>`, with its layout and field table
 *              beside it. Those are `static` in their screen's unit, so they
 *              are checked against the globals and that screen's names only.
 *
 * Exports:
 * - elementHandleIdentifier(): `ui_<screen>_<element>`
 * - storageIdentifiers():      A collection's buffer, layout and field table
 * - handledElements():         The objects of a screen that get a handle
 * - GeneratedName:             One composed identifier, with its source
 * - generatedNames():          Every composed identifier of a project
 * - GeneratedNamesInput:       What the collision check reads
 * - checkGeneratedNames():     The collision check, as diagnostics
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Globals } from '../schema/globals.js';
import type { SourceLocation } from '../schema/source-location.js';
import {
  fontDataIdentifier,
  formatLocation,
  mangleIdentifiers,
  type ExpandedScreen,
  type IdentifierSource,
} from '../resolver/index.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import type { RealisedElement, RealisedScreen } from './model.js';

/**
 * @brief The handle `ui.hpp` declares for a named object: `ui_<screen>_<element>`.
 *
 * `<screen>` is the screen's name exactly as `ui_screen_<screen>` spells it,
 * and `<element>` the element's name, so `services` on screen `departures` is
 * `ui_departures_services`. The screen is part of the name because element
 * names are unique per screen, not across the project.
 *
 * @param screen  The screen's name as written.
 * @param element The element's name as written (§13.4's joined name).
 */
export function elementHandleIdentifier(screen: string, element: string): string {
  return `ui_${screen}_${element}`;
}

/**
 * @brief The `static` identifiers one collection's storage is emitted as, in
 *        its screen's unit (§9.2): its buffer `ui_rows_<element>_<data>`, its
 *        layout and its field table.
 *
 * @param element The object's name (§13.4's joined name).
 * @param data    The `<data>`'s name.
 */
export function storageIdentifiers(
  element: string,
  data: string,
): { readonly buffer: string; readonly layout: string; readonly fields: string } {
  const buffer = `ui_rows_${element}_${data}`;
  return { buffer, layout: `${buffer}_layout`, fields: `${buffer}_fields` };
}

/**
 * @brief The objects of one screen that get a handle, in object order.
 *
 * An object the author named and wrote in the screen itself. A drawing element
 * is realised as draw calls and has no object to refer to (§13.5); an element
 * expanded out of a composite's template was written in the widget, not here,
 * so its instance is the screen's handle and the child is not exported.
 *
 * @param screen A realised screen.
 * @return Its handled objects, in object-array order (§13.3).
 */
export function handledElements(screen: RealisedScreen): readonly RealisedElement[] {
  return screen.objects.filter((object) => object.identifier !== '' && object.element.instantiation.length === 0);
}

/** One identifier the generator composes, with where it comes from. */
export interface GeneratedName {
  readonly identifier: string;
  /**
   * Where it is visible: `global` for a name `ui.hpp` declares, or the screen
   * whose translation unit alone holds it.
   */
  readonly scope: { readonly kind: 'global' } | { readonly kind: 'screen'; readonly screen: string };
  /** Prose naming the source, e.g. "the handle of <wd_service_list> 'services' on screen 'departures'". */
  readonly description: string;
  /** Where its source is written: the element's `name` attribute. */
  readonly loc?: SourceLocation;
}

// elementLoc
// Where an element's name is written, which is where a composed name built
// from it is reported.
//   element — a realised element
function elementLoc(element: RealisedElement): SourceLocation | undefined {
  const node = element.element.source;
  return node.attributeLocs?.name ?? node.loc;
}

/**
 * @brief Every identifier the generator composes for a project, in document
 *        order: per screen, each handled object's handle, then each
 *        collection's storage.
 *
 * Storage names are composed for every `<data>` of every object, whether or
 * not the block can be sized: the names do not depend on its size, and a
 * collision is worth reporting beside an unsized block, not after it.
 *
 * @param realised  The realised screens, in load order.
 * @param manifests The effective manifests, for each object's `<data>`.
 * @return The names, with their scope and source.
 */
export function generatedNames(realised: readonly RealisedScreen[], manifests: ManifestRegistry): readonly GeneratedName[] {
  const names: GeneratedName[] = [];
  for (const screen of realised) {
    const screenName = screen.screen.name;
    if (!screenName) continue;
    for (const element of handledElements(screen)) {
      const loc = elementLoc(element);
      names.push({
        identifier: elementHandleIdentifier(screenName, element.identifier),
        scope: { kind: 'global' },
        description: `the handle of <${element.element.node.tag}> '${element.identifier}' on screen '${screenName}'`,
        ...(loc !== undefined ? { loc } : {}),
      });
    }
    for (const element of screen.objects) {
      if (element.identifier === '') continue;
      const loc = elementLoc(element);
      for (const data of manifests.get(element.element.node.tag)?.api.data ?? []) {
        const spelled = storageIdentifiers(element.identifier, data.name);
        const source = `the storage of <${element.element.node.tag}> '${element.identifier}' <data name="${data.name}">`;
        for (const [identifier, what] of [
          [spelled.buffer, 'buffer'],
          [spelled.layout, 'layout'],
          [spelled.fields, 'field table'],
        ] as const) {
          names.push({
            identifier,
            scope: { kind: 'screen', screen: screenName },
            description: `${source} (its ${what})`,
            ...(loc !== undefined ? { loc } : {}),
          });
        }
      }
    }
  }
  return names;
}

/** Everything {@link checkGeneratedNames} reads. */
export interface GeneratedNamesInput {
  readonly globals: Globals;
  /** The expanded screens §13.4's table is built from. */
  readonly expansion: readonly ExpandedScreen[];
  /** Their realisation, in the same order. */
  readonly realised: readonly RealisedScreen[];
  /** The effective manifests, for each object's `<data>`. */
  readonly manifests: ManifestRegistry;
}

/** One name already in scope, and what to say about it. */
interface Holder {
  readonly description: string;
  readonly loc?: SourceLocation;
}

// tableHolder
// A §13.4 table row, as a collision message names it.
//   source — its source
function tableHolder(source: IdentifierSource): Holder {
  return { description: source.description, ...(source.loc !== undefined ? { loc: source.loc } : {}) };
}

// describe
// "<description> at file:line:column", as mangle.ts's own collisions read.
//   holder — a name's source
function describe(holder: Holder): string {
  const at = formatLocation(holder.loc);
  return `${holder.description}${at ? ` at ${at}` : ''}`;
}

// collision
// The diagnostic for a composed name that is already taken, located at the
// composed name's own source.
//   name  — the later, composed name
//   first — what already holds it
function collision(name: GeneratedName, first: Holder): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.GENERATED_NAME_COLLISION,
    severity: 'error',
    file: name.loc?.file ?? '',
    line: name.loc?.line ?? 1,
    column: name.loc?.column ?? 1,
    message:
      `C++ identifier '${name.identifier}' is generated twice: by ${describe(first)}; and by ` +
      `${describe(name)}. The generator never renames an identifier to avoid a collision (§13.4); ` +
      'rename one of the elements or screens.',
    offendingText: name.identifier,
  };
}

/**
 * @brief Reports every composed identifier that collides with another, or
 *        with one of §13.4's table (§9.2, §13.4).
 *
 * A global name (declared in `ui.hpp`) is checked against everything every
 * unit can see: `ui.hpp`'s own declarations, each `<bdf>`'s array, every
 * screen's objects and local styles, and every other composed name. A
 * screen-scoped one is checked against the globals and its own screen.
 * Collisions inside §13.4's table are not reported here: they are Pass 7's
 * `U8G2GL_NAME_COLLISION`.
 *
 * @param input Globals, the expanded screens, their realisation and the
 *              manifests.
 * @return One `U8G2GL_GENERATED_NAME_COLLISION` error per collision, at the
 *         later source, in document order. Never throws for user input.
 */
export function checkGeneratedNames(input: GeneratedNamesInput): readonly Diagnostic[] {
  // --- Step 1: Every name §13.4's table already holds, by where it is visible ---
  const table = mangleIdentifiers({ globals: input.globals, screens: input.expansion });
  const global = new Map<string, Holder>();
  for (const entry of table.global) {
    if (!global.has(entry.identifier)) global.set(entry.identifier, tableHolder(entry.source));
  }
  for (const font of input.globals.fonts ?? []) {
    if (font.kind === 'bdf' && font.name) {
      const loc = font.loc;
      global.set(fontDataIdentifier(font.name), {
        description: `the compiled array of font '${font.name}'`,
        ...(loc !== undefined ? { loc } : {}),
      });
    }
  }
  const local = new Map<string, Map<string, Holder>>();
  for (const screen of table.screens) {
    const names = new Map<string, Holder>();
    for (const entry of screen.identifiers) {
      if (!names.has(entry.identifier)) names.set(entry.identifier, tableHolder(entry.source));
    }
    local.set(screen.screen, names);
  }

  // --- Step 2: Each composed name, against what is in its scope so far ---
  // Globals first, in document order, then each screen's own: a global is
  // visible to every unit, so it is in scope wherever a local is checked.
  const composed = generatedNames(input.realised, input.manifests);
  const diagnostics: Diagnostic[] = [];
  const composedGlobal = new Map<string, Holder>();
  for (const name of composed) {
    if (name.scope.kind !== 'global') continue;
    const first =
      global.get(name.identifier) ??
      composedGlobal.get(name.identifier) ??
      [...local.values()].map((names) => names.get(name.identifier)).find((holder) => holder !== undefined);
    if (first !== undefined) {
      diagnostics.push(collision(name, first));
      continue;
    }
    composedGlobal.set(name.identifier, name);
  }
  const composedLocal = new Map<string, Map<string, Holder>>();
  for (const name of composed) {
    if (name.scope.kind !== 'screen') continue;
    const own = composedLocal.get(name.scope.screen) ?? new Map<string, Holder>();
    composedLocal.set(name.scope.screen, own);
    const first =
      global.get(name.identifier) ??
      composedGlobal.get(name.identifier) ??
      local.get(name.scope.screen)?.get(name.identifier) ??
      own.get(name.identifier);
    if (first !== undefined) {
      diagnostics.push(collision(name, first));
      continue;
    }
    own.set(name.identifier, name);
  }
  return diagnostics;
}
