/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/output-dir.test.ts
 * Purpose: Holds §13.10's boundary at the only place it can be held before harm
 *          is done — in the document. `dir="../src"` used to validate cleanly,
 *          and the writer's own guard is relative to whatever directory it is
 *          handed, so the escape was caught by nothing until a `generate` run had
 *          already been pointed at the application's own sources, where the writer
 *          deletes any file carrying the GENERATED marker (PR-04 WO5b carry,
 *          closed in WO12).
 * Description: Runs Pass 1 over a minimal project for each shape an `<output dir>`
 *              can take, and checks that both journeys report it identically —
 *              `validate` and `generate` must agree about a document, so an
 *              escaping directory is an error in both, not a warning in one.
 */

import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { validateSchema } from '../../src/core/validator/index.js';
import { registryOf } from '../helpers/manifest-registry.js';
import type { Globals } from '../../src/core/schema/globals.js';
import type { U8g2glProject } from '../../src/core/schema/project.js';

const EMPTY_GLOBALS: Globals = { consts: [], subjects: [], styles: [], fonts: [], images: [] };

/** A minimal, otherwise valid project declaring `<output dir="…">`. */
function projectWith(dir: string | undefined): U8g2glProject {
  return {
    schema: '0.4',
    name: 'out_dir',
    version: '1.0.0',
    targets: [{ name: 'primary', setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C' }],
    ...(dir === undefined ? {} : { output: { dir, loc: { file: 'u8g2gl.xml', line: 3, column: 5 } } }),
    loc: { file: 'u8g2gl.xml', line: 1, column: 1 },
  };
}

/** The output-directory diagnostics Pass 1 raises for a given `dir`. */
function diagnose(dir: string | undefined): ReturnType<typeof validateSchema> {
  const manifests = registryOf();
  return validateSchema({
    project: projectWith(dir),
    globals: EMPTY_GLOBALS,
    screens: [],
    manifests,
    catalogue: [],
  }).filter((d) => d.code === DIAGNOSTIC_CODES.OUTPUT_DIR_OUTSIDE_PROJECT);
}

describe('<output dir> must stay inside the project (§13.10)', () => {
  for (const dir of ['../src', '..', '../../elsewhere', 'a/../..', '/etc/u8g2gl', 'C:/build', 'src\\gen', '.', '', '   ']) {
    it(`refuses dir="${dir}"`, () => {
      const [diagnostic, ...rest] = diagnose(dir);
      expect(diagnostic, `dir="${dir}" was accepted`).toBeDefined();
      expect(rest).toEqual([]);
      expect(diagnostic?.severity).toBe('error');
      // At the <output> element the author wrote, not at the project root.
      expect(diagnostic?.file).toBe('u8g2gl.xml');
      expect(diagnostic?.line).toBe(3);
      expect(diagnostic?.message).toContain('§13.10');
      expect(diagnostic?.suggestions).toEqual(['generated']);
    });
  }

  for (const dir of ['generated', 'build/ui', 'a/../b', './generated', 'generated/', 'ui/generated']) {
    it(`accepts dir="${dir}"`, () => {
      expect(diagnose(dir)).toEqual([]);
    });
  }

  it('says nothing when the project declares no <output>', () => {
    expect(diagnose(undefined)).toEqual([]);
  });

  it('is an error, not a refusal awaiting a later PR', () => {
    // A RefusalPolicy would let `validate` warn where `generate` errors. This is
    // not a construct a later PR delivers: it is a document schema 0.4 cannot
    // mean, so both journeys must refuse it identically.
    const diagnostic = diagnose('../src')[0];
    expect(diagnostic?.code).toBe('U8G2GL_OUTPUT_DIR_OUTSIDE_PROJECT');
    expect(diagnostic?.code).not.toBe(DIAGNOSTIC_CODES.NOT_YET_SUPPORTED);
  });
});
