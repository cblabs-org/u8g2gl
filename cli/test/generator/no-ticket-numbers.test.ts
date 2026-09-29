/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/no-ticket-numbers.test.ts
 * Purpose: Generated code goes into users' repositories, so it must not carry
 *          this project's internal work-order or PR numbers. This makes that class
 *          of defect break the build instead of waiting for someone to grep.
 * Description: Generates the committed compile fixture for both targets
 *              (firmware and editor) exactly as the fixture tests do, and fails
 *              naming the file and line of any output matching `WO<digit>` or
 *              `PR-<digit>`. The fixture exercises every emitter the generator
 *              has: subjects, styles, both font kinds, both image kinds, three
 *              screens, a composite and the editor scene. The pattern is
 *              `\b(WO|PR-)\d`; requiring the digit keeps ordinary words such as
 *              `WORLD` from matching.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { loadProject } from '../../src/node/load-project.js';

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test/generated_fixture');

/** An internal ticket reference: a work order (`WO4`) or a PR (`PR-09`). */
const TICKET = /\b(WO|PR-)\d/;

describe('generated output carries no internal ticket numbers', () => {
  it('neither the firmware target nor the editor target', async () => {
    const loaded = loadProject(fixtureDir);
    const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
    const result = generate({
      ...loaded.model,
      generatorVersion: '0.0.0-golden',
      compiledAssets,
      bdfLicenceFiles: loaded.bdfLicenceFiles,
    });
    expect(result.errors, JSON.stringify(result.diagnostics.slice(0, 2))).toBe(0);
    const editor = emitEditorFiles({
      project: loaded.model.project,
      globals: loaded.model.globals,
      screens: loaded.model.screens,
      realised: result.realised!,
      resolved: result.resolved!,
      manifests: loaded.model.manifests,
      capacities: result.capacities!,
      images: compiledAssets.images,
      compiledFonts: compiledAssets.fonts,
      bdfLicenceFiles: loaded.bdfLicenceFiles,
      generatorVersion: '0.0.0-golden',
      target: result.target ?? '',
    }).files;

    // Guard the guard: it must actually be looking at output.
    expect(result.files.length).toBeGreaterThan(8);
    expect(editor).toHaveLength(2);

    const offences: string[] = [];
    for (const file of [...result.files, ...editor]) {
      file.content.split('\n').forEach((line, index) => {
        if (TICKET.test(line)) {
          offences.push(`${file.path}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offences).toEqual([]);
  });

  it('the pattern catches what it is meant to', () => {
    for (const bad of ['(WO4 F5, §16)', 'until PR-09, and', 'WO12', '// PR-04b']) {
      expect(TICKET.test(bad), bad).toBe(true);
    }
    for (const fine of ['SWOP', 'PROP-1', 'TWO4', 'a WOW', 'PR-', 'PRO4']) {
      expect(TICKET.test(fine), fine).toBe(false);
    }
  });
});
