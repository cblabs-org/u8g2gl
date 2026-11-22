/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/style-facts.ts
 * Purpose: What a style's card and a constant's row say beyond their
 *          attributes (ui_spec §6.4, §10): the largest corner radius the
 *          style's users allow, the project files that draw its preview, and
 *          each place a constant is referenced. Pure, so the radius bound is
 *          unit-tested without a browser.
 * Description: The radius bound explains the validator's existing check
 *              (`validate-geometry.ts`, a rounded box needs 2 × radius no more
 *              than its width and height) before it fires, and adds no rule
 *              of its own. It reads the style's users from the reference
 *              finder, and of those only the elements whose `width` and
 *              `height` are both written as integer literals: any other size
 *              is known only where the element is placed, which the validator
 *              checks there. An element that sets its own `radius` or
 *              `style_radius` is left out, because its own value wins over the
 *              style's (§10). The bound is `min(width, height) / 2` of the
 *              smallest such element, rounded down, and names it.
 *
 *              The preview is a label and a button in the style, side by side,
 *              on a one-screen project over the project's own `globals.xml`,
 *              drawn as the Fonts view draws its ruler, each captioned with
 *              what the runtime draws of a style on it. They take the style's
 *              font, or, for a style without one, the first font the project
 *              declares.
 *
 * Exports:
 * - RadiusBound:         The bound and the element that sets it
 * - radiusBound():       A style's radius bound, if any user has a literal size
 * - StyleSample:         One sample of a style's preview, and what it draws
 * - STYLE_SAMPLES:       The label and the button, side by side
 * - styleSampleTexts():  The project files that draw a style's preview
 * - ConstUse:            One place a constant is referenced, as its list shows it
 * - constUses():         Every place a constant is referenced
 */

import { parseCst, type CstElement } from '@u8g2gl/core/cst/index.js';
import type { Reference, ReferenceIndex } from '@u8g2gl/core/references/find-references.js';
import { integerLiteralValue } from '@u8g2gl/core/resolver/expression.js';
import { escapeXml, viewProjectTexts } from '../fonts/font-view-model';

/** A style's radius bound, and the element that sets it. */
export interface RadiusBound {
  /** The largest radius every literal-sized user allows. */
  readonly radius: number;
  /** The smallest user, as `screen.element` or `widget.element`. */
  readonly element: string;
  readonly width: number;
  readonly height: number;
}

/** The shapes by which an element applies a style. */
const APPLIES_STYLE: ReadonlySet<Reference['shape']> = new Set(['style-child', 'style-attribute', 'focus-style']);

// elementAt
// The element of a file whose range starts at an offset.
function elementAt(root: CstElement | undefined, start: number): CstElement | undefined {
  if (root === undefined) return undefined;
  if (root.start === start) return root;
  for (const child of root.children) {
    if (child.kind !== 'element' || child.start > start || child.end <= start) continue;
    return elementAt(child, start);
  }
  return undefined;
}

/**
 * @brief The largest radius a style's literal-sized users allow, and which of
 *        them sets it.
 *
 * @param refs  The project's references.
 * @param texts The texts `refs` was read from.
 * @param style The style's name.
 * @return The bound, or undefined when no user has a literal width and height.
 */
export function radiusBound(refs: ReferenceIndex, texts: ReadonlyMap<string, string>, style: string): RadiusBound | undefined {
  let best: RadiusBound | undefined;
  const parsed = new Map<string, CstElement | undefined>();
  for (const use of refs.of('style', style).uses) {
    // --- Step 1: An element that applies the style, found in its file ---
    if (!APPLIES_STYLE.has(use.shape) || use.elementRange === undefined || use.element === undefined) continue;
    if (!parsed.has(use.file)) parsed.set(use.file, parseCst(texts.get(use.file) ?? '', use.file).cst.root);
    const element = elementAt(parsed.get(use.file), use.elementRange.start);
    if (element === undefined) continue;
    const value = (name: string): string | undefined => element.attributes.find((attribute) => attribute.name === name)?.value;

    // --- Step 2: Its own radius wins over the style's; a size not literal is placed elsewhere ---
    if (value('radius') !== undefined || value('style_radius') !== undefined) continue;
    const width = integerLiteralValue(value('width') ?? '');
    const height = integerLiteralValue(value('height') ?? '');
    if (width === undefined || height === undefined) continue;

    // --- Step 3: The smallest box sets the bound ---
    const radius = Math.max(0, Math.floor(Math.min(width, height) / 2));
    if (best === undefined || radius < best.radius) best = { radius, element: `${use.screen ?? use.widget ?? use.file}.${use.element}`, width, height };
  }
  return best;
}

/** One sample in a style's preview: the element, its box on the preview's display, and what it draws of a style. */
export interface StyleSample {
  readonly part: 'label' | 'button';
  readonly tag: 'u8g2gl_label' | 'u8g2gl_button';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The style properties the runtime draws on it, as its caption says them. */
  readonly caption: string;
}

/**
 * The preview's two samples, side by side, inset so a frame shows whole. What
 * each draws is what its `render()` reads of the style: a label its font, draw
 * colour, font mode and alignment (`u8g2gl_label.cpp`); a button those, and
 * `invert`, `radius`, and `padding` beside a left or right alignment
 * (`u8g2gl_button.cpp`). No element draws a style's `border`: a button frames
 * itself from its own `border_width`.
 */
export const STYLE_SAMPLES: readonly StyleSample[] = [
  { part: 'label', tag: 'u8g2gl_label', x: 2, y: 2, width: 96, height: 22, caption: 'Label: font, draw colour, font mode, alignment' },
  {
    part: 'button',
    tag: 'u8g2gl_button',
    x: 104,
    y: 2,
    width: 96,
    height: 22,
    caption: 'Button: those, invert (a filled box, when not disabled), radius (box and frame), and padding beside a left or right alignment',
  },
];

/** What the samples say. */
const SAMPLE_TEXT = 'Sample 123';

/**
 * @brief The project files that draw a style's preview: a label and a button
 *        in the style, side by side, over the project's own `globals.xml`.
 *
 * @param globals   The project's `globals.xml`, as it is now.
 * @param style     The style's name.
 * @param fallback  The font for a style that names none: the project's first.
 * @param styleFont The style's own font, if it names one.
 */
export function styleSampleTexts(globals: string, style: string, fallback: string | undefined, styleFont: string | undefined): Map<string, string> {
  // The samples name no font of their own when the style does: an element's
  // own attribute would win over the style's (§10), and the preview is the style's.
  const font = styleFont === undefined && fallback !== undefined ? ` font="${escapeXml(fallback)}"` : '';
  const view = STYLE_SAMPLES.map(
    ({ part, tag, x, y, width, height }) =>
      `        <${tag} name="sample_${part}" x="${x}" y="${y}" width="${width}" height="${height}"${font} text="${SAMPLE_TEXT}">\n` +
      `            <style name="${escapeXml(style)}" />\n` +
      `        </${tag}>\n`,
  ).join('');
  return viewProjectTexts(globals, view);
}

/** One place a constant is referenced, as its "Used by" lists it. */
export interface ConstUse {
  /** `file: element.attribute`, or `file: style name.attribute`. */
  readonly label: string;
  readonly reference: Reference;
}

/** @brief Every place a constant is referenced, by file and attribute, in file then document order. */
export function constUses(refs: ReferenceIndex, name: string): ConstUse[] {
  return refs.of('const', name).uses.map((reference) => {
    const owner = reference.element ?? (reference.style !== undefined ? `style ${reference.style}` : `<${reference.tag}>`);
    return { label: `${reference.file}: ${owner}.${reference.attribute}`, reference };
  });
}
