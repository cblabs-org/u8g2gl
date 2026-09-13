/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/validate-references.ts
 * Purpose: Pass 2 — Validates cross-file and intra-screen symbol references (§15.1).
 * Description: Checks fonts, images, subjects, styles, composite instances, and focus
 *              ring targets against declared definitions. Employs Levenshtein edit
 *              distance (findClosest) to provide structured replacement suggestions.
 *              Image-ness is derived from the manifest's `type="image"` prop
 *              ([D-17], PR-3R WO7) rather than a hardcoded tag list.
 *
 * Exports:
 * - validateReferences(input): Runs Pass 2 cross-reference validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import { findClosest } from '../catalogue/edit-distance.js';
import type { ValidateInput } from './validate.js';

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
  const { globals, screens, manifests } = input;

  const declaredFonts = (globals?.fonts ?? []).map((f) => f.name);
  const fontSet = new Set(declaredFonts);

  const declaredImages = (globals?.images ?? []).map((i) => i.name);
  const imageSet = new Set(declaredImages);

  const declaredSubjects = (globals?.subjects ?? []).map((s) => s.name);
  const subjectSet = new Set(declaredSubjects);

  const globalStyles = (globals?.styles ?? []).map((s) => s.name);

  // One namespace for every element ([D-18]). The `u8g2gl_` prefix still picks
  // the diagnostic code below — a stable API — but whether a tag is known, and
  // what to suggest for one that is not, comes from the one registry.
  const knownTags = manifests.tags;

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

      // 2a. Check the element tag. Element knowledge is data,
      // never code ([D-17]): a tag validates if and only if a manifest
      // declares it — there is no hardcoded primitives set to fall back on.
      if (!manifests.has(node.tag)) {
        if (node.tag.startsWith('u8g2gl_')) {
          // Unknown built-in widget
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
              `Unknown widget '<${node.tag}>' in screen '${screen.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, knownTags),
            ),
          );
        } else {
          // Unknown user element
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_COMPONENT,
              `Unknown element '<${node.tag}>' instantiated in screen '${screen.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, knownTags),
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

      // 2c. Check image references. Image-ness is derived from the manifest
      // ([D-17]) — a `type="image"` prop named `src` or `image` — rather than
      // a hardcoded tag list. Of the three tags this list once named, only
      // `u8g2gl_xbm` ever had a manifest; `u8g2gl_bitmap` and `u8g2gl_icon`
      // name elements that do not exist and are already rejected as
      // UNKNOWN_WIDGET before this code runs (PR-3R WO7).
      const imageAttr = node.attributes.image ?? node.attributes.src;
      if (typeof imageAttr === 'string' && !imageAttr.startsWith('$')) {
        const manifest = manifests.get(node.tag);
        const isImageTag = manifest?.api.props.some(
          (p) => p.type === 'image' && (p.name === 'src' || p.name === 'image'),
        );

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

  // --- 3. Validate references inside composites (excluding $prop templates) ---
  for (const component of manifests.declaredComposites) {
    // Declared props only, deliberately: a `$name` placeholder may name only a
    // prop this composite declares itself. Its effective manifest also carries
    // props inherited from u8g2gl_obj (PR-04 WO2), which are attributes of the
    // container, not template parameters.
    const propNames = new Set(component.api.props.map((p) => `$${p.name}`));

    walkNodes(component.view?.children ?? [], (node) => {
      // Check the tag itself. Pass 2a runs only over screens, so without this
      // a misspelled element inside a composite's own template passed today —
      // the walk here checked fonts, images, and subjects but never the tag.
      if (!manifests.has(node.tag)) {
        if (node.tag.startsWith('u8g2gl_')) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_WIDGET,
              `Unknown widget '<${node.tag}>' in composite '${component.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, knownTags),
            ),
          );
        } else {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_COMPONENT,
              `Unknown element '<${node.tag}>' instantiated in composite '${component.name}'.`,
              node.loc,
              node.tag,
              findClosest(node.tag, knownTags),
            ),
          );
        }
      }

      // Check font references
      const fontAttr = node.attributes.font;
      if (typeof fontAttr === 'string' && !propNames.has(fontAttr) && !fontAttr.startsWith('$')) {
        if (!fontSet.has(fontAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_FONT,
              `Unknown font '${fontAttr}' referenced in composite '${component.name}'.`,
              node.attributeLocs?.font ?? node.loc,
              fontAttr,
              findClosest(fontAttr, declaredFonts),
            ),
          );
        }
      }

      // Check image references. Same manifest-derived signal as the screen
      // walk above (PR-3R WO7) — no hardcoded tag list.
      const imageAttr = node.attributes.image ?? node.attributes.src;
      if (
        typeof imageAttr === 'string' &&
        !propNames.has(imageAttr) &&
        !imageAttr.startsWith('$')
      ) {
        const manifest = manifests.get(node.tag);
        const isImageTag = manifest?.api.props.some(
          (p) => p.type === 'image' && (p.name === 'src' || p.name === 'image'),
        );

        if (isImageTag && !imageSet.has(imageAttr)) {
          diagnostics.push(
            createRefDiagnostic(
              DIAGNOSTIC_CODES.UNKNOWN_IMAGE,
              `Unknown image '${imageAttr}' referenced in composite '${component.name}'.`,
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
                `Unknown subject '${attrVal}' in binding '${attrName}' in composite '${component.name}'.`,
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
                `Unknown subject '${child.subject}' in <${child.type}> in composite '${component.name}'.`,
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

  // --- 4. Detect composite instantiation cycles (direct or transitive) ---
  // A composite is a real container object ([D-18]), so A instantiating B
  // instantiating A is not merely wasteful, it recurses forever at expansion
  // time. This must be a hard error, and the diagnostic must name the full
  // cycle path (e.g. "a -> b -> a") rather than just report that one exists.
  diagnostics.push(...detectCompositeCycles(manifests));

  return diagnostics;
}

/**
 * Walks the composite instantiation graph looking for a cycle reachable from
 * each composite, and reports every cycle exactly once via its lexicographically
 * smallest rotation, so `a -> b -> a` isn't also reported starting from `b`.
 */
function detectCompositeCycles(manifests: ValidateInput['manifests']): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const components = manifests.declaredComposites;
  const reportedCycles = new Set<string>();

  /** Tags directly instantiated inside a composite's own template. */
  function directChildTags(component: (typeof components)[number]): string[] {
    const tags: string[] = [];
    walkNodes(component.view?.children ?? [], (node) => {
      tags.push(node.tag);
    });
    return tags;
  }

  for (const start of components) {
    const path: string[] = [start.name];
    const onPath = new Set<string>([start.name]);

    const visit = (current: (typeof components)[number]): void => {
      for (const childTag of directChildTags(current)) {
        const child = manifests.get(childTag);
        if (!child?.view) {
          continue; // Not a composite reference — validated elsewhere.
        }

        if (onPath.has(childTag)) {
          // Found a cycle; report the path from its first occurrence, deduped
          // by its canonical (lexicographically smallest) rotation so the
          // same cycle is not reported once per composite that reaches it.
          const cycleStart = path.indexOf(childTag);
          const cyclePath = [...path.slice(cycleStart), childTag];
          const canonical = canonicalCycleKey(cyclePath);
          if (!reportedCycles.has(canonical)) {
            reportedCycles.add(canonical);
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
                `Composite instantiation cycle detected: ${cyclePath.join(' -> ')}.`,
                current.loc,
                childTag,
                [],
              ),
            );
          }
          continue;
        }

        path.push(childTag);
        onPath.add(childTag);
        visit(child);
        onPath.delete(childTag);
        path.pop();
      }
    };

    visit(start);
  }

  return diagnostics;
}

/**
 * Produces a rotation- and direction-stable key for a cycle's node sequence
 * (excluding the repeated closing node), so `a -> b -> a` and `b -> a -> b`
 * dedupe to the same reported cycle regardless of which composite in the
 * cycle the search started from.
 */
function canonicalCycleKey(cycleWithClosingNode: readonly string[]): string {
  const nodes = cycleWithClosingNode.slice(0, -1);
  let best = nodes.join(',');
  for (let i = 1; i < nodes.length; i++) {
    const rotated = [...nodes.slice(i), ...nodes.slice(0, i)].join(',');
    if (rotated < best) {
      best = rotated;
    }
  }
  return best;
}
