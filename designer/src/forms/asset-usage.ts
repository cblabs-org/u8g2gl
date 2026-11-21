/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/asset-usage.ts
 * Purpose: What globals.xml's sections say about each item beyond its
 *          attributes (ui_spec §6.4, §12): who uses it, so the author can see
 *          what a change touches and Remove can refuse while it is still
 *          used; and, for a `<bdf>`, the range presets — each a `range` value
 *          with a name, including one derived from the project's own text.
 * Description: Pure functions, unit-tested without a browser. Who uses what
 *              is the CLI's reference finder's answer
 *              (`core/references/find-references.ts`), so these lists, the
 *              guards and rename cannot disagree about what a reference is.
 *              A font's users are the screens' elements that name it through
 *              a font-typed prop or a `style_font` override, and the styles
 *              whose `font` it is; an image's, the elements naming it through
 *              an image-typed prop. "Only what this project uses" reads the
 *              static text by font exactly as the CLI's glyph-range warning
 *              does (`static-text.ts`), so the preset never yields a range the
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
 * - NameUser:         One user of a name, as a list shows it
 * - nameUsers():      Every user of one name, of any kind
 * - usersLine():      Users as one line of text
 * - RangePreset:      One `range` preset
 * - RANGE_PRESETS:    The fixed presets, in the form's order
 * - rangeOf():        Codepoints written as a `range` value
 * - projectPreset():  "Only what this project uses" for one font, and why it may be unsafe
 * - kindOfItem():     The kind of name a globals.xml item declares
 * - removeRefusal():  Why an item may not be removed now, naming its users
 */

import type { ProjectModel } from '@u8g2gl/core/generator/check-project.js';
import { codepointsByFont, staticTexts, stringBoundElements } from '@u8g2gl/core/fonts/static-text.js';
import type { Reference, ReferenceIndex, ReferenceKind } from '@u8g2gl/core/references/find-references.js';
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

// addOnce
// Appends a user to a name's list unless it is already there.
function addOnce(into: Map<string, string[]>, name: string, user: string): void {
  const list = into.get(name) ?? [];
  if (!list.includes(user)) list.push(user);
  into.set(name, list);
}

// usersOfType
// For every font or image name, the screens' elements naming it, and (for
// fonts) the styles: a screen's own first, then the global ones, as each
// screen layers its own styles over the globals.
//   refs — the project's references
//   kind — 'font' or 'image'
function usersOfType(refs: ReferenceIndex, kind: 'font' | 'image'): Map<string, AssetUsers> {
  const elements = new Map<string, string[]>();
  const localStyles = new Map<string, string[]>();
  const globalStyles = new Map<string, string[]>();
  for (const name of refs.names(kind)) {
    for (const use of refs.of(kind, name).uses) {
      if (use.shape === 'style-declaration-font') addOnce(use.localStyle === true ? localStyles : globalStyles, name, use.localStyle === true ? `${use.screen ?? ''}.${use.style ?? ''}` : (use.style ?? ''));
      else if (use.screen !== undefined && use.element !== undefined && (use.shape === 'prop' || use.shape === 'style-font')) addOnce(elements, name, `${use.screen}.${use.element}`);
    }
  }
  const names = new Set([...elements.keys(), ...localStyles.keys(), ...globalStyles.keys()]);
  return new Map([...names].map((name) => [name, { elements: elements.get(name) ?? [], styles: [...(localStyles.get(name) ?? []), ...(globalStyles.get(name) ?? [])] }]));
}

/** @brief Each font's users, by font name; a font nobody uses has no entry. */
export function fontUsers(refs: ReferenceIndex): Map<string, AssetUsers> {
  return usersOfType(refs, 'font');
}

/** @brief Each image's users, by image name; an image nobody uses has no entry. */
export function imageUsers(refs: ReferenceIndex): Map<string, AssetUsers> {
  return usersOfType(refs, 'image');
}

/** One user of a name, as a "Used by" list shows it. */
export interface NameUser {
  /** `screen.element`, `widget.element`, `style name`, or the file. */
  readonly label: string;
  /** The first reference behind it, for going to it. */
  readonly reference: Reference;
  /** How many references it makes. */
  readonly count: number;
}

// userLabel
// How a list names the user a reference belongs to.
function userLabel(reference: Reference): string {
  if (reference.style !== undefined) return reference.localStyle === true ? `style ${reference.screen ?? ''}.${reference.style}` : `style ${reference.style}`;
  if (reference.screen !== undefined && reference.element !== undefined) return `${reference.screen}.${reference.element}`;
  if (reference.widget !== undefined) return reference.element !== undefined ? `${reference.widget}.${reference.element}` : `widget ${reference.widget}`;
  return reference.file;
}

/**
 * @brief Every user of one name, each once, in file then document order.
 *
 * @param refs The project's references.
 * @param kind What the name is.
 * @param name The name.
 */
export function nameUsers(refs: ReferenceIndex, kind: ReferenceKind, name: string): NameUser[] {
  const users = new Map<string, NameUser>();
  for (const reference of refs.of(kind, name).uses) {
    const label = userLabel(reference);
    const known = users.get(label);
    users.set(label, known === undefined ? { label, reference, count: 1 } : { ...known, count: known.count + 1 });
  }
  return [...users.values()];
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

/** The kind of name each globals.xml item declares, by its vocabulary id. */
const ITEM_KINDS: Readonly<Record<string, ReferenceKind>> = {
  'subject-int': 'subject',
  'subject-string': 'subject',
  'subject-bool': 'subject',
  'subject-time': 'subject',
  'const-int': 'const',
  'const-string': 'const',
  style: 'style',
  'font-builtin': 'font',
  'font-bdf': 'font',
  'image-xbm': 'image',
  'image-convert': 'image',
};

/** How a refusal names each kind. */
const KIND_NOUNS: Readonly<Record<ReferenceKind, string>> = { subject: 'Subject', const: 'Constant', style: 'Style', font: 'Font', image: 'Image' };

/** @brief The kind of name a globals.xml item declares, or undefined for one that declares none this guards. */
export function kindOfItem(node: FormNode): ReferenceKind | undefined {
  return ITEM_KINDS[node.element.id];
}

/**
 * @brief Why a globals.xml item may not be removed now: it is still used, and
 *        the reason names its users.
 *
 * Fonts and images count the users `fontUsers()` and `imageUsers()` list;
 * subjects, styles and constants, every use the reference finder reports
 * (bindings, typed props and defaults, style references, `#name` tokens). A
 * global style's uses on a screen that shadows it are that screen's own
 * style's, so they do not hold it. Every globals kind is then guarded.
 *
 * @param refs The project's references now; undefined before the first run.
 * @param node The item.
 * @return The refusal, or undefined when it may be removed.
 */
export function removeRefusal(refs: ReferenceIndex | undefined, node: FormNode): string | undefined {
  const kind = kindOfItem(node);
  if (refs === undefined || kind === undefined) return undefined;
  const name = node.fields.find((field) => field.attribute.name === 'name')?.value ?? '';
  let names: string[];
  if (kind === 'font' || kind === 'image') {
    const users = (kind === 'font' ? fontUsers : imageUsers)(refs).get(name);
    names = users === undefined ? [] : [...users.elements, ...users.styles.map((style) => `style ${style}`)];
  } else {
    names = nameUsers(refs, kind, name).map((user) => user.label);
  }
  if (names.length === 0) return undefined;
  return `${KIND_NOUNS[kind]} '${name}' is still used by ${names.join(', ')}. Change ${names.length === 1 ? 'it' : 'them'} first, then remove it.`;
}
