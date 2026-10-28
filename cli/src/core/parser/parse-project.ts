/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-project.ts
 * Purpose: Transforms raw XML AST into typed U8g2glProject schema structures (§5.1).
 * Description: Extracts schema version, project identity, compilation targets,
 *              display setup constructors, hardware bus parameters, and generator
 *              output options, attaching source locations to all nodes.
 *
 * Exports:
 * - parseProject: Transform a parsed RawXmlElement into a U8g2glProject model
 * - parseProjectFile: Parse a raw XML string into a ParseResult<U8g2glProject>
 */

import type {
  BusConfig,
  OutputConfig,
  Target,
  U8g2glProject,
} from '../schema/project.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import {
  getAttribute,
  getAttributeValue,
  getChild,
  getChildren,
  getNumberAttribute,
  requireAttribute,
  type RawXmlElement,
} from './raw-xml.js';
import { tokenizeXml } from './cst-adapter.js';
import type { ParseResult } from './index.js';

/**
 * Transforms a raw XML target element into a typed Target instance.
 */
function parseTarget(
  targetEl: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): Target {
  const nameAttr = requireAttribute(targetEl, 'name', filename, diagnostics);
  const name = nameAttr?.value ?? '';

  const displayEl = getChild(targetEl, 'display');

  // setup constructor name: on <display setup="..."> or on <target setup="...">
  const setupAttr =
    (displayEl ? getAttribute(displayEl, 'setup') : undefined) ??
    getAttribute(targetEl, 'setup');

  if (!setupAttr) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
      severity: 'error',
      file: filename,
      line: targetEl.loc.line,
      column: targetEl.loc.column,
      message: `Missing required attribute 'setup' on target '${name}'`,
      offendingText: name,
    });
  }
  const setup = setupAttr?.value ?? '';

  // rotation: on <display rotation="..."> or <target rotation="...">
  const rotation =
    (displayEl ? getAttributeValue(displayEl, 'rotation') : undefined) ??
    getAttributeValue(targetEl, 'rotation');

  // ramBudget: on <target ram_budget="..."> or <target ramBudget="..."> or <display ...>
  const ramBudget =
    getNumberAttribute(targetEl, 'ram_budget', filename, diagnostics) ??
    getNumberAttribute(targetEl, 'ramBudget', filename, diagnostics) ??
    (displayEl
      ? getNumberAttribute(displayEl, 'ram_budget', filename, diagnostics) ??
        getNumberAttribute(displayEl, 'ramBudget', filename, diagnostics)
      : undefined);

  // bus configuration: from <bus> child or from attributes on <display> / <target>
  let bus: BusConfig | undefined;
  const busEl = getChild(targetEl, 'bus');

  if (busEl) {
    bus = {
      cs: getAttributeValue(busEl, 'cs'),
      dc: getAttributeValue(busEl, 'dc'),
      reset: getAttributeValue(busEl, 'reset'),
      address: getAttributeValue(busEl, 'address'),
      loc: busEl.loc,
    };
  } else {
    const fallbackBusSource = displayEl ?? targetEl;
    const cs = getAttributeValue(fallbackBusSource, 'cs');
    const dc = getAttributeValue(fallbackBusSource, 'dc');
    const reset = getAttributeValue(fallbackBusSource, 'reset');
    const address = getAttributeValue(fallbackBusSource, 'address');

    if (cs !== undefined || dc !== undefined || reset !== undefined || address !== undefined) {
      bus = {
        cs,
        dc,
        reset,
        address,
        loc: fallbackBusSource.loc,
      };
    }
  }

  return {
    name,
    setup,
    rotation,
    bus,
    ramBudget,
    loc: targetEl.loc,
  };
}

/**
 * Transforms a raw XML root element into a U8g2glProject model.
 */
export function parseProject(
  root: RawXmlElement,
  filename: string,
  diagnostics: Diagnostic[],
): U8g2glProject | undefined {
  if (root.name !== 'u8g2gl') {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MALFORMED_XML,
      severity: 'error',
      file: filename,
      line: root.loc.line,
      column: root.loc.column,
      message: `Expected root element <u8g2gl>, found <${root.name}>`,
      offendingText: root.name,
    });
    return undefined;
  }

  const schemaAttr = requireAttribute(root, 'schema', filename, diagnostics);
  const nameAttr = requireAttribute(root, 'name', filename, diagnostics);
  const versionAttr = requireAttribute(root, 'version', filename, diagnostics);

  const schema = schemaAttr?.value ?? '';
  const name = nameAttr?.value ?? '';
  const version = versionAttr?.value ?? '';

  // Check known child elements
  const targetsList: Target[] = [];
  let outputConfig: OutputConfig | undefined;

  for (const child of root.children) {
    if (child.name === 'targets') {
      const targets = getChildren(child, 'target');
      for (const targetEl of targets) {
        targetsList.push(parseTarget(targetEl, filename, diagnostics));
      }
    } else if (child.name === 'target') {
      // Direct child target
      targetsList.push(parseTarget(child, filename, diagnostics));
    } else if (child.name === 'output') {
      outputConfig = {
        dir: getAttributeValue(child, 'dir'),
        prefix: getAttributeValue(child, 'prefix'),
        loc: child.loc,
      };
    } else {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.MALFORMED_XML,
        severity: 'error',
        file: filename,
        line: child.loc.line,
        column: child.loc.column,
        message: `Unknown element '<${child.name}>' in <u8g2gl>`,
        offendingText: child.name,
      });
    }
  }

  return {
    schema,
    name,
    version,
    targets: targetsList,
    output: outputConfig,
    loc: root.loc,
  };
}

/**
 * Parses a project XML file from raw text into a ParseResult<U8g2glProject>.
 */
export function parseProjectFile(
  xml: string,
  filename: string,
): ParseResult<U8g2glProject> {
  const rawDoc = tokenizeXml(xml, filename);
  const diagnostics = [...rawDoc.diagnostics];

  if (!rawDoc.root) {
    return { diagnostics };
  }

  const project = parseProject(rawDoc.root, filename, diagnostics);
  const hasError = diagnostics.some((d) => d.severity === 'error');

  if (hasError || !project) {
    return { diagnostics };
  }

  return {
    value: project,
    diagnostics,
  };
}
