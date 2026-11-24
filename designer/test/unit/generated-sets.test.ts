/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/generated-sets.test.ts
 * Purpose: The sample sets made from declarations (ruling 8, Q3a): *empty* has
 *          no rows and empty strings; *one* a single row per collection;
 *          *full, longest* every collection at capacity and every string at
 *          its max_len in the widest glyph of the font that draws it; and the
 *          four conventional sets built from them. Every generated set checks
 *          clean against the project, so it applies whole.
 * Description: The departures fixture's shape, with a stand-in for the
 *              bridge's measureText: a proportional font where `@` advances
 *              furthest, and a monospaced one where every glyph ties, so the
 *              tie-break to `W` is shown. The real widths are the Wasm test's
 *              (wasm/test/measure-text.test.mjs).
 */

import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONVENTIONAL_SETS, conventionalSets, FALLBACK_GLYPH, generateSampleSet, widestGlyph, type TextMeasure } from '../../src/samples/generated-sets';
import { checkSampleSet, serialiseSampleSet } from '../../src/samples/sample-set';
import { sampleShapeOf } from '../../src/samples/sample-shape';
import { classifyProjectFile, ProjectModelCache } from '../../src/project/project-model';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../cli/test/fixtures/departures-project');
const SCREEN = 'screens/screen_departures.xml';

// fixtureTexts
// The departures fixture's documents, by project path.
function fixtureTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (classifyProjectFile(relative(FIXTURE, path)) !== undefined) texts.set(relative(FIXTURE, path), readFileSync(path, 'utf8'));
    }
  };
  walk(FIXTURE);
  return texts;
}

const SHAPE = sampleShapeOf(new ProjectModelCache().build(fixtureTexts()));

/**
 * A stand-in measure: `u8g2_font_6x10_mr` monospaced at 6, and
 * `u8g2_font_helvR08_tr` proportional with `@` widest. As U8G2 counts it, the
 * last glyph is its ink (one less than its advance here).
 */
const MEASURE: TextMeasure = (font, text) => {
  const advance = (c: string): number => (font === 'u8g2_font_6x10_mr' ? 6 : c === '@' ? 9 : c === 'W' ? 8 : 4);
  if (font !== 'u8g2_font_6x10_mr' && font !== 'u8g2_font_helvR08_tr') return undefined;
  const glyphs = [...text];
  return glyphs.reduce((sum, c, i) => sum + (i === glyphs.length - 1 ? advance(c) - 1 : advance(c)), 0);
};

test('the widest glyph is the largest advance; a tie prefers W; an unmeasurable font is undefined', () => {
  expect(widestGlyph('u8g2_font_helvR08_tr', MEASURE)).toBe('@');
  expect(widestGlyph('u8g2_font_6x10_mr', MEASURE)).toBe('W');
  expect(widestGlyph('u8g2_font_missing', MEASURE)).toBeUndefined();
});

test('empty: every collection with no rows, every string subject empty, numbers 0 and bools false', () => {
  const { document } = generateSampleSet('empty', SHAPE, MEASURE);
  expect(document.rows[SCREEN]).toEqual({ row0: [], formation: [], services: [] });
  expect(document.values).toEqual({ platform: '', system_time: 0, row0_time: '', row0_dest: '', row0_status: '', box_fill: 0, message_text: '' });
});

test('one: a single row per collection, of defaults, its strings the field’s name; subjects inherited', () => {
  const { document } = generateSampleSet('one', SHAPE, MEASURE);
  expect(document.values).toEqual({});
  expect(document.rows[SCREEN]).toEqual({
    row0: [{ cells: ['cells'] }],
    formation: [{ number: 1, class_type: 'standard', wheelchair: false, bike: false, loading_pct: 0 }],
    services: [{ cells: ['cells'] }],
  });
});

test('full, longest: every collection at capacity, every string at max_len in its font’s widest glyph', () => {
  const { document, unmeasured } = generateSampleSet('full', SHAPE, MEASURE);
  expect(unmeasured).toEqual([]);
  const rows = (document.rows[SCREEN] ?? {}) as Record<string, readonly unknown[]>;
  expect(rows.formation).toHaveLength(12);
  expect(rows.services).toHaveLength(10);
  expect(rows.row0).toHaveLength(1);
  // services: max_cols (6) cells of max_cell_chars (24) in the 6x10's W.
  expect(rows.services?.[0]).toEqual({ cells: Array.from({ length: 6 }, () => 'W'.repeat(24)) });
  // platform is drawn by plat_num in helvR08, whose widest glyph is @; max_len 8.
  expect(document.values.platform).toBe('@'.repeat(8));
  // A string subject no element draws falls back to W, at its max_len.
  expect(document.values.row0_dest).toBe(FALLBACK_GLYPH.repeat(64));
});

test('every generated set checks clean, so it applies whole', () => {
  for (const kind of ['empty', 'one', 'full'] as const) {
    const { document } = generateSampleSet(kind, SHAPE, MEASURE);
    expect(checkSampleSet('samples/x.json', serialiseSampleSet(document), SHAPE).problems, kind).toEqual([]);
  }
});

test('the conventional sets: typical from the initial values, empty, longest-plausible a copy of typical, worst-case full', () => {
  const { sets } = conventionalSets(SHAPE, MEASURE);
  expect([...sets.keys()]).toEqual([...CONVENTIONAL_SETS]);
  const typical = sets.get('typical');
  expect(typical?.values).toEqual({
    platform: '9',
    system_time: 71700,
    row0_time: '19:55',
    row0_dest: 'London Paddington',
    row0_status: 'On time',
    box_fill: 8,
    message_text: '',
  });
  expect(typical?.rows[SCREEN]?.services).toHaveLength(1);
  expect(sets.get('longest-plausible')).toEqual(typical);
  expect(sets.get('longest-plausible')).not.toBe(typical);
  expect(sets.get('empty')).toEqual(generateSampleSet('empty', SHAPE, MEASURE).document);
  expect(sets.get('worst-case')).toEqual(generateSampleSet('full', SHAPE, MEASURE).document);
  for (const [name, document] of sets) expect(checkSampleSet(`samples/${name}.json`, serialiseSampleSet(document), SHAPE).problems, name).toEqual([]);
});

test('a font that cannot be measured falls back to W, and is named', () => {
  const { document, unmeasured } = generateSampleSet('full', SHAPE, () => undefined);
  expect(unmeasured).toEqual(['u8g2_font_helvR08_tr', 'u8g2_font_6x10_mr']);
  expect(document.values.platform).toBe('W'.repeat(8));
});
