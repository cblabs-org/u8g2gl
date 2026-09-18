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
 *              Font, image and style values are checked as written — in screens
 *              and in each composite's `<view>` — skipping `$`-references, which
 *              are unknowable there. The values composite expansion substitutes
 *              for those references are then checked on the expanded tree by the
 *              same function (PR-04 WO7b, WO7 F4), and only those, so no value is
 *              checked twice; substituted-values.ts decides where each is reported.
 *
 *              PR-04 WO9 closes two ways an unresolvable reference reached
 *              emission: a `$prop` in a `bind_*` attribute written in a screen,
 *              where there is no template to substitute it (WO8a finding 3), and
 *              a **literal** `<style>` child inside a `<view>`, which neither
 *              this walk nor the substituted-value walk examined (WO8a finding
 *              4).
 *
 * Exports:
 * - validateReferences(input): Runs Pass 2 cross-reference validation
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { walkExpanded } from '../resolver/index.js';
import type { ValidateInput } from './validate.js';
import { pipelineOf } from './shared-model.js';
import { propReferenceIn, reportSubstituted, unsubstitutedPlaceholder } from './substituted-values.js';

/** The declarations a value written on a screen element may name. */
interface ReferenceScope {
  readonly declaredFonts: readonly string[];
  readonly fontSet: ReadonlySet<string>;
  readonly declaredImages: readonly string[];
  readonly imageSet: ReadonlySet<string>;
  /** Global styles, then the screen's own. */
  readonly availableStyles: readonly string[];
  readonly availableStyleSet: ReadonlySet<string>;
  readonly manifests: ValidateInput['manifests'];
}

// referenceScope
// What an element on `screen` may refer to.
function referenceScope(globals: Globals, screen: Screen, manifests: ValidateInput['manifests']): ReferenceScope {
  const declaredFonts = (globals?.fonts ?? []).map((f) => f.name);
  const declaredImages = (globals?.images ?? []).map((i) => i.name);
  const availableStyles = [...(globals?.styles ?? []).map((s) => s.name), ...(screen.styles ?? []).map((s) => s.name)];
  return {
    declaredFonts,
    fontSet: new Set(declaredFonts),
    declaredImages,
    imageSet: new Set(declaredImages),
    availableStyles,
    availableStyleSet: new Set(availableStyles),
    manifests,
  };
}

// checkValueReferences
// 2b–2d for one element: its font, `style_font` override, image, style and focus
// style must name declarations in scope. A `$`-reference is skipped — it is not
// yet a value.
//   node  — the element
//   scope — what it may refer to
//   only  — when given, only these attributes are checked (a substitution's)
function checkValueReferences(node: WidgetNode, scope: ReferenceScope, only?: ReadonlySet<string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checks = (...attributes: string[]): boolean => only === undefined || attributes.some((a) => only.has(a));
  const { declaredFonts, fontSet, declaredImages, imageSet, availableStyles, availableStyleSet, manifests } = scope;

  // --- Step 1: Font references ---
  const fontAttr = node.attributes.font;
  if (checks('font') && typeof fontAttr === 'string' && !fontAttr.startsWith('$') && !fontSet.has(fontAttr)) {
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

  const styleFontOverride = node.styleOverrides.font;
  if (
    checks('style_font') &&
    typeof styleFontOverride === 'string' &&
    !styleFontOverride.startsWith('$') &&
    !fontSet.has(styleFontOverride)
  ) {
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

  // --- Step 2: Image references ---
  // Image-ness is derived from the manifest ([D-17]) — a `type="image"` prop
  // named `src` or `image` — rather than a hardcoded tag list. Of the three tags
  // this list once named, only `u8g2gl_xbm` ever had a manifest; `u8g2gl_bitmap`
  // and `u8g2gl_icon` name elements that do not exist and are already rejected
  // as UNKNOWN_WIDGET before this code runs (PR-3R WO7).
  const imageAttr = node.attributes.image ?? node.attributes.src;
  if (checks('image', 'src') && typeof imageAttr === 'string' && !imageAttr.startsWith('$')) {
    const manifest = manifests.get(node.tag);
    const isImageTag = manifest?.api.props.some((p) => p.type === 'image' && (p.name === 'src' || p.name === 'image'));
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

  // --- Step 3: Style and focus-style references ---
  const styleAttr = node.attributes.style;
  if (checks('style') && typeof styleAttr === 'string' && !styleAttr.startsWith('$') && !availableStyleSet.has(styleAttr)) {
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

  const focusStyleAttr = node.attributes.focusStyle ?? node.attributes.focus_style;
  if (
    checks('focus_style', 'focusStyle') &&
    typeof focusStyleAttr === 'string' &&
    !focusStyleAttr.startsWith('$') &&
    !availableStyleSet.has(focusStyleAttr)
  ) {
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

  return diagnostics;
}

/**
 * The value attributes Pass 2 checks by name. A `$prop` in one of them, written
 * outside any composite, is reported here (PR-04 WO8a); `style_font` is reached
 * through `styleOverrides` and is handled beside them.
 */
const VALUE_ATTRIBUTES: readonly string[] = ['font', 'image', 'src', 'style', 'focus_style'];

// screenLevelPlaceholders
// A `$prop` in a font, image, style or **binding** value written directly in a
// screen. There is nothing to substitute it with, so it would reach output
// literally.
//   node — the element as written in a screen
function screenLevelPlaceholders(node: WidgetNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const attribute of VALUE_ATTRIBUTES) {
    const reference = propReferenceIn(node.attributes[attribute]);
    if (reference !== undefined) {
      diagnostics.push(
        unsubstitutedPlaceholder(
          reference,
          `'${attribute}' on <${node.tag}>`,
          node.attributeLocs?.[attribute] ?? node.loc,
        ),
      );
    }
  }
  const styleFont = propReferenceIn(node.styleOverrides.font);
  if (styleFont !== undefined) {
    diagnostics.push(
      unsubstitutedPlaceholder(
        styleFont,
        `'style_font' on <${node.tag}>`,
        node.attributeLocs?.style_font ?? node.loc,
      ),
    );
  }

  // A `$prop` in a binding attribute (PR-04 WO9, closing WO8a finding 3). 2e
  // below skips a `$` value as "not yet knowable", which is true inside a
  // template and false here: a screen has no props to bind, so nothing will ever
  // substitute it. Left unreported, `bind_text="$subject"` in a screen named no
  // declared subject, realisation recorded a binding on it all the same, and
  // emission would have registered an observer on a subject called `$subject`.
  //
  // The attribute names are not a list: any `bind_*` is a binding (§8.4), and
  // the `_fmt` companion is a format string rather than a subject reference.
  for (const [attribute, value] of Object.entries(node.attributes)) {
    if (!attribute.startsWith('bind_') || attribute.endsWith('_fmt')) {
      continue;
    }
    const reference = propReferenceIn(value);
    if (reference !== undefined) {
      diagnostics.push(
        unsubstitutedPlaceholder(
          reference,
          `'${attribute}' on <${node.tag}>`,
          node.attributeLocs?.[attribute] ?? node.loc,
        ),
      );
    }
  }

  // The same fact written as a directive child (PR-04 WO10, closing WO9
  // finding 8). `<bind_flag_if_eq subject="$p" … />` is a binding exactly as
  // `bind_text="$p"` is, and at screen level nothing will substitute it either:
  // 2e skips a `$` subject as "not yet knowable", realisation skips it as naming
  // no subject, so the element would silently lose its flag binding. Same code
  // as the attribute form, so a consumer branching on it sees one defect.
  for (const child of node.children) {
    if (!('kind' in child) || child.kind !== 'binding') {
      continue;
    }
    const reference = propReferenceIn(child.subject);
    if (reference !== undefined) {
      diagnostics.push(
        unsubstitutedPlaceholder(
          reference,
          `'subject' of <${child.type}> on <${node.tag}>`,
          child.loc ?? node.loc,
        ),
      );
    }
  }
  return diagnostics;
}

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

// walkNodesWithParent
// Like walkNodes, but also passes each element's enclosing element (undefined at
// the top of a view), which is what decides whether a tag is a collection child.
function walkNodesWithParent(
  children: readonly WidgetNodeChild[],
  visitor: (node: WidgetNode, parent: WidgetNode | undefined) => void,
  parent?: WidgetNode,
): void {
  for (const child of children) {
    if ('tag' in child && typeof child.tag === 'string') {
      visitor(child, parent);
      walkNodesWithParent(child.children, visitor, child);
    }
  }
}

// isDeclaredCollectionChild
// Whether a tag with no manifest of its own is a collection element its parent's
// manifest declares (§9) — `<column>` inside `<wd_list>`. Such a child is known:
// Pass 8 reports it as not yet supported (a warning in `validate`, PR-04 decision
// 1), so reporting it here as unknown would make `validate` error on it (PR-04
// WO5b F2). Read from the parent's own `api.elements`, never a tag list ([D-17]);
// collection elements are not inherited (PR-04 WO1 F8).
//   node      — the element whose tag has no manifest
//   parent    — its enclosing element, if any
//   manifests — the registry
function isDeclaredCollectionChild(
  node: WidgetNode,
  parent: WidgetNode | undefined,
  manifests: ValidateInput['manifests'],
): boolean {
  if (parent === undefined) {
    return false;
  }
  return manifests.get(parent.tag)?.api.elements.some((element) => element.name === node.tag) ?? false;
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

  // Global styles only, for the checks inside a composite's `<view>`: a template
  // is instantiated on whatever screen the author chooses, so a screen-local
  // style is not in scope for it. The screen walk uses `referenceScope`, which
  // adds that screen's own styles.
  const declaredGlobalStyles = (globals?.styles ?? []).map((s) => s.name);
  const globalStyleSet = new Set(declaredGlobalStyles);


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
    const scope = referenceScope(globals, screen, manifests);
    const { availableStyles, availableStyleSet } = scope;

    const screenElementNames = new Set<string>();

    walkNodesWithParent(screen.view?.children ?? [], (node, parent) => {
      if (typeof node.attributes.name === 'string' && node.attributes.name) {
        screenElementNames.add(node.attributes.name);
      }

      // 2a. Check the element tag. Element knowledge is data,
      // never code ([D-17]): a tag validates if and only if a manifest
      // declares it, or its parent's manifest declares it as a collection
      // element — there is no hardcoded primitives set to fall back on.
      if (!manifests.has(node.tag) && !isDeclaredCollectionChild(node, parent, manifests)) {
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

      // 2b–2d. Font, image, style and focus-style references
      diagnostics.push(...checkValueReferences(node, scope));

      // A `$prop` here can never be substituted: a screen has no template and so
      // no props to bind, and every check above skips a `$` value as unknowable
      // (PR-04 WO7b finding 4). Inside a composite's `<view>` the same values are
      // checked once expansion has substituted them, in 3b below.
      diagnostics.push(...screenLevelPlaceholders(node));

      for (const child of node.children) {
        if ('kind' in child && child.kind === 'style') {
          const reference = propReferenceIn(child.name);
          if (reference !== undefined) {
            diagnostics.push(
              unsubstitutedPlaceholder(reference, `<style> on <${node.tag}>`, child.loc ?? node.loc),
            );
          } else if (!availableStyleSet.has(child.name)) {
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

    walkNodesWithParent(component.view?.children ?? [], (node, parent) => {
      // Check the tag itself. Pass 2a runs only over screens, so without this
      // a misspelled element inside a composite's own template passed today —
      // the walk here checked fonts, images, and subjects but never the tag.
      if (!manifests.has(node.tag) && !isDeclaredCollectionChild(node, parent, manifests)) {
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

      // A literal `<style>` child inside the template (PR-04 WO9, closing WO8a
      // finding 4). The screen walk has always checked these; this walk never
      // did, and 3b checks only the ones expansion *substituted* — so a style
      // name written as literal text in a `<view>` was the one spelling nothing
      // examined, and `<style name="hedaer" />` reached emission as
      // `ui_style_hedaer`, a symbol no unit defines.
      //
      // Reported against the template, once, however often the composite is
      // instantiated: the defect is in the template's own text.
      for (const child of node.children) {
        if ('kind' in child && child.kind === 'style') {
          if (propNames.has(child.name) || child.name.startsWith('$')) {
            continue; // A `$prop`; 3b checks what it is substituted with.
          }
          if (!globalStyleSet.has(child.name)) {
            diagnostics.push(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_STYLE,
                `Unknown style '${child.name}' in <style> child in composite '${component.name}'.`,
                child.loc ?? node.loc,
                child.name,
                findClosest(child.name, declaredGlobalStyles),
              ),
            );
          }
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

  // --- 3b. Values composite expansion substituted (PR-04 WO7b, WO7 F4) ---
  // After sections 2 and 3, so a value already reported where it was written as
  // an argument is recognised and not reported again where the template uses it.
  const expansion = pipelineOf(input).expansion;
  const reportSubstitutedValue = reportSubstituted(diagnostics);
  for (const expanded of expansion.screens) {
    const scope = referenceScope(globals, expanded.screen, manifests);
    walkExpanded(expanded.elements, (element) => {
      for (const substitution of element.substitutions ?? []) {
        // A `<style name="$s">` child, whose value is not an attribute of the
        // element and so was never checked once substituted (PR-04 WO7b 6).
        const { styleChild } = substitution;
        if (styleChild !== undefined) {
          if (!scope.availableStyleSet.has(styleChild.name)) {
            reportSubstitutedValue(
              createRefDiagnostic(
                DIAGNOSTIC_CODES.UNKNOWN_STYLE,
                `Unknown style '${styleChild.name}' in <style> child on <${element.node.tag}>.`,
                styleChild.loc ?? element.node.loc,
                styleChild.name,
                findClosest(styleChild.name, scope.availableStyles),
              ),
              substitution,
              element,
            );
          }
          continue;
        }
        for (const diagnostic of checkValueReferences(element.node, scope, new Set([substitution.attribute]))) {
          reportSubstitutedValue(diagnostic, substitution, element);
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
