/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-widget-props.ts
 * Purpose: Pass 4 — Validates widget attributes against <api> manifests and component
 *          parameters (§13.1, §13.2).
 * Description: For each widget or component instance, checks that supplied attributes
 *              match declared property names, mandatory props are present, and enum
 *              values belong to the declared enumeration set. Skips common layout
 *              attributes and inline style overrides.
 *
 * Exports:
 * - validateWidgetProps(input): Runs Pass 4 widget property validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { ValidateInput } from './validate.js';

/** Standard common attributes valid on all visual nodes (§7.2, §10). */
const COMMON_ATTRIBUTES: ReadonlySet<string> = new Set([
  'name',
  'x',
  'y',
  'width',
  'height',
  'right',
  'bottom',
  'hcenter',
  'vcenter',
  'hidden',
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

/**
 * Validates widget and component attributes against declared manifests.
 */
export function validateWidgetProps(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { screens, components, widgetManifests } = input;

  const manifestMap = new Map((widgetManifests ?? []).map((m) => [m.name, m]));
  const componentMap = new Map((components ?? []).map((c) => [c.name, c]));

  for (const screen of screens ?? []) {
    walkNodes(screen.view?.children ?? [], (node) => {
      const manifest = manifestMap.get(node.tag);
      const component = componentMap.get(node.tag);

      // --- Case 1: Widget with manifest ---
      if (manifest) {
        const declaredProps = new Map(manifest.api?.props?.map((p) => [p.name, p]) ?? []);
        const declaredBindings = new Set(
          manifest.api?.bindings?.map((b) => b.name) ?? [],
        );
        for (const b of manifest.api?.bindings ?? []) {
          if (b.fmt) {
            declaredBindings.add(b.fmt);
          }
        }

        const allowedNames = [
          ...Array.from(COMMON_ATTRIBUTES),
          ...Array.from(declaredProps.keys()),
          ...Array.from(declaredBindings),
        ];

        // 1a. Check attributes on this widget instance
        for (const [attrName, attrVal] of Object.entries(node.attributes)) {
          if (attrVal === undefined) {
            continue;
          }

          if (COMMON_ATTRIBUTES.has(attrName) || attrName.startsWith('style_')) {
            continue;
          }

          if (declaredProps.has(attrName) || declaredBindings.has(attrName)) {
            continue;
          }

          // Unrecognized attribute
          const loc = node.attributeLocs?.[attrName] ?? node.loc;
          diagnostics.push(
            createPropDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
              `Unknown attribute '${attrName}' on <${node.tag}>.`,
              loc,
              attrName,
              findClosest(attrName, allowedNames),
            ),
          );
        }

        // 1b. Check required properties
        for (const prop of manifest.api?.props ?? []) {
          if (prop.required) {
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
        }

        // 1c. Check enum values
        for (const prop of manifest.api?.props ?? []) {
          if (prop.type === 'enum' && prop.values) {
            const rawVal = node.attributes[prop.name];
            if (typeof rawVal === 'string' && rawVal !== '' && !rawVal.startsWith('$')) {
              const allowedEnumValues = prop.values.split(',').map((v) => v.trim());
              if (!allowedEnumValues.includes(rawVal)) {
                const loc = node.attributeLocs?.[prop.name] ?? node.loc;
                diagnostics.push(
                  createPropDiagnostic(
                    DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
                    `Invalid value '${rawVal}' for enum property '${prop.name}' on <${node.tag}>. Expected one of: ${allowedEnumValues.join(', ')}.`,
                    loc,
                    rawVal,
                    findClosest(rawVal, allowedEnumValues),
                  ),
                );
              }
            }
          }
        }
      }

      // --- Case 2: Component instance ---
      if (component) {
        // `component.api` is an ApiBlock post-WO5b (component is a
        // WidgetManifest, not a retired `Component`) — reach through
        // `.props`, matching the widget path above. No behaviour change.
        const declaredProps = new Map(
          component.api?.props.map((p) => [p.name, p]) ?? [],
        );
        // Latent, closed while in this file per WO6: the composite path never
        // considered `bindings` in its unknown-attribute check, unlike the
        // widget path above. Harmless while a composite's `bindings` is
        // always empty, but it would misfire silently the moment one isn't.
        const declaredBindings = new Set(
          (component.api?.bindings ?? []).map((b) => b.name),
        );
        for (const b of component.api?.bindings ?? []) {
          if (b.fmt) {
            declaredBindings.add(b.fmt);
          }
        }

        const allowedNames = [
          ...Array.from(declaredProps.keys()),
          ...Array.from(declaredBindings),
        ];

        // 2a. Check attributes on component instance
        for (const [attrName, attrVal] of Object.entries(node.attributes)) {
          if (attrVal === undefined) {
            continue;
          }

          if (COMMON_ATTRIBUTES.has(attrName) || attrName.startsWith('style_')) {
            continue;
          }

          if (declaredProps.has(attrName) || declaredBindings.has(attrName)) {
            continue;
          }

          // Unrecognized attribute
          const loc = node.attributeLocs?.[attrName] ?? node.loc;
          diagnostics.push(
            createPropDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
              `Unknown attribute '${attrName}' on component <${node.tag}>.`,
              loc,
              attrName,
              findClosest(attrName, allowedNames),
            ),
          );
        }

        // 2b. Check required properties
        for (const prop of component.api?.props ?? []) {
          if (prop.required) {
            const val = node.attributes[prop.name];
            if (val === undefined || val === '') {
              diagnostics.push(
                createPropDiagnostic(
                  DIAGNOSTIC_CODES.MISSING_REQUIRED,
                  `Missing required attribute '${prop.name}' on component <${node.tag}>.`,
                  node.loc,
                  prop.name,
                ),
              );
            }
          }
        }

        // 2c. Check enum values — a widget prop with type="enum" and an
        // out-of-range value produces INVALID_ENUM_VALUE (case 1c above);
        // under [D-18] a composite is a WidgetManifest like any other, so
        // there is no longer even a nominal reason for the composite path
        // to lack the equivalent check ([WO5b] finding, closed by WO6).
        for (const prop of component.api?.props ?? []) {
          if (prop.type === 'enum' && prop.values) {
            const rawVal = node.attributes[prop.name];
            if (typeof rawVal === 'string' && rawVal !== '' && !rawVal.startsWith('$')) {
              const allowedEnumValues = prop.values.split(',').map((v) => v.trim());
              if (!allowedEnumValues.includes(rawVal)) {
                const loc = node.attributeLocs?.[prop.name] ?? node.loc;
                diagnostics.push(
                  createPropDiagnostic(
                    DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
                    `Invalid value '${rawVal}' for enum property '${prop.name}' on component <${node.tag}>. Expected one of: ${allowedEnumValues.join(', ')}.`,
                    loc,
                    rawVal,
                    findClosest(rawVal, allowedEnumValues),
                  ),
                );
              }
            }
          }
        }
      }
    });
  }

  return diagnostics;
}
