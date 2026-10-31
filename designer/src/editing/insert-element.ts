/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/editing/insert-element.ts
 * Purpose: What dropping a Palette tag on the canvas writes: one new element,
 *          in the right container, at the drop point, with a valid generated
 *          name and just enough attributes to validate and be seen — or, when
 *          no such element would validate, a refusal saying why. Deciding this
 *          apart from the pointer lets every rule be tested on text.
 * Description: The plan, in order:
 *              - **Container:** the innermost element under the drop point
 *                that already has element children in the XML — children that
 *                are elements the registry knows, not `<style>` or bindings —
 *                else the screen's `<view>`. Deterministic and needing no
 *                manifest flag: a label never gains a child from a drop.
 *              - **Position:** the drop point relative to that container's
 *                corner — the corner its existing children are placed from —
 *                rounded to integers by the caller.
 *              - **Attributes:** `name` (`element-names.ts`); `x`, `y`,
 *                `width`, `height` where the manifest declares them, the size
 *                at its manifest default or {@link INSERT_SIZE}; then every
 *                prop the manifest marks required, at its default or the
 *                simplest value of its type (`font`: the first global font,
 *                else the first built-in; `image`, `style`, `subject`: the
 *                first declared, else left out so the validator says why).
 *              - **Endpoints and radii:** a required `int` the resolver reads
 *                as a point or a length (its extras, not a list of names) is
 *                seeded so the element spans {@link INSERT_SIZE} from the drop
 *                point; any other required `int` is 0.
 *              - **Validation:** the project with the insert is run through the
 *                live pipeline; an error the current text does not already have
 *                refuses the drop, with that error's message as the reason.
 *              The element goes in as its container's last child, so it is
 *              drawn on top, through the CST's `insertElement`, which copies
 *              the siblings' indentation.
 *
 * Exports:
 * - INSERT_SIZE:      The size an inserted element gets with no manifest default
 * - InsertRequest:    What a drop reads
 * - InsertPlan:       The edit and the new name, or the refusal
 * - planInsert():     Plan one drop
 */

import { applyEdits, encodeAttributeValue, insertElement, parseCst, type CstElement, type TextEdit } from '@u8g2gl/core/cst/index.js';
import type { EffectiveManifest, ManifestRegistry } from '@u8g2gl/core/manifest/index.js';
import { createScreenPipeline, findTargetDisplay, type ResolvedElement } from '@u8g2gl/core/resolver/index.js';
import type { Globals } from '@u8g2gl/core/schema/globals.js';
import type { PropDef } from '@u8g2gl/core/schema/widget-manifest.js';
import BUILTIN_FONTS from '@u8g2gl/data/u8g2-fonts.json' with { type: 'json' };
import { nextElementName, projectNames } from '../documents/element-names';
import { runTextPipeline, type CompiledAssets, type Rect, type TextPipelineResult } from '../pipeline/live-pipeline';
import { ProjectModelCache } from '../project/project-model';

/**
 * The size, in device pixels, an inserted element is given on an axis its
 * manifest declares but sets no default for: visible, grabbable by its
 * handles, and one 8-pixel tile high.
 */
export const INSERT_SIZE = { width: 16, height: 8 } as const;

/** What a drop reads. */
export interface InsertRequest {
  /** The tag dropped. */
  readonly tag: string;
  /** The screen file the canvas draws. */
  readonly file: string;
  /** The drop point in device pixels, integers. */
  readonly x: number;
  readonly y: number;
  /** Every project document's current text. */
  readonly texts: ReadonlyMap<string, string>;
  /** The latest pipeline run of those texts: its model, diagnostics, rectangles and placements. */
  readonly base: TextPipelineResult;
  /** The compiled assets that run used. */
  readonly assets: CompiledAssets | undefined;
}

/** The outcome of a drop: one edit and the element's name, or why not. */
export type InsertPlan =
  | { readonly kind: 'insert'; readonly name: string; readonly text: string; readonly edits: readonly TextEdit[] }
  | { readonly kind: 'refused'; readonly reason: string };

// widgetChildren
// An element's children that are elements the registry knows: what makes it a
// container in the XML. `<style>`, bindings and events are not.
function widgetChildren(element: CstElement, registry: ManifestRegistry): CstElement[] {
  return element.children.filter((child): child is CstElement => child.kind === 'element' && registry.has(child.name));
}

// nameOf
// An element's written `name`, if any.
function nameOf(element: CstElement): string | undefined {
  return element.attributes.find((attr) => attr.name === 'name')?.value;
}

// contains
// Whether device pixel (x, y) is inside `rect`, half-open as it is drawn.
function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

// innermostContainer
// The deepest element under (x, y) that already has element children, or
// undefined for none. Depth-first, so a nested container wins over its parent.
//   element  — the subtree's root (the `<view>` to start)
//   registry — what counts as an element child
//   bounds   — the drawn rectangles by name
function innermostContainer(element: CstElement, registry: ManifestRegistry, bounds: ReadonlyMap<string, Rect>, x: number, y: number): CstElement | undefined {
  let found: CstElement | undefined;
  for (const child of widgetChildren(element, registry)) {
    const name = nameOf(child);
    const rect = name === undefined ? undefined : bounds.get(name);
    const inner = innermostContainer(child, registry, bounds, x, y);
    if (inner !== undefined) found = inner;
    else if (rect !== undefined && contains(rect, x, y) && widgetChildren(child, registry).length > 0) found = child;
  }
  return found;
}

// simplestValue
// A required prop's value with no manifest default: the simplest of its type.
// Undefined when the project declares nothing of a kind it names, so the
// attribute is left out and the validator says what is missing.
//   prop    — the prop
//   globals — the project's declarations
function simplestValue(prop: PropDef, globals: Globals): string | undefined {
  switch (prop.type) {
    case 'int':
      return '0';
    case 'bool':
      return 'false';
    case 'enum':
      return prop.values?.split(',')[0]?.trim() ?? '';
    case 'color':
      return '1';
    case 'font':
      return globals.fonts[0]?.name ?? BUILTIN_FONTS[0];
    case 'image':
      return globals.images[0]?.name;
    case 'style':
      return globals.styles[0]?.name;
    case 'subject':
      return globals.subjects[0]?.name;
    default:
      return '';
  }
}

// attributesFor
// The new element's attributes in the order they are written: name, the
// rectangle the manifest declares, then its required props.
//   manifest — the element's effective manifest
//   name     — its generated name
//   x, y     — its position in its container
//   globals  — the project's declarations
function attributesFor(manifest: EffectiveManifest, name: string, x: number, y: number, globals: Globals): [string, string][] {
  const declared = (attribute: string): PropDef | undefined => manifest.api.props.find((prop) => prop.name === attribute);
  const attributes: [string, string][] = [['name', name]];
  const rectangle: [string, string][] = [
    ['x', String(x)],
    ['y', String(y)],
    ['width', declared('width')?.default ?? String(INSERT_SIZE.width)],
    ['height', declared('height')?.default ?? String(INSERT_SIZE.height)],
  ];
  for (const [attribute, value] of rectangle) if (declared(attribute) !== undefined) attributes.push([attribute, value]);
  for (const prop of manifest.api.props) {
    if (prop.required !== true || attributes.some(([attribute]) => attribute === prop.name)) continue;
    const value = prop.default ?? simplestValue(prop, globals);
    if (value !== undefined) attributes.push([prop.name, value]);
  }
  return attributes;
}

// findResolved
// The resolved element written with `name`, at any depth.
function findResolved(elements: readonly ResolvedElement[], name: string): ResolvedElement | undefined {
  for (const element of elements) {
    if (element.node.attributes.name === name) return element;
    const inner = findResolved(element.children, name);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

// seedExtras
// Required endpoints and radii, written as 0 in a first draft, set from what
// the resolver reads them as: points spread over INSERT_SIZE from (x, y) — the
// first at the drop point, the next at the far corner, the third back under
// the first, so a line runs corner to corner and a triangle is not collinear —
// and lengths at half the size along the axes they span.
//   texts    — the project with the draft
//   name     — the new element
//   x, y     — its position in its container
//   seeded   — the attributes written as 0 that may be seeded; rewritten in place
function seedExtras(texts: ReadonlyMap<string, string>, name: string, x: number, y: number, seeded: [string, string][]): void {
  const model = new ProjectModelCache().build(texts);
  const display = findTargetDisplay(model.project.targets[0], model.catalogue);
  const pipeline = createScreenPipeline({ globals: model.globals, screens: model.screens, manifests: model.manifests, ...(display !== undefined ? { display } : {}) });
  const resolved = pipeline.resolution.screens.map((screen) => findResolved(screen.elements, name)).find((element) => element !== undefined);
  const index = { horizontal: 0, vertical: 0 };
  for (const extra of resolved?.extras ?? []) {
    const entry = seeded.find(([attribute]) => attribute === extra.attribute);
    if (entry === undefined) continue;
    if (extra.kind === 'point' && extra.axis !== undefined) {
      const i = index[extra.axis]++;
      entry[1] = extra.axis === 'horizontal' ? String(x + (i % 2 === 1 ? INSERT_SIZE.width - 1 : 0)) : String(y + (i === 0 ? 0 : INSERT_SIZE.height - 1));
    } else if (extra.kind === 'length') {
      const spans = extra.spans ?? [];
      const half = Math.min(...spans.map((axis) => (axis === 'horizontal' ? INSERT_SIZE.width : INSERT_SIZE.height) / 2));
      entry[1] = String(Number.isFinite(half) ? half : INSERT_SIZE.height / 2);
    }
  }
}

// errorKeys
// Each error diagnostic as code and message, counted: what "the same error"
// means across two texts whose offsets differ by the insert.
function errorKeys(result: TextPipelineResult): Map<string, number> {
  const keys = new Map<string, number>();
  for (const d of result.diagnostics) {
    if (d.severity !== 'error') continue;
    const key = `${d.code}\n${d.message}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return keys;
}

/**
 * @brief Plans one drop of a Palette tag on the canvas.
 *
 * @param request The tag, the drop point and the project as it is now.
 * @return The edit to the screen's text and the element's name, or the reason
 *         nothing is inserted.
 */
export function planInsert(request: InsertRequest): InsertPlan {
  // --- Step 1: The element, and the screen it is dropped on ---
  const { tag, file, base } = request;
  const registry = base.model.manifests;
  const manifest = registry.get(tag);
  if (manifest === undefined) return { kind: 'refused', reason: `<${tag}> is not an element this project knows` };
  const text = request.texts.get(file);
  const cst = text === undefined ? undefined : parseCst(text, file).cst;
  const view = cst?.root?.name === 'screen' ? cst.root.children.find((child): child is CstElement => child.kind === 'element' && child.name === 'view') : undefined;
  if (text === undefined || cst === undefined || view === undefined) return { kind: 'refused', reason: `${file} has no <view> to insert into` };

  // --- Step 2: The container, and the corner its children are placed from ---
  const container = innermostContainer(view, registry, base.bounds, request.x, request.y) ?? view;
  let origin = { x: 0, y: 0 };
  if (container !== view) {
    const sibling = widgetChildren(container, registry)
      .map((child) => nameOf(child))
      .map((name) => (name === undefined ? undefined : base.placements.get(name)))
      .find((placement) => placement !== undefined);
    const own = base.bounds.get(nameOf(container) ?? '');
    origin = sibling?.origin ?? (own === undefined ? origin : { x: own.x, y: own.y });
  }
  const x = request.x - origin.x;
  const y = request.y - origin.y;

  // --- Step 3: The attributes, a draft of the text, and its seeded extras ---
  const name = nextElementName(tag, projectNames(base.model));
  const attributes = attributesFor(manifest, name, x, y, base.model.globals);
  const index = container.children.filter((child) => child.kind === 'element').length;
  const editsFor = (): TextEdit[] =>
    insertElement(cst, container, index, `<${tag} ${attributes.map(([attribute, value]) => `${attribute}="${encodeAttributeValue(value, '"')}"`).join(' ')} />`);
  const textsWith = (edits: readonly TextEdit[]): Map<string, string> => new Map([...request.texts, [file, applyEdits(text, edits)]]);
  const required = attributes.filter(([attribute]) => manifest.api.props.some((prop) => prop.name === attribute && prop.required === true && prop.type === 'int' && prop.default === undefined));
  if (required.length > 0) seedExtras(textsWith(editsFor()), name, x, y, required);
  const edits = editsFor();

  // --- Step 4: Refused if the project with it has an error it does not have now ---
  const after = runTextPipeline({ texts: textsWith(edits), cache: new ProjectModelCache(), assets: request.assets, activeFile: file });
  const before = errorKeys(base);
  for (const [key, count] of errorKeys(after)) {
    if (count > (before.get(key) ?? 0)) return { kind: 'refused', reason: key.slice(key.indexOf('\n') + 1) };
  }
  return { kind: 'insert', name, text, edits };
}
