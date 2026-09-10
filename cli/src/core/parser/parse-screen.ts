/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-screen.ts
 * Purpose: Transforms raw XML AST into typed Screen and View models (§5.4).
 * Description: Extracts screen identity, local style definitions, visual widget tree,
 *              and explicit cyclic focus ring navigation ordering (§12.2), preserving
 *              source coordinate positions.
 *
 * Exports:
 * - parseScreen: Transform a parsed RawXmlElement into a Screen model
 * - parseScreenFile: Parse a raw XML string into a ParseResult<Screen>
 * - parseFocusRing: Helper to extract FocusRing definitions from raw XML
 */

import type { FocusEntry, FocusRing, Screen, View } from '../schema/screen.js';
import type { StyleDecl } from '../schema/globals.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttribute,
  getChild,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { parseStyleDeclarations } from './parse-globals.js';
import { parseWidgetTree } from './parse-widget-tree.js';
import type { ParseOptions, SourceEdit } from './name-policy.js';
import { tokenizeXml } from './xml-tokeniser.js';
import type { ParseResult } from './index.js';

/**
 * Parses a <focus_ring> element into a typed FocusRing structure (§12.2).
 */
export function parseFocusRing(
  ringEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): FocusRing {
  const wrapAttr = getAttribute(ringEl, 'wrap');
  const wrap = wrapAttr ? wrapAttr.value !== 'false' : true;

  const entries: FocusEntry[] = [];
  for (const child of ringEl.children) {
    if (child.name === 'focus' || child.name === 'entry') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      entries.push({
        name: nameAttr?.value ?? '',
        loc: child.loc,
      });
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown element '<${child.name}>' in <focus_ring>`,
        offendingText: child.name,
      });
    }
  }

  return {
    wrap,
    entries,
    loc: ringEl.loc,
  };
}

/**
 * Transforms a raw XML root element into a typed Screen model.
 */
export function parseScreen(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  options?: ParseOptions,
): Screen | undefined {
  if (root.name !== 'screen') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <screen>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  const nameAttr = requireAttribute(root, 'name', filename, diagnostics);
  const name = nameAttr?.value ?? '';

  let styles: readonly StyleDecl[] | undefined;
  const stylesEl = getChild(root, 'styles');
  if (stylesEl) {
    styles = parseStyleDeclarations(stylesEl, filename, diagnostics);
  }

  const viewEl = getChild(root, 'view');
  if (!viewEl) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Missing required <view> element in screen '${name}'`,
      offendingText: name,
    });
    return undefined;
  }

  // <focus_ring> can be inside <view> or directly under <screen>
  let focusRing: FocusRing | undefined;
  const directFocusRingEl = getChild(root, 'focus_ring');
  const viewFocusRingEl = getChild(viewEl, 'focus_ring');

  if (viewFocusRingEl) {
    focusRing = parseFocusRing(viewFocusRingEl, filename, diagnostics);
  } else if (directFocusRingEl) {
    focusRing = parseFocusRing(directFocusRingEl, filename, diagnostics);
  }

  // Separate visual children from <focus_ring> inside <view>
  const visualChildren = viewEl.children.filter(
    (child) => child.name !== 'focus_ring',
  );
  const widgetChildren = parseWidgetTree(visualChildren, filename, diagnostics, options);

  const view: View = {
    children: widgetChildren,
    focusRing,
    loc: viewEl.loc,
  };

  return {
    name,
    styles,
    view,
    loc: root.loc,
  };
}

/**
 * Parses a screen XML file from raw text into a ParseResult<Screen>.
 */
export function parseScreenFile(
  xml: string,
  filename: string,
  options?: ParseOptions,
): ParseResult<Screen> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  // The caller may supply its own sink; otherwise collect locally so the edits
  // still reach the ParseResult, which is where --fix-names reads them from.
  const nameEdits: SourceEdit[] = options?.nameEdits ?? [];

  if (!rawDoc.root) {
    return { diagnostics, nameEdits };
  }

  const screen = parseScreen(rawDoc.root, filename, diagnostics, { ...options, nameEdits });
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !screen) {
    return { diagnostics, nameEdits };
  }

  return {
    value: screen,
    diagnostics,
    nameEdits,
  };
}
