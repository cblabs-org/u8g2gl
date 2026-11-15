/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/mirror-rotation.test.ts
 * Purpose: Holds schema 0.7's two mirror rotations to their rules (design_spec
 *          §5.1, §15.4). They are additive, so an older project is told to
 *          declare 0.7 rather than refused for its version; they are
 *          layout-neutral, as R0 and R2 are, so nothing about the layout
 *          moves; and the display contract passes U8G2's own U8G2_MIRROR
 *          macros to the board, so what the board constructs is what U8G2
 *          calls them.
 * Description: The emit-project fixture (a landscape 128×64 SSD1306) with its
 *              target's rotation and schema replaced in memory, through
 *              `validate` and the real `generate` path, reading the contract
 *              macros back from `ui.hpp`. The degree spellings are checked to
 *              map to R0…R3 through the same path.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { validate } from '../../src/core/validator/index.js';
import { loadProject, type LoadedProject } from '../../src/node/load-project.js';

const PROJECT = resolve(__dirname, '..', 'generator', 'fixtures', 'emit-project');

/** The fixture's model at a schema version, with its first target at a rotation. */
function at(loaded: LoadedProject, schema: string, rotation: string): LoadedProject['model'] {
  const [first, ...rest] = loaded.model.project.targets;
  return {
    ...loaded.model,
    project: { ...loaded.model.project, schema, targets: [{ ...first!, rotation }, ...rest] },
  };
}

/** The display contract `ui.hpp` states, by macro name. */
async function contractAt(loaded: LoadedProject, rotation: string): Promise<Readonly<Record<string, string>>> {
  const model = at(loaded, '0.7', rotation);
  const compiledAssets = await compileProjectAssets({ globals: model.globals, assets: loaded.assets });
  const result = generate({ ...model, generatorVersion: '0.0.0-golden', compiledAssets });
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const header = result.files.find((f) => f.path === 'ui.hpp')?.content ?? '';
  const macros: Record<string, string> = {};
  for (const match of header.matchAll(/^#define (U8G2GL_TARGET_(?:WIDTH|HEIGHT|ROTATION)) (.+)$/gm)) {
    macros[match[1]!] = match[2]!;
  }
  return macros;
}

describe('the mirror rotations are schema 0.7 (§15.4)', () => {
  const loaded = loadProject(PROJECT);

  it.each(['0.4', '0.5', '0.6'])('a %s project writing MIRROR is told it needs schema 0.7, once', (schema) => {
    const result = validate(at(loaded, schema, 'MIRROR'));
    const newer = result.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED);
    expect(newer).toHaveLength(1);
    expect(newer[0]?.severity).toBe('error');
    expect(newer[0]?.message).toContain('needs schema "0.7"');
    expect(newer[0]?.message).toContain('schema="0.7"');
    expect(newer[0]?.offendingText).toBe('MIRROR');
    // Not the generic refusal: MIRROR is a real value, just a newer one.
    expect(result.diagnostics.map((d) => d.code)).not.toContain(DIAGNOSTIC_CODES.INVALID_ENUM_VALUE);
  });

  it('says the same of MIRROR_VERTICAL at 0.6', () => {
    const codes = validate(at(loaded, '0.6', 'MIRROR_VERTICAL')).diagnostics.map((d) => d.code);
    expect(codes).toEqual([DIAGNOSTIC_CODES.NEWER_SCHEMA_REQUIRED]);
  });

  it.each(['MIRROR', 'MIRROR_VERTICAL'])('validates %s clean at 0.7', (rotation) => {
    expect(validate(at(loaded, '0.7', rotation)).diagnostics).toEqual([]);
  });

  it('still accepts R0–R3 at 0.6', () => {
    for (const rotation of ['R0', 'R2', '0', '180']) {
      expect(validate(at(loaded, '0.6', rotation)).diagnostics, rotation).toEqual([]);
    }
  });
});

describe('the mirrors are layout-neutral, and the contract names them as U8G2 does', () => {
  const loaded = loadProject(PROJECT);

  it.each(['MIRROR', 'MIRROR_VERTICAL'])('%s checks the layout against the native 128×64', (rotation) => {
    expect(validate(at(loaded, '0.7', rotation)).checkedTarget?.display).toEqual({ width: 128, height: 64 });
  });

  it.each([
    ['MIRROR', 'U8G2_MIRROR'],
    ['MIRROR_VERTICAL', 'U8G2_MIRROR_VERTICAL'],
  ])('ui.hpp constructs %s with %s, unswapped', async (rotation, macro) => {
    expect(await contractAt(loaded, rotation)).toEqual({
      U8G2GL_TARGET_WIDTH: '128',
      U8G2GL_TARGET_HEIGHT: '64',
      U8G2GL_TARGET_ROTATION: macro,
    });
  });

  it.each([
    ['0', 'U8G2_R0'],
    ['180', 'U8G2_R2'],
  ])('ui.hpp maps the degree spelling %s to %s', async (rotation, macro) => {
    expect((await contractAt(loaded, rotation)).U8G2GL_TARGET_ROTATION).toBe(macro);
  });
});
