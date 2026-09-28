/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/fonts.ts
 * Purpose: The fonts unit (§14.1). A `<builtin>` font needs no compilation step
 *          at all — it names a font array U8G2 already ships, so the generated
 *          code is one alias per declaration. That is why §14.1 calls it the
 *          default path: it needs no `bdfconv`, no packaging, and no licensing
 *          consideration beyond linking U8G2.
 * Description: Emits `ui_font_<name>` as a pointer to the U8G2 array a
 *              `<builtin>` declaration names, and as a
 *              pointer to a compiled array this unit writes itself for a
 *              `<bdf>` declaration — every other unit refers to a font through
 *              §13.4's identifier rather than through a U8G2 symbol or a
 *              `bdfconv` array name in either case.
 *
 *              **`<bdf>` is compiled, never here.** `compileProjectAssets()`
 *              runs before `generate()` (it is asynchronous; this emitter is
 *              not) and hands its result in as `ProjectEmitInput.compiledFonts`.
 *              A `<bdf>` with no entry there is a defect `generate()` itself
 *              must already have refused (`U8G2GL_MISSING_COMPILED_FONT`) — see
 *              `generate.ts` — so finding one here is a programmer error, not
 *              an author's, and this module throws rather than guess at bytes.
 *
 * Exports:
 * - FONTS_UNIT:       The unit's file name
 * - fontDeclarations(): The `ui_font_*` pointers, for `ui.hpp`
 * - emitFontsUnit():  Emit `ui_fonts.cpp`
 */

import bdfconvSource from '../../../data/bdfconv/bdfconv-source.json' with { type: 'json' };
import type { BdfFontDecl, FontDecl } from '../../schema/globals.js';
import type { CompiledFont } from '../../fonts/index.js';
import { fontDataIdentifier, fontIdentifier } from '../../resolver/index.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/** §13.7's fonts unit. */
export const FONTS_UNIT = 'ui_fonts.cpp';

/**
 * The header declaring U8G2's own font arrays.
 *
 * Generated code must include it to refer to `u8g2_font_6x10_mr` and friends.
 * This is not §13.10's "display construction", which stays the application's:
 * the font arrays are data the generated units name, and nothing here
 * constructs a `U8G2`.
 */
const U8G2_HEADER = '#include <U8g2lib.h>';

/** How many bytes go on one line of a compiled font's emitted array. */
const BYTES_PER_LINE = 16;

/**
 * The longest a BDF-derived field (`FONT`, `COPYRIGHT`) may print in a
 * comment. A BDF is author input reaching generated C++ through nothing more
 * than string formatting, so it is capped rather than trusted (§13.9) — an
 * enormous `COPYRIGHT` would otherwise bloat every regeneration for no
 * reason a reader could see.
 */
const MAX_COMMENT_FIELD_LENGTH = 200;

/** One emitted font alias. */
export interface FontDeclaration {
  /** The `<builtin>` or `<bdf>` declaration this alias is emitted for. */
  readonly font: FontDecl;
  /** `ui_font_<name>` (§13.4). */
  readonly identifier: string;
  /**
   * The symbol it points at: the U8G2 array itself for a `<builtin>`, or this
   * unit's own `ui_fontdata_<name>` for a compiled `<bdf>`.
   */
  readonly array: string;
}

// sanitiseCommentField
// Makes BDF-derived text safe inside a generated `//` comment: a
// BDF is author input reaching generated C++ through nothing but string
// formatting, so it must not be able to inject a newline (which would end the
// comment early and let the next line become code), a raw control character,
// or a literal `*/` (harmless in a `//` comment today, but sanitised anyway
// as a precaution, since nothing here should depend on which comment style
// a future refactor chooses). Capped at MAX_COMMENT_FIELD_LENGTH so an
// oversized field cannot bloat every regeneration.
//   text — raw text from the BDF (a FONT or COPYRIGHT property)
function sanitiseCommentField(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // Control characters, including \n, \r and \t: replaced with a space
    // rather than dropped, so words do not run together.
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  out = out.replace(/\*\//g, '*\\/').replace(/\s+/g, ' ').trim();
  return out.length > MAX_COMMENT_FIELD_LENGTH ? `${out.slice(0, MAX_COMMENT_FIELD_LENGTH)}...` : out;
}

// rangeDescription
// The provenance comment's `range: ...` clause.
//   font     — the <bdf> declaration; only `range` is read
//   compiled — its compiled result, for the glyph counts
function rangeDescription(font: BdfFontDecl, compiled: CompiledFont): string {
  const range = font.range ?? 'none — every glyph';
  return `range: ${range} — ${compiled.selectedGlyphs} of ${compiled.totalGlyphs} glyphs, ${compiled.declaredLength} bytes`;
}

// compiledFontComment
// The provenance comment above a compiled <bdf>'s array (§14.1).
//   font          — the declaration
//   compiled      — its compiled result
//   licenceFiles  — sorted, project-relative licence-like files beside the BDF
function compiledFontComment(
  font: BdfFontDecl,
  compiled: CompiledFont,
  licenceFiles: readonly string[],
): string[] {
  const u8g2Version = bdfconvSource.u8g2.tag ?? '(unknown)';
  const lines: string[] = [
    `// ${font.name}: compiled from ${font.src} by bdfconv (U8G2 ${u8g2Version}) (§14.1).`,
  ];
  if (compiled.fontName !== undefined) {
    lines.push(`//   BDF font: ${sanitiseCommentField(compiled.fontName)}`);
  }
  if (compiled.copyright !== undefined) {
    lines.push(`//   BDF copyright: ${sanitiseCommentField(compiled.copyright)}`);
  }
  if (licenceFiles.length > 0) {
    const label = licenceFiles.length === 1 ? 'licence file' : 'licence files';
    lines.push(`//   ${label}: ${licenceFiles.join(', ')}`);
  }
  lines.push(`//   ${rangeDescription(font, compiled)}`);
  return lines;
}

// byteLines
// The compiled array's body: BYTES_PER_LINE bytes to a line, lower-case hex,
// two digits — a fixed layout, so a font whose bytes change produces a diff
// only where the bytes changed (§13.9), the same rule images.ts's byteLines()
// follows for `<xbm>`.
//   bytes — the compiled font's exact bytes
function byteLines(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  for (let index = 0; index < bytes.length; index += BYTES_PER_LINE) {
    const row = Array.from(bytes.slice(index, index + BYTES_PER_LINE))
      .map((byte) => `0x${byte.toString(16).padStart(2, '0')}`)
      .join(', ');
    lines.push(`    ${row},`);
  }
  return lines;
}

/**
 * @brief The `ui_font_*` aliases this project emits, in declaration order.
 *
 * Both font kinds: a `<builtin>`'s `name` **is** the U8G2 font array
 * identifier (`globals.ts`), so its alias is `ui_font_<name> = <name>`; a
 * `<bdf>`'s alias points at this unit's own `ui_fontdata_<name>` array
 * (§13.4).
 *
 * @param input Globals.
 * @return One entry per declared font, in declaration order (§13.9).
 */
export function fontDeclarations(input: ProjectEmitInput): readonly FontDeclaration[] {
  const declarations: FontDeclaration[] = [];
  for (const font of input.globals.fonts ?? []) {
    const identifier = fontIdentifier(font.name);
    const array = font.kind === 'builtin' ? font.name : fontDataIdentifier(font.name);
    declarations.push({ font, identifier, array });
  }
  return declarations;
}

/**
 * @brief Emits the fonts unit (§14.1).
 *
 * @param input Globals, every `<bdf>` already compiled (`compiledFonts`), the
 *              licence files found beside each one (`bdfLicenceFiles`) and
 *              this file's stamp.
 * @return The unit. Never raises a diagnostic: Pass 2 checked every font
 *         reference, and `generate()` already refused a `<bdf>` with no
 *         compiled entry before emission could reach this point — finding one
 *         here throws, because it means that guarantee was not honoured.
 * @throws Error if a `<bdf>` declaration has no entry in `compiledFonts` — a
 *         programmer error (`generate()` should have refused first), never an
 *         author's.
 */
export function emitFontsUnit(input: ProjectEmitInput): EmittedUnit {
  const declarations = fontDeclarations(input);
  const compiledFonts = input.compiledFonts ?? new Map<string, CompiledFont>();
  const bdfLicenceFiles = input.bdfLicenceFiles ?? new Map<string, readonly string[]>();

  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', '', U8G2_HEADER, ''];

  lines.push(section('Fonts (§14.1)'));
  if (declarations.length === 0) {
    lines.push('// globals.xml declares no fonts.');
  }
  for (const { font, identifier, array } of declarations) {
    // --- Step 1: Alias each <builtin> ---
    if (font.kind === 'builtin') {
      lines.push(
        '',
        `// ${font.name}: a U8G2 built-in, referenced rather than compiled (§14.1).`,
        `const uint8_t* const ${identifier} = ${array};`,
      );
      continue;
    }

    // --- Step 2: Compile-guard then emit each <bdf> ---
    const compiled = compiledFonts.get(font.name);
    if (compiled === undefined) {
      throw new Error(
        `<bdf> font '${font.name}' has no compiled entry in ProjectEmitInput.compiledFonts. ` +
          `generate() must refuse a build in this state (U8G2GL_MISSING_COMPILED_FONT) before emission ` +
          `runs, so reaching this line means that guarantee was not honoured — call compileProjectAssets() ` +
          `and pass its result to generate() as compiledAssets.`,
      );
    }
    const licenceFiles = bdfLicenceFiles.get(font.name) ?? [];
    lines.push(
      '',
      ...compiledFontComment(font, compiled, licenceFiles),
      // ui_fontdata_<name> holds the array; ui_font_<name> is a pointer to it
      // (mangle.ts's fontDataIdentifier() doc comment explains why two symbols).
      `static const uint8_t ${array}[${compiled.declaredLength}] U8G2_FONT_SECTION("${array}") = {`,
      ...byteLines(compiled.bytes),
      '};',
      `const uint8_t* const ${identifier} = ${array};`,
    );
  }

  lines.push('');
  return { content: lines.join('\n'), diagnostics: [] };
}
