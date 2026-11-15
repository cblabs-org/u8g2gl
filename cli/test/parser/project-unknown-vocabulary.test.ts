/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/project-unknown-vocabulary.test.ts
 * Purpose: Holds `u8g2gl.xml` to its vocabulary (design_spec §5.1): every
 *          attribute and child element the project vocabulary does not have
 *          is an error, once, at its own line, with the nearest spelling
 *          suggested, and an alias the vocabulary lists is not. A removed pin
 *          is reported once, as removed. An unknown attribute keeps the parsed
 *          model, so validation still reads the project's real schema and
 *          target; an unknown element withholds it, and then the parse error
 *          is the only report, never a schema version the file did not write.
 * Description: Inline documents through `parseProjectFile()`, where the check
 *              is made, and through `checkProject()`, where both journeys
 *              merge what loading found with what validation found. Every
 *              committed project fixture is parsed too, so a fixture that
 *              writes something the vocabulary lacks is caught here.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { checkProject, hasProjectModel, type ProjectModel } from '../../src/core/generator/check-project.js';
import type { U8g2glProject } from '../../src/core/schema/project.js';
import { buildManifestRegistry } from '../../src/core/manifest/manifest-registry.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

const SETUP = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';

/** A project file with every element present, and `extra` spliced into one of them. */
function project(parts: {
  readonly root?: string;
  readonly targets?: string;
  readonly target?: string;
  readonly display?: string;
  readonly output?: string;
  readonly inTargets?: string;
  readonly inTarget?: string;
  readonly inDisplay?: string;
  readonly schema?: string;
}): string {
  const extra = (text: string | undefined): string => (text === undefined ? '' : ` ${text}`);
  return [
    `<u8g2gl schema="${parts.schema ?? '0.7'}" name="p" version="1.0.0"${extra(parts.root)}>`,
    `  <targets${extra(parts.targets)}>`,
    `    <target name="main"${extra(parts.target)}>`,
    `      <display setup="${SETUP}"${extra(parts.display)}>${parts.inDisplay ?? ''}</display>`,
    ...(parts.inTarget !== undefined ? [`      ${parts.inTarget}`] : []),
    '    </target>',
    ...(parts.inTargets !== undefined ? [`    ${parts.inTargets}`] : []),
    '  </targets>',
    `  <output dir="generated"${extra(parts.output)} />`,
    '</u8g2gl>',
    '',
  ].join('\n');
}

/** The 1-based line and column at which `needle` starts in `text`. */
function locate(text: string, needle: string): { readonly line: number; readonly column: number } {
  const at = text.indexOf(needle);
  expect(at, needle).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, at).split('\n');
  return { line: before.length, column: (before[before.length - 1]?.length ?? 0) + 1 };
}

/** The diagnostics a document's parse reports, as code, place and message. */
function reported(xml: string): readonly Pick<Diagnostic, 'code' | 'line' | 'column' | 'message' | 'suggestions'>[] {
  return parseProjectFile(xml, 'u8g2gl.xml').diagnostics.map((d) => ({
    code: d.code,
    line: d.line,
    column: d.column,
    message: d.message,
    ...(d.suggestions !== undefined ? { suggestions: d.suggestions } : {}),
  }));
}

/** A loaded model for one `u8g2gl.xml` text, built as both loaders build it. */
function modelOf(xml: string): ProjectModel {
  const result = parseProjectFile(xml, 'u8g2gl.xml');
  const placeholder: U8g2glProject = { schema: '', name: 'unnamed', version: '1.0.0', targets: [] };
  return {
    project: result.value ?? placeholder,
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    manifests: buildManifestRegistry({ framework: [], project: [] }),
    catalogue: CATALOGUE,
    loadDiagnostics: result.diagnostics,
    hasProjectManifest: true,
    projectWithheld: result.value === undefined,
  };
}

describe('an unknown attribute on a u8g2gl.xml element is one error at its name, with a suggestion', () => {
  const cases = [
    { element: 'u8g2gl', part: 'root', typo: 'nmae', expected: ['name'] },
    { element: 'targets', part: 'targets', typo: 'dflt', expected: undefined },
    { element: 'target', part: 'target', typo: 'ram_budgte', expected: ['ram_budget', 'ramBudget'] },
    { element: 'display', part: 'display', typo: 'rotaton', expected: ['rotation'] },
    { element: 'output', part: 'output', typo: 'prefx', expected: ['prefix'] },
  ] as const;

  it.each(cases)('<$element $typo>', ({ element, part, typo, expected }) => {
    const xml = project({ [part]: `${typo}="1"` });
    const at = locate(xml, `${typo}="1"`);
    expect(reported(xml)).toEqual([
      {
        code: DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
        line: at.line,
        column: at.column,
        message: `Unknown attribute '${typo}' on <${element}>.`,
        ...(expected !== undefined ? { suggestions: expected } : {}),
      },
    ]);
    expect(parseProjectFile(xml, 'u8g2gl.xml').diagnostics.every((d) => d.severity === 'error')).toBe(true);
  });

  it('does not report an alias the vocabulary lists: ramBudget on <target> and <display>', () => {
    expect(reported(project({ target: 'ramBudget="9000"' }))).toEqual([]);
    expect(reported(project({ display: 'ramBudget="9000"' }))).toEqual([]);
    expect(reported(project({ display: 'ram_budget="9000"' }))).toEqual([]);
  });

  it('does not report an attribute the vocabulary spells on another element: setup and rotation on <target>', () => {
    const xml = [
      '<u8g2gl schema="0.7" name="p" version="1.0.0">',
      `  <target name="main" setup="${SETUP}" rotation="R2" ram_budget="100" />`,
      '</u8g2gl>',
    ].join('\n');
    expect(reported(xml)).toEqual([]);
  });

  it('does not exempt xmlns: U8G2GL declares no namespace, as on a widget or <style>', () => {
    const xml = project({ root: 'xmlns="urn:example"' });
    expect(reported(xml).map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE]);
  });
});

describe('an unknown child of a u8g2gl.xml element is one error at its tag', () => {
  const cases = [
    { parent: 'targets', part: 'inTargets' },
    { parent: 'target', part: 'inTarget' },
    { parent: 'display', part: 'inDisplay' },
  ] as const;

  it.each(cases)('<wibble/> in <$parent>', ({ parent, part }) => {
    const xml = project({ [part]: '<wibble/>' });
    const at = locate(xml, '<wibble/>');
    expect(reported(xml)).toEqual([
      { code: DIAGNOSTIC_CODES.MALFORMED_XML, line: at.line, column: at.column, message: `Unknown element '<wibble>' in <${parent}>` },
    ]);
  });

  it('keeps <bus> to its removal message alone', () => {
    const xml = project({ inTarget: '<bus kind="spi"/>' });
    expect(reported(xml).map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE]);
  });
});

describe('a removed pin is reported once, as removed, never also as unknown', () => {
  it.each(['target', 'display'] as const)('cs on <%s>', (part) => {
    const xml = project({ [part]: 'cs="5"' });
    expect(reported(xml).map((d) => d.code)).toEqual([DIAGNOSTIC_CODES.REMOVED_ATTRIBUTE]);
  });
});

describe('the model survives an unknown attribute, and a withheld one reports nothing about the placeholder', () => {
  it('keeps the parsed project beside an unknown attribute, so its real schema and target are validated', () => {
    const xml = project({ target: 'foo="1"', schema: '0.9' });
    const result = parseProjectFile(xml, 'u8g2gl.xml');
    expect(result.value?.schema).toBe('0.9');
    expect(result.value?.targets.map((t) => t.name)).toEqual(['main']);

    const codes = checkProject(modelOf(xml), 'warning').diagnostics.map((d) => d.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE);
    // The file's own '0.9', not the placeholder's ''.
    const schema = checkProject(modelOf(xml), 'warning').diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION);
    expect(schema?.message).toContain("'0.9'");
    expect(schema?.file).toBe('u8g2gl.xml');
  });

  it('gives <foo/> under <u8g2gl> exactly one error, the unknown element', () => {
    const xml = project({}).replace('  <targets>', '  <foo/>\n  <targets>');
    const model = modelOf(xml);
    expect(model.projectWithheld).toBe(true);
    expect(hasProjectModel(model)).toBe(false);
    const result = checkProject(model, 'warning');
    expect(result.diagnostics.map((d) => `${d.code} ${d.message}`)).toEqual([
      `${DIAGNOSTIC_CODES.MALFORMED_XML} Unknown element '<foo>' in <u8g2gl>`,
    ]);
    expect(result.errors).toBe(1);
  });

  it('still reports a genuinely empty schema="" that the file wrote', () => {
    const xml = project({ schema: '' });
    const model = modelOf(xml);
    expect(model.projectWithheld).toBe(false);
    const codes = checkProject(model, 'warning').diagnostics.map((d) => d.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION);
  });

  it('still drops the placeholder schema when no u8g2gl.xml was loaded at all', () => {
    const model: ProjectModel = { ...modelOf(project({})), project: { schema: '', name: 'unnamed', version: '1.0.0', targets: [] }, loadDiagnostics: [], hasProjectManifest: false, projectWithheld: false };
    expect(hasProjectModel(model)).toBe(false);
    expect(checkProject(model, 'warning').diagnostics.map((d) => d.code)).not.toContain(DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION);
  });
});

describe('every committed project fixture parses against the vocabulary with no diagnostic', () => {
  const root = resolve(__dirname, '../../..');
  const fixtures = [
    'cli/test/fixtures/departures-project',
    'cli/test/generator/fixtures/emit-project',
    'cli/test/integration/fixtures/broken-project',
    'cli/test/integration/fixtures/valid-project',
    'cli/test/node/design/test-run/fixtures/widget-probe-0.4',
    'cli/test/validator/fixtures/rotated-r1',
    'cli/test/validator/fixtures/valid',
    'test/generated_fixture',
  ];

  it.each(fixtures)('%s', (fixture) => {
    const xml = readFileSync(join(root, fixture, 'u8g2gl.xml'), 'utf8');
    const result = parseProjectFile(xml, 'u8g2gl.xml');
    expect(result.diagnostics).toEqual([]);
    expect(result.value).toBeDefined();
  });
});
