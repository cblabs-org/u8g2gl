/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/schema-guard.test.ts
 * Purpose: The generated schema guard asserts the schema the generator wrote
 *          for, not the one the project declares (rules/03-versioning.md).
 *          Every version the validator accepts is the current schema or an
 *          older, additive minor of it, so a project still declaring 0.4 must
 *          generate code the current runtime accepts — otherwise an additive
 *          bump breaks every project that has not re-declared.
 * Description: Generates the emit-project fixture declared as 0.4 and as 0.5:
 *              both guards read the current schema, and each file's
 *              `// schema` stamp keeps the declared version. Also checks the
 *              CLI's current schema against the runtime header in the same
 *              tree, which is the pairing the guard relies on.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { CURRENT_SCHEMA, CURRENT_SCHEMA_VERSION } from '../../src/core/schema/schema-version.js';
import { loadProject } from '../../src/node/load-project.js';

const fixtureDir = resolve(__dirname, 'fixtures/emit-project');
const versionHeader = resolve(__dirname, '../../../include/u8g2gl/u8g2gl_version.h');

/** The fixture generated as if its `u8g2gl.xml` declared `schema`. */
async function generateAs(schema: string): Promise<ReturnType<typeof generate>> {
  const loaded = loadProject(fixtureDir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  return generate({
    ...loaded.model,
    project: { ...loaded.model.project, schema },
    generatorVersion: '0.0.0-golden',
    compiledAssets,
  });
}

describe('the generated schema guard is the generator’s schema', () => {
  it.each(['0.4', '0.5'])('a project declaring %s generates REQUIRE_SCHEMA_VERSION(0, 5), and stamps what it declared', async (schema) => {
    const result = await generateAs(schema);
    expect(result.errors, JSON.stringify(result.diagnostics.slice(0, 2))).toBe(0);

    const config = result.files.find((file) => file.path === 'u8g2gl_generated_config.h')?.content ?? '';
    expect(config).toContain('U8G2GL_REQUIRE_SCHEMA_VERSION(0, 5);');
    expect(config).not.toContain(`U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);`);
    // Provenance is still the document's: every file records what it was generated from.
    for (const file of result.files.filter((f) => f.path.endsWith('.cpp') || f.path.endsWith('.h') || f.path.endsWith('.hpp'))) {
      expect(file.content, file.path).toContain(`// schema: ${schema}\n`);
    }
  });

  it('is the schema the runtime in this tree implements', () => {
    const header = readFileSync(versionHeader, 'utf-8');
    const macro = (name: string): number => Number(new RegExp(`#define ${name} +(\\d+)`).exec(header)?.[1]);
    expect(CURRENT_SCHEMA).toEqual({
      major: macro('U8G2GL_SCHEMA_VERSION_MAJOR'),
      minor: macro('U8G2GL_SCHEMA_VERSION_MINOR'),
    });
    expect(CURRENT_SCHEMA_VERSION).toBe('0.5');
  });
});
