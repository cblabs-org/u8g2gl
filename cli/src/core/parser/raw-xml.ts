/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/raw-xml.ts
 * Purpose: Defines raw untyped XML AST nodes and attribute lookup utilities
 *          preserving source coordinate positions prior to schema transformation.
 * Description: Low-level data structures capturing XML element hierarchies,
 *              attribute source positions, text nodes, and comments. Provides
 *              pure helper functions for inspecting raw attributes with diagnostics.
 *
 * Exports:
 * - RawXmlAttribute: An attribute with name, decoded value, and source location
 * - RawXmlElement: An element tag with attributes, child elements, and source location
 * - RawXmlDocument: Complete parse tree containing root element and any diagnostics
 * - getAttribute: Find raw attribute by name
 * - getAttributeValue: Read attribute string value or undefined
 * - getAttributeLocation: Where an attribute's name and value start, if present
 * - getChild: Find first child element matching tag name
 * - getChildren: Find all child elements matching tag name
 * - hasAttribute: Check whether an attribute is declared
 * - requireAttribute: Retrieve attribute or record a MISSING_REQUIRED diagnostic
 * - getBooleanAttribute: Parse attribute value as boolean
 * - getNumberAttribute: Parse attribute value as integer or record a diagnostic
 */

import type { AttributeLocation, OffsetRange, SourceLocation } from '../schema/source-location.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';

/**
 * An XML attribute with its decoded string value and source coordinates.
 * `loc` points to the start of the attribute value content.
 * `nameLoc` points to the start of the attribute name.
 * Both are derived from the offset ranges, which are what an edit replaces.
 */
export interface RawXmlAttribute {
  /** The attribute identifier (e.g. "name", "width", "bind_text"). */
  readonly name: string;
  /** The unescaped attribute value string. */
  readonly value: string;
  /** Source coordinates pointing to the start of the attribute value. */
  readonly loc: SourceLocation;
  /** Source coordinates pointing to the start of the attribute name. */
  readonly nameLoc: SourceLocation;
  /** Offsets of the name as written. */
  readonly nameRange: OffsetRange;
  /** Offsets of the value inside the quotes, entity references undecoded. */
  readonly valueRange: OffsetRange;
}

/**
 * A raw XML element node prior to schema-specific transformation.
 */
export interface RawXmlElement {
  /** Tag name of the element (e.g. "u8g2gl", "screen", "u8g2gl_label"). */
  readonly name: string;
  /** List of parsed attributes with source coordinates. */
  readonly attributes: readonly RawXmlAttribute[];
  /** Ordered list of nested child elements. */
  readonly children: readonly RawXmlElement[];
  /** Inner text content if any, stripped of outer whitespace. */
  readonly textContent?: string;
  /** XML comment strings encountered inside this element. */
  readonly comments: readonly string[];
  /** Source coordinate of the opening tag '<'. */
  readonly loc: SourceLocation;
  /** Source coordinate of the closing tag or self-closing '/>'. */
  readonly endLoc?: SourceLocation;
  /**
   * Offsets of the whole element, opening '<' through the end of its closing
   * tag or '/>' (or to end of input when it was never closed).
   */
  readonly range: OffsetRange;
}

/**
 * Result of reading an XML text into the raw element tree.
 */
export interface RawXmlDocument {
  /** The single root element of the XML document, if parsed. */
  readonly root?: RawXmlElement;
  /** Well-formedness diagnostics found while reading the text. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Returns the first attribute with the given name on the element, if present.
 */
export function getAttribute(element: RawXmlElement, name: string): RawXmlAttribute | undefined {
  return element.attributes.find((attr) => attr.name === name);
}

/**
 * Returns the string value of the attribute, or undefined if not present.
 */
export function getAttributeValue(element: RawXmlElement, name: string): string | undefined {
  return getAttribute(element, name)?.value;
}

/**
 * Returns where the named attribute's name and value start, or undefined if it
 * is absent. For a model field that a later diagnostic must locate.
 */
export function getAttributeLocation(element: RawXmlElement, name: string): AttributeLocation | undefined {
  const attr = getAttribute(element, name);
  return attr ? { name: attr.nameLoc, value: attr.loc } : undefined;
}

/**
 * Checks whether an attribute exists on the element.
 */
export function hasAttribute(element: RawXmlElement, name: string): boolean {
  return getAttribute(element, name) !== undefined;
}

/**
 * Retrieves a mandatory attribute. If missing, appends a MISSING_REQUIRED
 * diagnostic located at the element's start coordinates and returns undefined.
 */
export function requireAttribute(
  element: RawXmlElement,
  name: string,
  filename: string,
  diagnostics: Diagnostic[],
): RawXmlAttribute | undefined {
  const attr = getAttribute(element, name);
  if (!attr) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      severity: 'error',
      file: filename,
      line: element.loc.line,
      column: element.loc.column,
      message: `Missing required attribute '${name}' on <${element.name}>`,
      offendingText: element.name,
    });
    return undefined;
  }
  return attr;
}

/**
 * Parses an attribute value as a boolean ('true' -> true, 'false' -> false).
 * Returns undefined if the attribute is absent.
 */
export function getBooleanAttribute(element: RawXmlElement, name: string): boolean | undefined {
  const value = getAttributeValue(element, name);
  if (value === undefined) {
    return undefined;
  }
  return value === 'true';
}

/**
 * Parses an attribute value as an integer.
 * If the attribute is missing, returns undefined.
 * If the attribute is present but not a valid integer, appends a TYPE_MISMATCH
 * diagnostic at the attribute's value location and returns undefined.
 */
export function getNumberAttribute(
  element: RawXmlElement,
  name: string,
  filename: string,
  diagnostics: Diagnostic[],
): number | undefined {
  const attr = getAttribute(element, name);
  if (!attr) {
    return undefined;
  }
  const parsed = parseInt(attr.value, 10);
  if (Number.isNaN(parsed) || !/^-?\d+$/.test(attr.value.trim())) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.TYPE_MISMATCH,
      severity: 'error',
      file: filename,
      line: attr.loc.line,
      column: attr.loc.column,
      message: `Attribute '${name}' must be an integer, got '${attr.value}'`,
      offendingText: attr.value,
    });
    return undefined;
  }
  return parsed;
}

/**
 * Returns the first direct child element matching the given tag name.
 */
export function getChild(element: RawXmlElement, name: string): RawXmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

/**
 * Returns all direct child elements matching the given tag name.
 */
export function getChildren(element: RawXmlElement, name: string): readonly RawXmlElement[] {
  return element.children.filter((child) => child.name === name);
}
