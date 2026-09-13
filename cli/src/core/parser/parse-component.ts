/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-component.ts
 * Purpose: Transforms raw XML AST into typed WidgetManifest models for the
 *          composite case (§6.3). This file still parses the `<component>`
 *          root tag exactly as before — accepting a different root tag (e.g.
 *          `<widget>`, per design_spec §6.4) is a schema change reserved for
 *          WO8, not this merge.
 * Description: WO5 retired the separate `ComponentProp` type in favour of
 *              `PropDef`; WO5b finishes the merge by retiring `Component`
 *              itself (see schema/widget-manifest.ts) — a composite is now a
 *              `WidgetManifest` whose `api` is a full `ApiBlock`. This parser
 *              only ever populates `api.props` from `<prop>` children, now
 *              typed as `PropDef` and therefore able to carry `help`; `api.
 *              bindings` and `api.elements` are always empty here because a
 *              `<component>` document has never declared either — no
 *              behaviour changes, the shape is just made explicit.
 *
 * Exports:
 * - parseComponent: Transform a parsed RawXmlElement into a composite
 *   WidgetManifest model
 * - parseComponentFile: Parse a raw XML string into a
 *   ParseResult<WidgetManifest>
 */

import type { WidgetManifest, PropDef, PropType } from '../schema/widget-manifest.js';
import type { View } from '../schema/screen.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttributeValue,
  getBooleanAttribute,
  getChild,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { parseWidgetTree } from './parse-widget-tree.js';
import type { ParseOptions, SourceEdit } from './name-policy.js';
import { parseFocusRing } from './parse-screen.js';
import { tokenizeXml } from './xml-tokeniser.js';
import type { ParseResult } from './index.js';

/**
 * Infers a component identifier from its file path if omitted in XML attributes.
 * Pure string operation to uphold the isomorphic boundary (§1).
 */
function inferComponentName(filename: string): string {
  const normalized = filename.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const last = segments[segments.length - 1] ?? '';
  return last.endsWith('.xml') ? last.slice(0, -4) : last;
}

/**
 * Transforms a raw XML root element into a typed composite WidgetManifest.
 */
export function parseComponent(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
  options?: ParseOptions,
): WidgetManifest | undefined {
  if (root.name !== 'component') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <component>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  const name = getAttributeValue(root, 'name') ?? inferComponentName(filename);

  // Parse <api> parameter declarations
  const apiProps: PropDef[] = [];
  const apiEl = getChild(root, 'api');
  if (apiEl) {
    for (const child of apiEl.children) {
      if (child.name === 'prop') {
        const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const typeAttr = requireAttribute(child, 'type', filename, diagnostics);
        const defaultVal = getAttributeValue(child, 'default');
        const required = getBooleanAttribute(child, 'required');
        // [D-18]/WO5: a composite prop is now a PropDef like any other, so it
        // can carry `help` — this is the defect the merge fixes (§9 of
        // ui_spec.md calls description text on props the editor's
        // differentiator, and the pre-merge ComponentProp had no such field).
        const help = getAttributeValue(child, 'help');

        apiProps.push({
          name: nameAttr?.value ?? '',
          type: (typeAttr?.value ?? 'string') as PropType,
          default: defaultVal,
          required,
          help,
          loc: child.loc,
        });
      } else {
        diagnostics.push({
          code: DIAGNOSTIC_CODES.MALFORMED_XML,
          severity: 'error',
          file: filename,
          line: child.loc.line,
          column: child.loc.column,
          message: `Unknown element '<${child.name}>' in <component> <api>`,
          offendingText: child.name,
        });
      }
    }
  }

  // Parse <view> template
  const viewEl = getChild(root, 'view');
  if (!viewEl) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Missing required <view> element in component '${name}'`,
      offendingText: name,
    });
    return undefined;
  }

  const viewFocusRingEl = getChild(viewEl, 'focus_ring');
  const focusRing = viewFocusRingEl
    ? parseFocusRing(viewFocusRingEl, filename, diagnostics)
    : undefined;

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
    // No `extends`: a composite has no C++ class of its own (see
    // widget-manifest.ts) — the field is optional for exactly this case.
    api: { props: apiProps, bindings: [], elements: [], loc: apiEl?.loc },
    view,
    loc: root.loc,
  };
}

/**
 * Parses a component XML file from raw text into a ParseResult<WidgetManifest>.
 */
export function parseComponentFile(
  xml: string,
  filename: string,
  options?: ParseOptions,
): ParseResult<WidgetManifest> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  // As in parseScreenFile: collect locally when the caller supplied no sink, so
  // the edits always reach the ParseResult.
  const nameEdits: SourceEdit[] = options?.nameEdits ?? [];

  if (!rawDoc.root) {
    return { diagnostics, nameEdits };
  }

  const component = parseComponent(rawDoc.root, filename, diagnostics, { ...options, nameEdits });
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !component) {
    return { diagnostics, nameEdits };
  }

  return {
    value: component,
    diagnostics,
    nameEdits,
  };
}
