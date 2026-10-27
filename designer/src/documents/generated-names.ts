/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/documents/generated-names.ts
 * Purpose: [U-1]'s editor half: an element with no `name` gets one written into
 *          its buffer when the file is opened, so it appears in Monaco at once
 *          and the canvas can select it — but it reaches disk only when the user
 *          saves (ui_spec §16.1). The CLI's `--fix-names` performs the same
 *          insertion on disk; both apply the parser's own edits, so the names
 *          are identical.
 * Description: Parses the text under the `'generate'` missing-name policy and
 *              applies the insertions it returns. Only screens and widget
 *              manifests have element names; other documents come back
 *              unchanged.
 *
 * Exports:
 * - withGeneratedNames():  A document's text with its missing names inserted
 */

import { applyTextEdits, parseScreenFile, parseWidgetManifestFile } from '@u8g2gl/core/parser/index.js';
import { classifyProjectFile } from '../project/project-model';

/**
 * @brief The text with a generated `name="…"` inserted for every unnamed element.
 *
 * @param path Project-relative path, which decides the parser.
 * @param text The document as read.
 * @return The same string when nothing was missing.
 */
export function withGeneratedNames(path: string, text: string): string {
  const kind = classifyProjectFile(path);
  const options = { missingNamePolicy: 'generate' } as const;
  const edits =
    kind === 'screen'
      ? parseScreenFile(text, path, options).nameEdits
      : kind === 'widget'
        ? parseWidgetManifestFile(text, path, options).nameEdits
        : undefined;
  return edits === undefined || edits.length === 0 ? text : applyTextEdits(text, edits);
}
