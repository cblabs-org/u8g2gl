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
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { validate, type ValidateInput } from '../../src/core/validator/index.js';
import { CATALOGUE } from '../../src/data/catalogue.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

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
      resolve(validDir, 'widgets', 'status_bar', 'status_bar.xml'),
      'utf-8',
    );
    // A user composite carrying §6.6's `wd_` prefix. §13.4 reserved `wd_` until
    // the Chief Architect un-reserved it (2026-09-16), which is why WO7 had to
    // rename this fixture's ancestor; it is back so a test covers the
    // convention rather than its absence (PR-04 WO8c).
    const badgeXml = readFileSync(resolve(validDir, 'widgets', 'wd_badge', 'wd_badge.xml'), 'utf-8');

    const project = parseProjectFile(projectXml, 'u8g2gl.xml').value!;
    const globals = parseGlobalsFile(globalsXml, 'globals.xml').value!;
    const screen = parseScreenFile(screenXml, 'screens/screen_home.xml').value!;
    // Composite: a <widget> root carrying a <view> ([D-18], PR-3R WO9) — same
    // parser as a plain widget, distinguished only by the fixture's content.
    const component = parseWidgetManifestFile(
      componentXml,
      'widgets/status_bar/status_bar.xml',
    ).value!;
    const badge = parseWidgetManifestFile(badgeXml, 'widgets/wd_badge/wd_badge.xml').value!;

    // The fixture ships no copy of u8g2gl_label's manifest (PR-04 WO1): the
    // label comes from the bundled framework manifests, as it does in the CLI.
    return {
      project,
      globals,
      screens: [screen],
      manifests: frameworkRegistry([component, badge]),
      catalogue: CATALOGUE,
    };
  }

  it('valid project fixture produces 0 errors, and warns only about constructs generate does not build yet', () => {
    const input = loadValidProject();
    const result = validate(input);

    // PR-04 WO5b: the fixture's <bdf> fonts are valid as authored but refused by
    // `generate` until PR-04b, so validation reports them as warnings (decision 3).
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(2);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      DIAGNOSTIC_CODES.NOT_YET_SUPPORTED,
      DIAGNOSTIC_CODES.NOT_YET_SUPPORTED,
    ]);
  });

  // §6.6 recommends `wd_` for user elements and §13.4 reserved it, so a
  // composite named as the spec recommends was rejected — the contradiction the
  // Chief Architect resolved in favour of §6.6 (2026-09-16, ruling 2).
  it('accepts a wd_-named composite, its wd_-named child, and its instance', () => {
    const result = validate(loadValidProject());
    const names = result.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.INVALID_NAME);

    expect(names).toEqual([]);
    expect(result.errors).toBe(0);
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
    expect(schemaDiag?.suggestions).toEqual(['0.4']);
    expect(schemaDiag?.message).toContain("Expected '0.4'");
  });

  // --- PR-3R WO8: the §15.4 refusal path — 0.3 is superseded, not merely
  // unknown, so it must be refused with the specific migration table rather
  // than the generic "unknown version" message an unrecognised string gets.
  describe('schema version refusal (§15.4, PR-3R WO8)', () => {
    it('refuses schema="0.3" with a diagnostic naming specific migrations, not a generic mismatch', () => {
      const input = loadValidProject();
      const legacyInput: ValidateInput = {
        ...input,
        project: { ...input.project, schema: '0.3' },
      };

      const result = validate(legacyInput);
      const schemaDiag = result.diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION,
      );

      expect(schemaDiag).toBeDefined();
      expect(schemaDiag?.severity).toBe('error');
      // Assert on message *content* — a test only checking the diagnostic
      // code would pass against the obscure "unknown version" failure this
      // refusal path exists to prevent (WORKORDER testing requirement).
      expect(schemaDiag?.message).toContain('long_mode="clip"');
      expect(schemaDiag?.message).toContain('scroll_circular');
      expect(schemaDiag?.message).toContain("'animated' is removed");
      expect(schemaDiag?.message).toContain("'<component>' is removed");
      expect(schemaDiag?.message).toContain("'draw='");
      // Must not be reported under the generic unknown-version code.
      expect(
        result.diagnostics.some((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION),
      ).toBe(false);
    });

    it('validates cleanly at schema="0.4" (the fixture default)', () => {
      const input = loadValidProject();
      expect(input.project.schema).toBe('0.4');

      const result = validate(input);
      expect(
        result.diagnostics.some(
          (d) =>
            d.code === DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION ||
            d.code === DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
        ),
      ).toBe(false);
    });

    it('refuses an unrecognised version (0.9) distinctly from the known-old 0.3', () => {
      const input = loadValidProject();
      const futureInput: ValidateInput = {
        ...input,
        project: { ...input.project, schema: '0.9' },
      };

      const result = validate(futureInput);
      const unknownDiag = result.diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
      );
      const deprecatedDiag = result.diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.DEPRECATED_SCHEMA_VERSION,
      );

      expect(unknownDiag).toBeDefined();
      expect(deprecatedDiag).toBeUndefined();
      expect(unknownDiag?.message).toContain("Expected '0.4'");
      expect(unknownDiag?.message).not.toContain('long_mode');
    });
  });
});
