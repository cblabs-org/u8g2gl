/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/value.ts
 * Purpose: §13.2's type mapping, in one function. Every value that reaches
 *          generated C++ — a setter argument, a draw-call argument, a subject's
 *          initial value — is spelled here and nowhere else. That is the whole
 *          point: a setter call spelled in two places is two places for the
 *          escaping of a quote, the case of an enumerator, or the `&` on a
 *          subject to drift, and PR-3R found three of its four real defects by
 *          unifying exactly this kind of duplication (PROJECT.md, "Firmware /
 *          editor sharing"). The firmware emitter, WO11's editor target and
 *          every later work order share this spelling, and WO11's parity test is
 *          what enforces the sharing.
 * Description: One function per §13.2 row, behind {@link cppValue}, which is
 *              driven entirely by the prop's own `PropDef` — its `type`, its
 *              `emit` pattern, its declared `values` — so element knowledge
 *              stays data ([D-17]) and adding a widget needs no change here.
 *
 *              **It never guesses.** By the time emission runs the build has
 *              been validated: every value is a literal of the declared type
 *              (PR-04 WO9 closed the last four ways one could arrive
 *              unresolved). So a value this function cannot spell is a gap in
 *              validation — a programmer error — and it throws rather than
 *              emitting something plausible. Throwing is correct per
 *              typescript.md §4: a user error is a diagnostic, and this cannot
 *              be one, because the document that produced it was already
 *              accepted.
 *
 *              Deterministic: no locale, no floating point, and a fixed escape
 *              spelling, so an unchanged project regenerates byte-identically
 *              (§13.9).
 *
 * Exports:
 * - cppStringLiteral():  A C++ string literal, escaped (§13.2)
 * - cppEnumerator():     An enumerator from a manifest's `emit` pattern
 * - cppValue():          Spell one prop's resolved value as C++ (§13.2)
 * - COLOR_VALUES:        The values a `color` prop accepts
 */

import type { PropDef } from '../../schema/widget-manifest.js';
import {
  fontIdentifier,
  imageIdentifier,
  styleIdentifier,
  subjectIdentifier,
} from '../../resolver/index.js';

/**
 * The monochrome draw colours (§10) and their enumerators (`u8g2gl_types.h`).
 *
 * A `type="color"` prop takes one of three values, so §13.2 maps it directly
 * rather than through an `emit` pattern. `xor` uppercases to `XOR`, which is why
 * this is a table and not a string concatenation.
 */
const COLOR_ENUMERATORS: Readonly<Record<string, string>> = {
  '0': 'U8G2GL_COLOR_0',
  '1': 'U8G2GL_COLOR_1',
  xor: 'U8G2GL_COLOR_XOR',
};

/**
 * The values a `type="color"` prop accepts, in {@link COLOR_ENUMERATORS} order.
 *
 * Exported (PR-04 WO11) so the editor registry can generate one branch per
 * colour, each spelled by {@link cppValue}, without a second list of colours.
 */
export const COLOR_VALUES: readonly string[] = Object.keys(COLOR_ENUMERATORS);

/** Characters with a short C++ escape, rather than a numeric one. */
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

// octalEscape
// One byte as a three-digit octal escape.
//
// Three digits always, never fewer: a C++ octal escape consumes *at most* three
// digits, so a padded escape can never run on into a following digit —
// `"\0601"` is the byte 060 then the character `1`, while `"\601"` would be a
// different, and wrong, single escape. Hex escapes have no such bound (`\x` eats
// every hex digit that follows), which is why octal is used here.
function octalEscape(byte: number): string {
  return `\\${byte.toString(8).padStart(3, '0')}`;
}

/**
 * @brief Spells a string as a C++ string literal, escaped (§13.2).
 *
 * Printable ASCII passes through; the five characters in {@link SHORT_ESCAPES}
 * take their short escape; every other byte — a control character, or any
 * non-ASCII codepoint — is emitted as three-digit octal escapes of its **UTF-8
 * bytes**, so the literal is pure ASCII and cannot depend on the compiler's
 * source encoding.
 *
 * `?` is deliberately left alone: C++17 removed trigraphs, so `??=` needs no
 * escaping, and escaping it would make ordinary prose unreadable in review.
 *
 * @param text The resolved string value.
 * @return The literal, quotes included.
 */
export function cppStringLiteral(text: string): string {
  let out = '';
  for (const character of text) {
    const short = SHORT_ESCAPES[character];
    if (short !== undefined) {
      out += short;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20 && code < 0x7f) {
      out += character;
      continue;
    }
    // A control character, or anything outside ASCII: emit its UTF-8 bytes.
    for (const byte of new TextEncoder().encode(character)) {
      out += octalEscape(byte);
    }
  }
  return `"${out}"`;
}

/**
 * @brief Expands a manifest's `emit` pattern into an enumerator (§13.1, §13.2).
 *
 * The pattern is the manifest's, so the enumerator spelling is data rather than
 * a rule in the generator ([D-17]): `u8g2gl_label.xml` declares
 * `emit="U8G2GL_LONG_{VALUE^^}"`, and `long_mode="scroll"` becomes
 * `U8G2GL_LONG_SCROLL`.
 *
 * Two placeholders are understood — `{VALUE^^}` (uppercased, the only form the
 * shipped manifests use) and `{VALUE}` (verbatim). Anything else throws rather
 * than being left in the output, where it would reach committed C++ as literal
 * braces.
 *
 * @param pattern The prop's `emit` attribute.
 * @param value   The resolved enum value, already checked against `values` by
 *                Pass 4.
 * @return The enumerator.
 * @throws Error if the pattern holds an unrecognised placeholder.
 */
export function cppEnumerator(pattern: string, value: string): string {
  const expanded = pattern.replaceAll('{VALUE^^}', value.toUpperCase()).replaceAll('{VALUE}', value);
  if (expanded.includes('{') || expanded.includes('}')) {
    throw new Error(
      `Manifest emit pattern '${pattern}' holds a placeholder this generator does not understand; ` +
        `only '{VALUE^^}' and '{VALUE}' are supported (§13.1).`,
    );
  }
  return expanded;
}

// unspellable
// The programmer error for a value emission cannot spell. It names the prop, its
// declared type and the value, because whoever reads it is looking for the
// validation gap that let the value through — not for a mistake in the document.
function unspellable(prop: PropDef, value: string, why: string): Error {
  return new Error(
    `Cannot spell '${value}' as C++ for prop '${prop.name}' (type="${prop.type}"): ${why}. ` +
      `Emission runs only on a validated document, so this is a gap in validation rather than a ` +
      `defect in the project (§13.2).`,
  );
}

/**
 * @brief Spells one prop's resolved value as C++ (§13.2's type mapping).
 *
 * | `type`    | Emitted                                    |
 * |-----------|--------------------------------------------|
 * | `int`     | the literal integer                        |
 * | `bool`    | `true` / `false`                           |
 * | `string`  | an escaped string literal                  |
 * | `enum`    | an enumerator via the `emit` pattern       |
 * | `font`    | `ui_font_<name>`                           |
 * | `image`   | `ui_image_<name>`                          |
 * | `subject` | `&ui_subject_<name>`                       |
 * | `style`   | `ui_style_<name>`                          |
 * | `color`   | `U8G2GL_COLOR_*`                           |
 *
 * The identifier rows go through `mangle.ts`'s own spelling helpers, so a
 * generated symbol is spelled by the module that owns §13.4 rather than by a
 * second `ui_` string here.
 *
 * `int` is emitted as the integer it resolved to and is **not** range-checked
 * here: §13.2 gives coordinates `int16_t` and other `int` properties `int32_t`,
 * and those are two different checks the validator has already made
 * (validate-geometry.ts for a coordinate, the evaluator for anything else).
 *
 * @param prop  The prop's declaration, from the effective manifest.
 * @param value The resolved value, as the document holds it after resolution
 *              and substitution — never an expression.
 * @return The C++ spelling.
 * @throws Error if the value is not a literal of the declared type, or an enum
 *         prop declares no `emit` pattern. Both are programmer errors: see the
 *         file header.
 */
export function cppValue(prop: PropDef, value: string): string {
  switch (prop.type) {
    case 'int': {
      // Already a literal: §7.2's evaluator resolved every expression, and
      // WO9 extended that to non-coordinate `int` props. Anything else here
      // means one slipped through unresolved.
      if (!/^-?\d+$/.test(value.trim())) {
        throw unspellable(prop, value, 'it is not a literal integer, so an expression reached emission unresolved');
      }
      return String(Number(value.trim()));
    }
    case 'bool': {
      if (value !== 'true' && value !== 'false') {
        throw unspellable(prop, value, "a bool is 'true' or 'false'");
      }
      return value;
    }
    case 'string':
      return cppStringLiteral(value);
    case 'enum': {
      if (prop.emit === undefined || prop.emit === '') {
        throw unspellable(
          prop,
          value,
          `its manifest declares no 'emit' pattern, so there is no enumerator spelling to emit ` +
            `(§13.1). Add emit="..." to the <prop>`,
        );
      }
      return cppEnumerator(prop.emit, value);
    }
    case 'font':
      return fontIdentifier(value);
    case 'image':
      return imageIdentifier(value);
    case 'subject':
      // The address: every runtime binding method takes a subject pointer
      // (`bind_text(u8g2gl_subject_string_base*)`), and §13.2 spells this row
      // `&ui_subject_<name>` for that reason.
      return `&${subjectIdentifier(value)}`;
    case 'style':
      return styleIdentifier(value);
    case 'color': {
      const enumerator = COLOR_ENUMERATORS[value];
      if (enumerator === undefined) {
        throw unspellable(prop, value, `a colour is one of ${Object.keys(COLOR_ENUMERATORS).join(', ')} (§10)`);
      }
      return enumerator;
    }
  }
}
