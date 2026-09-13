/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/manifest/framework-manifests.ts
 * Purpose: Turns the bundled framework manifest texts into parsed manifests
 *          through the same parser a project's own widgets/ go through, so a
 *          built-in element and a custom one are handled identically ([D-17]).
 *          Kept in core, not node, because the designer needs it in a browser.
 * Description: Parses each text under a stable display path
 *              (`u8g2gl/manifests/<file>`) — the include path an author would
 *              recognise — so a diagnostic naming a framework manifest points
 *              somewhere real.
 *
 * Exports:
 * - ManifestText:              One manifest's filename and raw XML
 * - FRAMEWORK_MANIFEST_PATH:   Display path prefix for framework manifest files
 * - parseFrameworkManifests(): Parse bundled texts into manifests plus diagnostics
 */

import type { Diagnostic } from '../schema/diagnostic.js';
import type { WidgetManifest } from '../schema/widget-manifest.js';
import { parseWidgetManifestFile } from '../parser/parse-widget-manifest.js';

/**
 * One manifest as bundled: its filename and its XML text, unparsed.
 */
export interface ManifestText {
  /** Bare filename, e.g. "u8g2gl_label.xml". */
  readonly filename: string;
  /** Complete, unmodified XML text of the manifest. */
  readonly xml: string;
}

/**
 * Path prefix under which framework manifests are reported in diagnostics.
 * Matches the header include path (`#include <u8g2gl/...>`), not the repository
 * layout, because that is the path an installed user can find.
 */
export const FRAMEWORK_MANIFEST_PATH = 'u8g2gl/manifests';

/**
 * Parses bundled framework manifest texts.
 *
 * A text that fails to parse contributes diagnostics and no manifest. A clean
 * bundle yields no diagnostics; any that appear mean the shipped manifests are
 * broken, which is a framework defect the author cannot fix — reported rather
 * than swallowed so it is never silent.
 *
 * @param texts Manifest texts, typically FRAMEWORK_MANIFESTS.
 * @return Parsed manifests in input order, and every parse diagnostic.
 */
export function parseFrameworkManifests(texts: readonly ManifestText[]): {
  readonly manifests: readonly WidgetManifest[];
  readonly diagnostics: readonly Diagnostic[];
} {
  const manifests: WidgetManifest[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const text of texts) {
    const result = parseWidgetManifestFile(text.xml, `${FRAMEWORK_MANIFEST_PATH}/${text.filename}`);
    diagnostics.push(...result.diagnostics);
    if (result.value) {
      manifests.push(result.value);
    }
  }
  return { manifests, diagnostics };
}
