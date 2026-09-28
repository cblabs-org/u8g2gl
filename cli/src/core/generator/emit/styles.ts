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
 *              Every value is spelled by `cppValue()` against the `u8g2gl_obj`
 *              prop of the same name — the prop an element's own attribute and
 *              its `style_*` override are spelled through (§10) — so a style's
 *              `align="right"` and an element's cannot become two enumerators.
 *              Until PR-04 WO10b this module carried its own enumerator table,
 *              a second spelling (WO11 finding 4).
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
 * - emitStylesUnit():     Emit `ui_styles.cpp`
 */

import { STYLE_PROPERTIES, type StyleDecl } from '../../schema/globals.js';
import type { PropDef } from '../../schema/widget-manifest.js';
import { ROOT_CLASS_MANIFEST, type ManifestRegistry } from '../../manifest/index.js';
import { STYLES_INIT_FUNCTION, styleIdentifier } from '../../resolver/index.js';
import { section, type EmittedUnit, type ProjectEmitInput } from './unit.js';
import { cppValue } from './value.js';

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
export { STYLES_INIT_FUNCTION }; // Spelled once, in mangle.ts, which collision-checks it (PR-04 WO11b).

// The style properties and their setters are `STYLE_PROPERTIES`, the one list
// in the schema that the parser and Pass 1 read too (PR-04 WO11b). How a value
// is spelled is not there: it is the `u8g2gl_obj` prop named by `attribute`,
// through `cppValue()`.

// styleValueProp
// The `u8g2gl_obj` prop a style attribute's value is spelled through. Every
// object inherits it, so it is the declaration an element's own attribute of
// the same name uses; a style property with no such prop has no spelling that
// agrees with the element's, which is a framework defect, not an author's.
//   manifests — the effective manifests
//   attribute — the style attribute, e.g. `align`
function styleValueProp(manifests: ManifestRegistry, attribute: string): PropDef {
  const prop = manifests.get(ROOT_CLASS_MANIFEST)?.api.props.find((candidate) => candidate.name === attribute);
  if (prop === undefined) {
    throw new Error(
      `<${ROOT_CLASS_MANIFEST}> declares no '${attribute}' prop, so a style's '${attribute}' has no spelling ` +
        `shared with an element's own attribute (§10). Declare it in ${ROOT_CLASS_MANIFEST}.xml.`,
    );
  }
  return prop;
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
      const spelled = cppValue(styleValueProp(input.manifests, property.attribute), String(value));
      lines.push(`    ${identifier}.${property.setter}(${spelled});`);
    }
  }
  lines.push('}', '');

  return { content: lines.join('\n'), diagnostics: [] };
}
