/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/index.ts
 * Purpose: Public API barrel for the U8G2GL XML parser toolkit.
 * Description: Exports file-level parsing functions for all U8G2GL document types
 *              (project, globals, screens, components, widget manifests) and the
 *              generic ParseResult<T> container with diagnostic reporting.
 *
 * Exports:
 * - ParseResult: Standard outcome envelope carrying parsed AST and diagnostics
 * - parseProjectFile: Parse u8g2gl.xml files into U8g2glProject
 * - parseGlobalsFile: Parse globals.xml files into Globals
 * - parseScreenFile: Parse screen_*.xml files into Screen
 * - parseComponentFile: Parse component XML files into Component
 * - parseWidgetManifestFile: Parse widget manifest XML files into WidgetManifest
 * - tokenizeXml: Low-level XML scanner producing raw element tree
 * - RawXmlAttribute, RawXmlElement, RawXmlDocument: Low-level untyped XML types
 */

import type { Diagnostic } from '../schema/diagnostic.js';

/**
 * Generic result envelope returned by all U8G2GL file parsing functions.
 */
export interface ParseResult<T> {
  /** The parsed AST model, present if parsing succeeded without fatal errors. */
  readonly value?: T;
  /** All diagnostics (errors, warnings, notices) emitted during tokenisation and parsing. */
  readonly diagnostics: readonly Diagnostic[];
}

export { tokenizeXml, decodeXmlEntities } from './xml-tokeniser.js';
export type {
  RawXmlAttribute,
  RawXmlElement,
  RawXmlDocument,
} from './raw-xml.js';

export { parseProject, parseProjectFile } from './parse-project.js';
export { parseGlobals, parseGlobalsFile, parseStyleDeclarations } from './parse-globals.js';
export { parseScreen, parseScreenFile, parseFocusRing } from './parse-screen.js';
export { parseWidgetTree, parseWidgetNode } from './parse-widget-tree.js';
export { parseComponent, parseComponentFile } from './parse-component.js';
export { parseWidgetManifest, parseWidgetManifestFile } from './parse-widget-manifest.js';
