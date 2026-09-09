/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/validate.test.ts
 * Purpose: Integration and determinism tests for the validator orchestrator (§15.1).
 * Description: Verifies full project validation, multi-diagnostic collection without
 *              early bail, output determinism, stable diagnostic ordering, and schema
 *              version migration hints.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProjectFile,
  parseGlobalsFile,
  parseScreenFile,
  parseComponentFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateInput } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';

describe('validate orchestrator integration', () => {
  const validDir = resolve(__dirname, 'fixtures', 'valid');

  function loadValidProject(): ValidateInput {
    const projectXml = readFileSync(resolve(validDir, 'u8g2gl.xml'), 'utf-8');
    const globalsXml = readFileSync(resolve(validDir, 'globals.xml'), 'utf-8');
    const screenXml = readFileSync(
      resolve(validDir, 'screens', 'screen_home.xml'),
      'utf-8',
    );
    const componentXml = readFileSync(
      resolve(validDir, 'components', 'status_bar', 'status_bar.xml'),
      'utf-8',
    );
    const widgetXml = readFileSync(
      resolve(validDir, 'widgets', 'u8g2gl_label', 'u8g2gl_label.xml'),
      'utf-8',
    );

    const project = parseProjectFile(projectXml, 'u8g2gl.xml').value!;
    const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
    const screen = parseScreenFile(screenXml, 'screens/screen_home.xml').value!;
    const component = parseComponentFile(
      componentXml,
      'components/status_bar/status_bar.xml',
    ).value!;
    const widget = parseWidgetManifestFile(
      widgetXml,
      'widgets/u8g2gl_label/u8g2gl_label.xml',
    ).value!;

    return {
      project,
      globals,
      screens: [screen],
      components: [component],
      widgetManifests: [widget],
      catalogue: CATALOGUE,
    };
  }

  it('valid project fixture produces 0 errors and 0 warnings', () => {
    const input = loadValidProject();
    const result = validate(input);

    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('collects multiple errors across files without early bail', () => {
    const input = loadValidProject();

    // Introduce errors in project, screen, and globals
    const invalidInput: ValidateInput = {
      ...input,
      project: {
        ...input.project,
        schema: '0.1',
      },
      screens: [
        {
          ...input.screens[0]!,
          name: '123_invalid_screen',
        },
      ],
    };

    const result = validate(invalidInput);
    expect(result.errors).toBeGreaterThanOrEqual(2);

    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION);
    expect(codes).toContain(DIAGNOSTIC_CODES.INVALID_NAME);
  });

  it('is completely deterministic across repeated invocations', () => {
    const input = loadValidProject();
    const brokenInput: ValidateInput = {
      ...input,
      project: {
        ...input.project,
        schema: '0.99',
      },
    };

    const res1 = validate(brokenInput);
    const res2 = validate(brokenInput);

    expect(res1).toEqual(res2);
    expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
  });

  it('sorts diagnostics deterministically by file, then line, then column', () => {
    const input = loadValidProject();
    const brokenInput: ValidateInput = {
      ...input,
      project: {
        ...input.project,
        loc: { file: 'z_project.xml', line: 10, column: 5 },
        schema: '0.2',
      },
      screens: [
        {
          ...input.screens[0]!,
          loc: { file: 'a_screen.xml', line: 5, column: 2 },
          name: '99screen',
        },
        {
          ...input.screens[0]!,
          loc: { file: 'a_screen.xml', line: 2, column: 1 },
          name: '88screen',
        },
      ],
    };

    const result = validate(brokenInput);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);

    // Verify ordering: a_screen:2:1 < a_screen:5:2 < z_project:10:5
    for (let i = 0; i < result.diagnostics.length - 1; i++) {
      const a = result.diagnostics[i]!;
      const b = result.diagnostics[i + 1]!;

      const fileComp = a.file.localeCompare(b.file);
      if (fileComp !== 0) {
        expect(fileComp).toBeLessThan(0);
      } else if (a.line !== b.line) {
        expect(a.line).toBeLessThan(b.line);
      } else {
        expect(a.column).toBeLessThanOrEqual(b.column);
      }
    }
  });

  it('reports U8G2GL_UNKNOWN_SCHEMA_VERSION with migration suggestion', () => {
    const input = loadValidProject();
    const badSchemaInput: ValidateInput = {
      ...input,
      project: {
        ...input.project,
        schema: '0.1',
      },
    };

    const result = validate(badSchemaInput);
    const schemaDiag = result.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
    );

    expect(schemaDiag).toBeDefined();
    expect(schemaDiag?.severity).toBe('error');
    expect(schemaDiag?.suggestions).toEqual(['0.3']);
    expect(schemaDiag?.message).toContain("Expected '0.3'");
  });
});
