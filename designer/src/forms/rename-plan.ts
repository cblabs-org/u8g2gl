/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/rename-plan.ts
 * Purpose: What renaming a subject, constant, style, font or image across the
 *          project would do, worked out before anything is written (ui_spec
 *          §6.4, §14): the edits in each file, the generated symbols whose
 *          names change, and the screens a global style's rename leaves alone
 *          because a style of their own shadows it. Or why it cannot be done,
 *          so a refused rename writes nothing at all.
 * Description: Pure over the reference finder's index and the texts it read,
 *              unit-tested without a browser. Each reference's range is
 *              replaced by the new name, so a `#name` keeps its `#` and an
 *              attribute keeps its quotes. Refused, naming the reason:
 *              - a name §13.4 forbids (`checkNameRule()`, the validator's
 *                own), or, for a `<builtin>`, a font U8G2 does not bundle,
 *                since its name is the U8G2 symbol it aliases;
 *              - a name the same kind already declares, a screen's own styles
 *                included, which would merge two names into one;
 *              - a file that would be touched but is not well-formed, since
 *                its references cannot be planned safely. "Would be touched"
 *                is read generously: any unreadable file whose text holds the
 *                old name at all.
 *              The symbols are the generator's own spellings (`mangle.ts`),
 *              never restated here: a subject's `ui_subject_` object and
 *              `ui_set_` setter, a font's `ui_font_` alias (and a `<bdf>`'s
 *              `ui_fontdata_` array), an image's `ui_image_` array and a
 *              style's `ui_style_` object. A constant has none: it is resolved
 *              at build time.
 *
 * Exports:
 * - RenameTarget:       What is being renamed
 * - FileRename:         One file's edits
 * - SymbolChange:       One generated symbol, old and new
 * - RenamePlan:         A plan, or why there is none
 * - generatedSymbols(): The symbols a name gives rise to
 * - planRename():       The plan for a new name
 */

import FONT_NAMES from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import type { TextEdit } from '@u8g2gl/core/cst/index.js';
import type { ReferenceIndex, ReferenceKind } from '@u8g2gl/core/references/find-references.js';
import { fontDataIdentifier, fontIdentifier, imageIdentifier, styleIdentifier, subjectIdentifier, subjectSetterIdentifier } from '@u8g2gl/core/resolver/mangle.js';
import { checkNameRule } from '@u8g2gl/core/validator/validate-identifiers.js';

/** Every font U8G2 bundles: what a `<builtin>` may be called. */
const U8G2_FONTS: ReadonlySet<string> = new Set(FONT_NAMES as readonly string[]);

/** What is being renamed. */
export interface RenameTarget {
  readonly kind: ReferenceKind;
  readonly name: string;
  /** For a font: whether it is a `<builtin>`, whose name is a U8G2 symbol. */
  readonly builtin?: boolean;
}

/** One file's part of a rename: its edits, as one undo stop in that file. */
export interface FileRename {
  readonly file: string;
  /** In the coordinates of the text planned against, in document order. */
  readonly edits: readonly TextEdit[];
}

/** One generated symbol whose name changes. */
export interface SymbolChange {
  readonly from: string;
  readonly to: string;
}

/** A rename, or why there can be none. */
export type RenamePlan =
  | {
      readonly ok: true;
      /** Each file it changes, in path order; `globals.xml`'s declaration among them. */
      readonly files: readonly FileRename[];
      readonly symbols: readonly SymbolChange[];
      /** Screens left alone because their own style of that name shadows it. */
      readonly skipped: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/** What each kind is called in a sentence. */
const NOUNS: Readonly<Record<ReferenceKind, string>> = { subject: 'subject', const: 'constant', style: 'style', font: 'font', image: 'image' };

/**
 * @brief The generated symbols a name gives rise to, as application code calls
 *        them: a setter is written with its parentheses.
 *
 * @param target The name and its kind.
 */
export function generatedSymbols(target: RenameTarget): string[] {
  const { kind, name } = target;
  switch (kind) {
    case 'subject':
      return [`${subjectSetterIdentifier(name)}()`, subjectIdentifier(name)];
    case 'font':
      return target.builtin === true ? [fontIdentifier(name)] : [fontIdentifier(name), fontDataIdentifier(name)];
    case 'image':
      return [imageIdentifier(name)];
    case 'style':
      return [styleIdentifier(name)];
    case 'const':
      return [];
  }
}

// nameProblem
// Why a new name may not be used for this kind, or undefined when it may.
function nameProblem(target: RenameTarget, name: string): string | undefined {
  if (name === '') return 'A name is required.';
  if (target.kind === 'font' && target.builtin === true) {
    return U8G2_FONTS.has(name) ? undefined : `'${name}' is not a font U8G2 bundles. A built-in font's name is the U8G2 font it uses.`;
  }
  return checkNameRule(name, undefined, NOUNS[target.kind])?.message;
}

/**
 * @brief The plan for renaming a name to a new one, or why it is refused.
 *
 * @param refs    The project's references.
 * @param texts   The texts `refs` was read from, by project path.
 * @param target  What is being renamed.
 * @param newName The name it would have.
 * @return The edits per file, the symbols that change and the screens
 *         skipped; or a refusal naming its reason, with nothing planned.
 */
export function planRename(refs: ReferenceIndex, texts: ReadonlyMap<string, string>, target: RenameTarget, newName: string): RenamePlan {
  const noun = NOUNS[target.kind];
  const name = newName.trim();

  // --- Step 1: The new name must be one this kind may have, and free ---
  if (name === target.name) return { ok: false, reason: `It is already called '${name}'.` };
  const problem = nameProblem(target, name);
  if (problem !== undefined) return { ok: false, reason: problem };
  if (refs.of(target.kind, name).declarations.length > 0) return { ok: false, reason: `A ${noun} called '${name}' already exists. Renaming to it would merge the two.` };
  if (target.kind === 'style') {
    const local = [...refs.localStyles].find(([, names]) => names.has(name))?.[0];
    if (local !== undefined) return { ok: false, reason: `${local} declares a style of its own called '${name}', which would shadow this one there.` };
  }

  // --- Step 2: Every file it would touch must be readable ---
  const found = refs.of(target.kind, target.name);
  const references = [...found.declarations, ...found.uses];
  const touched = new Set(references.map((reference) => reference.file));
  const unreadable = refs.unreadable.find((file) => touched.has(file) || (texts.get(file) ?? '').includes(target.name));
  if (unreadable !== undefined) return { ok: false, reason: `${unreadable} is not well-formed XML, so its references cannot be renamed safely. Fix it first.` };
  if (references.length === 0) return { ok: false, reason: `Nothing declares or uses ${noun} '${target.name}'.` };

  // --- Step 3: One edit per reference, grouped by file ---
  const byFile = new Map<string, TextEdit[]>();
  for (const reference of references) {
    const edits = byFile.get(reference.file) ?? [];
    if (!edits.some((edit) => edit.start === reference.range.start)) edits.push({ start: reference.range.start, end: reference.range.end, text: name });
    byFile.set(reference.file, edits);
  }
  const files = [...byFile.keys()].sort().map((file) => ({ file, edits: (byFile.get(file) ?? []).sort((a, b) => a.start - b.start) }));

  // --- Step 4: The symbols that change, old to new ---
  const before = generatedSymbols(target);
  const after = generatedSymbols({ ...target, name });
  const symbols = before.map((from, i) => ({ from, to: after[i] ?? '' }));
  return { ok: true, files, symbols, skipped: found.shadowingFiles };
}
