/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/styles.ts
 * Purpose: The styles unit — one `u8g2gl_style` per declared style (§10, §13.4).
 *          Monochrome collapses styling to nine properties, so a style is a flat
 *          struct rather than a cascade; what it still needs is a record of
 *          *which* properties were set, because that is what lets a style
 *          selectively override an element's own values.
 * Description: Each style is emitted as a definition plus a line in
 *              `ui_styles_init()` per property the author declared. It has to be
 *              a run of setter calls rather than an aggregate initialiser: the
 *              setters are what maintain `set_mask`, and a brace initialiser
 *              would leave every property looking unset, so merging a style over
 *              an element would apply nothing at all.
 *
 *              A screen-local style of the same name as a global one is the
 *              override `screen.ts` describes — one `ui_style_<name>`, one pool
 *              slot — which is how `mangle.ts` keys it and how WO8b counted it.
 *              This module emits the same list `Capacities.styleNames` holds, in
 *              the same order, so the emitted styles and the counted capacity
 *              cannot disagree.
 *
 * Exports:
 * - STYLES_UNIT:          The unit's file name
 * - STYLES_INIT_FUNCTION: The function that applies each style's properties
 * - styleIdentifiers():   The distinct styles emitted, in order
 * - styleProperties():    A style's declared properties by attribute, in applied order
 * - emitStylesUnit():     Emit `ui_styles.cpp`
 */

import type { StyleDecl } from '../../schema/globals.js';
import { fontIdentifier, styleIdentifier } from '../../resolver/index.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';

/**
 * The styles unit.
 *
 * §13.7 lists one unit each for subjects, fonts and images and does not mention
 * styles; this work order requires a styles unit. The disagreement is recorded
 * rather than resolved here — a style needs a translation unit to live in
 * exactly as a subject does, and folding it into the subjects unit would put two
 * unrelated concerns in one file.
 */
export const STYLES_UNIT = 'ui_styles.cpp';

/** The function that applies every style's declared properties. */
export const STYLES_INIT_FUNCTION = 'ui_styles_init';

/**
 * Each `<style>` attribute, the `u8g2gl_style` setter that applies it, and how
 * its value is spelled.
 *
 * A table rather than a chain of `if`s because the mapping is the whole content
 * of this module, and because `truncate` — which `StyleDecl` still carries — is
 * deliberately **absent**: [D-19] deleted it from `u8g2gl_style`, so there is no
 * setter to call. A style declaring it is emitted without it, and that gap is
 * reported as a finding rather than silently tolerated here.
 */
interface StyleProperty {
  /** The `StyleDecl` member. */
  readonly key: keyof StyleDecl;
  /**
   * The attribute as `<style>` spells it, which is also the element `<prop>` of
   * the same name (§10). The editor applies a style through those props.
   */
  readonly attribute: string;
  /** The `u8g2gl_style` setter. */
  readonly setter: string;
  /** How the declared value becomes a C++ argument. */
  readonly argument: (value: string | number | boolean) => string;
}

/** `xor` uppercases to `XOR`, so the colour row is a table lookup (§10). */
const DRAW_COLORS: Readonly<Record<string, string>> = {
  '0': 'U8G2GL_COLOR_0',
  '1': 'U8G2GL_COLOR_1',
  xor: 'U8G2GL_COLOR_XOR',
};

const STYLE_PROPERTIES: readonly StyleProperty[] = [
  { key: 'font', attribute: 'font', setter: 'set_font', argument: (value) => fontIdentifier(String(value)) },
  { key: 'drawColor', attribute: 'draw_color', setter: 'set_draw_color', argument: (value) => DRAW_COLORS[String(value)] ?? 'U8G2GL_COLOR_1' },
  { key: 'invert', attribute: 'invert', setter: 'set_invert', argument: (value) => (value ? 'true' : 'false') },
  { key: 'padding', attribute: 'padding', setter: 'set_padding', argument: (value) => String(value) },
  { key: 'border', attribute: 'border', setter: 'set_border', argument: (value) => (value ? 'true' : 'false') },
  { key: 'radius', attribute: 'radius', setter: 'set_radius', argument: (value) => String(value) },
  {
    key: 'align',
    attribute: 'align',
    setter: 'set_align',
    argument: (value) => `U8G2GL_ALIGN_${String(value).toUpperCase()}`,
  },
  {
    key: 'fontMode',
    attribute: 'font_mode',
    setter: 'set_font_mode',
    argument: (value) => `U8G2GL_FONT_MODE_${String(value).toUpperCase()}`,
  },
  {
    key: 'bitmapMode',
    attribute: 'bitmap_mode',
    setter: 'set_bitmap_mode',
    argument: (value) => `U8G2GL_BITMAP_MODE_${String(value).toUpperCase()}`,
  },
];

/**
 * @brief A style's declared properties, by attribute, in the order
 *        {@link emitStylesUnit} applies them.
 *
 * The editor's scene description lists a style this way (PR-04 WO11), from the
 * same table the firmware unit is written from, so the two cannot apply a
 * different set or a different order.
 *
 * @param declaration The style as declared.
 * @return Each declared property's attribute and value.
 */
export function styleProperties(
  declaration: StyleDecl,
): readonly { readonly attribute: string; readonly value: string | number | boolean }[] {
  const properties: { attribute: string; value: string | number | boolean }[] = [];
  for (const property of STYLE_PROPERTIES) {
    const value = declaration[property.key];
    if (value === undefined || typeof value === 'object') {
      continue;
    }
    properties.push({ attribute: property.attribute, value });
  }
  return properties;
}

/**
 * @brief The distinct styles the project emits, in the order
 *        {@link ProjectEmitInput.capacities} counted them.
 *
 * Driven by `capacities.styleNames` rather than by a fresh walk of globals and
 * screens, so the emitted set is by construction the set that was counted
 * ([D-21]) — there is no second list to drift.
 *
 * @param input Globals, screens and the counted capacities.
 * @return Each style's declaration (the last one to declare that name wins, as
 *         an override does) and its `ui_style_<name>` identifier.
 */
export function styleIdentifiers(
  input: ProjectEmitInput,
): readonly { readonly name: string; readonly identifier: string; readonly declaration: StyleDecl | undefined }[] {
  // A screen style overriding a global one is the same identifier, so the
  // effective declaration is the last seen under that name — globals first,
  // then each screen in load order.
  const byName = new Map<string, StyleDecl>();
  for (const style of input.globals.styles ?? []) {
    byName.set(style.name, style);
  }
  for (const screen of input.screens) {
    for (const style of screen.styles ?? []) {
      byName.set(style.name, style);
    }
  }
  return input.capacities.styleNames.map((name) => ({
    name,
    identifier: styleIdentifier(name),
    declaration: byName.get(name),
  }));
}

/**
 * @brief Emits the styles unit (§10).
 *
 * @param input Globals, screens, capacities and this file's stamp.
 * @return The unit. Never raises: every style name was checked by Pass 2 and
 *         every value by Pass 1.
 */
export function emitStylesUnit(input: ProjectEmitInput): EmittedUnit {
  const styles = styleIdentifiers(input);
  const lines: string[] = [input.stamp.trimEnd(), '', '#include "ui.hpp"', ''];

  if (styles.length === 0) {
    lines.push(section('Styles (§10)'), '// The project declares no styles.', '');
    lines.push(`void ${STYLES_INIT_FUNCTION}() {}`, '');
    return { content: lines.join('\n'), diagnostics: [] };
  }

  // --- Step 1: One struct per distinct style identifier ---
  lines.push(section('Styles (§10)'));
  for (const { name, identifier } of styles) {
    lines.push('', `// ${name}`, `u8g2gl_style ${identifier};`);
  }

  // --- Step 2: Properties applied through the setters, which maintain set_mask ---
  lines.push(
    '',
    section('Style properties (§10)'),
    '// Set through the setters, never a brace initialiser: the setters are what',
    '// record the property in set_mask, and without that a style merged over an',
    '// element would apply nothing (u8g2gl_style.h).',
    '',
    `void ${STYLES_INIT_FUNCTION}() {`,
  );
  for (const { name, identifier, declaration } of styles) {
    lines.push(`    // ${name}`);
    if (declaration === undefined) {
      lines.push('    // Counted but not declared; nothing to apply.');
      continue;
    }
    for (const property of STYLE_PROPERTIES) {
      const value = declaration[property.key];
      if (value === undefined || typeof value === 'object') {
        continue;
      }
      lines.push(`    ${identifier}.${property.setter}(${property.argument(value)});`);
    }
  }
  lines.push('}', '');

  return { content: lines.join('\n'), diagnostics: [] };
}
