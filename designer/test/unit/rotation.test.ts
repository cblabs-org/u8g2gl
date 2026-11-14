/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/rotation.test.ts
 * Purpose: The designer's readers of a display's size, held to the target's
 *          rotation (design_spec §5.1, ui_spec §6.4). Layout readers — the
 *          canvas's size, the scene, hit-testing and the impact preview's
 *          outside test — see the oriented size; the picker lists each panel at
 *          its own size and adds the shown size beside it; a rotation change is
 *          previewed only when it swaps width and height.
 * Description: Runs the live text pipeline on a portrait screen for a 256×64
 *              SSD1322 at R1 and at R0, and checks the pipeline's display, its
 *              diagnostics, the scene's display, hit-testing low on the portrait
 *              screen and the impact preview's outside list. Then the picker's
 *              pure helpers, and the candidate texts a rotation preview runs on.
 */

import { expect, test } from '@playwright/test';
import { CATALOGUE } from '@u8g2gl/data/catalogue.js';
import { orientedNote, rotationResizes } from '../../src/forms/display-picker-model';
import { candidateTexts, outsideElements } from '../../src/forms/impact-preview';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';
import { hitsAt } from '../../src/selection/hit-test';

const SSD1322 = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const RECORD = CATALOGUE.find((record) => record.setup === SSD1322)!;
const NO_ASSETS = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };

/** A project on the SSD1322 at `rotation` (absent when undefined), with a portrait screen. */
function project(rotation: string | undefined): Map<string, string> {
  const written = rotation === undefined ? '' : ` rotation="${rotation}"`;
  return new Map([
    ['u8g2gl.xml', `<u8g2gl schema="0.6" name="turned" version="1.0.0">\n  <targets>\n    <target name="portrait" setup="${SSD1322}"${written} />\n  </targets>\n</u8g2gl>\n`],
    ['globals.xml', '<globals>\n</globals>\n'],
    [
      'screens/screen_home.xml',
      '<screen name="home">\n  <view>\n    <u8g2gl_box name="top" x="0" y="0" width="64" height="16" />\n    <u8g2gl_box name="low" x="0" y="200" width="64" height="40" />\n  </view>\n</screen>\n',
    ],
  ]);
}

/** One run of the canvas's own pipeline over `texts`. */
function run(texts: ReadonlyMap<string, string>) {
  return runTextPipeline({ texts, cache: new ProjectModelCache(), assets: NO_ASSETS, activeFile: 'screens/screen_home.xml' });
}

test('at R1 the canvas, the scene and hit-testing all see a 64×256 display', () => {
  const result = run(project('R1'));
  expect(result.errors, JSON.stringify(result.diagnostics)).toBe(0);
  expect(result.display).toEqual({ width: 64, height: 256 });
  expect((JSON.parse(result.scene!) as { display: unknown }).display).toEqual({ width: 64, height: 256 });
  // An element low on the portrait screen is placed, and hit, where it is drawn.
  expect(result.bounds.get('low')).toEqual({ x: 0, y: 200, width: 64, height: 40 });
  expect(hitsAt(result.targets, 10, 210)).toEqual(['low']);
  // The impact preview's outside test, at the oriented size, holds both.
  expect(outsideElements(result.bounds, result.display!.width, result.display!.height)).toEqual([]);
});

test('at R0 the same screen is laid out on 256×64, and the low element falls outside', () => {
  const result = run(project('R0'));
  expect(result.display).toEqual({ width: 256, height: 64 });
  expect(result.diagnostics.map((d) => d.code)).toContain('U8G2GL_OUT_OF_BOUNDS');
  expect(outsideElements(result.bounds, 256, 64).map((e) => e.name)).toEqual(['low']);
});

test('R2, 180 and an absent rotation are laid out as R0; 90 and R3 as R1', () => {
  for (const rotation of ['R2', '180', undefined]) expect(run(project(rotation)).display).toEqual({ width: 256, height: 64 });
  for (const rotation of ['90', 'R3', '270']) expect(run(project(rotation)).display).toEqual({ width: 64, height: 256 });
});

test('the picker shows a panel at its own size, and the shown size beside it only when they differ', () => {
  expect(orientedNote(RECORD, 'R1')).toBe('shown 64×256 at R1');
  expect(orientedNote(RECORD, '270')).toBe('shown 64×256 at R3');
  for (const rotation of ['R0', 'R2', '180', undefined, 'R9']) expect(orientedNote(RECORD, rotation)).toBeUndefined();
});

test('a rotation is previewed only when it swaps the layout’s width and height', () => {
  expect(rotationResizes(RECORD, 'R0', 'R1')).toBe(true);
  expect(rotationResizes(RECORD, undefined, '90')).toBe(true);
  expect(rotationResizes(RECORD, 'R3', 'R2')).toBe(true);
  expect(rotationResizes(RECORD, 'R0', 'R2')).toBe(false);
  expect(rotationResizes(RECORD, 'R1', 'R3')).toBe(false);
  expect(rotationResizes(RECORD, 'R2', undefined)).toBe(false);
  // No catalogue record: nothing to preview against, so it applies directly.
  expect(rotationResizes(undefined, 'R0', 'R1')).toBe(false);
});

test('a rotation preview runs on texts that change only the rotation, in memory', () => {
  const texts = project('R0');
  const key = 'u8g2gl.xml>targets#0>display|display/rotation';
  const turned = candidateTexts(texts, key, 'R1');
  expect(turned.get('u8g2gl.xml')).toBe(texts.get('u8g2gl.xml')!.replace('rotation="R0"', 'rotation="R1"'));
  expect(turned.get('screens/screen_home.xml')).toBe(texts.get('screens/screen_home.xml'));
  expect(texts.get('u8g2gl.xml')).toContain('rotation="R0"');
  expect(run(turned).display).toEqual({ width: 64, height: 256 });
  // "Not set" removes the attribute.
  expect(candidateTexts(texts, key, undefined).get('u8g2gl.xml')).not.toContain('rotation=');
});
