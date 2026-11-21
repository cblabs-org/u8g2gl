/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/glyph-ranges.test.ts
 * Purpose: The glyph-range warning (`U8G2GL_GLYPH_OUTSIDE_RANGE`, §14.1): static
 *          text using a character its `<bdf>` font's `range` leaves out is
 *          warned of, at the attribute; an unranged `<bdf>` and every built-in
 *          are never checked; and the warning changes no generated output.
 * Description: The compile fixture (`test/generated_fixture`) declares
 *              `font_4x6` with `range="0x20-0x7F"`, the unranged
 *              `font_arrow_mini`, and built-ins. Each case copies it, edits one
 *              screen or the globals, and validates through `checkProject`, as
 *              `validate` does. The static-text reading both this warning and
 *              the designer's presets use is tested beside it.
 */

import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProject, generate } from '../../src/core/generator/index.js';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { codepointsByFont, formatLiterals, staticTexts, stringBoundElements } from '../../src/core/fonts/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { loadProject } from '../../src/node/load-project.js';
import { makeTempDir } from '../node/design/temp-project.js';

const FIXTURE = resolve(__dirname, '../../../test/generated_fixture');
const BOUNDS = 'screens/screen_bounds.xml';

// copyWith
// A copy of the fixture with one file's text rewritten.
//   path   — project-relative
//   change — the rewrite
function copyWith(path: string, change: (text: string) => string): string {
  const dir = join(makeTempDir('glyph-ranges'), 'project');
  cpSync(FIXTURE, dir, { recursive: true });
  const file = join(dir, path);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
  return dir;
}

// warnings
// The glyph-range warnings validate reports for a project.
function warnings(dir: string) {
  return checkProject(loadProject(dir).model, 'warning').diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.GLYPH_OUTSIDE_RANGE);
}

describe('U8G2GL_GLYPH_OUTSIDE_RANGE', () => {
  it('is silent on the fixture as committed', () => {
    expect(warnings(FIXTURE)).toEqual([]);
  });

  it('fires for static text with a glyph outside a <bdf> range, at the attribute, naming the glyph', () => {
    const dir = copyWith(BOUNDS, (t) => t.replace('font="font_4x6" text="4x6!"', 'font="font_4x6" text="4x6é€"'));
    const found = warnings(dir);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warning', file: BOUNDS, offendingText: '4x6é€' });
    expect(found[0]!.message).toContain("'é' (U+00E9), '€' (U+20AC)");
    expect(found[0]!.message).toContain("font 'font_4x6' leaves out of its range '0x20-0x7F'");
    const line = readFileSync(join(dir, BOUNDS), 'utf8').split('\n')[found[0]!.line - 1] ?? '';
    expect(line).toContain('text="4x6é€"');
  });

  it('does not fire for an unranged <bdf>, which holds every glyph of its file', () => {
    expect(warnings(copyWith(BOUNDS, (t) => t.replace('font="font_arrow_mini" text="A"', 'font="font_arrow_mini" text="é"')))).toEqual([]);
    expect(warnings(copyWith('globals.xml', (t) => t.replace(' range="0x20-0x7F"', '')))).toEqual([]);
  });

  it('ignores built-in fonts, whose glyph sets are U8G2\'s', () => {
    const dir = copyWith(BOUNDS, (t) => t.replace('font="font_4x6" text="4x6!"', 'font="u8g2_font_6x10_mr" text="4x6é€"'));
    expect(warnings(dir)).toEqual([]);
  });

  it('changes no generated output', async () => {
    const dir = copyWith(BOUNDS, (t) => t.replace('font="font_4x6" text="4x6!"', 'font="font_4x6" text="4x6é"'));
    const emit = async (root: string) => {
      const loaded = loadProject(root);
      const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
      return generate({ ...loaded.model, generatorVersion: '0.0.0-golden', compiledAssets, bdfLicenceFiles: loaded.bdfLicenceFiles });
    };
    const result = await emit(dir);
    expect(result.errors).toBe(0);
    expect(result.diagnostics.map((d) => d.code)).toContain(DIAGNOSTIC_CODES.GLYPH_OUTSIDE_RANGE);
    // The only output change is the edited text's own line, never anything the warning adds.
    const withoutText = (text: string) => text.split('\n').filter((line) => !line.includes('ui_obj_bdf_4x6.set_text('));
    const screen = result.files.find((file) => file.path === 'ui_screen_bounds.cpp')!.content;
    const original = readFileSync(join(FIXTURE, 'generated', 'ui_screen_bounds.cpp'), 'utf8');
    expect(withoutText(screen)).toEqual(withoutText(original));
    for (const file of result.files.filter((f) => f.path !== 'ui_screen_bounds.cpp')) {
      expect(file.content, file.path).toBe(readFileSync(join(FIXTURE, 'generated', file.path), 'utf8'));
    }
  });
});

describe('the static text the warning and the range presets read', () => {
  it('drops format conversions, keeping their literal characters and %%', () => {
    expect(formatLiterals('%d °C')).toBe(' °C');
    expect(formatLiterals('T: %-3.1f%% %s!')).toBe('T: % !');
  });

  it('lists string props and formats by font, and the elements bound to a string subject', () => {
    const { model } = loadProject(FIXTURE);
    const texts = staticTexts(model.screens, model.globals, model.manifests);
    const byFont = codepointsByFont(texts);
    expect(byFont.get('font_4x6')).toEqual([...new Set('4x6!')].map((c) => c.codePointAt(0)).sort((a, b) => a! - b!));
    expect(codepointsByFont(texts, new Map([['font_4x6', ['Z']]])).get('font_4x6')).toContain(0x5a);
    const bound = stringBoundElements(model.screens, model.globals, model.manifests);
    expect(bound.length).toBeGreaterThan(0);
    expect(bound.every((entry) => typeof entry.element.attributes.name === 'string')).toBe(true);
  });
});
