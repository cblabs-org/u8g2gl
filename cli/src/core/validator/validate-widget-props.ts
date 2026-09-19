/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-widget-props.ts
 * Purpose: Pass 4 — checks every element instance's attributes against the
 *          effective manifest of its tag (§13.1, §13.2). One body for plain
 *          widgets and composites alike, because [D-18] leaves one element
 *          vocabulary: two copies of this logic had already drifted apart
 *          twice (PR-3R WO5b, WO6), and unifying them is how those were found.
 * Description: For each instance with a known tag, reports attributes the
 *              effective manifest (inherited props and bindings included) does
 *              not declare, missing required props, and enum values outside the
 *              declared set, and `flag="disabled"` on a drawing element, which
 *              has no object to disable (§8.4). Layout and identity attributes in
 *              COMMON_ATTRIBUTES and `style_*` overrides are accepted, except that
 *              an anchor is inapplicable to an element that is not rectangular,
 *              and `hcenter` / `vcenter` must be `true` or `false` (§7.2, PR-04
 *              WO7b). **Every `type="bool"` prop takes that same strictness**
 *              (PR-04 WO9): only `hidden` was ever value-checked, so
 *              `filled="yes"` validated and reached emission, where §13.2's
 *              value helper has no `bool` spelling for it. Unknown tags are
 *              Pass 2's concern and are skipped here.
 *
 *              Once, never twice (PR-04 WO7b): every check runs on the elements
 *              as written — screens and each composite's `<view>` — so a template
 *              defect is reported once however often it is instantiated. The one
 *              exception is a value that was a `$prop` there: it is unknowable as
 *              written, so the enum and centring checks run again on the expanded
 *              tree for exactly the attributes expansion substituted, located at
 *              the element that uses the value with its instance named — unless
 *              the argument is fixed by the template (reported once, no chain) or
 *              this pass already reported the same code at the argument itself.
 *
 * Exports:
 * - validateWidgetProps(input): Runs Pass 4 element property validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import { isDrawingElement, OBJECT_ONLY_FLAGS, type EffectiveManifest } from '../manifest/manifest-registry.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { GEOMETRY_BINDINGS, isRectangular, walkExpanded } from '../resolver/index.js';
import { namedStyles } from '../generator/emit/screen-model.js';
import { styleProperties } from '../generator/emit/styles.js';
import type { Globals, StyleDecl } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { ValidateInput } from './validate.js';
import { pipelineOf } from './shared-model.js';
import { propReferenceIn, reportSubstituted, unsubstitutedPlaceholder } from './substituted-values.js';

/**
 * The anchor attributes (§7.2). They name the layout contract, not elements
 * ([D-17]); which elements may carry them is read from the manifest.
 */
const ANCHOR_ATTRIBUTES: readonly string[] = ['right', 'bottom', 'hcenter', 'vcenter'];

/** The centring switches, which are strict booleans (§7.2). */
const CENTRING_ATTRIBUTES: readonly string[] = ['hcenter', 'vcenter'];

/**
 * The attributes held to a strict boolean by the **layout and visibility
 * contract**, whatever element carries them. The centring switches are §7.2's;
 * `hidden` joins them in PR-04 WO8a, because `hidden="yes"` used to parse to
 * `false` and the element simply rendered, with nothing said (WO7b finding 3).
 * These are contract names, not element knowledge ([D-17]) — `hidden` is
 * accepted only where the manifest declares it.
 *
 * It is the floor, not the whole set: {@link booleanAttributesOf} adds every
 * `type="bool"` prop the element's own manifest declares.
 */
const BOOLEAN_ATTRIBUTES: readonly string[] = ['hcenter', 'vcenter', 'hidden'];

/** The only values a boolean attribute may take (§7.2). */
const BOOLEAN_VALUES: readonly string[] = ['true', 'false'];

// booleanAttributesOf
// Every attribute on one element that must be `true` or `false`: the contract
// names above, plus every `type="bool"` prop its manifest declares — read from
// the manifest, never a tag list ([D-17]), so a custom element's own bool prop
// is checked exactly as `filled` is.
//
// Before PR-04 WO9 only `hidden` was value-checked, so `filled="yes"` validated
// and reached emission (WO8a finding 2, confirmed end to end) — where §13.2's
// value helper has no `bool` spelling for `yes` and could only have guessed. A
// bool is a two-member set, so it gets the strictness §7.2 gives `hcenter`.
//
// `hidden` is declared `type="bool"` on `u8g2gl_obj`, so it arrives from both
// sources; the list is deduplicated, or every `hidden="yes"` would be reported
// twice for one mistake.
//   manifest — effective manifest for the element's tag
function booleanAttributesOf(manifest: EffectiveManifest): readonly string[] {
  const names = [...BOOLEAN_ATTRIBUTES];
  for (const prop of manifest.api.props) {
    if (prop.type === 'bool' && !names.includes(prop.name)) {
      names.push(prop.name);
    }
  }
  return names;
}

/**
 * Identity, anchor and style attributes valid on every element, which no
 * manifest declares because none reaches a setter or a draw call: `name` is
 * identity ([U-1]); the anchors are resolved to literal coordinates at build
 * time ([D-7]); styles are applied by the generator (§10, §12.2).
 *
 * Deliberately **not** here: `x`, `y`, `width`, `height` and `hidden`. Those
 * are real properties, accepted only where the effective manifest declares
 * them (PR-04 WO3) — so `x` on a `<u8g2gl_line>` or a literal `hidden` on a
 * drawing element is an unknown attribute, not silently ignored. A drawing
 * element is hidden through a `<bind_flag_if_*>` child (§6.2).
 *
 * `focusStyle` is not an authored attribute: the parser mirrors `focus_style`
 * into it (parse-widget-tree.ts) and validate-references.ts reads it, so it
 * must be admitted or every `focus_style` would report a phantom attribute.
 */
const COMMON_ATTRIBUTES: ReadonlySet<string> = new Set([
  'name',
  'right',
  'bottom',
  'hcenter',
  'vcenter',
  'style',
  'focus_style',
  'focusStyle',
]);

function createPropDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText?: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(offendingText ? { offendingText } : {}),
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}

function walkNodes(
  children: readonly WidgetNodeChild[],
  visitor: (node: WidgetNode) => void,
): void {
  for (const child of children) {
    if ('tag' in child && typeof child.tag === 'string') {
      visitor(child);
      if (child.children && child.children.length > 0) {
        walkNodes(child.children, visitor);
      }
    }
  }
}

// checkInstanceProps
// Checks one element instance against its tag's effective manifest: unknown
// attributes, missing required props, out-of-range enum values — in that order.
//   node     — the instance as parsed from a screen
//   manifest — effective manifest for node.tag, inheritance already merged
//   atScreenLevel — whether the element is written in a screen rather than in a
//                   composite's `<view>`, where a `$prop` has no meaning
//   styles   — the named styles in scope, for a style that supplies a required prop
function checkInstanceProps(
  node: WidgetNode,
  manifest: EffectiveManifest,
  atScreenLevel: boolean,
  styles: StyleScope,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { props, bindings } = manifest.api;

  // --- Step 1: Collect every attribute name the element accepts ---
  const declaredNames = new Set<string>();
  for (const prop of props) {
    declaredNames.add(prop.name);
  }
  for (const binding of bindings) {
    declaredNames.add(binding.name);
    // A binding's format companion (e.g. bind_text_fmt) is an attribute too.
    if (binding.fmt) {
      declaredNames.add(binding.fmt);
    }
  }
  const suggestionPool = [...COMMON_ATTRIBUTES, ...declaredNames];

  // --- Step 2: Reject attributes nothing declares ---
  for (const [attrName, attrVal] of Object.entries(node.attributes)) {
    if (attrVal === undefined) {
      continue;
    }
    if (COMMON_ATTRIBUTES.has(attrName) || attrName.startsWith('style_')) {
      continue;
    }
    if (declaredNames.has(attrName)) {
      continue;
    }
    diagnostics.push(
      createPropDiagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
        `Unknown attribute '${attrName}' on <${node.tag}>.`,
        node.attributeLocs?.[attrName] ?? node.loc,
        attrName,
        findClosest(attrName, suggestionPool),
      ),
    );
  }

  // --- Step 3: Require mandatory props ---
  // Written, bound or styled all count (PR-04 WO11b); see missingRequired. A
  // named style that is still a `$`-reference is unknowable here, so the check
  // waits for the expanded tree (checkSubstitutedValues) rather than guessing.
  if (!namedStyles(node).some((name) => name.startsWith('$'))) {
    diagnostics.push(...missingRequired(node, manifest, styles));
  }

  // --- Step 4: Check enum values against the declared set ---
  // A `$`-prefixed value is a composite template parameter, resolved at
  // expansion time; its value is not knowable here (see checkSubstitutedValues).
  for (const prop of props) {
    const diagnostic = checkEnumValue(node, prop.name, manifest);
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }

  // --- Step 4b: Anchors only on a rectangular element; centring switches are booleans (§7.2) ---
  if (!isRectangular(manifest)) {
    for (const anchor of ANCHOR_ATTRIBUTES) {
      const value = node.attributes[anchor];
      if (typeof value !== 'string' || (CENTRING_ATTRIBUTES.includes(anchor) && value === 'false')) {
        continue;
      }
      diagnostics.push(
        createPropDiagnostic(
          DIAGNOSTIC_CODES.INAPPLICABLE_ANCHOR,
          `Anchor '${anchor}' cannot apply to ${describeNode(node)}: anchors apply only to rectangular ` +
            `elements, whose manifest declares x, y, width and height, and <${node.tag}> does not (§7.2).`,
          node.attributeLocs?.[anchor] ?? node.loc,
          anchor,
        ),
      );
    }
  }
  for (const attribute of booleanAttributesOf(manifest)) {
    const diagnostic = checkBooleanValue(node, attribute);
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }

  // --- Step 4c: A `$prop` written outside any composite can never be substituted ---
  if (atScreenLevel) {
    diagnostics.push(...screenLevelPlaceholders(node, manifest));
  }

  // --- Step 5: Flag directives must name a flag the element can carry ---
  // §8.4 fixes the flag set, so it is not declared per element; the registry
  // spells both the set and the drawing-element test once (PR-04 WO8a).
  // `hidden` applies to every element — an object flag, or a draw-time guard on
  // a drawing element (§13.5). `disabled` is interaction state on an object,
  // and a drawing element has none (PR-04 WO5a).
  if (isDrawingElement(manifest.declared)) {
    for (const child of node.children) {
      if ('kind' in child && child.kind === 'binding' && child.flag !== undefined && OBJECT_ONLY_FLAGS.includes(child.flag)) {
        diagnostics.push(
          createPropDiagnostic(
            DIAGNOSTIC_CODES.INAPPLICABLE_FLAG,
            `Flag '${child.flag}' in <${child.type}> cannot apply to <${node.tag}>: it is a drawing ` +
              `element (draw= props only) with no object to disable. Only 'hidden' applies to a ` +
              `drawing element (§8.4).`,
            child.loc ?? node.loc,
            child.flag,
          ),
        );
      }
    }
  }

  return diagnostics;
}

/** The named styles in scope for an element, by name (§10). */
type StyleScope = ReadonlyMap<string, StyleDecl>;

// styleScope
// What a named style on an element can resolve to: the global styles, and on a
// screen that screen's own, which override a global style of the same name —
// the one `ui_style_<name>` mangle.ts keys them as. A composite's `<view>` sees
// only the globals: its template is shared by every screen.
//   globals — the project's globals
//   screen  — the screen the element is written in, if it is written in one
function styleScope(globals: Globals | undefined, screen: Screen | undefined): StyleScope {
  const scope = new Map<string, StyleDecl>();
  for (const style of [...(globals?.styles ?? []), ...(screen?.styles ?? [])]) {
    scope.set(style.name, style);
  }
  return scope;
}

// suppliedByStyle
// Whether a named style the element applies declares a property of this name.
// Which `<style>` attribute is which property is `styleProperties()`'s one
// table, the one the styles unit is emitted from, so a style counts here
// exactly when it would set the property at init (§10, §13.7).
//   node   — the element
//   name   — the property
//   styles — the named styles in scope
function suppliedByStyle(node: WidgetNode, name: string, styles: StyleScope): boolean {
  return namedStyles(node).some((style) => {
    const declaration = styles.get(style);
    return declaration !== undefined && styleProperties(declaration).some((property) => property.attribute === name);
  });
}

// missingRequired
// The MISSING_REQUIRED diagnostic for each required prop nothing supplies.
//
// A value can come from four places, and any one satisfies `required` (PR-04
// WO11b, WO10b finding 1): the attribute written; a geometry binding for it
// ([D-20] — `bind_x` supplies `x`, from the resolver's one table); a `style_*`
// override of it; or a named style the element applies that declares it (§10).
// Before, only the first counted, so a label had to write `font=` beside the
// style that already set it, and the fixture wrote `x="0"` beside `bind_x`.
//
// A prop declared `required` *and* defaulted is an invalid declaration, which
// Pass 1 reports once at the declaration (OVERCONSTRAINED, WO7b). Reporting a
// missing attribute here as well would make one mistake read as several
// defects — one per instance — so the declaration is reported and the instances
// are left alone (PR-04 WO7b finding 5).
//   node     — the element, as written or as expanded
//   manifest — its effective manifest
//   styles   — the named styles in scope
function missingRequired(node: WidgetNode, manifest: EffectiveManifest, styles: StyleScope): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const prop of manifest.api.props) {
    if (!prop.required || prop.default !== undefined) {
      continue;
    }
    const written = node.attributes[prop.name];
    const binding = GEOMETRY_BINDINGS.find((entry) => entry.attribute === prop.name);
    const supplied =
      (written !== undefined && written !== '') ||
      (binding !== undefined && node.attributes[binding.binding] !== undefined) ||
      node.styleOverrides[prop.name] !== undefined ||
      suppliedByStyle(node, prop.name, styles);
    if (!supplied) {
      diagnostics.push(
        createPropDiagnostic(
          DIAGNOSTIC_CODES.MISSING_REQUIRED,
          `Missing required attribute '${prop.name}' on <${node.tag}>.`,
          node.loc,
          prop.name,
        ),
      );
    }
  }
  return diagnostics;
}

// describeNode
// "<u8g2gl_circle> 'dot'", or "<u8g2gl_circle>" when unnamed.
function describeNode(node: WidgetNode): string {
  const name = node.attributes.name;
  return typeof name === 'string' && name !== '' ? `<${node.tag}> '${name}'` : `<${node.tag}>`;
}

// checkEnumValue
// The INVALID_ENUM_VALUE diagnostic for one attribute, if the manifest declares
// it as an enum and its value is known and outside the declared set.
//   node      — the element
//   attribute — the attribute to check
//   manifest  — effective manifest for node.tag
function checkEnumValue(node: WidgetNode, attribute: string, manifest: EffectiveManifest): Diagnostic | undefined {
  const prop = manifest.api.props.find((p) => p.name === attribute);
  if (prop === undefined || prop.type !== 'enum' || !prop.values) {
    return undefined;
  }
  const rawVal = node.attributes[attribute];
  if (typeof rawVal !== 'string' || rawVal === '' || rawVal.startsWith('$')) {
    return undefined;
  }
  const allowedValues = prop.values.split(',').map((v) => v.trim());
  if (allowedValues.includes(rawVal)) {
    return undefined;
  }
  return createPropDiagnostic(
    DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    `Invalid value '${rawVal}' for enum property '${prop.name}' on <${node.tag}>. Expected one of: ${allowedValues.join(', ')}.`,
    node.attributeLocs?.[prop.name] ?? node.loc,
    rawVal,
    findClosest(rawVal, allowedValues),
  );
}

// screenLevelPlaceholders
// A `$prop` in an enum or boolean attribute written outside any composite's
// `<view>`. The enum and boolean checks skip such a value as "not yet knowable",
// which is true inside a template and false in a screen, where nothing will ever
// substitute it (PR-04 WO7b findings 3 and 4). Fonts, images and styles are
// Pass 2's, through the same helper; geometry is Pass 6's UNRESOLVED_VALUE.
//   node     — the element as written in a screen
//   manifest — effective manifest for node.tag
function screenLevelPlaceholders(node: WidgetNode, manifest: EffectiveManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checked = new Set<string>();
  const check = (attribute: string): void => {
    if (checked.has(attribute)) {
      return;
    }
    checked.add(attribute);
    const reference = propReferenceIn(node.attributes[attribute]);
    if (reference !== undefined) {
      diagnostics.push(
        unsubstitutedPlaceholder(
          reference,
          `'${attribute}' on ${describeNode(node)}`,
          node.attributeLocs?.[attribute] ?? node.loc,
        ),
      );
    }
  };

  for (const prop of manifest.api.props) {
    if (prop.type === 'enum') {
      check(prop.name);
    }
  }
  for (const attribute of booleanAttributesOf(manifest)) {
    check(attribute);
  }
  return diagnostics;
}

// checkBooleanValue
// The INVALID_ENUM_VALUE diagnostic for a boolean attribute — `hcenter`,
// `vcenter` or `hidden` — whose value is neither `true` nor `false` (§7.2). The
// same code as an enum: a boolean is a two-member set, and the suggestions carry
// both members. A value the parser already turned into a real boolean is not a
// string and needs no check; a `$`-reference is not yet a value, and outside a
// composite it is screenLevelPlaceholders' to report.
//   node      — the element
//   attribute — `hcenter`, `vcenter` or `hidden`
function checkBooleanValue(node: WidgetNode, attribute: string): Diagnostic | undefined {
  const value = node.attributes[attribute];
  if (typeof value !== 'string' || value.startsWith('$') || BOOLEAN_VALUES.includes(value)) {
    return undefined;
  }
  return createPropDiagnostic(
    DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
    `Invalid value '${value}' for '${attribute}' on ${describeNode(node)}: it is a boolean, ` +
      `'true' or 'false' (§7.2).`,
    node.attributeLocs?.[attribute] ?? node.loc,
    value,
    [...BOOLEAN_VALUES],
  );
}

// checkSubstitutedValues
// The enum and centring checks for the values composite expansion substituted —
// the ones Step 4 skipped as `$`-references (PR-04 WO7 F5). Nothing else is
// checked again: every other value was checked as written.
//   input       — validator input
//   diagnostics — output; also read, so a fact already reported at the argument is not repeated
function checkSubstitutedValues(input: ValidateInput, diagnostics: Diagnostic[]): void {
  const { manifests } = input;
  const expansion = pipelineOf(input).expansion;
  const report = reportSubstituted(diagnostics);
  for (const screen of expansion.screens) {
    const styles = styleScope(input.globals, screen.screen);
    walkExpanded(screen.elements, (element) => {
      const manifest = manifests.get(element.node.tag);
      if (manifest === undefined) {
        return;
      }
      // A required prop a `$`-named style may supply was left for here (Step 3
      // of checkInstanceProps): the style's name is known now.
      const styleSubstitution = (element.substitutions ?? []).find(
        (substitution) => substitution.attribute === 'style' || substitution.styleChild !== undefined,
      );
      if (styleSubstitution !== undefined) {
        for (const diagnostic of missingRequired(element.node, manifest, styles)) {
          report(diagnostic, styleSubstitution, element);
        }
      }
      for (const substitution of element.substitutions ?? []) {
        const { attribute } = substitution;
        if (substitution.styleChild !== undefined) {
          continue; // A `<style name="$s">` value is not an attribute: Pass 2's.
        }
        const diagnostic = booleanAttributesOf(manifest).includes(attribute)
          ? checkBooleanValue(element.node, attribute)
          : checkEnumValue(element.node, attribute, manifest);
        if (diagnostic !== undefined) {
          report(diagnostic, substitution, element);
        }
      }
    });
  }
}

/**
 * Validates element instance attributes in every screen, and inside every
 * composite's `<view>`, against the effective manifests in `input.manifests`.
 *
 * Composite interiors are checked on the same path as screens because §13.11
 * validates composite instantiation "inside composites as well as screens";
 * before PR-04 WO3 an element inside a `<view>` was never prop-checked.
 * `$prop` placeholder values are unknowable here and are skipped by the enum
 * check already; attribute *names* inside a template are literal and checked.
 *
 * @param input Validator input; only `screens` and `manifests` are read.
 * @return Diagnostics in screen order, then declared-composite order, each in
 *         document order.
 */
export function validateWidgetProps(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { screens, manifests } = input;

  const visit = (atScreenLevel: boolean, styles: StyleScope) => (node: WidgetNode): void => {
    const manifest = manifests.get(node.tag);
    if (manifest) {
      diagnostics.push(...checkInstanceProps(node, manifest, atScreenLevel, styles));
    }
  };

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], visit(true, styleScope(input.globals, screen)));
  }
  const globalStyles = styleScope(input.globals, undefined);
  for (const composite of manifests.declaredComposites) {
    walkNodes(composite.view?.children ?? [], visit(false, globalStyles));
  }
  checkSubstitutedValues(input, diagnostics);

  return diagnostics;
}
