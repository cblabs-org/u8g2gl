/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/static-text.ts
 * Purpose: The characters a project draws that design time can see, by font:
 *          every string prop's literal value and the literal part of every
 *          binding's format string, each with the font its element draws in.
 *          A `<bdf>` compiled with a `range` holds only some glyphs, so two
 *          readers need this one answer: the validator, which warns where
 *          static text uses a glyph its font's range leaves out, and the
 *          designer's "Only what this project uses" range preset, which
 *          derives a range from it. One definition, so the preset can never
 *          offer a range the warning then flags.
 * Description: Elements are read as authored, in each screen's document order
 *              (§13.9). Which props carry text is the manifests' data
 *              ([D-17]): every prop of type `string`, and every binding's
 *              `fmt` attribute. A `$` or `#` value is a reference, not text,
 *              and is left out, as is anything a composite's own view draws.
 *              An element's font is its `font` attribute, else its style's
 *              (a screen's style before a global one of the same name).
 *
 *              Design time cannot see a string subject's live value, so an
 *              element bound to one draws characters nothing here lists:
 *              `stringBoundElements()` names those, for the preset to flag.
 *              Sample values join the derivation later through
 *              `codepointsByFont()`'s `extra` input.
 *
 * Exports:
 * - StaticText:            One piece of text design time can see, where it is and its font
 * - elementFont():         The font an element draws in
 * - formatLiterals():      A printf format's literal characters
 * - staticTexts():         Every piece of static text in the project
 * - stringBoundElements(): The elements bound to a string subject, with their fonts
 * - codepointsByFont():    The codepoints each font is asked to draw
 */

import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import type { Globals, StyleDecl, SubjectDecl } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';

/** One piece of text design time can see. */
export interface StaticText {
  /** The element that draws it. */
  readonly element: WidgetNode;
  /** The screen it is in. */
  readonly screen: Screen;
  /** The attribute it is written in: a string prop, or a binding's `fmt`. */
  readonly attribute: string;
  /** The characters drawn: the literal value, or a format's literal part. */
  readonly text: string;
  /** Where the attribute's value was written, when known. */
  readonly loc: SourceLocation | undefined;
  /** The font the element draws in, or undefined when it names none. */
  readonly font: string | undefined;
}

// isWidgetNode
// Whether a child is a nested element, rather than a binding, event, style or static child.
function isWidgetNode(child: WidgetNodeChild): child is WidgetNode {
  return (child as WidgetNode).tag !== undefined && (child as { kind?: string }).kind === undefined;
}

// walk
// Every element of a screen, depth first, in document order.
//   nodes — a view's or an element's children
//   visit — called once per element
function walk(nodes: readonly WidgetNodeChild[], visit: (node: WidgetNode) => void): void {
  for (const child of nodes) {
    if (!isWidgetNode(child)) continue;
    visit(child);
    walk(child.children, visit);
  }
}

// literal
// An attribute's value when it is text, not a `$` or `#` reference.
//   value — the attribute as parsed
function literal(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' && !value.startsWith('$') && !value.startsWith('#') ? value : undefined;
}

/**
 * @brief The font an element draws in: its `font`, else its style's.
 *
 * @param node    The element.
 * @param screen  Its screen, whose styles come before the globals' of the same name.
 * @param globals The project's globals.
 * @return The font's name, or undefined when neither names one.
 */
export function elementFont(node: WidgetNode, screen: Screen, globals: Globals): string | undefined {
  const own = literal(node.attributes['font']);
  if (own !== undefined) return own;
  const styleName = literal(node.attributes['style']);
  if (styleName === undefined) return undefined;
  const find = (styles: readonly StyleDecl[] | undefined): StyleDecl | undefined => styles?.find((style) => style.name === styleName);
  return (find(screen.styles) ?? find(globals.styles))?.font;
}

/**
 * @brief A printf format's literal characters: what it draws whatever the value.
 *
 * `%%` is one `%`; every conversion (`%d`, `%-3.1f`, `%s`) is left out, since
 * its characters come from the value.
 */
export function formatLiterals(format: string): string {
  return format.replace(/%(%|[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|L|z|j|t)?[a-zA-Z])/g, (_, conversion: string) => (conversion === '%' ? '%' : ''));
}

/**
 * @brief Every piece of text the project draws that design time can see.
 *
 * @param screens   Every screen, in project order.
 * @param globals   The globals, for styles.
 * @param manifests Every element's manifest, for which props carry text.
 * @return In screen order, then document order, then manifest order.
 */
export function staticTexts(screens: readonly Screen[], globals: Globals, manifests: ManifestRegistry): StaticText[] {
  const texts: StaticText[] = [];
  for (const screen of screens) {
    walk(screen.view.children, (node) => {
      const manifest = manifests.get(node.tag);
      if (manifest === undefined) return;
      const font = elementFont(node, screen, globals);
      const add = (attribute: string, text: string): void => {
        if (text !== '') texts.push({ element: node, screen, attribute, text, loc: node.attributeLocs?.[attribute], font });
      };
      for (const prop of manifest.api.props) {
        if (prop.type !== 'string') continue;
        const value = literal(node.attributes[prop.name]);
        if (value !== undefined) add(prop.name, value);
      }
      for (const binding of manifest.api.bindings) {
        if (binding.fmt === undefined) continue;
        const format = literal(node.attributes[binding.fmt]);
        if (format !== undefined) add(binding.fmt, formatLiterals(format));
      }
    });
  }
  return texts;
}

/**
 * @brief The elements bound to a string subject, with the font each draws in:
 *        their text is live data, which design time cannot see.
 *
 * @param screens   Every screen.
 * @param globals   The globals, for subjects and styles.
 * @param manifests Every element's manifest, for its bindings.
 * @return One entry per such element, in screen then document order.
 */
export function stringBoundElements(
  screens: readonly Screen[],
  globals: Globals,
  manifests: ManifestRegistry,
): Array<{ readonly element: WidgetNode; readonly screen: Screen; readonly font: string | undefined }> {
  const strings = new Set((globals.subjects ?? []).filter((subject: SubjectDecl) => subject.type === 'string').map((subject) => subject.name));
  const bound: Array<{ element: WidgetNode; screen: Screen; font: string | undefined }> = [];
  for (const screen of screens) {
    walk(screen.view.children, (node) => {
      const manifest = manifests.get(node.tag);
      const subject = manifest?.api.bindings.map((binding) => literal(node.attributes[binding.name])).find((name) => name !== undefined && strings.has(name));
      if (subject !== undefined) bound.push({ element: node, screen, font: elementFont(node, screen, globals) });
    });
  }
  return bound;
}

/**
 * @brief The codepoints each font is asked to draw by the project's static text.
 *
 * @param texts From staticTexts().
 * @param extra More text per font (sample values, once they exist), by font.
 * @return Font → its codepoints, ascending and without repeats.
 */
export function codepointsByFont(texts: readonly StaticText[], extra: ReadonlyMap<string, readonly string[]> = new Map()): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  const add = (font: string, text: string): void => {
    let set = sets.get(font);
    if (set === undefined) sets.set(font, (set = new Set()));
    for (const char of text) set.add(char.codePointAt(0) ?? 0);
  };
  for (const text of texts) if (text.font !== undefined) add(text.font, text.text);
  for (const [font, strings] of extra) for (const text of strings) add(font, text);
  return new Map([...sets].map(([font, set]) => [font, [...set].sort((a, b) => a - b)]));
}
