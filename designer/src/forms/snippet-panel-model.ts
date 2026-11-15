/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/snippet-panel-model.ts
 * Purpose: What the target section's constructor-snippet panel shows, in
 *          place of the pin fields schema 0.7 removed ([D-22], ui_spec §6.4).
 *          The board owns the wiring, so the designer writes no pins: it shows
 *          the board-side code that constructs the target's display, and the
 *          author copies it into their firmware. The text is core's
 *          `constructorSnippet()`, so it is byte for byte what
 *          `u8g2gl display <setup> --snippet` prints.
 * Description: Pure functions over the form model, so the panel's content is
 *              unit-tested without a browser: a target node's name, its
 *              display's setup and rotation as the form reads them, and the
 *              snippet for them. Nothing here writes to the project.
 *
 * Exports:
 * - SNIPPET_LEAD:      The line the panel opens with
 * - TargetSnippet:     A target's snippet and what it was made from
 * - projectSchema():   The schema a u8g2gl.xml form declares
 * - targetSnippet():   The snippet a target node shows, or undefined
 */

import { constructorSnippet } from '@u8g2gl/core/catalogue/index.js';
import type { DisplayRecord } from '@u8g2gl/core/schema/display-record.js';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import type { FormModel, FormNode } from './form-model';

/** The panel's first line: where the pins went ([D-22]). */
export const SNIPPET_LEAD = "Pins and bus are configured by your firmware's board (e.g. board.h); U8G2GL describes the panel.";

/** Each setup's record, by name. */
const BY_SETUP: ReadonlyMap<string, DisplayRecord> = new Map(CATALOGUE.map((record) => [record.setup, record]));

/** A target's snippet, and the inputs it was made from. */
export interface TargetSnippet {
  readonly targetName: string;
  readonly setup: string;
  readonly rotation: string | undefined;
  /** `constructorSnippet()`'s text for those inputs. */
  readonly text: string;
}

// fieldValue
// A field's value on a node, wherever the file writes it (the form model
// resolves `<target setup>` and `<display setup>` to the one field).
//   node — the node
//   name — the attribute's canonical name
function fieldValue(node: FormNode, name: string): string | undefined {
  return node.fields.find((field) => field.attribute.name === name)?.value;
}

/**
 * @brief The schema version a `u8g2gl.xml` form's project declares.
 *
 * @param model The form, or undefined before the first read.
 * @return The `schema` attribute as written, or undefined.
 */
export function projectSchema(model: FormModel | undefined): string | undefined {
  const project = model?.sections.find((section) => section.node?.element.id === 'project')?.node;
  return project === undefined ? undefined : fieldValue(project, 'schema');
}

/**
 * @brief The constructor snippet a target shows: for its display's setup and
 *        rotation, as the form reads them now.
 *
 * @param node A form node; only a `<target>` has a snippet.
 * @return The snippet, or undefined when the node is not a target, or its
 *         setup is absent or not in the catalogue (the setup field already
 *         says why).
 */
export function targetSnippet(node: FormNode): TargetSnippet | undefined {
  if (node.element.id !== 'target') return undefined;
  const display = node.parts.find((part) => part.element.id === 'display');
  const setup = display === undefined ? undefined : fieldValue(display, 'setup');
  const record = setup === undefined ? undefined : BY_SETUP.get(setup);
  if (display === undefined || setup === undefined || record === undefined) return undefined;
  // A target without a name is flagged by its own field; the snippet still
  // names something, so its mismatch comment reads.
  const targetName = fieldValue(node, 'name') ?? 'unnamed';
  const rotation = fieldValue(display, 'rotation');
  return { targetName, setup, rotation, text: constructorSnippet(record, rotation, targetName) };
}
