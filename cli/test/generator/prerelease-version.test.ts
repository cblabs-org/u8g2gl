/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/prerelease-version.test.ts
 * Purpose: A packed CLI reports its release tag's full version, such as
 *          `0.16.0-beta.1` (.agents/rules/03-versioning.md), and stamps it
 *          into every generated file it writes. Nothing upstream of the stamp
 *          may assume a plain `X.Y.Z`, or a beta CLI would refuse to generate,
 *          or stamp something other than what it is.
 * Description: The version lookup accepts a pre-release version as read, and
 *              generating both real fixture projects, for every target each
 *              declares, with that version succeeds and stamps it, byte for
 *              byte, wherever a stable version is stamped.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/index.js';
import { generate } from '../../src/core/generator/index.js';
import { getGeneratorVersion } from '../../src/node/generator-version.js';
import { loadProject } from '../../src/node/load-project.js';

const PRERELEASE = '0.16.0-beta.1';
const STABLE = '0.16.0';

const FIXTURES = [
  resolve(__dirname, '../../../test/generated_fixture'),
  resolve(__dirname, '../fixtures/departures-project'),
];

describe('a pre-release CLI version', () => {
  it('is read from package.json as it is', () => {
    expect(getGeneratorVersion(() => JSON.stringify({ version: PRERELEASE }))).toBe(PRERELEASE);
  });

  it.each(FIXTURES)('generates and is stamped wherever a stable version is: %s', async (dir) => {
    const loaded = loadProject(dir);
    const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
    const targets = loaded.model.project.targets.map((target) => target.name);
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      const run = (generatorVersion: string): ReturnType<typeof generate> =>
        generate({
          ...loaded.model,
          target,
          generatorVersion,
          compiledAssets,
          bdfLicenceFiles: loaded.bdfLicenceFiles,
        });
      const stable = run(STABLE);
      const prerelease = run(PRERELEASE);

      // --- It generates, exactly as a stable version does ---
      expect(prerelease.errors, JSON.stringify(prerelease.diagnostics.slice(0, 2))).toBe(0);
      expect(prerelease.files.map((f) => f.path)).toEqual(stable.files.map((f) => f.path));

      // --- Its stamp is the full version, and is the only difference ---
      const config = prerelease.files.find((f) => f.path.endsWith('u8g2gl_generated_config.h'));
      expect(config?.content, target).toContain(`// generator: ${PRERELEASE}\n`);
      for (const [index, file] of stable.files.entries()) {
        expect(prerelease.files[index]?.content, `${target}: ${file.path}`).toBe(
          file.content.replaceAll(STABLE, PRERELEASE),
        );
      }
    }
  });
});
