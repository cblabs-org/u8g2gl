/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-references.ts
 * Purpose: Pass 2 — Validates cross-file and intra-screen symbol references (§15.1).
 * Description: Checks fonts, images, subjects, styles, component instances, and focus
 *              ring targets against declared definitions. Employs Levenshtein edit
 *              distance (findClosest) to provide structured replacement suggestions.
 *
 * Exports:
 * - validateReferences(input): Runs Pass 2 cross-reference validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { ValidateInput } from './validate.js';

/** Standard Tier 1 primitive elements (§6.1). */
const TIER1_PRIMITIVES: ReadonlySet<string> = new Set([
  'u8g2gl_box',
  'u8g2gl_frame',
  'u8g2gl_circle',
  'u8g2gl_disc',
  'u8g2gl_hline',
  'u8g2gl_vline',
  'u8g2gl_line',
  'u8g2gl_bitmap',
]);

function createRefDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
  suggestions: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

/**
 * Traverses a widget node child list recursively.
 */
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
 * Validates cross-file and intra-file references against declared symbols.
 */
export function validateReferences(input: ValidateInput): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { globals, screens, components, widgetManifests } = input;

  const declaredFonts = (globals?.fonts ?? []).map((f) => f.name);
  const fontSet = new Set(declaredFonts);

  const declaredImages = (globals?.images ?? []).map((i) => i.name);
  const imageSet = new Set(declaredImages);

  const declaredSubjects = (globals?.subjects ?? []).map((s) => s.name);
  const subjectSet = new Set(declaredSubjects);

  const globalStyles = (globals?.styles ?? []).map((s) => s.name);
  const declaredComponents = (components ?? []).map((c) => c.name);
  const componentSet = new Set(declaredComponents);

  const manifestMap = new Map((widgetManifests ?? []).map((m) => [m.name, m]));

  // --- 1. Validate font references in styles (globals and screen-local) ---
  for (const style of globals?.styles ?? []) {
    if (style.font && !fontSet.has(style.font)) {
      diagnostics.push(
        createRefDiagnostic(
          DIAGNOSTIC_CODES.UNKNOWN_FONT,
          `Unknown font '${style.font}' referenced in style '${style.name}'.`,
          style.loc,
          style.font,
          findClosest(style.font, declaredFonts),
        ),
      );
    }
  }

  for (const screen of screens ?? []) {
    for (const style of screen.styles ?? []) {
      if (style.font && !fontSet.has(style.font)) {
        diagnostics.push(
          createRefDiagnostic(
            DIAGNOSTIC_CODES.UNKNOWN_FONT,
            `Unknown font '${style.font}' referenced in local style '${style.name}' in screen '${screen.name}'.`,
            style.loc,
            style.font,
            findClosest(style.font, declaredFonts),
          ),
        );
      }
    }
  }

  // --- 2. Validate screen views and widget nodes ---
  for (const screen of screens ?? []) {
    const screenStyles = (screen.styles ?? []).map((s) => s.name);
    const availableStyles = [...globalStyles, ...screenStyles];
    const availableStyleSet = new Set(availableStyles);

    const screenElementNames = new Set<string>();

    walkNodes(screen.view?.children ?? [], (node) => {
      if (typeof node.attributes.name === 'string' && node.attributes.name) {
        screenElementNames.add(node.attributes.name);
      }

      // 2a. Check component tag or widget tag
      const isManifestWidget = manifestMap.has(node.tag);
      const isPrimitive = TIER1_PRIMITIVES.has(node.tag);
      const isComponent = componentSet.has(node.tag);

      if (!isManifestWidget && !isPrimitive) {
        if (node.tag.startsWith('u8g2gl_')) {
          // Unknown built-in widget
          const manifestNames = Array.from(manifestMap.keys());
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
              `Unknown widget '<${node.tag}>' in screen '${screen.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, manifestNames),
            ),
          );
        } else if (!isComponent) {
          // Unknown component
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_COMPONENT,
              `Unknown component '<${node.tag}>' instantiated in screen '${screen.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, declaredComponents),
            ),
          );
        }
      }

      // 2b. Check font references
      const fontAttr = node.attributes.font;
      if (typeof fontAttr === 'string' && !fontAttr.startsWith('$')) {
        if (!fontSet.has(fontAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_FONT,
              `Unknown font '${fontAttr}' referenced on <${node.tag}>.`,
              node.attributeLocs?.font ?? node.loc,
              fontAttr,
              findClosest(fontAttr, declaredFonts),
            ),
          );
        }
      }

      const styleFontOverride = node.styleOverrides.font;
      if (typeof styleFontOverride === 'string' && !styleFontOverride.startsWith('$')) {
        if (!fontSet.has(styleFontOverride)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_FONT,
              `Unknown font '${styleFontOverride}' in style_font on <${node.tag}>.`,
              node.attributeLocs?.style_font ?? node.loc,
              styleFontOverride,
              findClosest(styleFontOverride, declaredFonts),
            ),
          );
        }
      }

      // 2c. Check image references
      const imageAttr = node.attributes.image ?? node.attributes.src;
      if (typeof imageAttr === 'string' && !imageAttr.startsWith('$')) {
        // Only validate as image if tag is an image widget or manifest declares image prop
        const manifest = manifestMap.get(node.tag);
        const hasImageProp = manifest?.api.props.some(
          (p) => p.type === 'image' && (p.name === 'src' || p.name === 'image'),
        );
        const isImageTag =
          node.tag === 'u8g2gl_bitmap' ||
          node.tag === 'u8g2gl_xbm' ||
          node.tag === 'u8g2gl_icon' ||
          hasImageProp;

        if (isImageTag && !imageSet.has(imageAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_IMAGE,
              `Unknown image '${imageAttr}' referenced on <${node.tag}>.`,
              node.attributeLocs?.image ?? node.attributeLocs?.src ?? node.loc,
              imageAttr,
              findClosest(imageAttr, declaredImages),
            ),
          );
        }
      }

      // 2d. Check style references
      const styleAttr = node.attributes.style;
      if (typeof styleAttr === 'string' && !styleAttr.startsWith('$')) {
        if (!availableStyleSet.has(styleAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_STYLE,
              `Unknown style '${styleAttr}' referenced on <${node.tag}>.`,
              node.attributeLocs?.style ?? node.loc,
              styleAttr,
              findClosest(styleAttr, availableStyles),
            ),
          );
        }
      }

      const focusStyleAttr = node.attributes.focusStyle ?? node.attributes.focus_style;
      if (typeof focusStyleAttr === 'string' && !focusStyleAttr.startsWith('$')) {
        if (!availableStyleSet.has(focusStyleAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_STYLE,
              `Unknown focus style '${focusStyleAttr}' referenced on <${node.tag}>.`,
              node.attributeLocs?.focus_style ?? node.attributeLocs?.focusStyle ?? node.loc,
              focusStyleAttr,
              findClosest(focusStyleAttr, availableStyles),
            ),
          );
        }
      }

      for (const child of node.children) {
        if ('kind' in child && child.kind === 'style') {
          if (!availableStyleSet.has(child.name)) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_STYLE,
                `Unknown style '${child.name}' in <style> child on <${node.tag}>.`,
                child.loc ?? node.loc,
                child.name,
                findClosest(child.name, availableStyles),
              ),
            );
          }
        }
      }

      // 2e. Check subject references in bindings
      for (const [attrName, attrVal] of Object.entries(node.attributes)) {
        if (
          attrName.startsWith('bind_') &&
          !attrName.endsWith('_fmt') &&
          typeof attrVal === 'string' &&
          !attrVal.startsWith('$')
        ) {
          if (!subjectSet.has(attrVal)) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
                `Unknown subject '${attrVal}' in binding '${attrName}' on <${node.tag}>.`,
                node.attributeLocs?.[attrName] ?? node.loc,
                attrVal,
                findClosest(attrVal, declaredSubjects),
              ),
            );
          }
        }
      }

      // Child binding directives (<bind_flag_if_eq subject="..." />)
      for (const child of node.children) {
        if ('kind' in child && child.kind === 'binding') {
          if (child.subject && !child.subject.startsWith('$') && !subjectSet.has(child.subject)) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
                `Unknown subject '${child.subject}' in <${child.type}> on <${node.tag}>.`,
                child.loc ?? node.loc,
                child.subject,
                findClosest(child.subject, declaredSubjects),
              ),
            );
          }
        }
      }
    });

    // 2f. Validate focus ring entries
    if (screen.view?.focusRing) {
      for (const entry of screen.view.focusRing.entries) {
        if (entry.name && !screenElementNames.has(entry.name)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
              `Focus ring entry '${entry.name}' does not match any named element in screen '${screen.name}'.`,
              entry.loc,
              entry.name,
              findClosest(entry.name, Array.from(screenElementNames)),
            ),
          );
        }
      }
    }
  }

  // --- 3. Validate references inside components (excluding $prop templates) ---
  for (const component of components ?? []) {
    const propNames = new Set((component.api ?? []).map((p) => `$${p.name}`));

    walkNodes(component.view?.children ?? [], (node) => {
      // Check font references
      const fontAttr = node.attributes.font;
      if (typeof fontAttr === 'string' && !propNames.has(fontAttr) && !fontAttr.startsWith('$')) {
        if (!fontSet.has(fontAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_FONT,
              `Unknown font '${fontAttr}' referenced in component '${component.name}'.`,
              node.attributeLocs?.font ?? node.loc,
              fontAttr,
              findClosest(fontAttr, declaredFonts),
            ),
          );
        }
      }

      // Check image references
      const imageAttr = node.attributes.image ?? node.attributes.src;
      if (
        typeof imageAttr === 'string' &&
        !propNames.has(imageAttr) &&
        !imageAttr.startsWith('$')
      ) {
        const isImageTag =
          node.tag === 'u8g2gl_bitmap' ||
          node.tag === 'u8g2gl_xbm' ||
          node.tag === 'u8g2gl_icon';

        if (isImageTag && !imageSet.has(imageAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_IMAGE,
              `Unknown image '${imageAttr}' referenced in component '${component.name}'.`,
              node.attributeLocs?.image ?? node.attributeLocs?.src ?? node.loc,
              imageAttr,
              findClosest(imageAttr, declaredImages),
            ),
          );
        }
      }

      // Check subject references in bindings
      for (const [attrName, attrVal] of Object.entries(node.attributes)) {
        if (
          attrName.startsWith('bind_') &&
          !attrName.endsWith('_fmt') &&
          typeof attrVal === 'string' &&
          !propNames.has(attrVal) &&
          !attrVal.startsWith('$')
        ) {
          if (!subjectSet.has(attrVal)) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
                `Unknown subject '${attrVal}' in binding '${attrName}' in component '${component.name}'.`,
                node.attributeLocs?.[attrName] ?? node.loc,
                attrVal,
                findClosest(attrVal, declaredSubjects),
              ),
            );
          }
        }
      }

      for (const child of node.children) {
        if ('kind' in child && child.kind === 'binding') {
          if (
            child.subject &&
            !propNames.has(child.subject) &&
            !child.subject.startsWith('$') &&
            !subjectSet.has(child.subject)
          ) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
                `Unknown subject '${child.subject}' in <${child.type}> in component '${component.name}'.`,
                child.loc ?? node.loc,
                child.subject,
                findClosest(child.subject, declaredSubjects),
              ),
            );
          }
        }
      }
    });
  }

  return diagnostics;
}
