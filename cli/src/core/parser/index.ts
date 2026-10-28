/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/index.ts
 * Purpose: Public API barrel for the U8G2GL XML parser toolkit.
 * Description: Exports file-level parsing functions for all U8G2GL document types
 *              (project, globals, screens, widget manifests) and the generic
 *              ParseResult<T> container with diagnostic reporting. Per [D-18]
 *              there is one element vocabulary: `parseWidgetManifestFile`
 *              parses both a plain widget and a composite (a `<widget>` with
 *              a `<view>`) — PR-3R WO9 retired the separate `<component>`
 *              root and its `parseComponentFile` entry point.
 *
 * Exports:
 * - ParseResult: Standard outcome envelope carrying parsed AST and diagnostics
 * - parseProjectFile: Parse u8g2gl.xml files into U8g2glProject
 * - parseGlobalsFile: Parse globals.xml files into Globals
 * - parseScreenFile: Parse screen_*.xml files into Screen
 * - parseWidgetManifestFile: Parse widget manifest XML files into WidgetManifest
 *   (plain widget or composite, per [D-18])
 * - tokenizeXml: Read XML text into the raw element tree (built from the CST)
 * - decodeXmlEntities: The entity rule applied to every attribute value and text
 * - rootElementName: The root element's tag, for dispatching a file to its parser
 * - RawXmlAttribute, RawXmlElement, RawXmlDocument: Low-level untyped XML types
 * - MissingNamePolicy, ParseOptions, SourceEdit, applyTextEdits: [U-1] name policy and write-back
 */

import type { Diagnostic } from '../schema/diagnostic.js';
import type { SourceEdit } from './name-policy.js';

/**
 * Generic result envelope returned by all U8G2GL file parsing functions.
 */
export interface ParseResult<T> {
  /** The parsed AST model, present if parsing succeeded without fatal errors. */
  readonly value?: T;
  /** All diagnostics (errors, warnings, notices) emitted while reading and parsing. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Write-back insertions for names synthesised during this parse, in document
   * order. Non-empty only under the `'generate'` missing-name policy; the CLI's
   * `--fix-names` and the designer's auto-correction both apply exactly these.
   */
  readonly nameEdits?: readonly SourceEdit[];
}

export { tokenizeXml, decodeXmlEntities, rootElementName } from './cst-adapter.js';
export type {
  RawXmlAttribute,
  RawXmlElement,
  RawXmlDocument,
} from './raw-xml.js';

export { parseProject, parseProjectFile } from './parse-project.js';
export { parseGlobals, parseGlobalsFile, parseStyleDeclarations } from './parse-globals.js';
export { parseScreen, parseScreenFile, parseFocusRing } from './parse-screen.js';
export {
  parseWidgetTree,
  parseWidgetNode,
  createWidgetParseContext,
  hiddenAttributeValue,
} from './parse-widget-tree.js';
export type { NameAllocator, WidgetParseContext } from './parse-widget-tree.js';
export {
  DEFAULT_MISSING_NAME_POLICY,
  applyTextEdits,
  createNameInsertion,
} from './name-policy.js';
export type { MissingNamePolicy, ParseOptions, SourceEdit } from './name-policy.js';
export {
  parseWidgetManifest,
  parseWidgetManifestFile,
  COMPONENT_REMOVED_MIGRATION,
} from './parse-widget-manifest.js';
