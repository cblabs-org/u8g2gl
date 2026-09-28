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
 * Description: Emits `ui_font_<name>` as a pointer to the U8G2 array the
 *              declaration names, so every other unit refers to a font through
 *              §13.4's identifier rather than through a U8G2 symbol.
 *
 *              `<bdf>` is **refused, not handled here** — Pass 8 reports
 *              `U8G2GL_NOT_YET_SUPPORTED` as an error under `generate` (PR-04
 *              decision 3), naming PR-04b, so a BDF declaration never reaches
 *              emission. It is still skipped defensively rather than assumed
 *              away, and a comment records the refusal in the emitted file, so
 *              nothing silently vanishes if that policy is ever relaxed.
 *
 * Exports:
 * - FONTS_UNIT:       The unit's file name
 * - fontDeclarations(): The `ui_font_*` pointers, for `ui.hpp`
 * - emitFontsUnit():  Emit `ui_fonts.cpp`
 */

import type { FontDecl } from '../../schema/globals.js';
import { fontIdentifier } from '../../resolver/index.js';
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

/** One emitted font alias. */
export interface FontDeclaration {
  readonly font: FontDecl;
  /** `ui_font_<name>` (§13.4). */
  readonly identifier: string;
  /** The U8G2 array it aliases. */
  readonly array: string;
}

/**
 * @brief The `ui_font_*` aliases this project emits, in declaration order.
 *
 * Only `<builtin>` fonts: a `<builtin>`'s `name` **is** the U8G2 font array
 * identifier (`globals.ts`), so the alias is `ui_font_<name> = <name>`.
 *
 * @param input Globals.
 * @return One entry per builtin font, in declaration order (§13.9).
 */
export function fontDeclarations(input: ProjectEmitInput): readonly FontDeclaration[] {
  const declarations: FontDeclaration[] = [];
  for (const font of input.globals.fonts ?? []) {
    if (font.kind !== 'builtin') {
      continue; // <bdf>: refused by Pass 8 before emission (§14.1, PR-04b).
    }
    declarations.push({ font, identifier: fontIdentifier(font.name), array: font.name });
  }
  return declarations;
}

/**
 * @brief Emits the fonts unit (§14.1).
 *
 * @param input Globals and this file's stamp.
 * @return The unit. Never raises: Pass 2 checked every font reference and Pass 8
 *         refused every `<bdf>`.
 */
export function emitFontsUnit(input: ProjectEmitInput): EmittedUnit {
  const declarations = fontDeclarations(input);
  const deferred = (input.globals.fonts ?? []).filter((font) => font.kind === 'bdf');

  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', '', U8G2_HEADER, ''];

  lines.push(section('Fonts (§14.1)'));
  if (declarations.length === 0) {
    lines.push('// globals.xml declares no <builtin> fonts.');
  }
  for (const { font, identifier, array } of declarations) {
    lines.push(
      '',
      `// ${font.name}: a U8G2 built-in, referenced rather than compiled (§14.1).`,
      `const uint8_t* const ${identifier} = ${array};`,
    );
  }

  // Recorded in the output, not merely skipped: a reader comparing globals.xml
  // against this file would otherwise find a declaration with no counterpart.
  for (const font of deferred) {
    lines.push(
      '',
      `// ${font.name}: a <bdf> font. Compiling BDF with bdfconv is delivered in`,
      "// PR-04b, and 'u8g2gl generate' refuses it until then (§14.1), so this",
      '// declaration emits nothing.',
    );
  }

  lines.push('');
  return { content: lines.join('\n'), diagnostics: [] };
}
