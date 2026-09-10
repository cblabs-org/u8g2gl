/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/name-policy.ts
 * Purpose: Owns the [U-1] missing-name policy and the source edits that write a
 *          synthesised name back into the document. It exists as its own module
 *          because two very different callers share it: the CLI, which must
 *          *refuse* to invent element identity, and the designer, which must
 *          invent it and then show the author what it did. Making the policy a
 *          parameter — rather than a branch inside the parser — is what stops
 *          those two journeys from drifting into two implementations.
 * Description: Declares the policy union and its safe default, the SourceEdit
 *              insertion record, the pure back-to-front edit applier, and the
 *              column arithmetic that turns an element's opening-tag location
 *              into the exact insertion point for a ` name="…"` attribute. All
 *              of it is pure string work: nothing here re-serialises XML, so
 *              comments, attribute order and indentation survive untouched.
 *              `src/node/` applies the same edits to disk; the designer applies
 *              them to an in-memory buffer.
 *
 * Exports:
 * - MissingNamePolicy:            'error' (refuse) or 'generate' (synthesise)
 * - DEFAULT_MISSING_NAME_POLICY:  'error' — the safe journey when no caller chooses
 * - SourceEdit:                   One text insertion at a 1-based source location
 * - ParseOptions:                 Policy plus an optional sink for computed edits
 * - createNameInsertion():        Build the ` name="…"` insertion for an element
 * - applyTextEdits():             Apply insertions to a source string, back-to-front
 */

import type { SourceLocation } from '../schema/source-location.js';

/**
 * What the parser does when an element carries no `name` attribute ([U-1]).
 *
 * - `'error'` — emit `U8G2GL_MISSING_NAME` at `error` severity and synthesise
 *   nothing. The element keeps no name. This is the build journey: a synthesised
 *   name is *positional*, so inserting an element above one renumbers it, and
 *   generated code that bound to `label_0` would silently drive a different
 *   widget. A build pipeline has no canvas, no undo stack and nobody watching,
 *   so it must not invent identity.
 * - `'generate'` — synthesise `{tag}_{n}` from the document-wide allocator, emit
 *   `U8G2GL_MISSING_NAME` at `warning` severity, and carry on. This is the
 *   editor journey, where auto-correction is visible and reversible, and the
 *   journey `u8g2gl validate --fix-names` opts into deliberately.
 */
export type MissingNamePolicy = 'error' | 'generate';

/**
 * The policy applied when a caller does not choose one.
 *
 * Silent synthesis is the dangerous option, so it must be opted into rather than
 * inherited by accident — which is precisely how it reached the build in the
 * first place.
 */
export const DEFAULT_MISSING_NAME_POLICY: MissingNamePolicy = 'error';

/**
 * A single text insertion at a 1-based source coordinate.
 *
 * Deliberately an *insertion*, not a replacement: write-back never needs to
 * remove or rewrite existing text, so there is no round-trip serializer here and
 * none is wanted. `loc` is the position the text is inserted *before*.
 */
export interface SourceEdit {
  /** 1-based file/line/column at which `text` is inserted. */
  readonly loc: SourceLocation;
  /** Exact text to insert, including any leading space it needs. */
  readonly text: string;
}

/**
 * Options accepted by every parser entry point that can encounter an
 * unnamed element.
 */
export interface ParseOptions {
  /** Missing-name behaviour. Defaults to {@link DEFAULT_MISSING_NAME_POLICY}. */
  readonly missingNamePolicy?: MissingNamePolicy;
  /**
   * Optional sink for write-back edits. When supplied and the policy is
   * `'generate'`, one insertion per synthesised name is appended in document
   * order. The array is mutated in place — it is a collector, matching the
   * `diagnostics` parameter already used throughout the parser.
   */
  readonly nameEdits?: SourceEdit[];
}

/**
 * @brief Builds the insertion that writes a synthesised name into the source.
 *
 * @param elementLoc  Location of the element's opening `<`, as recorded by the
 *                    tokeniser.
 * @param tagName     The element's tag name, exactly as it appears in source.
 * @param name        The name to insert.
 * @return An insertion of ` name="…"` positioned immediately after the tag name.
 */
export function createNameInsertion(
  elementLoc: SourceLocation,
  tagName: string,
  name: string,
): SourceEdit {
  // The tokeniser records `loc` at the '<' itself. XML forbids whitespace
  // between '<' and the tag name, so the character immediately after the name
  // is at column (loc.column + 1 + tagName.length) — one for the '<', then the
  // name. Inserting there lands before any existing attribute, which keeps the
  // author's attribute order intact and puts identity first where a reader
  // looks for it.
  return {
    loc: {
      file: elementLoc.file,
      line: elementLoc.line,
      column: elementLoc.column + 1 + tagName.length,
    },
    text: ` name="${name}"`,
  };
}

/**
 * Builds the absolute offset of the first character of every line.
 *
 * Newline handling matches the tokeniser's own `advance()` — LF, CR and CRLF all
 * end a line — because an offset table that disagreed with the coordinates the
 * tokeniser produced would place edits in the wrong place on CRLF files only,
 * which is the kind of defect that survives every test written on macOS.
 */
function buildLineStartOffsets(source: string): readonly number[] {
  const starts: number[] = [0];

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\r') {
      if (source[i + 1] === '\n') {
        i++;
      }
      starts.push(i + 1);
    } else if (ch === '\n') {
      starts.push(i + 1);
    }
  }

  return starts;
}

/**
 * @brief Applies insertions to a source string.
 *
 * Pure: no file I/O, so the CLI and the designer run the identical code against
 * a file's contents and an editor buffer respectively.
 *
 * @param source Original document text.
 * @param edits  Insertions in any order; an edit whose location falls outside
 *               `source` is skipped rather than throwing, since a bad location
 *               is a programmer error that must not corrupt a user's file.
 * @return The document with every applicable insertion applied.
 */
export function applyTextEdits(source: string, edits: readonly SourceEdit[]): string {
  // --- Step 1: Resolve each 1-based coordinate to an absolute offset ---
  const lineStarts = buildLineStartOffsets(source);
  const resolved: { offset: number; text: string }[] = [];

  for (const edit of edits) {
    const lineStart = lineStarts[edit.loc.line - 1];
    if (lineStart === undefined) {
      continue;
    }
    const offset = lineStart + (edit.loc.column - 1);
    if (offset < 0 || offset > source.length) {
      continue;
    }
    resolved.push({ offset, text: edit.text });
  }

  // --- Step 2: Order back-to-front (descending offset) ---
  // Applying in descending order means an insertion never shifts the offsets of
  // the edits still to be applied. Front-to-back would require re-deriving every
  // later offset after each splice — more code and one more way to be wrong.
  resolved.sort((a, b) => b.offset - a.offset);

  // --- Step 3: Splice each insertion into place ---
  let result = source;
  for (const edit of resolved) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset);
  }

  return result;
}
