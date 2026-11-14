/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-sections.ts
 * Purpose: The Explorer's section rows for the two project files (ruling 2):
 *          `u8g2gl.xml ▸ Project · Targets ▸ <each target> · Output` and
 *          `globals.xml ▸ Subjects (n) · Fonts (n) · Images (n) · Styles (n) ·
 *          Consts (n)`, so the parts of a project file are visible, and one
 *          click away, before the file is opened (principle 8).
 * Description: Read from the same form model the form draws, from each file's
 *              current buffer, so a row and the section it opens always
 *              agree. A file whose text cannot be read keeps its last rows,
 *              as the element rows do. Pure.
 *
 * Exports:
 * - SectionRow:         One row: the form key it opens, its label, its children
 * - sectionRows():      A file's rows from its text
 * - nextSectionRows():  Every project file's rows, keeping identity where unchanged
 */

import { buildFormModel, isFormFile, type FormModel } from './form-model';

/** One Explorer section row. */
export interface SectionRow {
  /** The form section or item key the row opens. */
  readonly key: string;
  readonly label: string;
  /** For a list section: its item count, which the label shows for globals. */
  readonly count?: number;
  readonly children: readonly SectionRow[];
}

/** The sections whose label carries their count: the globals' kinds, as ruling 2 writes them. */
const COUNTED: ReadonlySet<string> = new Set(['globals.xml']);

// rowsOf
// A form's rows: a row per section; a list in u8g2gl.xml lists its items by
// name, a list in globals.xml shows its count.
function rowsOf(model: FormModel): SectionRow[] {
  return model.sections.map((section) => {
    const items = section.list?.items ?? [];
    const counted = section.list !== undefined && COUNTED.has(model.file);
    return {
      key: section.key,
      label: counted ? `${section.title} (${items.length})` : section.title,
      ...(section.list !== undefined ? { count: items.length } : {}),
      children: counted
        ? []
        : items.map((item) => ({
            key: item.key,
            label: item.fields.find((field) => field.attribute.name === 'name')?.value ?? item.element.label,
            children: [],
          })),
    };
  });
}

/**
 * @brief A project file's section rows from its text.
 *
 * @return The rows; undefined when the text cannot be read, so the caller
 *         keeps the last ones.
 */
export function sectionRows(file: string, text: string): readonly SectionRow[] | undefined {
  if (!isFormFile(file)) return undefined;
  const reading = buildFormModel(file, text);
  return reading.kind === 'form' ? rowsOf(reading.model) : undefined;
}

// sameRows
// Whether two row lists show the same thing.
function sameRows(a: readonly SectionRow[], b: readonly SectionRow[]): boolean {
  return a.length === b.length && a.every((row, i) => {
    const other = b[i];
    return other !== undefined && row.key === other.key && row.label === other.label && sameRows(row.children, other.children);
  });
}

/**
 * @brief Every project file's rows, from the current texts, keeping the
 *        previous map when no row changed, so the Explorer does not re-render
 *        on a keystroke that moves none.
 *
 * @param previous The rows last returned.
 * @param texts    Each project file's current text, by path.
 */
export function nextSectionRows(
  previous: ReadonlyMap<string, readonly SectionRow[]>,
  texts: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly SectionRow[]> {
  const next = new Map<string, readonly SectionRow[]>();
  let changed = previous.size !== texts.size;
  for (const [file, text] of texts) {
    const before = previous.get(file);
    const rows = sectionRows(file, text) ?? before ?? [];
    if (before !== undefined && sameRows(before, rows)) {
      next.set(file, before);
    } else {
      next.set(file, rows);
      changed = true;
    }
  }
  return changed ? next : previous;
}
