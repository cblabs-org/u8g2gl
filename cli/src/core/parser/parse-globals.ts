/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-globals.ts
 * Purpose: Transforms raw XML AST into typed Globals declarations (§5.3).
 * Description: Parses compile-time constants (§7.2), reactive data subjects (§8),
 *              monochrome styles (§10), BDF/builtin fonts (§14.1), and image
 *              assets (§14.2), threading source coordinate locations through all nodes.
 *
 * Exports:
 * - parseGlobals: Transform a parsed RawXmlElement into a Globals model
 * - parseGlobalsFile: Parse a raw XML string into a ParseResult<Globals>
 * - parseStyleDeclarations: Shared style parser reused across globals and screen files
 */

import type {
  BdfFontDecl,
  BitmapMode,
  BuiltinFontDecl,
  ConstDecl,
  ConvertImageDecl,
  DrawColor,
  FontDecl,
  FontMode,
  Globals,
  ImageDecl,
  StyleDecl,
  SubjectDecl,
  SubjectType,
  TextAlign,
  XbmImageDecl,
} from '../schema/globals.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttributeValue,
  getBooleanAttribute,
  getChildren,
  getNumberAttribute,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { tokenizeXml } from './xml-tokeniser.js';
import type { ParseResult } from './index.js';

/**
 * Parses individual <style> elements into StyleDecl models.
 * Shared between globals.xml and local screen <styles> blocks.
 */
export function parseStyleDeclarations(
  stylesEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): readonly StyleDecl[] {
  const result: StyleDecl[] = [];
  const styleElements = getChildren(stylesEl, 'style');

  for (const el of styleElements) {
    const nameAttr = requireAttribute(el, 'name', filename, diagnostics);
    const name = nameAttr?.value ?? '';

    const font = getAttributeValue(el, 'font');
    const drawColor = (getAttributeValue(el, 'draw_color') ??
      getAttributeValue(el, 'drawColor')) as DrawColor | undefined;
    const invert = getBooleanAttribute(el, 'invert');
    const padding = getNumberAttribute(el, 'padding', filename, diagnostics);
    const border = getBooleanAttribute(el, 'border');
    const radius = getNumberAttribute(el, 'radius', filename, diagnostics);
    const align = getAttributeValue(el, 'align') as TextAlign | undefined;
    const truncate = getBooleanAttribute(el, 'truncate');
    const fontMode = (getAttributeValue(el, 'font_mode') ??
      getAttributeValue(el, 'fontMode')) as FontMode | undefined;
    const bitmapMode = (getAttributeValue(el, 'bitmap_mode') ??
      getAttributeValue(el, 'bitmapMode')) as BitmapMode | undefined;

    result.push({
      name,
      font,
      drawColor,
      invert,
      padding,
      border,
      radius,
      align,
      truncate,
      fontMode,
      bitmapMode,
      loc: el.loc,
    });
  }

  return result;
}

/**
 * Parses <consts> block containing <int> and <string> constant declarations.
 */
function parseConsts(
  constsEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): readonly ConstDecl[] {
  const result: ConstDecl[] = [];

  for (const child of constsEl.children) {
    if (child.name === 'int' || child.name === 'string') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      const valueAttr = requireAttribute(child, 'value', filename, diagnostics);

      result.push({
        name: nameAttr?.value ?? '',
        type: child.name as 'int' | 'string',
        value: valueAttr?.value ?? '',
        loc: child.loc,
      });
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown constant type '<${child.name}>' in <consts>`,
        offendingText: child.name,
      });
    }
  }

  return result;
}

/**
 * Parses <subjects> block containing reactive variable declarations.
 */
function parseSubjects(
  subjectsEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): readonly SubjectDecl[] {
  const result: SubjectDecl[] = [];
  const validTypes = new Set(['int', 'string', 'bool', 'time']);

  for (const child of subjectsEl.children) {
    if (validTypes.has(child.name)) {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      const name = nameAttr?.value ?? '';
      const type = child.name as SubjectType;
      const defaultVal =
        getAttributeValue(child, 'default') ?? getAttributeValue(child, 'value');
      const maxLen =
        getNumberAttribute(child, 'max_len', filename, diagnostics) ??
        getNumberAttribute(child, 'maxLen', filename, diagnostics);

      result.push({
        name,
        type,
        default: defaultVal,
        maxLen,
        loc: child.loc,
      });
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown subject type '<${child.name}>' in <subjects>`,
        offendingText: child.name,
      });
    }
  }

  return result;
}

/**
 * Parses <fonts> block containing <bdf> and <builtin> font declarations.
 */
function parseFonts(
  fontsEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): readonly FontDecl[] {
  const result: FontDecl[] = [];

  for (const child of fontsEl.children) {
    if (child.name === 'bdf') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      const srcAttr = requireAttribute(child, 'src', filename, diagnostics);
      const range = getAttributeValue(child, 'range');

      const decl: BdfFontDecl = {
        kind: 'bdf',
        name: nameAttr?.value ?? '',
        src: srcAttr?.value ?? '',
        range,
        loc: child.loc,
      };
      result.push(decl);
    } else if (child.name === 'builtin') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);

      const decl: BuiltinFontDecl = {
        kind: 'builtin',
        name: nameAttr?.value ?? '',
        loc: child.loc,
      };
      result.push(decl);
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown font declaration '<${child.name}>' in <fonts>`,
        offendingText: child.name,
      });
    }
  }

  return result;
}

/**
 * Parses <images> block containing <xbm> and <convert> image declarations.
 */
function parseImages(
  imagesEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): readonly ImageDecl[] {
  const result: ImageDecl[] = [];

  for (const child of imagesEl.children) {
    if (child.name === 'xbm') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      const srcAttr = requireAttribute(child, 'src', filename, diagnostics);

      const decl: XbmImageDecl = {
        kind: 'xbm',
        name: nameAttr?.value ?? '',
        src: srcAttr?.value ?? '',
        loc: child.loc,
      };
      result.push(decl);
    } else if (child.name === 'convert') {
      const nameAttr = requireAttribute(child, 'name', filename, diagnostics);
      const srcAttr = requireAttribute(child, 'src', filename, diagnostics);
      const widthAttr = requireAttribute(child, 'width', filename, diagnostics);
      const heightAttr = requireAttribute(child, 'height', filename, diagnostics);

      const width =
        getNumberAttribute(child, 'width', filename, diagnostics) ??
        parseInt(widthAttr?.value ?? '0', 10);
      const height =
        getNumberAttribute(child, 'height', filename, diagnostics) ??
        parseInt(heightAttr?.value ?? '0', 10);
      const mode = getAttributeValue(child, 'mode') as
        | 'threshold'
        | 'dither'
        | undefined;
      const threshold = getNumberAttribute(
        child,
        'threshold',
        filename,
        diagnostics,
      );

      const decl: ConvertImageDecl = {
        kind: 'convert',
        name: nameAttr?.value ?? '',
        src: srcAttr?.value ?? '',
        width,
        height,
        mode,
        threshold,
        loc: child.loc,
      };
      result.push(decl);
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown image declaration '<${child.name}>' in <images>`,
        offendingText: child.name,
      });
    }
  }

  return result;
}

/**
 * Transforms a raw XML root element into a typed Globals document model.
 */
export function parseGlobals(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): Globals | undefined {
  if (root.name !== 'globals') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <globals>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  let consts: readonly ConstDecl[] = [];
  let subjects: readonly SubjectDecl[] = [];
  let styles: readonly StyleDecl[] = [];
  let fonts: readonly FontDecl[] = [];
  let images: readonly ImageDecl[] = [];

  for (const child of root.children) {
    if (child.name === 'consts') {
      consts = parseConsts(child, filename, diagnostics);
    } else if (child.name === 'subjects') {
      subjects = parseSubjects(child, filename, diagnostics);
    } else if (child.name === 'styles') {
      styles = parseStyleDeclarations(child, filename, diagnostics);
    } else if (child.name === 'fonts') {
      fonts = parseFonts(child, filename, diagnostics);
    } else if (child.name === 'images') {
      images = parseImages(child, filename, diagnostics);
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown element '<${child.name}>' in <globals>`,
        offendingText: child.name,
      });
    }
  }

  return {
    consts,
    subjects,
    styles,
    fonts,
    images,
    loc: root.loc,
  };
}

/**
 * Parses a globals XML file from raw text into a ParseResult<Globals>.
 */
export function parseGlobalsFile(
  xml: string,
  filename: string,
): ParseResult<Globals> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  if (!rawDoc.root) {
    return { diagnostics };
  }

  const globals = parseGlobals(rawDoc.root, filename, diagnostics);
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !globals) {
    return { diagnostics };
  }

  return {
    value: globals,
    diagnostics,
  };
}
