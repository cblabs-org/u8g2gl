/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/project/project-references.ts
 * Purpose: Where the designer gets the project's references (who uses each
 *          subject, constant, style, font and image) from: the CLI's own
 *          reference finder over the documents' current texts, so the forms'
 *          "Used by" lists, their removal guards and rename all read one
 *          answer, and the same one a CLI `rename` would.
 * Description: The index is rebuilt only when a text or the manifests change.
 *              Texts are compared by identity, which is what the documents
 *              hand out for an unchanged buffer, so asking again on every
 *              render costs a walk over the paths. The manifests come from
 *              the last run; before the first run there is no index, as there
 *              is no model.
 *
 * Exports:
 * - referencesOf():         The index for a set of texts and manifests, cached
 * - workspaceReferences():  The index for the session's documents now
 * - goToReference():        Select a reference's element, or open its file at it
 */

import { indexReferences, type Reference, type ReferenceIndex } from '@u8g2gl/core/references/find-references.js';
import type { ManifestRegistry } from '@u8g2gl/core/manifest/manifest-registry.js';
import type { Workspace } from '../workspace';

/** The last index built, and what it was built from. */
let last: { readonly texts: ReadonlyMap<string, string>; readonly manifests: Pick<ManifestRegistry, 'get'>; readonly index: ReferenceIndex } | undefined;

// sameTexts
// Whether two sets of texts hold the same paths with identical strings.
function sameTexts(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [path, text] of a) if (b.get(path) !== text) return false;
  return true;
}

/**
 * @brief The reference index for these texts, built once while they and the
 *        manifests stay the same.
 *
 * @param texts     Every project document's text, by project path.
 * @param manifests The elements' manifests, from the last run.
 */
export function referencesOf(texts: ReadonlyMap<string, string>, manifests: Pick<ManifestRegistry, 'get'>): ReferenceIndex {
  if (last !== undefined && last.manifests === manifests && sameTexts(last.texts, texts)) return last.index;
  const index = indexReferences({ documents: texts, manifests });
  last = { texts, manifests, index };
  return index;
}

/**
 * @brief The references in the session's documents as they are now: open
 *        buffers where there are any, disk text otherwise.
 *
 * @return The index, or undefined before the first run has read the manifests.
 */
export function workspaceReferences(workspace: Workspace): ReferenceIndex | undefined {
  const manifests = workspace.loop.lastRun.get()?.result.model.manifests;
  return manifests === undefined ? undefined : referencesOf(workspace.documents.texts(), manifests);
}

/**
 * @brief Goes to a reference: selects its element on its screen, or else puts
 *        the caret on it in its file.
 *
 * A screen's element is selected as a click in the Explorer selects it, so
 * the canvas, the XML and the property panel all follow. Anything else (a
 * widget's template or default, a style in globals.xml) has no element to
 * select on a canvas, so its file opens at the reference.
 *
 * @param workspace The session.
 * @param reference The reference.
 */
export function goToReference(workspace: Workspace, reference: Reference): void {
  if (reference.screen !== undefined && reference.element !== undefined) {
    workspace.openFile({ path: reference.file });
    workspace.selection.select(reference.file, [reference.element], 'tree');
    return;
  }
  const before = (workspace.documents.textOf(reference.file) ?? '').slice(0, reference.range.start);
  const line = before.split('\n').length;
  workspace.openFile({ path: reference.file, line, column: before.length - before.lastIndexOf('\n') });
}
