/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/compile-fixture.test.ts
 * Purpose: Holds the committed compile-layer fixture (`test/generated_fixture/`
 *          at the repository root) to the generator that produced it. That
 *          fixture's `generated/` directory is built and executed by the C++
 *          test suite (PR-04 WO10, §17.1), so it is only evidence about the
 *          generator while it is exactly what the generator writes today. If
 *          emission changes and the fixture is not regenerated, the C++ suite
 *          would go on passing against stale output; this test is what fails.
 * Description: Regenerates the fixture through the core API, with the same fixed
 *              version the goldens use, and asserts the file set and every byte
 *              equal what is committed. Refresh deliberately with
 *              `node test/generator/refresh-goldens.mjs`, then rebuild and run
 *              the C++ suite.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator/index.js';
import { emitEditorFiles } from '../../src/core/generator/emit/index.js';
import { loadProject } from '../../src/node/load-project.js';

/** Must match refresh-goldens.mjs and emit-golden.test.ts. */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const fixtureDir = resolve(__dirname, '../../../test/generated_fixture');
const committedDir = join(fixtureDir, 'generated');
const committedEditorDir = join(fixtureDir, 'generated_editor');

/** Generates the fixture exactly as refresh-goldens.mjs does. */
function regenerate(): ReturnType<typeof generate> {
  const loaded = loadProject(fixtureDir);
  return generate({ ...loaded.model, generatorVersion: GOLDEN_GENERATOR_VERSION, assets: loaded.assets });
}

describe('the compile-layer fixture is exactly what the generator writes (§17.1, §13.9)', () => {
  const result = regenerate();

  it('generates without a diagnostic', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('commits the same file set the generator emits', () => {
    expect(readdirSync(committedDir).sort()).toEqual(result.files.map((file) => file.path).sort());
  });

  it('regenerating it is an empty diff, byte for byte', () => {
    for (const file of result.files) {
      expect(readFileSync(join(committedDir, file.path), 'utf-8'), file.path).toBe(file.content);
    }
  });

  it('is deterministic: a second run produces the same bytes', () => {
    expect(regenerate().files).toEqual(result.files);
  });
});

// The editor target's committed output (PR-04 WO11), built into the C++ suite's
// parity test: regenerated from the same build, byte for byte.
function regenerateEditor(): readonly { path: string; content: string }[] {
  const loaded = loadProject(fixtureDir);
  const result = regenerate();
  if (result.realised === undefined || result.resolved === undefined || result.capacities === undefined) {
    throw new Error('the fixture did not generate');
  }
  return emitEditorFiles({
    project: loaded.model.project,
    globals: loaded.model.globals,
    screens: loaded.model.screens,
    realised: result.realised,
    resolved: result.resolved,
    manifests: loaded.model.manifests,
    capacities: result.capacities,
    assets: loaded.assets,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    target: result.target ?? '',
  }).files;
}

describe('the editor fixture is exactly what the generator writes (WO11, §13.9)', () => {
  const files = regenerateEditor();

  it('commits the same file set', () => {
    expect(readdirSync(committedEditorDir).sort()).toEqual(files.map((file) => file.path).sort());
  });

  it('regenerating it is an empty diff, byte for byte', () => {
    for (const file of files) {
      expect(readFileSync(join(committedEditorDir, file.path), 'utf-8'), file.path).toBe(file.content);
    }
  });

  it('is deterministic', () => {
    expect(regenerateEditor()).toEqual(files);
  });
});
