/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/build/prepare-build.test.ts
 * Purpose: The parts of the project editor Wasm build that need no compiler:
 *          the platform-header rule (one diagnostic, at the `#include`, before
 *          anything compiles) and the build hash (it changes when, and only
 *          when, a widget source, a manifest, a font, an image or the generated
 *          configuration changes). Runs on every machine.
 * Description: Each case copies the departures project (a fixture with custom
 *              widgets) into a temp
 *              directory, changes one thing, and prepares it again.
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEditorWasm } from '../../../../src/node/design/build/editor-wasm-build.js';
import { checkPlatformHeaders, PLATFORM_HEADER_CODE, platformOf } from '../../../../src/node/design/build/platform-headers.js';
import { prepareBuild } from '../../../../src/node/design/build/prepare-build.js';
import { makeTempDir, removeTempDirs } from '../temp-project.js';
import { fakeHost } from '../../toolchain/fake-host.js';
import { FRAMEWORK_ROOT, DEPARTURES_PROJECT } from './departures-project.js';

afterEach(removeTempDirs);


/** The compile fixture's XBM, to give the departures project an image. */
const FIXTURE_XBM = resolve(__dirname, '../../../../../test/generated_fixture/assets/icon_wifi.xbm');

// departuresCopy
// An unmodified copy of the departures project in a fresh temp directory.
function departuresCopy(): string {
  const dir = join(makeTempDir('departures'), 'project');
  cpSync(DEPARTURES_PROJECT, dir, { recursive: true });
  return dir;
}

// edit
// Rewrites one project file with a function of its text.
function edit(project: string, path: string, change: (text: string) => string): void {
  const file = join(project, path);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
}

// hashOf
// The build hash after preparing, failing the test if preparation refuses.
async function hashOf(project: string, cache: string): Promise<string> {
  const prepared = await prepareBuild(project, cache);
  if (!prepared.ok) {
    throw new Error(JSON.stringify(prepared.diagnostics, null, 2));
  }
  return prepared.buildHash;
}

describe('the platform-header rule', () => {
  it('classifies Arduino, ESP-IDF and FreeRTOS headers, and nothing a widget may use', () => {
    expect(platformOf('Arduino.h')).toBe('Arduino');
    expect(platformOf('esp_log.h')).toBe('ESP-IDF');
    expect(platformOf('driver/gpio.h')).toBe('ESP-IDF');
    expect(platformOf('sdkconfig.h')).toBe('ESP-IDF');
    expect(platformOf('freertos/FreeRTOS.h')).toBe('FreeRTOS');
    expect(platformOf('FreeRTOS.h')).toBe('FreeRTOS');
    for (const allowed of ['U8g2lib.h', 'u8g2gl/u8g2gl_obj.h', 'cstdint', 'wd_probe_box.hpp', 'desp_thing.h']) {
      expect(platformOf(allowed), allowed).toBeUndefined();
    }
  });

  it('reports each platform #include at its line, and ignores one in a comment or string', () => {
    const text = [
      '// #include <Arduino.h> is not allowed here', // a comment
      '/* #include "esp_log.h"',
      '   still a comment */',
      'const char* s = "#include <FreeRTOS.h>";',
      '#include "wd_x.hpp"',
      '  #include <Arduino.h>',
    ].join('\n');
    const diagnostics = checkPlatformHeaders(new Map([['widgets/wd_x/wd_x.cpp', text]]));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: PLATFORM_HEADER_CODE, severity: 'error', file: 'widgets/wd_x/wd_x.cpp', line: 6, column: 3 });
    expect(diagnostics[0]?.message).toMatch(/'Arduino\.h' is a Arduino header\. A widget's C\+\+ may depend only on U8G2 and U8G2GL/);
  });

  it('refuses the build with one diagnostic before anything is compiled', async () => {
    const project = departuresCopy();
    edit(project, 'widgets/wd_probe_box/wd_probe_box.cpp', (text) =>
      text.replace('#include "wd_probe_box.hpp"', '#include "wd_probe_box.hpp"\n#include <Arduino.h>'),
    );
    const { host, runs } = fakeHost();
    const build = await buildEditorWasm({
      projectRoot: project,
      cacheRoot: makeTempDir('build-cache'),
      frameworkRoot: FRAMEWORK_ROOT,
      toolchain: { source: 'path', version: '5.0.3', emxx: '/fake/em++', emcc: '/fake/emcc', env: {} },
      host,
      optimisation: 'O1',
    });
    expect(build.status).toBe('failed');
    expect(build.diagnostics).toEqual([
      expect.objectContaining({ code: PLATFORM_HEADER_CODE, file: 'widgets/wd_probe_box/wd_probe_box.cpp', line: 16, column: 1 }),
    ]);
    expect(runs).toEqual([]);
  });
});

describe('the build hash', () => {
  it('generates into the cache, never into the project, and is stable', async () => {
    const project = departuresCopy();
    const cache = makeTempDir('build-cache');
    const before = readFileSync(join(project, 'generated', 'ui_fonts.cpp'), 'utf8');
    const first = await hashOf(project, cache);
    expect(await hashOf(project, cache)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    // The project's own generated/ is the user's firmware build's: untouched.
    expect(readFileSync(join(project, 'generated', 'ui_fonts.cpp'), 'utf8')).toBe(before);
  });

  // Each change is made to a fresh copy and compared with that copy's own hash.
  const changes: ReadonlyArray<{ readonly what: string; readonly moves: boolean; readonly apply: (project: string) => void }> = [
    {
      what: 'a widget source',
      moves: true,
      apply: (p) => edit(p, 'widgets/wd_probe_box/wd_probe_box.cpp', (t) => `${t}\n// edited\n`),
    },
    {
      what: 'a widget header',
      moves: true,
      apply: (p) => edit(p, 'widgets/wd_probe_box/wd_probe_box.hpp', (t) => `${t}\n// edited\n`),
    },
    {
      what: 'a widget manifest',
      moves: true,
      apply: (p) => edit(p, 'widgets/wd_probe_box/wd_probe_box.xml', (t) => t.replace('default="8"', 'default="9"')),
    },
    {
      what: 'a font',
      moves: true,
      apply: (p) => edit(p, 'globals.xml', (t) => t.replace('<fonts>', '<fonts>\n        <builtin name="u8g2_font_5x7_mr" />')),
    },
    {
      what: 'an image',
      moves: true,
      apply: (p) => {
        mkdirSync(join(p, 'assets'), { recursive: true });
        cpSync(FIXTURE_XBM, join(p, 'assets', 'icon.xbm'));
        edit(p, 'globals.xml', (t) => t.replace('</globals>', '    <images>\n        <xbm name="icon" src="assets/icon.xbm" />\n    </images>\n</globals>'));
      },
    },
    {
      what: 'the generated configuration (one more object on the busiest screen)',
      moves: true,
      apply: (p) =>
        edit(p, 'screens/screen_departures.xml', (t) =>
          t.replace('</view>', '    <u8g2gl_label name="extra" x="200" y="0" width="20" height="10" font="u8g2_font_6x10_mr" text="x" />\n    </view>'),
        ),
    },
    {
      what: 'a screen element\'s position',
      moves: false,
      apply: (p) => edit(p, 'screens/screen_departures.xml', (t) => t.replace('name="plat_label" x="5"', 'name="plat_label" x="6"')),
    },
    {
      what: 'a subject\'s value',
      moves: false,
      apply: (p) => edit(p, 'globals.xml', (t) => t.replace('value="London Paddington"', 'value="Bristol"')),
    },
  ];
  for (const { what, moves, apply } of changes) {
    it(`${moves ? 'changes' : 'does not change'} when ${what} changes`, async () => {
      const project = departuresCopy();
      const cache = makeTempDir('build-cache');
      const before = await hashOf(project, cache);
      apply(project);
      const after = await hashOf(project, cache);
      expect(after !== before, what).toBe(moves);
    });
  }
});
