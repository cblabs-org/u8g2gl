/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-widget-manifest.ts
 * Purpose: Transforms raw XML AST into typed WidgetManifest models (§6.4, §13.1).
 * Description: Parses widget metadata (`name`, `extends`, `animated`), public property
 *              descriptors, reactive binding slots, and child collection element definitions.
 *
 * Exports:
 * - parseWidgetManifest: Transform a parsed RawXmlElement into a WidgetManifest model
 * - parseWidgetManifestFile: Parse a raw XML string into a ParseResult<WidgetManifest>
 */

import type {
  ApiBlock,
  BindDef,
  ElementArgDef,
  ElementDef,
  PropDef,
  PropType,
  WidgetManifest,
} from '../schema/widget-manifest.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttribute,
  getAttributeValue,
  getBooleanAttribute,
  getChild,
  getNumberAttribute,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { tokenizeXml } from './xml-tokeniser.js';
import type { ParseResult } from './index.js';

/**
 * Transforms a raw XML root element into a typed WidgetManifest model.
 */
export function parseWidgetManifest(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): WidgetManifest | undefined {
  if (root.name !== 'widget') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <widget>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  const nameAttr = requireAttribute(root, 'name', filename, diagnostics);
  const name = nameAttr?.value ?? '';

  const extendsVal = getAttributeValue(root, 'extends') ?? 'u8g2gl_obj';
  const animatedAttr = getAttribute(root, 'animated');
  const animated = animatedAttr ? animatedAttr.value !== 'false' : true;

  const props: PropDef[] = [];
  const bindings: BindDef[] = [];
  const elements: ElementDef[] = [];

  const apiEl = getChild(root, 'api');
  if (apiEl) {
    for (const child of apiEl.children) {
      if (child.name === 'prop') {
        const propNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const propTypeAttr = requireAttribute(child, 'type', filename, diagnostics);
        const propName = propNameAttr?.value ?? '';
        const propType = (propTypeAttr?.value ?? 'string') as PropType;
        const setter = getAttributeValue(child, 'setter') ?? `set_${propName}`;
        const defaultVal = getAttributeValue(child, 'default');
        const required = getBooleanAttribute(child, 'required');
        const isAnimated = getBooleanAttribute(child, 'animated');
        const emit = getAttributeValue(child, 'emit');
        const values = getAttributeValue(child, 'values');
        const help = getAttributeValue(child, 'help');

        props.push({
          name: propName,
          type: propType,
          setter,
          default: defaultVal,
          required,
          animated: isAnimated,
          emit,
          values,
          help,
          loc: child.loc,
        });
      } else if (child.name === 'bind') {
        const bindNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const bindTypeAttr = requireAttribute(child, 'type', filename, diagnostics);
        const bindName = bindNameAttr?.value ?? '';
        const bindType = bindTypeAttr?.value ?? 'string';
        const setter = getAttributeValue(child, 'setter') ?? bindName;
        const fmt = getAttributeValue(child, 'fmt');

        bindings.push({
          name: bindName,
          type: bindType,
          setter,
          fmt,
          loc: child.loc,
        });
      } else if (child.name === 'element') {
        const elemNameAttr = requireAttribute(child, 'name', filename, diagnostics);
        const elemName = elemNameAttr?.value ?? '';
        const access = getAttributeValue(child, 'access') ?? 'add';
        const help = getAttributeValue(child, 'help');

        const args: ElementArgDef[] = [];
        for (const argChild of child.children) {
          if (argChild.name === 'arg') {
            const argNameAttr = requireAttribute(argChild, 'name', filename, diagnostics);
            const argTypeAttr = requireAttribute(argChild, 'type', filename, diagnostics);
            const maxLen =
              getNumberAttribute(argChild, 'max_len', filename, diagnostics) ??
              getNumberAttribute(argChild, 'maxLen', filename, diagnostics);

            args.push({
              name: argNameAttr?.value ?? '',
              type: (argTypeAttr?.value ?? 'string') as PropType,
              maxLen,
              loc: argChild.loc,
            });
          } else {
            diagnostics.push({
              code: DIAGNOSTIC_CODES.MALFORMED_XML,
              severity: 'error',
              file: filename,
              line: argChild.loc.line,
              column: argChild.loc.column,
              message: `Unknown element '<${argChild.name}>' in <element> definition`,
              offendingText: argChild.name,
            });
          }
        }

        elements.push({
          name: elemName,
          access,
          args,
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
          message: `Unknown element '<${child.name}>' in <widget> <api>`,
          offendingText: child.name,
        });
      }
    }
  }

  const apiBlock: ApiBlock = {
    props,
    bindings,
    elements,
    loc: apiEl?.loc,
  };

  return {
    name,
    extends: extendsVal,
    animated,
    api: apiBlock,
    loc: root.loc,
  };
}

/**
 * Parses a widget manifest XML file from raw text into a ParseResult<WidgetManifest>.
 */
export function parseWidgetManifestFile(
  xml: string,
  filename: string,
): ParseResult<WidgetManifest> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  if (!rawDoc.root) {
    return { diagnostics };
  }

  const manifest = parseWidgetManifest(rawDoc.root, filename, diagnostics);
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !manifest) {
    return { diagnostics };
  }

  return {
    value: manifest,
    diagnostics,
  };
}
