/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/form-problems.ts
 * Purpose: Puts each Problems row about a project file on the form field it
 *          is about, so a problem is shown where it is fixed (ui_spec §6.4,
 *          ui_spec §9.2 "what needs acting on stays inline"), with the same
 *          code and words the Problems panel uses: the rows are the panel's
 *          own, never reworded.
 * Description: A row's line and column become an offset into the form's
 *              text. The deepest node whose element contains it owns the row;
 *              within it, the field whose attribute contains the offset, else
 *              the field the message names in quotes (`Missing required
 *              attribute 'setup'` is reported at the target, and belongs to
 *              its display's `setup`), searching the node's parts too, else a
 *              written field whose name the message uses as a word. A row
 *              that names no field stays on its node. Pure.
 *
 * Exports:
 * - FormProblems:      Rows by field key and by node key
 * - placeProblems():   Place a file's rows on its form
 */

import type { ProblemRow } from '../pipeline/diagnostics';
import { allNodes, type FormField, type FormModel, type FormNode } from './form-model';

/** A file's Problems rows, placed: by field key, and by node key for those on no field. */
export interface FormProblems {
  readonly byField: ReadonlyMap<string, readonly ProblemRow[]>;
  readonly byNode: ReadonlyMap<string, readonly ProblemRow[]>;
}

// fieldsOf
// A node's fields, then its parts', recursively: where a row on the node may belong.
function fieldsOf(node: FormNode): FormField[] {
  return [...node.fields, ...node.parts.flatMap(fieldsOf)];
}

// quotedNames
// The names a message quotes: `'setup'`, `'prefix="x"'` → setup, prefix.
function quotedNames(message: string): string[] {
  return [...message.matchAll(/'([A-Za-z_][\w]*)(?:=[^']*)?'/g)].map((match) => match[1] ?? '');
}

/**
 * @brief Places a file's Problems rows on its form.
 *
 * @param model The file's form.
 * @param rows  The Problems rows, any file's; only `model.file`'s are placed.
 */
export function placeProblems(model: FormModel, rows: readonly ProblemRow[]): FormProblems {
  const byField = new Map<string, ProblemRow[]>();
  const byNode = new Map<string, ProblemRow[]>();
  const add = (map: Map<string, ProblemRow[]>, key: string, row: ProblemRow): void => {
    map.set(key, [...(map.get(key) ?? []), row]);
  };
  const nodes = allNodes(model);
  for (const row of rows) {
    if (row.file !== model.file) continue;
    // --- Step 1: The offset, and the deepest node containing it ---
    const offset = model.cst.lines.offsetOf(row.line, row.column) ?? 0;
    let owner: FormNode = model.root;
    for (const node of nodes) {
      if (node.range !== undefined && node.range.start <= offset && offset < node.range.end) {
        const span = node.range.end - node.range.start;
        const best = owner.range === undefined ? Infinity : owner.range.end - owner.range.start;
        if (span <= best) owner = node;
      }
    }
    // --- Step 2: The field written there, else the field it names ---
    const fields = fieldsOf(owner);
    const written = fields.find((field) => field.at !== undefined && field.at.start <= offset && offset < field.at.end);
    const named = quotedNames(row.message)
      .map((name) => fields.find((field) => field.attribute.name === name || field.at?.name === name))
      .find((field) => field !== undefined);
    // A message that names an attribute without quotes ("Invalid rotation
    // 'R9' on target 'primary'") belongs to that attribute, when it is written.
    const worded = fields.find((field) => field.at !== undefined && new RegExp(`\\b${field.attribute.name}\\b`).test(row.message));
    const field = written ?? named ?? worded;
    if (field !== undefined) add(byField, field.key, row);
    else add(byNode, owner.key, row);
  }
  return { byField, byNode };
}
