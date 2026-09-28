/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-widget-tree.ts
 * Purpose: Recursively transforms raw XML element subtrees into typed WidgetNodes,
 *          enforcing [U-1] element identity under a caller-supplied missing-name
 *          policy. The policy is passed in rather than decided here because the
 *          CLI must refuse to invent identity while the designer must invent it
 *          and show the author — see name-policy.ts for the reasoning.
 * Description: Recognises one element vocabulary ([D-18]): a tag is either a
 *              drawing primitive that compiles to a `u8g2gl_draw_*` free-function
 *              call, a C++-backed widget, or a composite instance inlined at
 *              build time — the distinction is a generator outcome, never an
 *              authoring category, so this parser makes no tier decision at all.
 *              Extracts common layout coordinates, style overrides (`style_*`), reactive
 *              binding slots (`bind_*`), condition directives, and input event handlers.
 *              Under the `'generate'` policy an omitted name is synthesised as
 *              {tag}_{n} from a document-wide allocator — so synthesis can never
 *              manufacture a duplicate — and a write-back insertion is recorded.
 *              Under the default `'error'` policy nothing is synthesised.
 *
 * Exports:
 * - NameAllocator: Document-scoped pool of element names (opaque to callers)
 * - WidgetParseContext: Allocator, policy and edit sink shared by one document's parse
 * - createWidgetParseContext: Build a context seeded from a document's elements
 * - parseWidgetTree: Parse an array of child elements into WidgetNode AST nodes
 * - parseWidgetNode: Recursively parse a single element into a WidgetNode
 * - hiddenAttributeValue: The boolean rule for `hidden`, keeping a `$prop` placeholder as text
 */

import type {
  BindingChild,
  CommonAttributes,
  EventChild,
  EventTrigger,
  StyleChild,
  WidgetNode,
  WidgetNodeChild,
} from '../schema/widget-node.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { getAttributeValue, type RawXmlElement } from './raw-xml.js';
import {
  DEFAULT_MISSING_NAME_POLICY,
  createNameInsertion,
  type MissingNamePolicy,
  type ParseOptions,
  type SourceEdit,
} from './name-policy.js';

/**
 * Parses an inline <style name="..." /> child reference within a widget.
 */
function parseStyleChild(el: RawXmlElement): StyleChild {
  const name = getAttributeValue(el, 'name') ?? '';
  return {
    kind: 'style',
    name,
    loc: el.loc,
  };
}

/**
 * Parses conditional subject flag binding directives (<bind_flag_if_eq>, etc., §8.4).
 */
function parseBindingChild(el: RawXmlElement): BindingChild {
  const subject = getAttributeValue(el, 'subject') ?? '';
  const refVal =
    getAttributeValue(el, 'ref_value') ??
    getAttributeValue(el, 'value') ??
    getAttributeValue(el, 'refValue');
  const flag = getAttributeValue(el, 'flag');

  return {
    kind: 'binding',
    type: el.name,
    subject,
    value: refVal,
    refValue: refVal,
    flag,
    loc: el.loc,
  };
}

/**
 * Parses user action event handlers (<screen_load_event>, <screen_back_event>, <event_cb>, §12.3).
 */
function parseEventChild(el: RawXmlElement): EventChild {
  const trigger = (getAttributeValue(el, 'trigger') as EventTrigger) ?? 'press';
  const screen = getAttributeValue(el, 'screen');
  const callback = getAttributeValue(el, 'callback');

  return {
    kind: 'event',
    type: el.name as 'screen_load_event' | 'screen_back_event' | 'event_cb',
    trigger,
    screen,
    callback,
    loc: el.loc,
  };
}

/**
 * The document-wide name pool used to synthesise [U-1] fallback names.
 *
 * `taken` holds every element name known to the document — explicit names found
 * by the pre-pass plus every name synthesis has already issued. `nextIndex` is
 * only a search cursor per clean tag, so allocating N names costs O(N) rather
 * than O(N^2); correctness rests entirely on `taken`.
 */
export interface NameAllocator {
  readonly taken: Set<string>;
  readonly nextIndex: Map<string, number>;
}

/**
 * Everything one document's parse needs to decide element identity.
 *
 * Bundling the allocator with the policy and the edit sink is deliberate: they
 * have exactly the same lifetime (one screen or one component) and passing them
 * as one value makes it impossible to descend into a subtree with the right
 * allocator but the wrong policy.
 */
export interface WidgetParseContext {
  /** Document-scoped name pool, seeded with every explicit name in the document. */
  readonly allocator: NameAllocator;
  /** How an omitted `name` is handled. */
  readonly policy: MissingNamePolicy;
  /** Optional sink receiving one ` name="…"` insertion per synthesised name. */
  readonly edits?: SourceEdit[];
}

/**
 * True when a child element is a nested widget rather than a directive.
 *
 * `<style>`, `<bind_flag_if_*>` and the event elements also carry `name`-ish
 * attributes, but they are not elements in the identity namespace — `<style
 * name="x">` references a style, it does not declare an element called `x`.
 * Both the pre-pass and the recursive walk must agree on this predicate, or the
 * pre-pass would reserve names the walk never assigns.
 */
function isNestedWidgetElement(el: RawXmlElement): boolean {
  return !(
    el.name.startsWith('bind_flag_if_') ||
    el.name === 'screen_load_event' ||
    el.name === 'screen_back_event' ||
    el.name === 'event_cb' ||
    el.name === 'style'
  );
}

/**
 * Pre-pass: collects every explicit element `name` in a document subtree.
 *
 * This must run before any name is synthesised. The uniqueness namespace is the
 * whole document, so an explicit name appearing *later* in document order still
 * has to block an earlier synthesised name from taking it — a fact a
 * single-pass, in-document-order walk cannot know.
 */
function collectExplicitNames(
  elements: readonly RawXmlElement[],
  taken: Set<string>,
): void {
  for (const el of elements) {
    if (!isNestedWidgetElement(el)) {
      continue;
    }
    const name = getAttributeValue(el, 'name');
    if (typeof name === 'string' && name.trim() !== '') {
      taken.add(name);
    }
    collectExplicitNames(el.children, taken);
  }
}

/**
 * Builds a name allocator seeded with every explicit name in the document.
 */
function createNameAllocator(elements: readonly RawXmlElement[]): NameAllocator {
  const taken = new Set<string>();
  collectExplicitNames(elements, taken);
  return { taken, nextIndex: new Map<string, number>() };
}

/**
 * @brief Builds the parse context for one document.
 *
 * @param elements Every top-level element of the document, so the allocator's
 *                 pre-pass sees the whole identity namespace.
 * @param options  Caller's policy and optional edit sink. An absent
 *                 `missingNamePolicy` resolves to the safe default, `'error'`.
 * @return A context to be shared by the entire parse of that document.
 */
export function createWidgetParseContext(
  elements: readonly RawXmlElement[],
  options?: ParseOptions,
): WidgetParseContext {
  return {
    allocator: createNameAllocator(elements),
    policy: options?.missingNamePolicy ?? DEFAULT_MISSING_NAME_POLICY,
    ...(options?.nameEdits ? { edits: options.nameEdits } : {}),
  };
}

/**
 * Issues the lowest free `{cleanTag}_{n}` name and reserves it.
 *
 * @param allocator  Document-scoped pool; the returned name is added to it.
 * @param cleanTag   §13.4-conformant tag stem, prefixes already stripped.
 * @return A name guaranteed not to collide with any other name in the document.
 */
function allocateName(allocator: NameAllocator, cleanTag: string): string {
  let n = allocator.nextIndex.get(cleanTag) ?? 0;
  while (allocator.taken.has(`${cleanTag}_${n}`)) {
    n += 1;
  }
  const generatedName = `${cleanTag}_${n}`;
  allocator.taken.add(generatedName);
  allocator.nextIndex.set(cleanTag, n + 1);
  return generatedName;
}

/** The only values a boolean attribute may take (§7.2). */
const BOOLEAN_TEXT: readonly string[] = ['true', 'false'];

/**
 * @brief The parsed value of a `hidden` attribute: `"true"` and `"false"` are
 *        booleans; anything else — a `$prop` placeholder, or a value that is
 *        simply not a boolean — stays text.
 *
 * Two defects shaped this rule, and both were silent:
 * - Converting `hidden="$p"` to a boolean lost the reference before composite
 *   expansion could substitute it, so every such element became visible (PR-04
 *   WO7 F6). Expansion substitutes the placeholder and applies this same
 *   function to the argument, so the rule is spelled once.
 * - The old rule was `text === 'true'`, which quietly turned `hidden="yes"`
 *   into `false` — the element rendered, and nothing said why (PR-04 WO7b 3).
 *   Keeping the text instead lets Pass 4 hold `hidden` to the strictness §7.2
 *   gives `hcenter` / `vcenter`, rather than guessing on the author's behalf.
 *
 * So a non-boolean value survives parsing deliberately: this function decides
 * what the document *says*, and the validator decides whether it is allowed.
 *
 * @param text The attribute value as written, or as substituted.
 * @return A boolean for `"true"` / `"false"`, or the text unchanged.
 */
export function hiddenAttributeValue(text: string): string | boolean {
  return BOOLEAN_TEXT.includes(text) ? text === 'true' : text;
}

/**
 * Recursively parses a single RawXmlElement into a WidgetNode.
 * Enforces [U-1] element identity per the context's {@link MissingNamePolicy}.
 *
 * @param context  Document-scoped context shared by the whole parse. It is
 *                 **required**, and deliberately has no default: a default that
 *                 built an allocator from `el` alone would silently give an
 *                 external caller a single-element identity namespace — the
 *                 exact scope mismatch WO8 removed — and would silently pick a
 *                 policy on the caller's behalf. Build one with
 *                 {@link createWidgetParseContext} over the whole document.
 */
export function parseWidgetNode(
  el: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  context: WidgetParseContext,
): WidgetNode {
  // --- Step 1: Collect XML attributes and map style overrides ---
  const attributes: Record<string, string | boolean | undefined> = {};
  const styleOverrides: Record<string, string> = {};
  const attributeLocs: Record<string, SourceLocation> = {};

  for (const attr of el.attributes) {
    attributeLocs[attr.name] = attr.loc;

    if (attr.name.startsWith('style_')) {
      const styleKey = attr.name.slice(6);
      styleOverrides[styleKey] = attr.value;
      attributes[attr.name] = attr.value;
    } else if (attr.name === 'focus_style') {
      attributes['focusStyle'] = attr.value;
      attributes['focus_style'] = attr.value;
      attributeLocs['focusStyle'] = attr.loc;
    } else if (attr.name === 'hidden') {
      attributes['hidden'] = hiddenAttributeValue(attr.value);
    } else {
      attributes[attr.name] = attr.value;
    }
  }

  // --- Step 2: Enforce element identity [U-1] under the caller's policy ---
  const rawName = attributes['name'];
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    if (context.policy === 'error') {
      // Refuse to invent identity. A synthesised name is positional, so a build
      // that invented one would rebind generated code to a different widget the
      // moment an element was inserted above it — silently, in CI, with nobody
      // looking. Leave the element unnamed and say so.
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MISSING_NAME,
        severity: 'error',
        file: filename,
        line: el.loc?.line ?? 1,
        column: el.loc?.column ?? 1,
        message:
          `Element <${el.name}> is missing a required 'name' attribute. ` +
          `Add an explicit name, or run 'u8g2gl validate --fix-names' to write ` +
          `generated names into the source.`,
        offendingText: el.name,
        // No `suggestions` here on purpose. A suggestion is a machine-applicable
        // fix, and under this policy there is deliberately no name to apply —
        // proposing a placeholder would be exactly the silent invention this
        // policy exists to prevent. The 'generate' path does carry one.
      });
    } else {
      synthesiseName(el, filename, attributes, attributeLocs, diagnostics, context);
    }
  }

  // --- Step 3: Parse nested children (bindings, events, styles, sub-widgets) ---
  const children: WidgetNodeChild[] = [];

  for (const child of el.children) {
    if (child.name.startsWith('bind_flag_if_')) {
      children.push(parseBindingChild(child));
    } else if (
      child.name === 'screen_load_event' ||
      child.name === 'screen_back_event' ||
      child.name === 'event_cb'
    ) {
      children.push(parseEventChild(child));
    } else if (child.name === 'style') {
      children.push(parseStyleChild(child));
    } else {
      // Nested widget, collection element (e.g. <column>), or component instance.
      // The same context descends, so names stay unique across the document and
      // the policy cannot change part-way down the tree.
      children.push(parseWidgetNode(child, filename, diagnostics, context));
    }
  }

  // --- Step 4: Construct and return immutable WidgetNode ---
  return {
    tag: el.name,
    attributes: attributes as CommonAttributes & {
      readonly [key: string]: string | boolean | undefined;
    },
    styleOverrides,
    children,
    loc: el.loc,
    attributeLocs,
  };
}

/**
 * Synthesises a `{tag}_{n}` name for an unnamed element under the `'generate'`
 * policy, records the warning, and queues the write-back insertion.
 *
 * Split out of parseWidgetNode so the policy branch there reads as the two
 * outcomes it is, rather than one short arm and forty lines of the other.
 *
 * @param attributes     Mutated in place: gains the synthesised `name`.
 * @param attributeLocs  Mutated in place: gains a location for `name` so later
 *                       diagnostics can point at the element.
 */
function synthesiseName(
  el: RawXmlElement,
  filename: string,
  attributes: Record<string, string | boolean | undefined>,
  attributeLocs: Record<string, SourceLocation>,
  diagnostics: Diagnostic[],
  context: WidgetParseContext,
): void {
  // --- Step 1: Reduce the tag to a §13.4-conformant identifier stem ---
  // Strip `u8g2gl_` and `ui_` — §13.4's reserved prefixes, so an auto-generated
  // name built from the tag would be rejected by name validation — and,
  // separately, `wd_`. `wd_` is NOT reserved: it is deliberately absent from
  // RESERVED_IDENTIFIER_PREFIXES (Chief Architect ruling 2026-09-16, see
  // resolver/mangle.ts), because by [D-12] a tag *is* its C++ class name and
  // `wd_` names classes users write (§6.6). It is stripped here only because
  // `wd_service_list`'s unnamed child reads better as `service_list_0` than as
  // `wd_service_list_0` — a readability choice, not a reservation. Do not
  // "reconcile" this list with the reserved one by adding `wd_` back; that
  // regression has already been made once.
  const baseTag = (el.name.replace(/^(u8g2gl_|wd_|ui_)/, '') || el.name)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/_$/, '');
  const cleanTag = /^[a-z]/.test(baseTag) ? baseTag : `elem_${baseTag}`;

  // --- Step 2: Allocate from the document-wide pool ---
  // The counter MUST be document-scoped, not a sibling index. The uniqueness
  // namespace enforced by validate-identifiers.ts is the whole screen (or the
  // whole component), so a per-parent counter makes two unnamed labels under
  // two different boxes both 'label_0' — a spurious U8G2GL_DUPLICATE_NAME
  // error naming an identifier the author never wrote. That was the WO8
  // remediation; do not "simplify" this back to a sibling index.
  const generatedName = allocateName(context.allocator, cleanTag);

  attributes['name'] = generatedName;
  if (el.loc && !attributeLocs['name']) {
    attributeLocs['name'] = el.loc;
  }

  // --- Step 3: Record the write-back insertion, if the caller wants one ---
  if (context.edits && el.loc) {
    context.edits.push(createNameInsertion(el.loc, el.name, generatedName));
  }

  // --- Step 4: Warn — auto-correction must always be visible ---
  diagnostics.push({
    code: DIAGNOSTIC_CODES.MISSING_NAME,
    severity: 'warning',
    file: filename,
    line: el.loc?.line ?? 1,
    column: el.loc?.column ?? 1,
    message:
      `Element <${el.name}> is missing a required 'name' attribute. ` +
      `Auto-generated name '${generatedName}'. Add an explicit name ` +
      `for stable identity and readable generated code.`,
    offendingText: el.name,
    suggestions: [`name="${generatedName}"`],
  });
}

/**
 * Parses an array of raw child XML elements into an array of WidgetNode AST elements.
 *
 * This is the document boundary for [U-1] name synthesis: it is called once per
 * screen and once per component, which is exactly the scope over which
 * validate-identifiers.ts enforces element-name uniqueness. The context is
 * created here, and here only, so the two scopes cannot drift apart again.
 *
 * @param options Missing-name policy and optional write-back sink. Omitting it
 *                selects `'error'` — the safe journey.
 */
export function parseWidgetTree(
  elements: readonly RawXmlElement[],
  filename: string,
  diagnostics: Diagnostic[],
  options?: ParseOptions,
): readonly WidgetNode[] {
  // --- Step 1: Pre-pass — reserve every explicit name in the document ---
  const context = createWidgetParseContext(elements, options);

  // --- Step 2: Walk in document order, synthesising only unreserved names ---
  return elements.map((el) => parseWidgetNode(el, filename, diagnostics, context));
}
