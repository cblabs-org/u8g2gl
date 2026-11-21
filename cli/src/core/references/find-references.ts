/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/references/find-references.ts
 * Purpose: Answers "where is this name used?" for the five kinds of name
 *          `globals.xml` declares — subjects, constants, styles, fonts and
 *          images — with the file and the exact text of every use. The
 *          designer's "Used by" lists, its removal guards and its rename all
 *          read it, and a later CLI `rename` can, so they cannot disagree
 *          about what a reference is. Renaming is only safe when every
 *          reference is found structurally, never by searching text: a text
 *          search for `margin` also finds `margin_top`.
 * Description: Pure and read-only over the project's texts, parsed into CSTs
 *              (`core/cst/`), because a reference must come with the offsets
 *              of the text to replace, which the parsed model has forgotten.
 *              Files are told apart by their root element, so a widget
 *              manifest is found wherever it lives. The shapes:
 *              - subjects: `bind_*` attributes (not `_fmt`), and
 *                `<bind_flag_if_*> subject=`;
 *              - every kind but constants: a prop whose manifest types it
 *                `subject`, `style`, `font` or `image` ([D-17]: which props
 *                these are is the manifests' data), on an instance or as the
 *                prop's `default` in a widget's `<api>`;
 *              - styles: `<style name>` children, and `style=` and
 *                `focus_style=` on any element;
 *              - fonts: `style_font=` overrides, and the `font` of a style,
 *                global or screen-local;
 *              - constants: each `#name` the resolver's expression tokeniser
 *                reads in any attribute value (`constantTokens()`), never a
 *                substring, and never in a constant's own value, which §7.2
 *                makes a literal.
 *              A value written as a `$prop` is not yet a name and is skipped.
 *              A screen that declares a style of its own shadows a global one
 *              of the same name, as `validate-references.ts` resolves it: its
 *              references to that name are reported apart, as `shadowed`.
 *              A composite's template sees global styles only, so its
 *              references never are. Never throws for user input: a file
 *              that is not well-formed is listed as `unreadable`, with what
 *              its recovered tree still shows.
 *
 * Exports:
 * - ReferenceKind:      The five kinds of name
 * - ReferenceShape:     How a reference is written
 * - Reference:          One declaration or use, with its file and range
 * - NameReferences:     One name's declarations, uses and shadowed uses
 * - ReferenceInput:     The project's texts and manifests
 * - ReferenceIndex:     Every name's references, from one reading
 * - indexReferences():  Read every reference in the project once
 * - findReferences():   One name's references
 */

import { decodeEntities, parseCst, type CstAttribute, type CstElement, type CstRange } from '../cst/index.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import { BUILTIN_CONSTANTS, constantTokens } from '../resolver/expression.js';
import type { PropType } from '../schema/widget-manifest.js';

/** The five kinds of name `globals.xml` declares. */
export type ReferenceKind = 'subject' | 'const' | 'style' | 'font' | 'image';

/**
 * How a reference is written:
 * - `declaration`:   the `name` of its `globals.xml` declaration;
 * - `binding`:       a `bind_*="name"` attribute;
 * - `flag-binding`:  `<bind_flag_if_* subject="name">`;
 * - `prop`:          an instance's prop the manifest types as the kind;
 * - `prop-default`:  that prop's `default` in a widget's `<api>`;
 * - `style-child`:   `<style name="name" />` inside an element;
 * - `style-attribute`, `focus-style`: `style=` and `focus_style=` on an element;
 * - `style-font`:    a `style_font=` override on an element;
 * - `style-declaration-font`: the `font` of a `<style>`, global or screen-local;
 * - `constant`:      a `#name` token in an attribute value.
 */
export type ReferenceShape =
  | 'declaration'
  | 'binding'
  | 'flag-binding'
  | 'prop'
  | 'prop-default'
  | 'style-child'
  | 'style-attribute'
  | 'focus-style'
  | 'style-font'
  | 'style-declaration-font'
  | 'constant';

/** One declaration or use of a name. */
export interface Reference {
  readonly kind: ReferenceKind;
  readonly name: string;
  readonly shape: ReferenceShape;
  /** The project path it is written in. */
  readonly file: string;
  /** Exactly the text to replace to rename it: the name, without any `#`. */
  readonly range: CstRange;
  /** The attribute it is written in. */
  readonly attribute: string;
  /** The tag of the element the attribute is on (`style` for a `<style>` child). */
  readonly tag: string;
  /**
   * The element it belongs to, by name, when it is inside a `<view>`: for a
   * `<style>` child, a `<bind_flag_if_*>` or a static child, its parent element.
   */
  readonly element?: string;
  /** That element's own range, to select or highlight it. */
  readonly elementRange?: CstRange;
  /** The screen's name, when it is written in a screen. */
  readonly screen?: string;
  /** The widget's name, when it is written in a widget manifest. */
  readonly widget?: string;
  /** For a style's `font` or a `#name` in a style: the style's name. */
  readonly style?: string;
  /** For the same: whether that style is a screen's own. */
  readonly localStyle?: boolean;
}

/** One name's references. */
export interface NameReferences {
  /** Its declarations in `globals.xml`: one, unless it is declared twice. */
  readonly declarations: readonly Reference[];
  /** Every use of it, in file then document order. */
  readonly uses: readonly Reference[];
  /**
   * For a style: uses on screens that declare a style of their own of the same
   * name, which therefore mean that one, not this. Neither its users nor
   * renamed with it.
   */
  readonly shadowed: readonly Reference[];
  /** The screen files that shadow a style, in path order. */
  readonly shadowingFiles: readonly string[];
}

/** What the finder reads. */
export interface ReferenceInput {
  /** Every project document's text, by project path. */
  readonly documents: ReadonlyMap<string, string>;
  /** The elements' manifests, for which props are typed subject, style, font or image. */
  readonly manifests: Pick<ManifestRegistry, 'get'>;
}

/** Every name's references, from one reading of the project. */
export interface ReferenceIndex {
  /** One name's references; empty lists for a name nobody declares or uses. */
  of(kind: ReferenceKind, name: string): NameReferences;
  /** Every name of a kind that is declared or used, in first-seen order. */
  names(kind: ReferenceKind): readonly string[];
  /** The files that are not well-formed XML, in path order. */
  readonly unreadable: readonly string[];
  /** The screen-local style names, by screen file. */
  readonly localStyles: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Nothing. */
const NONE: NameReferences = { declarations: [], uses: [], shadowed: [], shadowingFiles: [] };

/** The `globals.xml` groups, and the kind of name each one declares. */
const DECLARATION_GROUPS: Readonly<Record<string, ReferenceKind>> = {
  subjects: 'subject',
  consts: 'const',
  styles: 'style',
  fonts: 'font',
  images: 'image',
};

/** The manifest prop types that are references, and the kind each names. */
const PROP_KINDS: Partial<Readonly<Record<PropType, ReferenceKind>>> = {
  subject: 'subject',
  style: 'style',
  font: 'font',
  image: 'image',
};

/** The event children an element may carry (§12.3): directives, not elements. */
const EVENT_TAGS: ReadonlySet<string> = new Set(['screen_load_event', 'screen_back_event', 'event_cb']);

/** Where a file's references are being collected. */
interface FileScope {
  readonly file: string;
  readonly screen?: string;
  readonly widget?: string;
}

/** The view element a reference belongs to. */
interface Owner {
  readonly name: string;
  readonly range: CstRange;
}

// elementChildren
// An element's element children, in document order.
function elementChildren(element: CstElement): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element');
}

// attributeValue
// An attribute's decoded value, by name.
function attributeValue(element: CstElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

// rawOffsets
// For each code unit of an attribute's decoded value, the offset in the file
// of the raw text it came from: an entity reference decodes to fewer code
// units than it is written with, so a decoded offset is not a raw one.
//   attribute — the attribute, with its raw value and where it starts
function rawOffsets(attribute: CstAttribute): number[] {
  const offsets: number[] = [];
  const raw = attribute.rawValue;
  const entity = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/y;
  for (let i = 0; i < raw.length; ) {
    entity.lastIndex = i;
    const match = raw[i] === '&' ? entity.exec(raw) : null;
    const written = match?.[0] ?? raw.charAt(i);
    for (let unit = 0; unit < decodeEntities(written).length; unit++) offsets.push(attribute.valueRange.start + i);
    i += written.length;
  }
  offsets.push(attribute.valueRange.end);
  return offsets;
}

/** Collects references as one reading walks the project. */
class Collector {
  private readonly byKind = new Map<ReferenceKind, Map<string, { declarations: Reference[]; uses: Reference[]; shadowed: Reference[] }>>();
  readonly localStyles = new Map<string, Set<string>>();

  // entry
  // A name's lists, made on first sight.
  private entry(kind: ReferenceKind, name: string): { declarations: Reference[]; uses: Reference[]; shadowed: Reference[] } {
    let names = this.byKind.get(kind);
    if (names === undefined) this.byKind.set(kind, (names = new Map()));
    let lists = names.get(name);
    if (lists === undefined) names.set(name, (lists = { declarations: [], uses: [], shadowed: [] }));
    return lists;
  }

  /** @brief Records a whole-value reference: the attribute's value is the name. */
  whole(scope: FileScope, kind: ReferenceKind, shape: ReferenceShape, element: CstElement, attribute: CstAttribute, owner: Owner | undefined, extra: Partial<Reference> = {}): void {
    const name = attribute.value;
    // --- A `$prop` is a template's placeholder, not yet a name ---
    if (name === '' || name.startsWith('$')) return;
    const reference: Reference = {
      kind,
      name,
      shape,
      file: scope.file,
      range: attribute.valueRange,
      attribute: attribute.name,
      tag: element.name,
      ...(owner !== undefined ? { element: owner.name, elementRange: owner.range } : {}),
      ...(scope.screen !== undefined ? { screen: scope.screen } : {}),
      ...(scope.widget !== undefined ? { widget: scope.widget } : {}),
      ...extra,
    };
    const lists = this.entry(kind, name);
    if (shape === 'declaration') lists.declarations.push(reference);
    else if (kind === 'style' && this.localStyles.get(scope.file)?.has(name) === true) lists.shadowed.push(reference);
    else lists.uses.push(reference);
  }

  /** @brief Records every `#name` token the expression tokeniser reads in an attribute's value. */
  constants(scope: FileScope, element: CstElement, attribute: CstAttribute, owner: Owner | undefined, extra: Partial<Reference> = {}): void {
    if (!attribute.value.includes('#')) return;
    const tokens = constantTokens(attribute.value);
    if (tokens === undefined) return;
    const offsets = tokens.length > 0 ? rawOffsets(attribute) : [];
    for (const token of tokens) {
      // #screen_* and #parent_* are the resolver's, never a <const>'s (§7.2).
      if (BUILTIN_CONSTANTS.includes(token.name)) continue;
      const start = offsets[token.start];
      const end = offsets[token.end];
      if (start === undefined || end === undefined) continue;
      this.entry('const', token.name).uses.push({
        kind: 'const',
        name: token.name,
        shape: 'constant',
        file: scope.file,
        range: { start, end },
        attribute: attribute.name,
        tag: element.name,
        ...(owner !== undefined ? { element: owner.name, elementRange: owner.range } : {}),
        ...(scope.screen !== undefined ? { screen: scope.screen } : {}),
        ...(scope.widget !== undefined ? { widget: scope.widget } : {}),
        ...extra,
      });
    }
  }

  /** @brief The index of what was collected. */
  index(unreadable: readonly string[]): ReferenceIndex {
    const localStyles = this.localStyles;
    const byKind = this.byKind;
    return {
      unreadable,
      localStyles,
      of: (kind, name) => {
        const lists = byKind.get(kind)?.get(name);
        if (lists === undefined) return NONE;
        const shadowingFiles = [...new Set(lists.shadowed.map((reference) => reference.file))];
        // Shadowing is by screen, so a screen that declares the name but never
        // uses it still keeps the global from it: it is listed too.
        if (kind === 'style') for (const [file, names] of localStyles) if (names.has(name) && !shadowingFiles.includes(file)) shadowingFiles.push(file);
        return { declarations: lists.declarations, uses: lists.uses, shadowed: lists.shadowed, shadowingFiles: shadowingFiles.sort() };
      },
      names: (kind) => [...(byKind.get(kind)?.keys() ?? [])],
    };
  }
}

// collectGlobals
// globals.xml: each group's declarations, every style's font, and any `#name`
// in an attribute outside <consts>.
function collectGlobals(root: CstElement, scope: FileScope, into: Collector): void {
  for (const group of elementChildren(root)) {
    const kind = DECLARATION_GROUPS[group.name];
    for (const item of elementChildren(group)) {
      const name = item.attributes.find((attribute) => attribute.name === 'name');
      if (kind !== undefined && name !== undefined) into.whole(scope, kind, 'declaration', item, name, undefined);
      for (const attribute of item.attributes) {
        if (attribute === name) continue;
        if (kind === 'style' && attribute.name === 'font') {
          into.whole(scope, 'font', 'style-declaration-font', item, attribute, undefined, { style: name?.value ?? '', localStyle: false });
        } else if (kind !== 'const') {
          into.constants(scope, item, attribute, undefined, kind === 'style' ? { style: name?.value ?? '', localStyle: false } : {});
        }
      }
    }
  }
}

// collectLocalStyles
// A screen's own <styles>: their names, which shadow global styles on this
// screen, and their fonts.
function collectLocalStyles(styles: CstElement, scope: FileScope, into: Collector): void {
  const names = into.localStyles.get(scope.file) ?? new Set<string>();
  for (const style of elementChildren(styles)) {
    const name = attributeValue(style, 'name') ?? '';
    if (name !== '') names.add(name);
    for (const attribute of style.attributes) {
      if (attribute.name === 'name') continue;
      if (attribute.name === 'font') into.whole(scope, 'font', 'style-declaration-font', style, attribute, undefined, { style: name, localStyle: true });
      else into.constants(scope, style, attribute, undefined, { style: name, localStyle: true });
    }
  }
  into.localStyles.set(scope.file, names);
}

// collectView
// A <view>'s elements, depth first: each element's attributes, and its
// <style>, <bind_flag_if_*>, event and static children.
//   parent — the element whose children these are, undefined at the view
function collectView(children: readonly CstElement[], parent: CstElement | undefined, input: ReferenceInput, scope: FileScope, into: Collector): void {
  const parentManifest = parent === undefined ? undefined : input.manifests.get(parent.name);
  const owner: Owner | undefined = parent === undefined ? undefined : { name: attributeValue(parent, 'name') ?? parent.name, range: { start: parent.start, end: parent.end } };
  for (const child of children) {
    // --- Step 1: Directives and static children belong to their parent ---
    if (child.name === 'style') {
      const name = child.attributes.find((attribute) => attribute.name === 'name');
      if (name !== undefined) into.whole(scope, 'style', 'style-child', child, name, owner);
      continue;
    }
    if (child.name.startsWith('bind_flag_if_')) {
      for (const attribute of child.attributes) {
        if (attribute.name === 'subject') into.whole(scope, 'subject', 'flag-binding', child, attribute, owner);
        else into.constants(scope, child, attribute, owner);
      }
      continue;
    }
    if (EVENT_TAGS.has(child.name) || parentManifest?.api.elements.some((element) => element.name === child.name) === true) {
      for (const attribute of child.attributes) into.constants(scope, child, attribute, owner);
      continue;
    }

    // --- Step 2: An element: each attribute by what it is ---
    const self: Owner = { name: attributeValue(child, 'name') ?? child.name, range: { start: child.start, end: child.end } };
    const props = input.manifests.get(child.name)?.api.props ?? [];
    for (const attribute of child.attributes) {
      if (attribute.name === 'name') continue;
      if (attribute.name.startsWith('bind_') && !attribute.name.endsWith('_fmt')) {
        into.whole(scope, 'subject', 'binding', child, attribute, self);
      } else if (attribute.name === 'style') {
        into.whole(scope, 'style', 'style-attribute', child, attribute, self);
      } else if (attribute.name === 'focus_style') {
        into.whole(scope, 'style', 'focus-style', child, attribute, self);
      } else if (attribute.name === 'style_font') {
        into.whole(scope, 'font', 'style-font', child, attribute, self);
      } else {
        const type = props.find((prop) => prop.name === attribute.name)?.type;
        const kind = type === undefined ? undefined : PROP_KINDS[type];
        if (kind !== undefined) into.whole(scope, kind, 'prop', child, attribute, self);
        else into.constants(scope, child, attribute, self);
      }
    }

    // --- Step 3: Its children ---
    collectView(elementChildren(child), child, input, scope, into);
  }
}

// collectWidget
// A widget manifest: its typed props' defaults, then its template.
function collectWidget(root: CstElement, input: ReferenceInput, scope: FileScope, into: Collector): void {
  for (const part of elementChildren(root)) {
    if (part.name === 'api') {
      for (const declaration of elementChildren(part)) {
        const type = attributeValue(declaration, 'type') as PropType | undefined;
        const kind = declaration.name === 'prop' && type !== undefined ? PROP_KINDS[type] : undefined;
        for (const attribute of declaration.attributes) {
          if (attribute.name === 'default' && kind !== undefined) into.whole(scope, kind, 'prop-default', declaration, attribute, undefined);
          else if (attribute.name === 'default') into.constants(scope, declaration, attribute, undefined);
        }
      }
    } else if (part.name === 'view') {
      collectView(elementChildren(part), undefined, input, scope, into);
    }
  }
}

// collectAttributesOnly
// Any other document (u8g2gl.xml): only `#name` tokens can be written in it.
function collectAttributesOnly(element: CstElement, scope: FileScope, into: Collector): void {
  for (const attribute of element.attributes) into.constants(scope, element, attribute, undefined);
  for (const child of elementChildren(element)) collectAttributesOnly(child, scope, into);
}

/**
 * @brief Reads every reference in the project, once.
 *
 * Files are read in path order, so every list is in file then document order
 * and the same texts always give the same index. A screen's own styles are
 * read before its view, so its references to them are known to be shadowed.
 *
 * @param input The project's texts and its manifests.
 * @return The index. A file that is not well-formed is in `unreadable`, and
 *         its recovered tree is still read.
 */
export function indexReferences(input: ReferenceInput): ReferenceIndex {
  const into = new Collector();
  const unreadable: string[] = [];
  const paths = [...input.documents.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const file of paths) {
    // --- Step 1: Parse; a file that is not well-formed is read as far as it goes ---
    const { cst, diagnostics } = parseCst(input.documents.get(file) ?? '', file);
    if (diagnostics.length > 0) unreadable.push(file);
    const root = cst.root;
    if (root === undefined) continue;

    // --- Step 2: By what the file is, which its root says ---
    if (root.name === 'globals') {
      collectGlobals(root, { file }, into);
    } else if (root.name === 'screen') {
      const scope: FileScope = { file, screen: attributeValue(root, 'name') ?? '' };
      const parts = elementChildren(root);
      for (const styles of parts.filter((part) => part.name === 'styles')) collectLocalStyles(styles, scope, into);
      for (const view of parts.filter((part) => part.name === 'view')) collectView(elementChildren(view), undefined, input, scope, into);
    } else if (root.name === 'widget') {
      collectWidget(root, input, { file, widget: attributeValue(root, 'name') ?? '' }, into);
    } else {
      collectAttributesOnly(root, { file }, into);
    }
  }
  return into.index(unreadable);
}

/**
 * @brief One name's references: a reading of the project for just that name.
 *
 * @param input The project's texts and its manifests.
 * @param kind  What the name is.
 * @param name  The name, without any `#`.
 */
export function findReferences(input: ReferenceInput, kind: ReferenceKind, name: string): NameReferences {
  return indexReferences(input).of(kind, name);
}
