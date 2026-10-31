/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/documents/element-names.ts
 * Purpose: The name an element the canvas creates is given — an insert from
 *          the Palette, a duplicate — so that it is a valid identifier the
 *          moment it is written ([U-1], §13.4) and never collides with a name
 *          already in the project. A colliding or invalid name would make the
 *          canvas's own edit the cause of an error in Problems.
 * Description: `<stem>_<n>` with the lowest free `n` from 1, where the stem is
 *              the tag as the parser's own name synthesis cleans it: the
 *              `u8g2gl_`, `wd_` and `ui_` prefixes stripped (`u8g2gl_` and
 *              `ui_` are reserved, §13.4, so the bare tag would not validate),
 *              lower-cased, anything outside `[a-z0-9_]` turned to `_`, runs of
 *              `_` collapsed and a trailing one dropped, and `elem_` put in
 *              front of a stem that does not start with a letter. A unit test
 *              holds this to the parser's synthesis, so the two cannot drift.
 *
 *              "Free" is across the whole project, not one screen: every
 *              element name in every screen and composite, every screen name,
 *              and every global's (constant, subject, style, font, image). The
 *              validator's duplicate rule is per screen, but §13.4's mangling
 *              checks generated identifiers against the globals too, and a name
 *              free everywhere satisfies both.
 *
 * Exports:
 * - nameStem():         A tag's stem for generated names
 * - projectNames():     Every name the project already uses
 * - nextElementName():  The lowest free `<stem>_<n>`
 */

import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import type { WidgetNodeChild } from '@u8g2gl/core/schema/widget-node.js';

/**
 * @brief The stem a generated name for `tag` starts with.
 *
 * @param tag An element tag, e.g. `u8g2gl_label` or `wd_service_list`.
 * @return E.g. `label`, `service_list`.
 */
export function nameStem(tag: string): string {
  const base = (tag.replace(/^(u8g2gl_|wd_|ui_)/, '') || tag)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/_$/, '');
  return /^[a-z]/.test(base) ? base : `elem_${base}`;
}

// collectNodeNames
// Every element name in a view subtree, at any depth.
//   children — the subtree's children
//   into     — where the names go
function collectNodeNames(children: readonly WidgetNodeChild[], into: Set<string>): void {
  for (const child of children) {
    if (!('tag' in child)) continue;
    const name = child.attributes.name;
    if (typeof name === 'string' && name !== '') into.add(name);
    collectNodeNames(child.children, into);
  }
}

/**
 * @brief Every name the project already uses, in any scope.
 *
 * @param model The project model of the texts the name will be written into.
 * @return Element, screen and global names.
 */
export function projectNames(model: ProjectModel): Set<string> {
  const names = new Set<string>();
  const { globals } = model;
  for (const list of [globals.consts, globals.subjects, globals.styles, globals.fonts, globals.images]) {
    for (const entry of list) if (entry.name !== '') names.add(entry.name);
  }
  for (const screen of model.screens) {
    if (screen.name !== '') names.add(screen.name);
    collectNodeNames(screen.view?.children ?? [], names);
  }
  for (const composite of model.manifests.declaredComposites) {
    collectNodeNames(composite.view?.children ?? [], names);
  }
  return names;
}

/**
 * @brief The lowest free `<stem>_<n>`, `n` from 1, for an element of `tag`.
 *
 * @param tag   The new element's tag.
 * @param taken Names already in use; see {@link projectNames}.
 */
export function nextElementName(tag: string, taken: ReadonlySet<string>): string {
  const stem = nameStem(tag);
  let n = 1;
  while (taken.has(`${stem}_${n}`)) n += 1;
  return `${stem}_${n}`;
}
