/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/cost-notes.ts
 * Purpose: The property panel's RAM line, by [Q-19]'s rule: the panel shows a
 *          memory cost only where §18 computes one. §18 now computes a
 *          collection widget's storage exactly (design_spec §9.2), so an
 *          element whose manifest declares `<data>` gets the bytes the build
 *          allocates for each block and how they follow; a project widget
 *          without `<data>` keeps the muted line that no figure exists. The
 *          figure is never estimated here: it is the pipeline's own storage,
 *          from the capacities the scene and the firmware are generated from.
 * Description: `costNotes()` turns the selection and the drawn screen's storage
 *              into the header's note lines. Kept apart from the controller so
 *              the rule is testable without a workspace.
 *
 * Exports:
 * - PROJECT_COST_NOTE: The muted line for a project widget with no figure
 * - costNotes():       The RAM lines for a selection
 */

import type { EffectiveManifest } from '@u8g2gl/core/manifest/index.js';
import { storageDerivation, type CollectionStorage } from '@u8g2gl/core/realise/index.js';

/** The [Q-19] rule's line: no figure for a cost §18 cannot compute. */
export const PROJECT_COST_NOTE = 'RAM cost not reported for project widgets ([Q-19])';

/**
 * @brief The header's RAM lines for a selection.
 *
 * One line per `<data>` block of each element whose manifest declares one,
 * stating the bytes §18 reports and their derivation; a block that cannot be
 * sized says so, because a problem refuses it. For a project widget without
 * `<data>`, the muted line, once. With several elements, each figure is
 * prefixed with its element's name.
 *
 * @param names     The selected elements' names.
 * @param manifests Their manifests, in the same order.
 * @param storage   The drawn screen's collections, by element name.
 * @return The notes; empty for a selection with no project widget and no `<data>`.
 */
export function costNotes(
  names: readonly string[],
  manifests: readonly EffectiveManifest[],
  storage: ReadonlyMap<string, readonly CollectionStorage[]>,
): string[] {
  const notes: string[] = [];
  let unreported = false;
  for (const [index, name] of names.entries()) {
    const manifest = manifests[index];
    if (manifest === undefined) continue;
    const declared = manifest.api.data ?? [];
    if (declared.length === 0) {
      unreported = unreported || manifest.origin === 'project';
      continue;
    }
    const prefix = names.length > 1 ? `${name}: ` : '';
    const blocks = storage.get(name) ?? [];
    for (const data of declared) {
      const block = blocks.find((candidate) => candidate.data.name === data.name);
      notes.push(
        block === undefined
          ? `${prefix}RAM for ${data.name} not computed: its storage cannot be sized (see Problems)`
          : `${prefix}RAM ${block.bytes} bytes for ${data.name}: ${storageDerivation(block)}`,
      );
    }
  }
  return unreported ? [...notes, PROJECT_COST_NOTE] : notes;
}
