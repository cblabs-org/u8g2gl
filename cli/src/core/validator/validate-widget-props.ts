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
 *              declared set. Layout and identity attributes in
 *              COMMON_ATTRIBUTES and `style_*` overrides are always accepted.
 *              Unknown tags are Pass 2's concern and are skipped here.
 *
 * Exports:
 * - validateWidgetProps(input): Runs Pass 4 element property validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { EffectiveManifest } from '../manifest/manifest-registry.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { ValidateInput } from './validate.js';

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
  for (const prop of props) {
    if (prop.type !== 'enum' || !prop.values) {
      continue;
    }
    const rawVal = node.attributes[prop.name];
    // A `$`-prefixed value is a composite template parameter, resolved at
    // expansion time; its value is not knowable here.
    if (typeof rawVal !== 'string' || rawVal === '' || rawVal.startsWith('$')) {
      continue;
    }
    const allowedValues = prop.values.split(',').map((v) => v.trim());
    if (!allowedValues.includes(rawVal)) {
      diagnostics.push(
        createPropDiagnostic(
          DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
          `Invalid value '${rawVal}' for enum property '${prop.name}' on <${node.tag}>. Expected one of: ${allowedValues.join(', ')}.`,
          node.attributeLocs?.[prop.name] ?? node.loc,
          rawVal,
          findClosest(rawVal, allowedValues),
        ),
      );
    }
  }

  return diagnostics;
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

  return diagnostics;
}
