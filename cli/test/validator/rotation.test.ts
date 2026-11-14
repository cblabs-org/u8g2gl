/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/rotation.test.ts
 * Purpose: Holds `validate` and `generate` to the target's rotation
 *          (design_spec §5.1). A quarter turn swaps the panel's width and
 *          height, so a portrait layout that fits at R1 runs off a landscape
 *          display at R0, and the bounds message must name the size the author
 *          is actually laying out against. The framebuffer is the hardware's,
 *          so §18's figure must not move with the rotation.
 * Description: Loads `fixtures/rotated-r1` (a portrait screen on a 256×64
 *              SSD1322 at R1) and re-checks it at other rotations by replacing
 *              the target's `rotation` in memory, so every case judges the same
 *              screens. Also runs the 128×64 `valid` fixture at R1, which turns
 *              a clean landscape layout into one that overflows, to see the
 *              rotated wording. Then the scene's `display` and the budget's
 *              framebuffer line, through the real generate path.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { describeScenes } from '../../src/core/generator/emit/index.js';
import { generate } from '../../src/core/generator/index.js';
import { buildGenerateReport } from '../../src/core/generator/report/index.js';
import { findTargetDisplay } from '../../src/core/resolver/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';
import { validate } from '../../src/core/validator/index.js';
import { loadProject, type LoadedProject } from '../../src/node/load-project.js';

const ROTATED = resolve(__dirname, 'fixtures', 'rotated-r1');
const LANDSCAPE = resolve(__dirname, 'fixtures', 'valid');

/** The project's model with its first target's rotation replaced (or removed). */
function atRotation(loaded: LoadedProject, rotation: string | undefined): LoadedProject['model'] {
  const [first, ...rest] = loaded.model.project.targets;
  const target = { ...first! };
  delete (target as { rotation?: string }).rotation;
  if (rotation !== undefined) {
    Object.assign(target, { rotation });
  }
  return { ...loaded.model, project: { ...loaded.model.project, targets: [target, ...rest] } };
}

/** What validation says, as code and message, for comparing two runs. */
function summary(diagnostics: readonly Diagnostic[]): readonly (readonly [string, string])[] {
  return diagnostics.map((d) => [d.code, d.message] as const);
}

describe('validation honours the target rotation (design_spec §5.1)', () => {
  const loaded = loadProject(ROTATED);

  it('starts from a fixture written at R1', () => {
    expect(loaded.model.project.targets[0]?.rotation).toBe('R1');
  });

  it('validates the portrait layout clean at R1, and says it checked 64×256', () => {
    const result = validate(loaded.model);
    expect(summary(result.diagnostics)).toEqual([]);
    expect(result.checkedTarget?.display).toEqual({ width: 64, height: 256 });
  });

  it.each(['90', 'R3', '270'])('validates it clean at %s too', (rotation) => {
    expect(summary(validate(atRotation(loaded, rotation)).diagnostics)).toEqual([]);
  });

  it('reports the same layout at R0 as out of bounds against the native 64px height', () => {
    const result = validate(atRotation(loaded, 'R0'));
    const outOfBounds = result.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS);
    expect(outOfBounds.map((d) => d.message)).toEqual([
      "Element '<u8g2gl_box>' extends to y=240, display is 64px high (0..63).",
      "Element '<u8g2gl_box>' extends to y=256, display is 64px high (0..63).",
    ]);
    // R0 is not a rotation that changed the size, so nothing says "rotated".
    expect(outOfBounds.every((d) => !d.message.includes('rotated'))).toBe(true);
    expect(result.checkedTarget?.display).toEqual({ width: 256, height: 64 });
  });

  it.each(['R2', '180', '0', undefined])('treats %s exactly as R0', (rotation) => {
    const r0 = summary(validate(atRotation(loaded, 'R0')).diagnostics);
    expect(r0.length).toBeGreaterThan(0);
    expect(summary(validate(atRotation(loaded, rotation)).diagnostics)).toEqual(r0);
  });

  it('names the oriented size, and how it came by it, when a rotated display overflows', () => {
    const landscape = loadProject(LANDSCAPE);
    expect(summary(validate(landscape.model).diagnostics)).toEqual([]);
    const result = validate(atRotation(landscape, 'R1'));
    const messages = result.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.OUT_OF_BOUNDS).map((d) => d.message);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages).toContain(
      "Element '<status_bar>' extends to x=128, display 64×128 (128×64 rotated 90°) is 64px wide (0..63).",
    );
    expect(messages.every((m) => m.includes('display 64×128 (128×64 rotated 90°)'))).toBe(true);
    const r3 = validate(atRotation(landscape, 'R3')).diagnostics.map((d) => d.message);
    expect(r3.some((m) => m.includes('display 64×128 (128×64 rotated 270°)'))).toBe(true);
  });
});

describe('generation honours the target rotation', () => {
  /** Generates the fixture at a rotation, with its scene and §18 report. */
  async function build(rotation: string) {
    const loaded = loadProject(ROTATED);
    const model = atRotation(loaded, rotation);
    const compiledAssets = await compileProjectAssets({ globals: model.globals, assets: loaded.assets });
    const result = generate({ ...model, generatorVersion: '0.0.0-golden', compiledAssets });
    return { model, result, compiledAssets };
  }

  it('describes a 64×256 display in the scene at R1, which the test-run harness sizes from', async () => {
    const { model, result, compiledAssets } = await build('R1');
    expect(result.errors).toBe(0);
    const scene = describeScenes({
      project: {
        project: model.project,
        globals: model.globals,
        screens: model.screens,
        capacities: result.capacities!,
        manifests: model.manifests,
        images: compiledAssets.images,
        compiledFonts: compiledAssets.fonts,
        bdfLicenceFiles: new Map(),
        stamp: '',
      },
      realised: result.realised!,
      resolved: result.resolved!,
      manifests: model.manifests,
      generated: { source: 'u8g2gl.xml', schema: '0.6', generator: '0.0.0-golden', target: 'portrait' },
    });
    expect(scene.display).toEqual({ width: 64, height: 256 });
  });

  it('keeps §18\'s framebuffer line native: the same bytes at R0 and R1', async () => {
    // R0 overflows and generate refuses it, so both reports are built from the
    // R1 build's realisation and capacities; only the target differs, which is
    // exactly the input a rotation changes.
    const { result, compiledAssets, model } = await build('R1');
    expect(result.errors).toBe(0);
    const framebuffer = (rotation: string) => {
      const target = { ...model.project.targets[0]!, rotation };
      const display = findTargetDisplay(target, model.catalogue);
      const report = buildGenerateReport({
        globals: model.globals,
        manifests: model.manifests,
        realised: result.realised ?? [],
        capacities: result.capacities!,
        target,
        ...(display !== undefined ? { display } : {}),
        generatorVersion: '0.0.0-golden',
        images: compiledAssets.images,
        compiledFonts: compiledAssets.fonts,
      });
      const line = report.budget.ram.find((entry) => entry.item.startsWith('framebuffer'));
      expect(line).toBeDefined();
      return { line, display: report.budget.display };
    };
    const r0 = framebuffer('R0');
    const r1 = framebuffer('R1');
    expect(r1.line).toEqual(r0.line);
    expect(r1.line?.item).toBe('framebuffer (256x64)');
    expect(r1.line?.figure).toMatchObject({ kind: 'measured', bytes: 2048 });
    // The report describes the hardware, so its display is the panel's own size.
    expect(r1.display).toEqual({ width: 256, height: 64 });
  });
});
