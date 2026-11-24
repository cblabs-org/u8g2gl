/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/cost-notes.test.ts
 * Purpose: The property panel's RAM line ([Q-19]'s rule, design_spec §9.2,
 *          §18): a collection widget states the bytes the build allocates for
 *          each `<data>`, the figure §18 reports, and a project widget without
 *          `<data>` keeps the muted line.
 * Description: The departures project's texts through `runTextPipeline`, as the
 *              edit loop runs them, so the figure is the pipeline's own; the
 *              notes are read with `costNotes()` for a selection of names.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { costNotes, PROJECT_COST_NOTE } from '../../src/panel/cost-notes';
import { runTextPipeline } from '../../src/pipeline/live-pipeline';
import { ProjectModelCache } from '../../src/project/project-model';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..', '..', '..', 'cli', 'test', 'fixtures', 'departures-project');
const SCREEN = 'screens/screen_departures.xml';
const ASSETS = { fonts: new Map(), images: new Map(), diagnostics: [], failedFonts: new Set<string>(), failedImages: new Set<string>() };

/** The project's XML documents, by project path. */
function projectTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.xml')) texts.set(relative(PROJECT, path).split('\\').join('/'), readFileSync(path, 'utf8'));
    }
  };
  walk(PROJECT);
  return texts;
}

/** The notes the panel shows for `names`, after one run over `texts`. */
function notesFor(texts: Map<string, string>, names: readonly string[], tags: readonly string[]): string[] {
  const result = runTextPipeline({ texts, cache: new ProjectModelCache(), assets: ASSETS, activeFile: SCREEN });
  const manifests = tags.map((tag) => result.model.manifests.get(tag)!);
  return costNotes(names, manifests, result.storage);
}

test("a collection widget states its storage's bytes and how they follow, not the muted line", () => {
  const notes = notesFor(projectTexts(), ['services'], ['wd_service_list']);
  expect(notes).toEqual([
    'RAM 1520 bytes for rows: 10 rows × 152 bytes (cells: 6 × string, 25 bytes each, max_len 24 + 1, at 0; padded to 4)',
  ]);
});

test("the figure is the instance's own: max_rows 1 is a tenth of max_rows 10", () => {
  const texts = projectTexts();
  expect(notesFor(texts, ['row0'], ['wd_service_list'])[0]).toMatch(/^RAM 152 bytes for rows: 1 row × 152 bytes/);
  texts.set(SCREEN, texts.get(SCREEN)!.replace('max_rows="1"', 'max_rows="10"'));
  expect(notesFor(texts, ['row0'], ['wd_service_list'])[0]).toMatch(/^RAM 1520 bytes for rows: 10 rows/);
});

test('several elements: each figure names its element', () => {
  const notes = notesFor(projectTexts(), ['formation', 'services'], ['wd_train_formation', 'wd_service_list']);
  expect(notes).toEqual([expect.stringMatching(/^formation: RAM 144 bytes for carriages: 12 rows × 12 bytes/), expect.stringMatching(/^services: RAM 1520 bytes for rows/)]);
});

test('a project widget without <data> keeps the muted line', () => {
  const notes = notesFor(projectTexts(), ['box'], ['wd_probe_box']);
  expect(notes).toEqual([PROJECT_COST_NOTE]);
});

test('a block that cannot be sized says so rather than showing a figure', () => {
  const texts = projectTexts();
  const manifest = 'widgets/wd_service_list/wd_service_list.xml';
  texts.set(manifest, texts.get(manifest)!.replace(' max_len="max_cell_chars"', ''));
  expect(notesFor(texts, ['services'], ['wd_service_list'])).toEqual(['RAM for rows not computed: its storage cannot be sized (see Problems)']);
});
