/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/document-states.test.ts
 * Purpose: The live pipeline's half of EDITOR-DESIGN §3.8: a valid project has
 *          a scene; a well-formed but invalid one still has a scene when the
 *          emitter can describe it (an overflow) and none when it cannot; a
 *          document that is not well-formed has none and says so, which is
 *          what turns canvas editing off.
 * Description: A small framework-only project run through `runTextPipeline`,
 *              one edit per case.
 */

import { expect, test } from '@playwright/test';
import { runTextPipeline, type TextPipelineResult } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const SCREEN = 'screens/screen_home.xml';
const BOXES = '<screen name="home">\n  <view>\n    <u8g2gl_box name="left" x="0" y="0" width="20" height="10" />\n    <u8g2gl_box name="right" x="100" y="0" width="20" height="10" />\n  </view>\n</screen>\n';

function run(screen: string): TextPipelineResult {
  const texts = new Map([
    [
      'u8g2gl.xml',
      '<u8g2gl schema="0.5" name="states" version="1.0.0">\n  <targets>\n    <target name="host" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />\n  </targets>\n</u8g2gl>\n',
    ],
    ['globals.xml', '<globals>\n</globals>\n'],
    [SCREEN, screen],
  ]);
  return runTextPipeline({
    texts,
    cache: new ProjectModelCache(),
    assets: { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set(), failedImages: new Set() },
    activeFile: SCREEN,
  });
}

test('a valid project has a scene and is well-formed', () => {
  const result = run(BOXES);
  expect(result.errors).toBe(0);
  expect(result.scene).toBeDefined();
  expect(result.wellFormed).toBe(true);
});

test('an overflow is an error, and the scene is still described, so the canvas stays live', () => {
  const result = run(BOXES.replace('name="right" x="100"', 'name="right" x="120"'));
  expect(result.diagnostics.map((d) => d.code)).toContain('U8G2GL_OUT_OF_BOUNDS');
  expect(result.errors).toBeGreaterThan(0);
  expect(result.scene).toBeDefined();
  expect(result.wellFormed).toBe(true);
  expect(result.bounds.get('right')).toEqual({ x: 120, y: 0, width: 20, height: 10 });
});

test('an error the emitter cannot describe leaves no scene, but the text is still well-formed', () => {
  const result = run(BOXES.replace('<u8g2gl_box name="right"', '<u8g2gl_nothing name="right"'));
  expect(result.errors).toBeGreaterThan(0);
  expect(result.scene).toBeUndefined();
  expect(result.wellFormed).toBe(true);
});

test('text that is not well-formed has no scene and says so', () => {
  const result = run(BOXES.replace('<u8g2gl_box name="right"', '<u8g2gl_bo name="right" x='));
  expect(result.diagnostics.map((d) => d.code)).toContain('U8G2GL_MALFORMED_XML');
  expect(result.scene).toBeUndefined();
  expect(result.wellFormed).toBe(false);
});
