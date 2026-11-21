/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/asset-usage.ts
 * Purpose: What globals.xml's fonts and images sections say about each item
 *          beyond its attributes (ui_spec §12): who uses it, so the author can
 *          see what a change touches and Remove can refuse while it is still
 *          used; and, for a `<bdf>`, the range presets — each a `range` value
 *          with a name, including one derived from the project's own text.
 * Description: Pure functions over the project model, unit-tested without a
 *              browser. An element uses a font or an image through any prop
 *              its manifest types `font` or `image` ([D-17]: which props are
 *              fonts is the manifests' data); a style uses a font through its
 *              `font`. "Only what this project uses" reads the static text by
 *              font exactly as the CLI's glyph-range warning does
 *              (`static-text.ts`), so the preset never yields a range the
 *              warning flags; sample values can join it later through
 *              `codepointsByFont()`'s extra text. It is unsafe for a font an
 *              element bound to a string subject draws in, since live data can
 *              carry characters design time cannot see, and the preset says
 *              which elements.
 *
 * Exports:
 * - AssetUsers:       The elements and styles that use one font or image
 * - fontUsers():      Each font's users
 * - imageUsers():     Each image's users
 * - usersLine():      Users as one line of text
 * - RangePreset:      One `range` preset
 * - RANGE_PRESETS:    The fixed presets, in the form's order
 * - rangeOf():        Codepoints written as a `range` value
 * - projectPreset():  "Only what this project uses" for one font, and why it may be unsafe
 * - removeRefusal():  Why an item may not be removed now, naming its users
 */

import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import { codepointsByFont, staticTexts, stringBoundElements } from '@u8g2gl/core/fonts/static-text.js';
import type { Screen } from '@u8g2gl/core/schema/screen.js';
import type { WidgetNode, WidgetNodeChild } from '@u8g2gl/core/schema/widget-node.js';
import type { FormNode } from './form-model';

/** The elements and styles that use one font or image. */
export interface AssetUsers {
  /** `screen.element`, in screen then document order. */
  readonly elements: readonly string[];
  /** Style names: a global one, or `screen.style` for a screen's own. */
  readonly styles: readonly string[];
}

/** Nobody. */
const NO_USERS: AssetUsers = { elements: [], styles: [] };

// each
// Every element of a screen, depth first, in document order.
function each(screen: Screen, visit: (node: WidgetNode) => void): void {
  const walk = (children: readonly WidgetNodeChild[]): void => {
    for (const child of children) {
      if ('kind' in child) continue;
      visit(child);
      walk(child.children);
    }
  };
  walk(screen.view.children);
}

// usersOfType
// For every font or image name, the elements naming it through a prop of the
// given manifest type, and (for fonts) the styles.
//   model — the project
//   type  — 'font' or 'image'
function usersOfType(model: ProjectModel, type: 'font' | 'image'): Map<string, AssetUsers> {
  const elements = new Map<string, string[]>();
  const styles = new Map<string, string[]>();
  const add = (into: Map<string, string[]>, name: string, user: string): void => {
    const list = into.get(name) ?? [];
    if (!list.includes(user)) list.push(user);
    into.set(name, list);
  };
  for (const screen of model.screens) {
    each(screen, (node) => {
      const manifest = model.manifests.get(node.tag);
      const name = typeof node.attributes.name === 'string' ? node.attributes.name : node.tag;
      for (const prop of manifest?.api.props ?? []) {
        const value = node.attributes[prop.name];
        if (prop.type === type && typeof value === 'string' && value !== '') add(elements, value, `${screen.name}.${name}`);
      }
    });
    if (type === 'font') for (const style of screen.styles ?? []) if (style.font !== undefined) add(styles, style.font, `${screen.name}.${style.name}`);
  }
  if (type === 'font') for (const style of model.globals.styles ?? []) if (style.font !== undefined) add(styles, style.font, style.name);
  const names = new Set([...elements.keys(), ...styles.keys()]);
  return new Map([...names].map((name) => [name, { elements: elements.get(name) ?? [], styles: styles.get(name) ?? [] }]));
}

/** @brief Each font's users, by font name; a font nobody uses has no entry. */
export function fontUsers(model: ProjectModel): Map<string, AssetUsers> {
  return usersOfType(model, 'font');
}

/** @brief Each image's users, by image name; an image nobody uses has no entry. */
export function imageUsers(model: ProjectModel): Map<string, AssetUsers> {
  return usersOfType(model, 'image');
}

/** @brief Users as one line: `2 elements, 1 style`, or `not used`. */
export function usersLine(users: AssetUsers | undefined): string {
  const { elements, styles } = users ?? NO_USERS;
  if (elements.length === 0 && styles.length === 0) return 'not used';
  const part = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
  return [elements.length > 0 ? part(elements.length, 'element') : '', styles.length > 0 ? part(styles.length, 'style') : ''].filter(Boolean).join(', ');
}

/** One `range` preset. */
export interface RangePreset {
  readonly id: string;
  readonly label: string;
  /** The `range` value it writes; undefined removes the attribute (every glyph). */
  readonly range: string | undefined;
  /** What it holds, in words. */
  readonly help: string;
}

/** The fixed presets, in the form's order. "Only what this project uses" follows them. */
export const RANGE_PRESETS: readonly RangePreset[] = [
  { id: 'all', label: 'All', range: undefined, help: 'Every glyph in the file: no range attribute.' },
  { id: 'ascii', label: 'Printable ASCII', range: '0x20-0x7E', help: 'Space to tilde: letters, digits and punctuation.' },
  { id: 'latin1', label: 'Latin-1', range: '0x20-0x7E,0xA0-0xFF', help: 'Printable ASCII, and the accented letters and signs of Latin-1.' },
  { id: 'time', label: 'Digits and time', range: '0x20,0x2B-0x3A', help: 'Space, + , - . /, the digits and the colon.' },
];

/**
 * @brief Codepoints as a `range` value: runs of consecutive codes joined as
 *        `lo-hi`, in hexadecimal, as the `range` help writes them.
 *
 * @param codepoints Ascending, without repeats.
 */
export function rangeOf(codepoints: readonly number[]): string {
  const hex = (code: number): string => `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
  const items: string[] = [];
  for (let i = 0; i < codepoints.length; ) {
    const lo = codepoints[i] ?? 0;
    let hi = lo;
    while (codepoints[i + 1] === hi + 1) hi = codepoints[++i] ?? hi;
    items.push(lo === hi ? hex(lo) : `${hex(lo)}-${hex(hi)}`);
    i++;
  }
  return items.join(',');
}

/**
 * @brief "Only what this project uses" for one font: a range of exactly the
 *        characters the project's static text draws in it.
 *
 * @param model The project.
 * @param font  The `<bdf>`'s name.
 * @return The preset, undefined when no static text uses the font; and the
 *         elements bound to a string subject that draw in it, whose live text
 *         may need characters outside the range.
 */
export function projectPreset(model: ProjectModel, font: string): { readonly preset: RangePreset | undefined; readonly unsafeFor: readonly string[] } {
  const codes = codepointsByFont(staticTexts(model.screens, model.globals, model.manifests)).get(font) ?? [];
  const unsafeFor = stringBoundElements(model.screens, model.globals, model.manifests)
    .filter((entry) => entry.font === font)
    .map((entry) => `${entry.screen.name}.${typeof entry.element.attributes.name === 'string' ? entry.element.attributes.name : entry.element.tag}`);
  const preset =
    codes.length === 0
      ? undefined
      : { id: 'project', label: 'Only what this project uses', range: rangeOf(codes), help: 'Exactly the characters the project’s static text and formats draw in this font.' };
  return { preset, unsafeFor };
}

/**
 * @brief Why a fonts or images item may not be removed now: it is still used,
 *        and the reason names its users.
 *
 * @param model The project, as last run.
 * @param node  The item.
 * @return The refusal, or undefined when it may be removed.
 */
export function removeRefusal(model: ProjectModel | undefined, node: FormNode): string | undefined {
  const kind = node.element.id;
  const isFont = kind === 'font-builtin' || kind === 'font-bdf';
  if (model === undefined || (!isFont && kind !== 'image-xbm' && kind !== 'image-convert')) return undefined;
  const name = node.fields.find((field) => field.attribute.name === 'name')?.value ?? '';
  const users = (isFont ? fontUsers : imageUsers)(model).get(name);
  if (users === undefined) return undefined;
  const names = [...users.elements, ...users.styles.map((style) => `style ${style}`)];
  return `${isFont ? 'Font' : 'Image'} '${name}' is still used by ${names.join(', ')}. Change ${names.length === 1 ? 'it' : 'them'} first, then remove it.`;
}
