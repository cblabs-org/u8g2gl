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
 *              {tag}_{index} with a warning diagnostic when omitted.
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
 * Recursively parses a single RawXmlElement into a WidgetNode.
 * Enforces [U-1] element identity: validates explicit 'name' attribute or
 * auto-generates '{tag}_{siblingIndex}' with a warning diagnostic.
 */
export function parseWidgetNode(
  el: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  siblingIndex: number = 0,
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
    const generatedName = `${cleanTag}_${siblingIndex}`;

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
  let childWidgetIndex = 0;

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
      // Nested widget, collection element (e.g. <column>), or component instance
      children.push(parseWidgetNode(child, filename, diagnostics, childWidgetIndex++));
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
 * Tracks sibling indices across elements to support [U-1] auto-generated naming.
 */
export function parseWidgetTree(
  elements: readonly RawXmlElement[],
  filename: string,
  diagnostics: Diagnostic[],
): readonly WidgetNode[] {
  return elements.map((el, siblingIndex) =>
    parseWidgetNode(el, filename, diagnostics, siblingIndex),
  );
}
