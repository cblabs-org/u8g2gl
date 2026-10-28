/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/element-facts.ts
 * Purpose: What the property panel knows about a selected element from the
 *          text and the last pipeline run: each attribute as written, each
 *          diagnostic placed on the attribute it is about, and the literals the
 *          scene computed for its geometry. The text is the model ([UD-3]), so
 *          these are read afresh from the current CST, looked up by `name`
 *          ([U-1]), never remembered between runs.
 * Description: `namedCstElements()` finds a document's named elements below
 *              its root, which is also how a commit finds what it edits.
 *              `elementFacts()` then gathers, per selected name, its written
 *              attributes and its diagnostics: E-1b gives each diagnostic the
 *              position of the attribute at fault, so a diagnostic inside an
 *              attribute's range is that attribute's, and one elsewhere in the
 *              element's open tag (a missing required prop, say) is the
 *              element's own. Pure: no React, no Monaco.
 *
 * Exports:
 * - FieldProblem:         One diagnostic, as a field shows it
 * - ELEMENT_PROBLEMS:     The key of an element's own problems
 * - ElementFacts:         One selected element's attributes, problems and placement
 * - namedCstElements():   A CST's named elements below the root, by name
 * - elementFacts():       Facts for the selected names
 */

import type { CstDocument, CstElement } from '@u8g2gl/core/cst/index.js';
import type { Diagnostic, Severity } from '@u8g2gl/core/schema/diagnostic.js';
import type { Rect } from '../pipeline/live-pipeline';

/** One diagnostic as a field shows it, beneath the control. */
export interface FieldProblem {
  readonly severity: Severity;
  readonly message: string;
}

/** The key, in {@link ElementFacts.problems}, of problems about the element rather than one attribute. */
export const ELEMENT_PROBLEMS = '';

/** One selected element, as the current text and the last run describe it. */
export interface ElementFacts {
  readonly name: string;
  readonly tag: string;
  /** Every attribute as written, decoded, by name. */
  readonly attributes: ReadonlyMap<string, string>;
  /** Diagnostics by the attribute they are at; {@link ELEMENT_PROBLEMS} for the element's own. */
  readonly problems: ReadonlyMap<string, readonly FieldProblem[]>;
  /**
   * The element's rectangle in its container's coordinates, as the scene
   * placed it: the literals its geometry attributes evaluate to. Undefined when
   * the last run drew no rectangle for it.
   */
  readonly placed: Rect | undefined;
}

/**
 * @brief A document's named elements below its root, by `name`.
 *
 * The root (`<screen>`, `<widget>`) is not an element of the view and is never
 * included. A name written twice is a validator error; the first wins here, as
 * it does for the selection.
 */
export function namedCstElements(cst: CstDocument): Map<string, CstElement> {
  const found = new Map<string, CstElement>();
  const visit = (element: CstElement, depth: number): void => {
    const name = element.attributes.find((attribute) => attribute.name === 'name')?.value;
    if (depth > 0 && name !== undefined && name !== '' && !found.has(name)) found.set(name, element);
    for (const child of element.children) {
      if (child.kind === 'element') visit(child, depth + 1);
    }
  };
  if (cst.root !== undefined) visit(cst.root, 0);
  return found;
}

/**
 * @brief The facts for each selected name found in the text.
 *
 * @param cst         The selected file's current CST.
 * @param names       The selection, in its order.
 * @param diagnostics The last run's diagnostics, for every file.
 * @param placed      The last run's rectangles in container coordinates, by name.
 * @return One entry per name present in the text, in selection order.
 */
export function elementFacts(
  cst: CstDocument,
  names: readonly string[],
  diagnostics: readonly Diagnostic[],
  placed: ReadonlyMap<string, Rect>,
): ElementFacts[] {
  // --- Step 1: The selected elements in the current text ---
  const elements = namedCstElements(cst);
  const selected = names.flatMap((name) => {
    const element = elements.get(name);
    return element === undefined ? [] : [{ name, element }];
  });

  // --- Step 2: Each diagnostic in this file onto its element's attribute ---
  const problems = new Map<string, Map<string, FieldProblem[]>>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.file !== cst.file) continue;
    const offset = cst.lines.offsetOf(diagnostic.line, diagnostic.column);
    if (offset === undefined) continue;
    const owner = selected.find(({ element }) => offset >= element.openTag.start && offset < element.openTag.end);
    if (owner === undefined) continue;
    const attribute = owner.element.attributes.find((a) => offset >= a.start && offset < a.end)?.name ?? ELEMENT_PROBLEMS;
    const byAttribute = problems.get(owner.name) ?? new Map<string, FieldProblem[]>();
    const list = byAttribute.get(attribute) ?? [];
    if (!list.some((p) => p.message === diagnostic.message)) list.push({ severity: diagnostic.severity, message: diagnostic.message });
    byAttribute.set(attribute, list);
    problems.set(owner.name, byAttribute);
  }

  // --- Step 3: The facts ---
  return selected.map(({ name, element }) => ({
    name,
    tag: element.name,
    attributes: new Map(element.attributes.map((attribute) => [attribute.name, attribute.value])),
    problems: problems.get(name) ?? new Map(),
    placed: placed.get(name),
  }));
}
