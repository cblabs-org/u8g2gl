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
 *              the wiring belongs instead ([D-22]). Every other attribute
 *              and child element is checked against the project vocabulary,
 *              the table the designer's forms are built from, so the parser
 *              and the forms cannot disagree about what `u8g2gl.xml` may
 *              say: an attribute the vocabulary does not spell on that
 *              element is U8G2GL_UNKNOWN_ATTRIBUTE, an unknown child is
 *              U8G2GL_MALFORMED_XML, both errors.
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
  attributeSpellings,
  PROJECT_VOCABULARY,
  vocabularyChildren,
} from '../schema/project-vocabulary.js';
import { findClosest } from '../catalogue/edit-distance.js';
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

/** For an element on which every unknown attribute is reported. */
const NO_EXEMPTION: ReadonlySet<string> = new Set();

/**
 * The parser's errors that leave the model's shape intact, so the model is
 * kept beside them. A removed pin or `<bus>` and an unknown attribute were
 * never read into the model, so it is complete without them; keeping it lets
 * validation go on to the project's real schema and targets. An unknown
 * element, a missing required attribute or an unreadable value is not here:
 * the model would be missing what the file meant, so it is withheld.
 */
const MODEL_PRESERVING_CODES: ReadonlySet<string> = new Set([
  DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE,
  DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
]);

/**
 * The ids of the `u8g2gl.xml` elements the parser reads, as the vocabulary
 * keys them. Each element's known attributes and children come from the
 * vocabulary under this id.
 */
type ProjectElementId = 'project' | 'targets' | 'target' | 'display' | 'output';

/**
 * Every attribute name the parser accepts on each `u8g2gl.xml` element, built
 * once from the vocabulary: each attribute's canonical spelling and every
 * alternative, credited to the element it is written on. `ramBudget` on
 * `<target>` is an alternative of `ram_budget`, so it is known there; nothing
 * here is typed a second time ([D-17]).
 */
const KNOWN_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = (() => {
  const known = new Map<string, string[]>();
  for (const element of PROJECT_VOCABULARY) {
    if (element.file !== 'u8g2gl.xml') {
      continue;
    }
    for (const attribute of element.attributes) {
      for (const spelling of attributeSpellings(element, attribute)) {
        const names = known.get(spelling.element) ?? [];
        if (!names.includes(spelling.name)) {
          names.push(spelling.name);
        }
        known.set(spelling.element, names);
      }
    }
  }
  return known;
})();

// reportUnknownAttributes
// U8G2GL_UNKNOWN_ATTRIBUTE for each attribute on `element` that the vocabulary
// does not spell on that element, at the attribute's name, with the closest
// known spellings suggested as a widget's unknown attribute is. An error: an
// attribute the parser never reads silently does nothing, which is how the
// pins went unnoticed. `xmlns` and `xml:` attributes get no exemption, as on a
// widget or a `<style>`: the tokeniser hands them over as ordinary attributes
// and U8G2GL declares no namespace.
//   element     — the raw element
//   id          — its vocabulary id
//   exempt      — names another check already reports (the removed pins)
//   filename    — the project file
//   diagnostics — where the reports are appended
function reportUnknownAttributes(
  element: RawXmlElement,
  id: ProjectElementId,
  exempt: ReadonlySet<string>,
  filename: string,
  diagnostics: Diagnostic[],
): void {
  const known = KNOWN_ATTRIBUTES.get(id) ?? [];
  for (const attribute of element.attributes) {
    if (known.includes(attribute.name) || exempt.has(attribute.name)) {
      continue;
    }
    const suggestions = findClosest(attribute.name, known);
    diagnostics.push({
      code: DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
      severity: 'error',
      file: filename,
      line: attribute.nameLoc.line,
      column: attribute.nameLoc.column,
      message: `Unknown attribute '${attribute.name}' on <${element.name}>.`,
      offendingText: attribute.name,
      ...(suggestions.length > 0 ? { suggestions } : {}),
    });
  }
}

// unknownElementDiagnostic
// The U8G2GL_MALFORMED_XML an element the vocabulary does not allow where it
// is written gets, at its tag. One wording for every parent, the one an
// unknown child of `<u8g2gl>` has always had.
//   child    — the unknown element
//   parent   — the tag it was written in
//   filename — the project file
function unknownElementDiagnostic(child: RawXmlElement, parent: string, filename: string): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES.MALFORMED_XML,
    severity: 'error',
    file: filename,
    line: child.loc.line,
    column: child.loc.column,
    message: `Unknown element '<${child.name}>' in <${parent}>`,
    offendingText: child.name,
  };
}

// reportUnknownChildren
// An unknown-element error for each child of `element` whose tag the
// vocabulary does not list among that element's children. `<bus>` is skipped
// under `<target>`: it was a child there until schema 0.7, and
// reportRemovedWiring() refuses it with the removal message alone.
//   element     — the raw element
//   id          — its vocabulary id
//   filename    — the project file
//   diagnostics — where the reports are appended
function reportUnknownChildren(
  element: RawXmlElement,
  id: ProjectElementId,
  filename: string,
  diagnostics: Diagnostic[],
): void {
  const allowed = vocabularyChildren(id).map((child) => child.tag);
  for (const child of element.children) {
    if (allowed.includes(child.name) || (id === 'target' && child.name === REMOVED_BUS_ELEMENT)) {
      continue;
    }
    diagnostics.push(unknownElementDiagnostic(child, element.name, filename));
  }
}

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

  // Everything else the vocabulary does not have is refused too. The pins are
  // exempt here because the refusal above already names each one.
  reportUnknownAttributes(targetEl, 'target', REMOVED_PIN_ATTRIBUTES, filename, diagnostics);
  reportUnknownChildren(targetEl, 'target', filename, diagnostics);
  for (const display of getChildren(targetEl, 'display')) {
    reportUnknownAttributes(display, 'display', REMOVED_PIN_ATTRIBUTES, filename, diagnostics);
    reportUnknownChildren(display, 'display', filename, diagnostics);
  }

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
  reportUnknownAttributes(root, 'project', NO_EXEMPTION, filename, diagnostics);

  // Check known child elements
  const targetsList: Target[] = [];
  let outputConfig: OutputConfig | undefined;

  for (const child of root.children) {
    if (child.name === 'targets') {
      reportUnknownAttributes(child, 'targets', NO_EXEMPTION, filename, diagnostics);
      reportUnknownChildren(child, 'targets', filename, diagnostics);
      const targets = getChildren(child, 'target');
      for (const targetEl of targets) {
        targetsList.push(parseTarget(targetEl, filename, diagnostics));
      }
    } else if (child.name === 'target') {
      // Direct child target
      targetsList.push(parseTarget(child, filename, diagnostics));
    } else if (child.name === 'output') {
      reportUnknownAttributes(child, 'output', NO_EXEMPTION, filename, diagnostics);
      reportUnknownChildren(child, 'output', filename, diagnostics);
      outputConfig = {
        dir: getAttributeValue(child, 'dir'),
        prefix: getAttributeValue(child, 'prefix'),
        loc: child.loc,
      };
    } else {
      diagnostics.push(unknownElementDiagnostic(child, root.name, filename));
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
 * Any error withholds the model, except those in MODEL_PRESERVING_CODES — a
 * removed pin or `<bus>`, and an unknown attribute — which never shaped the
 * model, so it is complete without them. Keeping it lets validation go on to
 * the project's real schema and targets. The kept errors are still errors, so
 * `generate` still writes nothing. A withheld model leaves its consumer a
 * placeholder; `checkProject()` reports nothing about that placeholder.
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
    (d) => d.severity === 'error' && !MODEL_PRESERVING_CODES.has(d.code),
  );

  if (hasError || !project) {
    return { diagnostics };
  }

  return {
    value: project,
    diagnostics,
  };
}
