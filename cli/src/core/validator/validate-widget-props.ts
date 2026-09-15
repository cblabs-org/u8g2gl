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
 *              WO7b). Unknown tags are Pass 2's concern and are skipped here.
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
import type { EffectiveManifest } from '../manifest/manifest-registry.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { expandScreens, isRectangular, walkExpanded } from '../resolver/index.js';
import type { ValidateInput } from './validate.js';
import { reportSubstituted } from './substituted-values.js';

/**
 * The anchor attributes (§7.2). They name the layout contract, not elements
 * ([D-17]); which elements may carry them is read from the manifest.
 */
const ANCHOR_ATTRIBUTES: readonly string[] = ['right', 'bottom', 'hcenter', 'vcenter'];

/** The centring switches, which are strict booleans (§7.2). */
const CENTRING_ATTRIBUTES: readonly string[] = ['hcenter', 'vcenter'];

/** The only values a centring switch may take (§7.2). */
const BOOLEAN_VALUES: readonly string[] = ['true', 'false'];

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
function checkInstanceProps(node: WidgetNode, manifest: EffectiveManifest): Diagnostic[] {
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
  for (const prop of props) {
    if (!prop.required) {
      continue;
    }
    const val = node.attributes[prop.name];
    if (val === undefined || val === '') {
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
  for (const attribute of CENTRING_ATTRIBUTES) {
    const diagnostic = checkCentringValue(node, attribute);
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }

  // --- Step 5: Flag directives must name a flag the element can carry ---
  // §8.4 fixes the flag set at `hidden` and `disabled`, so it is not declared
  // per element. `hidden` applies to every element — an object flag, or a
  // draw-time guard on a drawing element (§13.5). `disabled` is interaction
  // state on an object; a drawing element has no object, so there is nothing
  // to disable (PR-04 WO5a).
  if (isDrawingElement(manifest)) {
    for (const child of node.children) {
      if ('kind' in child && child.kind === 'binding' && child.flag === 'disabled') {
        diagnostics.push(
          createPropDiagnostic(
            DIAGNOSTIC_CODES.INAPPLICABLE_FLAG,
            `Flag 'disabled' in <${child.type}> cannot apply to <${node.tag}>: it is a drawing ` +
              `element (draw= props only) with no object to disable. Only 'hidden' applies to a ` +
              `drawing element (§8.4).`,
            child.loc ?? node.loc,
            'disabled',
          ),
        );
      }
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

// checkCentringValue
// The INVALID_ENUM_VALUE diagnostic for an `hcenter` / `vcenter` value that is
// neither `true` nor `false` (§7.2). The same code as an enum: a boolean is a
// two-member set, and the suggestions carry both members. A `$`-reference is not
// yet a value.
//   node      — the element
//   attribute — `hcenter` or `vcenter`
function checkCentringValue(node: WidgetNode, attribute: string): Diagnostic | undefined {
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
  const { globals, screens, manifests } = input;
  const expansion = expandScreens({ globals, screens: screens ?? [], manifests });
  const report = reportSubstituted(diagnostics);
  for (const screen of expansion.screens) {
    walkExpanded(screen.elements, (element) => {
      const manifest = manifests.get(element.node.tag);
      if (manifest === undefined) {
        return;
      }
      for (const substitution of element.substitutions ?? []) {
        const { attribute } = substitution;
        const diagnostic = CENTRING_ATTRIBUTES.includes(attribute)
          ? checkCentringValue(element.node, attribute)
          : checkEnumValue(element.node, attribute, manifest);
        if (diagnostic !== undefined) {
          report(diagnostic, substitution, element);
        }
      }
    });
  }
}

// isDrawingElement
// Whether an element is a drawing element: its own manifest declares draw= props
// and no setter= props, so it has no class and never an object ([D-18], §6.2).
// Decided from the registry's manifest, never from a list of tags ([D-17]), and
// by the same test the schema pass uses for its `extends` rule. A composite is
// never one: it realises as a container object.
//   manifest — effective manifest for the instance's tag
function isDrawingElement(manifest: EffectiveManifest): boolean {
  const props = manifest.declared.api.props;
  return (
    manifest.view === undefined &&
    props.some((p) => p.draw !== undefined) &&
    !props.some((p) => p.setter !== undefined)
  );
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

  const visit = (node: WidgetNode): void => {
    const manifest = manifests.get(node.tag);
    if (manifest) {
      diagnostics.push(...checkInstanceProps(node, manifest));
    }
  };

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], visit);
  }
  for (const composite of manifests.declaredComposites) {
    walkNodes(composite.view?.children ?? [], visit);
  }
  checkSubstitutedValues(input, diagnostics);

  return diagnostics;
}
