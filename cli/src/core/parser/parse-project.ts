/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/parser/parse-project.ts
 * Purpose: Transforms raw XML AST into typed U8g2glProject schema structures (§5.1).
 * Description: Extracts schema version, project identity, compilation targets,
 *              display setup constructors, rotations, and generator output
 *              options, attaching source locations to all nodes. The pin
 *              attributes and `<bus>`, removed in schema 0.7, are refused at
 *              every version with U8G2GL_REMOVED_ATTRIBUTE, which says where
 *              the wiring belongs instead ([D-22]).
 *
 * Exports:
 * - parseProject: Transform a parsed RawXmlElement into a U8g2glProject model
 * - parseProjectFile: Parse a raw XML string into a ParseResult<U8g2glProject>
 */

import type {
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
import type { SourceLocation } from '../schema/source-location.js';
import { tokenizeXml } from './cst-adapter.js';
import type { ParseResult } from './index.js';

/**
 * The pin attributes schema 0.7 removed. They never had any effect: U8G2GL
 * does not construct the display, the board does ([D-22]).
 */
const REMOVED_PIN_ATTRIBUTES: ReadonlySet<string> = new Set(['cs', 'dc', 'reset', 'address']);

/** The element schema 0.7 removed, which only ever held those attributes. */
const REMOVED_BUS_ELEMENT = 'bus';

// removedDiagnostic
// One U8G2GL_REMOVED_ATTRIBUTE, saying where the wiring belongs and how to
// get the board-side code for this target's display.
//   what     — the attribute or element as the message names it ('cs', '<bus>')
//   kind     — 'attribute' or 'element'
//   setup    — the target's setup when written, so the command can be copied
//   loc      — the attribute's name or the element's tag
//   filename — the project file
function removedDiagnostic(
  what: string,
  kind: 'attribute' | 'element',
  setup: string | undefined,
  loc: SourceLocation,
  filename: string,
): Diagnostic {
  const display = setup !== undefined && setup !== '' ? setup : '<setup>';
  return {
    code: DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE,
    severity: 'error',
    file: filename,
    line: loc.line,
    column: loc.column,
    message:
      `'${what}' is not a U8G2GL ${kind}: pins and bus are configured by your firmware's board ` +
      `(e.g. \`board.h\`); U8G2GL describes the panel. See \`u8g2gl display ${display} --snippet\`.`,
    offendingText: kind === 'element' ? REMOVED_BUS_ELEMENT : what,
  };
}

// reportRemovedWiring
// Refuses every pin attribute on a target, its `<display>` and any `<bus>`,
// and each `<bus>` element itself, once per occurrence, in document order.
// Refused at every schema version: a pin was never read by anything, so the
// only project this breaks is one that writes one, and each gets the fix.
//   targetEl    — the `<target>` element
//   setup       — the target's setup when written
//   filename    — the project file
//   diagnostics — where the refusals are appended
function reportRemovedWiring(
  targetEl: RawXmlElement,
  setup: string | undefined,
  filename: string,
  diagnostics: Diagnostic[],
): void {
  const refuseAttributes = (element: RawXmlElement): void => {
    for (const attribute of element.attributes) {
      if (REMOVED_PIN_ATTRIBUTES.has(attribute.name)) {
        diagnostics.push(removedDiagnostic(attribute.name, 'attribute', setup, attribute.nameLoc, filename));
      }
    }
  };

  refuseAttributes(targetEl);
  for (const child of targetEl.children) {
    if (child.name === 'display') {
      refuseAttributes(child);
    } else if (child.name === REMOVED_BUS_ELEMENT) {
      diagnostics.push(removedDiagnostic(`<${REMOVED_BUS_ELEMENT}>`, 'element', setup, child.loc, filename));
      refuseAttributes(child);
    }
  }
}

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

  // The pins and <bus> are refused, never read (schema 0.7, [D-22]).
  reportRemovedWiring(targetEl, setupAttr?.value, filename, diagnostics);

  return {
    name,
    setup,
    rotation,
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
 *
 * Any error withholds the model, except U8G2GL_REMOVED_ATTRIBUTE: a pin or
 * `<bus>` never shaped the model, so it is complete without them. Keeping it
 * lets validation go on to the project's real schema and targets, instead of
 * reporting the empty placeholder a withheld model leaves (a schema version
 * '' the file never wrote, and no targets). The refusal is still an error, so
 * `generate` still writes nothing.
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
  const hasError = diagnostics.some(
    (d) => d.severity === 'error' && d.code !== DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE,
  );

  if (hasError || !project) {
    return { diagnostics };
  }

  return {
    value: project,
    diagnostics,
  };
}
