/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-widget-tree.ts
 * Purpose: Recursively transforms raw XML element subtrees into typed WidgetNodes,
 *          enforcing [U-1] element identity (required name with auto-generated fallback).
 * Description: Recognises Tier 1 primitives (§6.1), Tier 2 built-in widgets (§6.2),
 *              Tier 4 custom widgets (§6.4), and potential Tier 3 component instances (§6.3).
 *              Extracts common layout coordinates, style overrides (`style_*`), reactive
 *              binding slots (`bind_*`), condition directives, and input event handlers.
 *              Enforces that every element has a stable name identifier, auto-generating
 *              {tag}_{n} with a warning diagnostic when omitted. Synthesis is allocated
 *              against a document-wide name pool so it can never manufacture a duplicate.
 *
 * Exports:
 * - parseWidgetTree: Parse an array of child elements into WidgetNode AST nodes
 * - parseWidgetNode: Recursively parse a single element into a WidgetNode
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
interface NameAllocator {
  readonly taken: Set<string>;
  readonly nextIndex: Map<string, number>;
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

/**
 * Recursively parses a single RawXmlElement into a WidgetNode.
 * Enforces [U-1] element identity: validates explicit 'name' attribute or
 * auto-generates '{tag}_{n}' with a warning diagnostic.
 *
 * @param allocator  Document-scoped name pool shared by the whole parse. Omit it
 *                   only when parsing a standalone subtree; a fresh allocator is
 *                   then seeded from `el` alone, which is correct for that
 *                   subtree but knows nothing of a wider document.
 */
export function parseWidgetNode(
  el: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  allocator: NameAllocator = createNameAllocator([el]),
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
      attributes['hidden'] = attr.value === 'true';
    } else {
      attributes[attr.name] = attr.value;
    }
  }

  // --- Step 2: Enforce element identity [U-1] (required name or auto-generate) ---
  const rawName = attributes['name'];
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    // Strip framework and custom widget prefixes (u8g2gl_, wd_, ui_) so the
    // auto-generated identifier conforms to §13.4 and passes name validation.
    const baseTag = (el.name.replace(/^(u8g2gl_|wd_|ui_)/, '') || el.name)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/__+/g, '_')
      .replace(/_$/, '');
    const cleanTag = /^[a-z]/.test(baseTag) ? baseTag : `elem_${baseTag}`;

    // The counter MUST be document-scoped, not a sibling index. The uniqueness
    // namespace enforced by validate-identifiers.ts is the whole screen (or the
    // whole component), so a per-parent counter makes two unnamed labels under
    // two different boxes both 'label_0' — a spurious U8G2GL_DUPLICATE_NAME
    // error naming an identifier the author never wrote. That was the WO8
    // remediation; do not "simplify" this back to a sibling index.
    const generatedName = allocateName(allocator, cleanTag);

    attributes['name'] = generatedName;
    if (el.loc && !attributeLocs['name']) {
      attributeLocs['name'] = el.loc;
    }

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
      // The same allocator descends, so names stay unique across the document.
      children.push(parseWidgetNode(child, filename, diagnostics, allocator));
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
 * Parses an array of raw child XML elements into an array of WidgetNode AST elements.
 *
 * This is the document boundary for [U-1] name synthesis: it is called once per
 * screen and once per component, which is exactly the scope over which
 * validate-identifiers.ts enforces element-name uniqueness. The allocator is
 * created here, and here only, so the two scopes cannot drift apart again.
 */
export function parseWidgetTree(
  elements: readonly RawXmlElement[],
  filename: string,
  diagnostics: Diagnostic[],
): readonly WidgetNode[] {
  // --- Step 1: Pre-pass — reserve every explicit name in the document ---
  const allocator = createNameAllocator(elements);

  // --- Step 2: Walk in document order, synthesising only unreserved names ---
  return elements.map((el) => parseWidgetNode(el, filename, diagnostics, allocator));
}
