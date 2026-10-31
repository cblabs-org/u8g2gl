/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/commit-edits.ts
 * Purpose: Turns a committed field into the smallest text edit that writes it
 *          ([UD-3]): the panel never regenerates an element, it rewrites one
 *          attribute's value in the author's own text, adds the attribute
 *          after the last one in the element's own layout, or removes it for
 *          *reset*. Every edit is computed by the CLI's CST edit functions on
 *          the current text, with each element looked up by `name` at the
 *          moment of the commit, never from offsets remembered earlier.
 * Description: Pure, so the edits can be tested without a browser; the panel
 *              controller lands them on the Monaco model as one undo stop. A
 *              commit to several elements is one list of edits against one
 *              text (ui_spec §9.4), which `applyEdits` and Monaco both take as
 *              a single change.
 *
 * Exports:
 * - ROOT_TARGET:        The name that stands for the document's root (screen properties)
 * - attributeEdits():   The edits that set or remove one attribute on named elements
 */

import { insertAttribute, parseCst, removeAttribute, replaceAttributeValue, type CstElement, type TextEdit } from '@u8g2gl/core/cst/index.js';
import { namedCstElements } from './element-facts';

/**
 * The target name that means the document's root element — `<screen>` — whose
 * own attributes the panel shows with nothing selected. Empty, because no
 * element below the root may have an empty name ([U-1]).
 */
export const ROOT_TARGET = '';

/**
 * @brief The edits that set `attribute` to `value` on each named element, or
 *        remove it when `value` is undefined (reset).
 *
 * An element that already has the value gets no edit, and one that does not
 * write the attribute gets none for a reset, so a commit that changes nothing
 * changes no text. Names not found in the text are skipped: the selection is
 * reconciled after every run, so that is a race, not an intent.
 *
 * @param text      The document's current text.
 * @param file      Its project path, for the CST's diagnostics.
 * @param names     The elements, by `name`; {@link ROOT_TARGET} for the root.
 * @param attribute The attribute to write.
 * @param value     The decoded value, or undefined to remove the attribute.
 * @return The edits, non-overlapping, in the coordinates of `text`.
 */
export function attributeEdits(
  text: string,
  file: string,
  names: readonly string[],
  attribute: string,
  value: string | undefined,
): TextEdit[] {
  const { cst } = parseCst(text, file);
  const elements = namedCstElements(cst);
  const targets = names.flatMap((name): CstElement[] => {
    const element = name === ROOT_TARGET ? cst.root : elements.get(name);
    return element === undefined ? [] : [element];
  });
  return targets.flatMap((element) => {
    const existing = element.attributes.find((a) => a.name === attribute);
    if (value === undefined) return existing === undefined ? [] : removeAttribute(cst, existing);
    return existing === undefined ? insertAttribute(cst, element, attribute, value) : replaceAttributeValue(existing, value);
  });
}
