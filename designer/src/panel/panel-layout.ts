/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/panel/panel-layout.ts
 * Purpose: Decides which fields the property panel shows for an element, and
 *          in what order, from its effective manifest and nothing else
 *          ([UD-5]). There is no per-widget code: a custom widget gets the same
 *          panel a framework one does, because both are only manifests
 *          ([D-17]). It is the one place the panel's order is decided, so the
 *          schema decision at checkpoint C4 (EDITOR-DESIGN §8) has one thing to
 *          change.
 * Description: EDITOR-DESIGN §8's order without the schema's `group=`:
 *              geometry first, in pairs (`x`/`y`, `width`/`height`,
 *              `right`/`bottom`, whichever the manifest declares); then the
 *              element's own props in its manifest's declaration order, then
 *              any inherited from an ancestor between it and the root; then,
 *              in a group of their own, the props inherited from the root
 *              class, headed *From u8g2gl_obj* ([Q-10]). Bindings follow the
 *              props of the section their declaring manifest puts them in, one
 *              field per attribute however many subject types it accepts.
 *              A drawing element extends nothing ([D-18]), so it has no
 *              inherited group. Pure: no React, no Monaco.
 *
 * Exports:
 * - FieldKind:          A prop or a binding
 * - FieldSpec:          One field: the attribute and what the manifest says of it
 * - SectionId:          Which of the three sections a field is in
 * - PanelSection:       A section's title and its rows of one or two fields
 * - PanelLayout:        Every section for one element
 * - GEOMETRY_PAIRS:     The geometry props, paired as the panel shows them
 * - INHERITED_TITLE:    The inherited group's heading
 * - panelLayout():      The layout for an effective manifest
 * - sharedLayout():     The fields several layouts have in common
 */

import { isDrawingElement, ROOT_CLASS_MANIFEST, type EffectiveManifest, type ManifestOrigin } from '@u8g2gl/core/manifest/index.js';
import { COLOR_VALUES } from '@u8g2gl/core/schema/globals.js';
import type { PropType } from '@u8g2gl/core/schema/widget-manifest.js';

/** Whether a field is a `<prop>` or a `<bind>` attribute. */
export type FieldKind = 'prop' | 'binding';

/** One field: an attribute of the element, as its manifest declares it. */
export interface FieldSpec {
  /** The attribute's name, which is also the field's identity. */
  readonly key: string;
  readonly kind: FieldKind;
  /** The prop's type; a binding's field edits a `subject`. */
  readonly type: PropType;
  /** The subject types a binding accepts, in declaration order; empty for a prop. */
  readonly subjectTypes: readonly string[];
  /** An enum's members, or the draw colours; empty otherwise. */
  readonly options: readonly string[];
  /** The manifest's default, shown greyed while the attribute is not written. */
  readonly default: string | undefined;
  readonly required: boolean;
  /** The manifest's help text, as its author wrote it. */
  readonly help: string | undefined;
  /** The tag of the manifest that declared it. */
  readonly source: string;
}

/** Which section a field is in. */
export type SectionId = 'geometry' | 'element' | 'inherited';

/** A section of the panel: rows of one field, or of a geometry pair. */
export interface PanelSection {
  readonly id: SectionId;
  readonly title: string;
  /** Rows in display order; a geometry row may hold two fields side by side. */
  readonly rows: readonly (readonly FieldSpec[])[];
}

/** The panel for one element, or the fields several have in common. */
export interface PanelLayout {
  /** The element's tag; for several, the first one's. */
  readonly tag: string;
  /** Where its manifest was declared; undefined for an unknown tag. */
  readonly origin: ManifestOrigin | undefined;
  /** A drawing element: no class, no inherited group ([D-18]). */
  readonly drawing: boolean;
  /** Non-empty sections, in display order. */
  readonly sections: readonly PanelSection[];
}

/**
 * The geometry props, paired (ui_spec §9.1: "coordinates grouped as x/y and
 * w/h pairs"). Generic names every element's placement uses (§7.2), never a
 * widget's: an element that declares none of them has no geometry section.
 */
export const GEOMETRY_PAIRS: readonly (readonly [string, string])[] = [
  ['x', 'y'],
  ['width', 'height'],
  ['right', 'bottom'],
];

/** The inherited group's heading ([Q-10]). */
export const INHERITED_TITLE = `From ${ROOT_CLASS_MANIFEST}`;

/** Every geometry prop name, for membership tests. */
const GEOMETRY_NAMES: ReadonlySet<string> = new Set(GEOMETRY_PAIRS.flat());

/**
 * @brief The panel layout for an element's effective manifest.
 *
 * @param manifest The effective manifest (`ManifestRegistry.get()`).
 * @return Its sections: geometry, the element's own fields, and the root
 *         class's inherited fields. Empty sections are left out.
 */
export function panelLayout(manifest: EffectiveManifest): PanelLayout {
  // --- Step 1: One spec per prop, and one per binding attribute ---
  const props = manifest.api.props.map((prop, i): FieldSpec => ({
    key: prop.name,
    kind: 'prop',
    type: prop.type,
    subjectTypes: [],
    options: optionsOf(prop.type, prop.values),
    default: prop.default,
    required: prop.required === true,
    help: prop.help,
    source: manifest.propSources[i] ?? manifest.name,
  }));
  const bindings = bindingSpecs(manifest);

  // --- Step 2: Geometry first, in pairs, whoever declared it ---
  const byKey = new Map(props.map((spec) => [spec.key, spec]));
  const geometry = GEOMETRY_PAIRS.map((pair) => pair.flatMap((name) => byKey.get(name) ?? [])).filter((row) => row.length > 0);

  // --- Step 3: The element's own, in its declaration order, then intermediate ancestors' ---
  // Effective order puts an override in its parent's slot; the panel shows the
  // element's own props as its author ordered them, which says more about
  // what matters to it (EDITOR-DESIGN §8).
  const rest = props.filter((spec) => !GEOMETRY_NAMES.has(spec.key));
  const declaredOrder = new Map(manifest.declared.api.props.map((prop, i) => [prop.name, i]));
  const own = rest
    .filter((spec) => spec.source === manifest.name)
    .sort((a, b) => (declaredOrder.get(a.key) ?? 0) - (declaredOrder.get(b.key) ?? 0));
  // The root class's own panel has nothing inherited to set apart.
  const isRootField = (spec: FieldSpec): boolean => spec.source === ROOT_CLASS_MANIFEST && manifest.name !== ROOT_CLASS_MANIFEST;
  const between = rest.filter((spec) => spec.source !== manifest.name && !isRootField(spec));
  const fromRoot = rest.filter(isRootField);

  // --- Step 4: The sections, each binding after its section's props ---
  const sections: PanelSection[] = [
    { id: 'geometry', title: 'Geometry', rows: geometry },
    { id: 'element', title: 'Properties', rows: [...own, ...between, ...bindings.filter((spec) => !isRootField(spec))].map((spec) => [spec]) },
    { id: 'inherited', title: INHERITED_TITLE, rows: [...fromRoot, ...bindings.filter(isRootField)].map((spec) => [spec]) },
  ];
  return {
    tag: manifest.name,
    origin: manifest.origin,
    drawing: isDrawingElement(manifest.declared),
    sections: sections.filter((section) => section.rows.length > 0),
  };
}

/**
 * @brief The fields every one of several layouts has, for a multi-selection
 *        (ui_spec §9.4): the first layout's sections and order, keeping each
 *        field the others also have with the same kind and type.
 *
 * @param layouts One layout per selected element; at least one.
 * @return The shared layout; with one layout, that layout.
 */
export function sharedLayout(layouts: readonly PanelLayout[]): PanelLayout {
  const [first, ...others] = layouts;
  if (first === undefined) throw new RangeError('sharedLayout needs at least one layout');
  if (others.length === 0) return first;
  const fieldsOf = (layout: PanelLayout): Map<string, FieldSpec> =>
    new Map(layout.sections.flatMap((section) => section.rows.flat()).map((spec) => [spec.key, spec]));
  const otherFields = others.map(fieldsOf);
  const shared = (spec: FieldSpec): boolean =>
    otherFields.every((fields) => {
      const other = fields.get(spec.key);
      return other !== undefined && other.kind === spec.kind && other.type === spec.type;
    });
  const sections = first.sections
    .map((section) => ({ ...section, rows: section.rows.map((row) => row.filter(shared)).filter((row) => row.length > 0) }))
    .filter((section) => section.rows.length > 0);
  return { ...first, drawing: layouts.every((layout) => layout.drawing), sections };
}

// optionsOf
// The fixed choices a type offers: an enum's declared members, or the draw
// colours for `color` (the one list, core/schema/globals.ts).
//   type   — the prop's type
//   values — its `values=`, comma-separated, for an enum
function optionsOf(type: PropType, values: string | undefined): readonly string[] {
  if (type === 'enum') {
    return (values ?? '')
      .split(',')
      .map((member) => member.trim())
      .filter((member) => member !== '');
  }
  return type === 'color' ? COLOR_VALUES : [];
}

// bindingSpecs
// One field per binding attribute. `bind_text` is declared once per subject
// type it accepts (§8.4); the panel offers one dropdown for it, filtered to
// any of those types. The field's source is the nearest manifest that
// declared any of its overloads, so a widget that redeclares it owns it.
//   manifest — the effective manifest
function bindingSpecs(manifest: EffectiveManifest): FieldSpec[] {
  const specs = new Map<string, { types: string[]; sources: string[] }>();
  manifest.api.bindings.forEach((binding, i) => {
    const entry = specs.get(binding.name) ?? { types: [], sources: [] };
    if (!entry.types.includes(binding.type)) entry.types.push(binding.type);
    entry.sources.push(manifest.bindingSources[i] ?? manifest.name);
    specs.set(binding.name, entry);
  });
  return [...specs].map(([name, { types, sources }]) => ({
    key: name,
    kind: 'binding',
    type: 'subject',
    subjectTypes: types,
    options: [],
    default: undefined,
    required: false,
    help: `Binds to a ${types.join(' or ')} subject; its value replaces the literal while bound (§8.4).`,
    source: sources.includes(manifest.name) ? manifest.name : (sources[0] ?? manifest.name),
  }));
}
