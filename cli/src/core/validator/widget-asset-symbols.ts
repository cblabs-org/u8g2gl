/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/widget-asset-symbols.ts
 * Purpose: The rule for how a widget gets a font or an image, checked in one
 *          place so a widget cannot pass on the device and fail only in the
 *          designer. There are exactly two routes. A `type="font"` or
 *          `type="image"` prop: U8G2GL declares, generates and, in the
 *          designer, injects it end to end. Or the widget owns it: a U8G2 font
 *          or a bitmap of its own, named in its C++ and compiled with it in
 *          every build. A widget naming one of the project's **generated**
 *          symbols (`ui_font_…`, `ui_fontdata_…`, `ui_image_…`) is neither: the
 *          symbol exists only in that project's firmware build, and the editor
 *          Wasm compiles no project font or image (design_spec §9), so the
 *          widget would link on the board and fail in the designer.
 * Description: `checkWidgetAssetSymbols()` reads each widget source with its
 *              comments and string and character literals blanked (so a
 *              symbol named in a comment, a log message or an `#include` path
 *              is not a use), then reports every identifier in one of the
 *              three generated families as `U8G2GL_WIDGET_ASSET_SYMBOL`, at
 *              its line and column. The families are taken from the resolver's
 *              own identifier functions, the ones the fonts and images
 *              emitters name their symbols with, so the check cannot drift from
 *              what is generated. §13.4 reserves the `ui_` prefix for generated
 *              code, so any identifier in these families is a generated symbol,
 *              declared in this project or not.
 *
 *              It takes text, not files: the CLI's `validate` and `generate`
 *              and the design server's editor build read the widget
 *              directories and pass their sources in. Application code is
 *              never passed, so it is never scanned: an application may use
 *              the generated symbols freely.
 *
 * Exports:
 * - WIDGET_SOURCE_EXTENSIONS:  The files in a widget's directory that are scanned
 * - generatedAssetSymbolOf():  Whether an identifier is a generated font or image symbol
 * - checkWidgetAssetSymbols(): One diagnostic per generated symbol a widget names
 */

import { fontDataIdentifier, fontIdentifier, imageIdentifier } from '../resolver/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';

/** The widget source files scanned: compiled units and headers. */
export const WIDGET_SOURCE_EXTENSIONS: readonly string[] = ['.cpp', '.cc', '.h', '.hpp'];

/**
 * The generated families, each with the kind it holds. From the identifier
 * functions themselves, called with an empty name, so a change to how a
 * symbol is spelled changes what is matched. Longest first: `ui_fontdata_`
 * also begins with `ui_font`, but not with `ui_font_`, so the order only
 * matters for the reader.
 */
const FAMILIES: ReadonlyArray<{ readonly prefix: string; readonly kind: 'font' | 'image' }> = [
  { prefix: fontDataIdentifier(''), kind: 'font' },
  { prefix: fontIdentifier(''), kind: 'font' },
  { prefix: imageIdentifier(''), kind: 'image' },
];

/**
 * @brief Whether an identifier is a generated font or image symbol, and which kind.
 *
 * @param identifier A C++ identifier.
 * @return `'font'` or `'image'`, or undefined for any other identifier —
 *         including a bare prefix (`ui_font_` with no name after it).
 */
export function generatedAssetSymbolOf(identifier: string): 'font' | 'image' | undefined {
  return FAMILIES.find(({ prefix }) => identifier.startsWith(prefix) && identifier.length > prefix.length)?.kind;
}

/**
 * @brief One error per generated font or image symbol named in widget source.
 *
 * @param sources Project-relative path → text, for widget files only. Files
 *                whose extension is not a widget source's are ignored.
 * @return Errors in path, then line, then column order (§13.9), each located
 *         at the symbol.
 */
export function checkWidgetAssetSymbols(sources: ReadonlyMap<string, string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const files = [...sources]
    .filter(([file]) => WIDGET_SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [file, text] of files) {
    const lines = codeOnly(text).split('\n');
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(/[A-Za-z_]\w*/g)) {
        const symbol = match[0];
        const kind = generatedAssetSymbolOf(symbol);
        if (kind === undefined) continue;
        diagnostics.push({
          code: DIAGNOSTIC_CODES.WIDGET_ASSET_SYMBOL,
          severity: 'error',
          file,
          line: index + 1,
          column: (match.index ?? 0) + 1,
          message:
            `'${symbol}' is a generated ${kind} symbol, which only one project's firmware build defines, ` +
            `so this widget would link on the device and fail in the designer, which compiles no project ${kind}. ` +
            `Take the ${kind} through a type="${kind}" prop, so U8G2GL supplies it in every build; or, for a ` +
            `${kind} the widget owns, name a U8G2 ${kind === 'font' ? 'font (u8g2_font_…)' : 'bitmap of its own'} in its C++.`,
          offendingText: symbol,
        });
      }
    }
  }
  return diagnostics;
}

/** The encoding prefixes a raw string literal may carry before its `R`. */
const RAW_PREFIXES: readonly string[] = ['', 'u8', 'u', 'U', 'L'];

// wordBefore
// The run of word characters (and digit separators) that ends just before
// `index`: the identifier or number a quote or an `R` is attached to.
//   text  — the source
//   index — the position after the run
function wordBefore(text: string, index: number): string {
  let start = index;
  while (start > 0 && /[\w']/.test(text[start - 1] ?? '')) start--;
  return text.slice(start, index);
}

// codeOnly
// The text with every comment, string literal and character literal blanked
// to spaces, newlines kept, so line and column numbers still point into the
// original. A raw string (R"delim( … )delim") is blanked to its closing
// delimiter, since its body may hold anything. An unterminated comment or
// literal blanks to the end of the file, as the compiler would refuse it.
//   text — one source file
function codeOnly(text: string): string {
  let out = '';
  let i = 0;
  const blank = (end: number): void => {
    out += text.slice(i, end).replace(/[^\n]/g, ' ');
    i = end;
  };
  while (i < text.length) {
    const char = text[i] ?? '';
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const end = text.indexOf('\n', i);
      blank(end < 0 ? text.length : end);
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      blank(end < 0 ? text.length : end + 2);
    } else if (char === 'R' && text[i + 1] === '"' && RAW_PREFIXES.includes(wordBefore(text, i))) {
      // A raw string: R"delim(body)delim", or u8R, uR, UR, LR. Its body may
      // hold unescaped quotes, so it ends only at its own delimiter. The
      // encoding prefix was copied as code already; it is no symbol.
      const open = text.indexOf('(', i + 2);
      const delimiter = open < 0 ? '' : text.slice(i + 2, open);
      const end = open < 0 ? -1 : text.indexOf(`)${delimiter}"`, open);
      blank(end < 0 ? text.length : end + delimiter.length + 2);
    } else if (char === '"' || char === "'") {
      // An ordinary literal runs to its unescaped closing quote, or the end of
      // the line. A quote inside a number is a digit separator (1'000,
      // 0xFF'FF), not a character literal: the word it follows starts with a
      // digit, where an identifier (case'a') cannot.
      if (char === "'" && /^[0-9]/.test(wordBefore(text, i))) {
        out += char;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < text.length && text[j] !== char && text[j] !== '\n') {
        j += text[j] === '\\' ? 2 : 1;
      }
      blank(Math.min(j + 1, text.length));
    } else {
      out += char;
      i++;
    }
  }
  return out;
}
