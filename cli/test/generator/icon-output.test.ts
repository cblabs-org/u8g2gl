/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/icon-output.test.ts
 * Purpose: `<api icon>` is for the designer's Palette and nothing else: it
 *          must reach no generated file. Generated code is committed and read
 *          in review (§13.9, [D-11]), so choosing a different icon for a
 *          widget must never move a byte of firmware.
 * Description: Generates two real fixture projects, for every target each
 *              declares, twice: once with every manifest's icon removed,
 *              framework and project alike, and once with every manifest given
 *              one. The file lists and every byte must match. Both runs
 *              declare schema 0.6, so the version stamp is held equal and only
 *              the icon differs.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { buildManifestRegistry, type ManifestRegistry } from '../../src/core/manifest/index.js';
import type { ApiBlock, WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { loadProject } from '../../src/node/load-project.js';

const FIXTURES = [
  resolve(__dirname, '../../../test/generated_fixture'),
  resolve(__dirname, '../fixtures/departures-project'),
];

/** An `<api>` with no icon. */
function withoutIcon(api: ApiBlock): ApiBlock {
  const rest: { -readonly [K in keyof ApiBlock]: ApiBlock[K] } = { ...api };
  delete rest.icon;
  delete rest.iconLoc;
  return rest;
}

/** An `<api>` with an icon, whatever it carried before. */
function withIcon(api: ApiBlock): ApiBlock {
  return { ...api, icon: 'train-front' };
}

/**
 * The registry rebuilt from the same declarations in the same order, each
 * `<api>` passed through `edit`.
 */
function rebuilt(registry: ManifestRegistry, edit: (api: ApiBlock) => ApiBlock): ManifestRegistry {
  const framework: WidgetManifest[] = [];
  const project: WidgetManifest[] = [];
  for (const tag of registry.tags) {
    const entry = registry.get(tag);
    if (entry === undefined) continue;
    (entry.origin === 'framework' ? framework : project).push({ ...entry.declared, api: edit(entry.declared.api) });
  }
  return buildManifestRegistry({ framework, project });
}

describe('<api icon> reaches no generated file (§13.9)', () => {
  it.each(FIXTURES)('generates identical bytes with and without it: %s', async (dir) => {
    const loaded = loadProject(dir);
    const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
    const project = { ...loaded.model.project, schema: '0.6' };
    const targets = project.targets.map((target) => target.name);
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      const run = (edit: (api: ApiBlock) => ApiBlock): ReturnType<typeof generate> =>
        generate({
          ...loaded.model,
          project,
          manifests: rebuilt(loaded.model.manifests, edit),
          target,
          generatorVersion: '0.0.0-golden',
          compiledAssets,
          bdfLicenceFiles: loaded.bdfLicenceFiles,
        });
      const bare = run(withoutIcon);
      const iconed = run(withIcon);

      expect(bare.errors, JSON.stringify(bare.diagnostics.slice(0, 2))).toBe(0);
      expect(iconed.errors, JSON.stringify(iconed.diagnostics.slice(0, 2))).toBe(0);
      expect(iconed.files.map((f) => f.path)).toEqual(bare.files.map((f) => f.path));
      for (const [index, file] of bare.files.entries()) {
        expect(iconed.files[index]?.content, `${target}: ${file.path}`).toBe(file.content);
      }
      expect(bare.files.length).toBeGreaterThan(0);
    }
  });
});
