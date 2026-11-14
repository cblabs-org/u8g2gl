/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/display-contract.test.ts
 * Purpose: Holds `ui.hpp`'s display contract (design_spec §16) to the layout it
 *          describes. The macros tell the board what to construct, and
 *          `ui_display_matches()` checks what it did construct, so a contract
 *          computed apart from the resolver could pass a board that the layout
 *          does not fit. The C++ suite runs the check against the R0 fixture;
 *          this covers the rotations that fixture cannot, through the real
 *          generate path.
 * Description: Generates `test/validator/fixtures/rotated-r1` at each rotation
 *              and reads the four macros back from `ui.hpp`. Also checks that
 *              the contract adds no include to `ui.hpp`, is not
 *              `#ifndef`-guarded, that `ui.cpp` defines the check against those
 *              macros, and that an emit input with no contract is refused
 *              rather than emitted with empty values.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { emitUiHeader, emitUiInitUnit, type ProjectEmitInput } from '../../src/core/generator/emit/index.js';
import { generate } from '../../src/core/generator/index.js';
import { loadProject } from '../../src/node/load-project.js';
import { frameworkRegistry } from '../helpers/manifest-registry.js';

const ROTATED = resolve(__dirname, '..', 'validator', 'fixtures', 'rotated-r1');
const SETUP = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';

/** `ui.hpp` and `ui.cpp` for the fixture generated at a rotation. */
async function generatedAt(rotation: string): Promise<{ readonly header: string; readonly unit: string }> {
  const loaded = loadProject(ROTATED);
  const [first, ...rest] = loaded.model.project.targets;
  const model = { ...loaded.model, project: { ...loaded.model.project, targets: [{ ...first!, rotation }, ...rest] } };
  const compiledAssets = await compileProjectAssets({ globals: model.globals, assets: loaded.assets });
  const result = generate({ ...model, generatorVersion: '0.0.0-golden', compiledAssets });
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const file = (path: string): string => result.files.find((f) => f.path === path)?.content ?? '';
  return { header: file('ui.hpp'), unit: file('ui.cpp') };
}

/** Each `#define U8G2GL_TARGET_*` in a header, by name. */
function contractMacros(header: string): Readonly<Record<string, string>> {
  const macros: Record<string, string> = {};
  for (const match of header.matchAll(/^#define (U8G2GL_TARGET_\w+) (.+)$/gm)) {
    macros[match[1]!] = match[2]!;
  }
  return macros;
}

describe('the display contract in ui.hpp (design_spec §16)', () => {
  it.each([
    ['R1', '64', '256', 'U8G2_R1'],
    ['90', '64', '256', 'U8G2_R1'],
    ['R3', '64', '256', 'U8G2_R3'],
    ['270', '64', '256', 'U8G2_R3'],
  ])('states the oriented size at %s', async (rotation, width, height, macro) => {
    const { header } = await generatedAt(rotation);
    expect(contractMacros(header)).toEqual({
      U8G2GL_TARGET_WIDTH: width,
      U8G2GL_TARGET_HEIGHT: height,
      U8G2GL_TARGET_ROTATION: macro,
      U8G2GL_TARGET_SETUP: `"${SETUP}"`,
    });
  });

  it('adds no include and guards no macro: the contract is not overridable', async () => {
    const { header } = await generatedAt('R1');
    const includes = header.match(/^#include .+$/gm);
    expect(includes).toEqual([
      '#include "u8g2gl_generated_config.h"',
      '#include <cstdint>',
      '#include "u8g2gl/u8g2gl_core.h"',
      '#include "u8g2gl/u8g2gl_style.h"',
      '#include "u8g2gl/u8g2gl_subject.h"',
    ]);
    expect(header).not.toMatch(/#ifndef U8G2GL_TARGET_/);
    expect(header).toContain('bool ui_display_matches(U8G2& display);');
  });

  it('defines ui_display_matches() in ui.cpp against the macros, not the numbers', async () => {
    const { unit } = await generatedAt('R1');
    expect(unit).toContain('#include <U8g2lib.h>');
    expect(unit).toContain(
      [
        'bool ui_display_matches(U8G2& display) {',
        '    return display.getDisplayWidth() == U8G2GL_TARGET_WIDTH &&',
        '           display.getDisplayHeight() == U8G2GL_TARGET_HEIGHT;',
        '}',
      ].join('\n'),
    );
  });

  it('refuses to emit either unit without a contract, rather than emit empty values', () => {
    const input: ProjectEmitInput = {
      project: { schema: '0.7', name: 'p', version: '1.0.0', targets: [] },
      globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
      screens: [],
      capacities: { maxObjectsPerScreen: 0, maxBindingsPerObject: 0, totalBindings: 0, styles: 0, styleNames: [], subjects: [] },
      manifests: frameworkRegistry(),
      images: new Map(),
      stamp: '',
    };
    expect(() => emitUiHeader(input)).toThrow(/display contract/);
    expect(() => emitUiInitUnit(input)).toThrow(/display contract/);
  });
});
