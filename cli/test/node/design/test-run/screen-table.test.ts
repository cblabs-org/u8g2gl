/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/test-run/screen-table.test.ts
 * Purpose: What the test-run build decides without a compiler: the screen
 *          table it adds to the firmware code, read from the scene generated
 *          beside it, and the cache keys and flags it shares with the editor
 *          Wasm build, so the harness reuses the editor's U8G2 and runtime
 *          objects and links neither the bridge nor the scene parser.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { frameworkBuildSetup } from '../../../../src/node/design/build/compile-units.js';
import { readFrameworkSources } from '../../../../src/node/design/build/framework-sources.js';
import { prepareBuild } from '../../../../src/node/design/build/prepare-build.js';
import { readSceneLayout, screenTableUnit } from '../../../../src/node/design/test-run/screen-table.js';
import type { SelectedToolchain } from '../../../../src/node/toolchain/detect-toolchain.js';
import { DEPARTURES_PROJECT, FRAMEWORK_ROOT } from '../build/departures-project.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';

/** A toolchain that is never run: only its version reaches a key. */
const TOOLCHAIN: SelectedToolchain = { source: 'path', version: '5.0.3', emxx: '/em/em++', emcc: '/em/emcc', env: {} };

describe('the screen table', () => {
  it('reads the screens, in document order, and the display from a scene', () => {
    const scene = readFileSync(join(FRAMEWORK_ROOT, 'test', 'generated_fixture', 'generated_editor', 'ui_scene.json'), 'utf8');
    expect(readSceneLayout(scene)).toEqual({ display: { width: 128, height: 64 }, screens: ['bounds', 'gauges', 'home'] });
  });

  it('refuses text that is not a sized scene', () => {
    expect(readSceneLayout('not json')).toBeUndefined();
    expect(readSceneLayout('{"screens": []}')).toBeUndefined();
    expect(readSceneLayout('{"display": {"width": 128, "height": 64}, "screens": [{}]}')).toBeUndefined();
  });

  it('names each screen by the generated descriptor and records the panel', () => {
    const unit = screenTableUnit({ display: { width: 256, height: 64 }, screens: ['home', 'settings'] });
    expect(unit).toContain('#include "ui.hpp"');
    expect(unit).toContain('#include "harness.h"');
    expect(unit).toContain('    {"home", &ui_screen_home},\n    {"settings", &ui_screen_settings},');
    expect(unit).toContain('const uint8_t u8g2gl_harness_screen_count = 2;');
    expect(unit).toContain('const int32_t u8g2gl_harness_display_width = 256;');
    expect(unit).toContain('const int32_t u8g2gl_harness_display_height = 64;');
  });

  it('is deterministic, so the table\'s object is reused until a screen or the display changes', () => {
    const layout = { display: { width: 128, height: 64 }, screens: ['a', 'b'] };
    expect(screenTableUnit(layout)).toBe(screenTableUnit({ ...layout, screens: [...layout.screens] }));
    expect(screenTableUnit(layout)).not.toBe(screenTableUnit({ ...layout, screens: ['b', 'a'] }));
  });

  it('still links for a project with no screens: one null row the count excludes', () => {
    const unit = screenTableUnit({ display: { width: 128, height: 64 }, screens: [] });
    expect(unit).toContain('    {nullptr, nullptr},');
    expect(unit).toContain('u8g2gl_harness_screen_count = 0;');
  });
});

describe('the caches and flags the harness shares with the editor Wasm', () => {
  afterAll(removeTempDirs);

  it('keeps the bridge apart from the runtime, and the harness beside it, at one configuration key', async () => {
    const cache = makeTempDir('test-run-keys');
    const prepared = await prepareBuild(DEPARTURES_PROJECT, cache);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const setup = frameworkBuildSetup(readFrameworkSources(FRAMEWORK_ROOT), TOOLCHAIN, cache, join(prepared.generatedDir, 'u8g2gl_generated_config.h'));
    const key = (dir: string): string => dir.slice(dir.lastIndexOf('/') + 1);
    expect(setup.runtimeDir).toBe(join(cache, 'runtime', key(setup.runtimeDir)));
    expect(setup.editorHostDir).toBe(join(cache, 'editor-host', key(setup.runtimeDir)));
    expect(setup.harnessDir).toBe(join(cache, 'harness', key(setup.runtimeDir)));
    expect(key(setup.runtimeDir)).toMatch(/^\d+\.\d+\.\d+-em5\.0\.3-[0-9a-f]{16}-[0-9a-f]{16}$/);
    expect(readFileSync(join(setup.runtimeDir, 'u8g2gl_generated_config.h'), 'utf8')).toBe(
      readFileSync(join(prepared.generatedDir, 'u8g2gl_generated_config.h'), 'utf8'),
    );
  });

  it('compiles firmware units without U8G2GL_EDITOR, and every framework and editor unit with it', async () => {
    const cache = makeTempDir('test-run-flags');
    const prepared = await prepareBuild(DEPARTURES_PROJECT, cache);
    if (!prepared.ok) throw new Error('departures did not prepare');
    const setup = frameworkBuildSetup(readFrameworkSources(FRAMEWORK_ROOT), TOOLCHAIN, cache, join(prepared.generatedDir, 'u8g2gl_generated_config.h'));
    expect(setup.runtimeFlags).toContain('-DU8G2GL_EDITOR');
    expect(setup.projectFlags(true, [])).toContain('-DU8G2GL_EDITOR');
    const firmware = setup.projectFlags(false, [prepared.generatedDir]);
    expect(firmware).not.toContain('-DU8G2GL_EDITOR');
    // Otherwise identical to an editor unit's: same optimisation, warnings and includes.
    expect(firmware).toEqual(setup.projectFlags(true, [prepared.generatedDir]).filter((flag) => flag !== '-DU8G2GL_EDITOR'));
  });

  it('a different configuration gets its own runtime, editor-host and harness caches', async () => {
    const cache = makeTempDir('test-run-config');
    const prepared = await prepareBuild(DEPARTURES_PROJECT, cache);
    if (!prepared.ok) throw new Error('departures did not prepare');
    const framework = readFrameworkSources(FRAMEWORK_ROOT);
    const departures = frameworkBuildSetup(framework, TOOLCHAIN, cache, join(prepared.generatedDir, 'u8g2gl_generated_config.h'));
    const fixture = frameworkBuildSetup(
      framework,
      TOOLCHAIN,
      cache,
      join(FRAMEWORK_ROOT, 'test', 'generated_fixture', 'generated', 'u8g2gl_generated_config.h'),
    );
    expect(fixture.u8g2Dir).toBe(departures.u8g2Dir);
    expect(fixture.runtimeDir).not.toBe(departures.runtimeDir);
    expect(fixture.harnessDir).not.toBe(departures.harnessDir);
  });
});
