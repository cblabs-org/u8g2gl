/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/load-project.test.ts
 * Purpose: Pins the shared load path both `validate` and `generate` use (PR-04
 *          WO5b): a diagnostic located in a bundled framework manifest prints its
 *          source line (WO1 F9), and a lone non-project file is not held to a
 *          schema version it cannot declare (WO5a finding 6).
 * Description: Loads throwaway projects written under the git-ignored cli/tmp/.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadProject } from '../../src/node/load-project.js';
import { formatDiagnostics } from '../../src/node/format-diagnostic.js';
import { checkProject } from '../../src/core/generator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';

const tempDirs: string[] = [];

/** A minimal valid project using only builtin fonts. */
function createProject(): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/load-project-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'));
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.5" name="loaded" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
  );
  writeFileSync(join(dir, 'globals.xml'), '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n');
  writeFileSync(
    join(dir, 'screens/screen_home.xml'),
    `<screen name="home">
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="128" height="12" font="u8g2_font_6x10_mr" text="Hi" />
    </view>
</screen>
`,
  );
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadProject (PR-04 WO5b)', () => {
  it('loads a directory as a project with a project manifest and validates it clean', () => {
    const dir = createProject();
    const loaded = loadProject(dir);

    expect(loaded.projectRoot).toBe(resolve(dir));
    expect(loaded.model.hasProjectManifest).toBe(true);
    expect(loaded.model.screens.map((s) => s.name)).toEqual(['home']);
    expect(checkProject(loaded.model, 'warning').diagnostics).toEqual([]);
  });

  it('prints the source line of a diagnostic inside a bundled framework manifest (WO1 F9)', () => {
    const broken = FRAMEWORK_MANIFESTS.map((m) =>
      m.filename === 'u8g2gl_box.xml' ? { ...m, xml: m.xml.replace('</api>', '  <bogus_child />\n  </api>') } : m,
    );
    const loaded = loadProject(createProject(), { frameworkManifests: broken });

    const diagnostic = loaded.model.loadDiagnostics.find((d) => d.file === 'u8g2gl/manifests/u8g2gl_box.xml');
    expect(diagnostic).toBeDefined();

    const formatted = formatDiagnostics([diagnostic!], (f) => loaded.fileContents.get(f));
    expect(formatted).toContain('<bogus_child />');
    expect(formatted).toContain(`${diagnostic!.line} |`);
  });

  it('keeps every bundled manifest text in the file map', () => {
    const loaded = loadProject(createProject());
    for (const manifest of FRAMEWORK_MANIFESTS) {
      expect(loaded.fileContents.get(`u8g2gl/manifests/${manifest.filename}`)).toBe(manifest.xml);
    }
  });

  it('does not report a schema version for a single screen file (WO5a finding 6)', () => {
    const dir = createProject();
    const loaded = loadProject(join(dir, 'screens/screen_home.xml'), { label: 'screen_home.xml' });

    expect(loaded.projectRoot).toBeUndefined();
    expect(loaded.model.hasProjectManifest).toBe(false);
    expect(checkProject(loaded.model, 'warning').diagnostics.map((d) => d.code)).not.toContain(
      DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
    );
  });

  it('still reports a bad schema version for a single u8g2gl.xml', () => {
    const dir = createProject();
    writeFileSync(
      join(dir, 'u8g2gl.xml'),
      '<u8g2gl schema="0.9" name="loaded" version="1.0.0"><targets><target name="p" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets></u8g2gl>\n',
    );
    const loaded = loadProject(join(dir, 'u8g2gl.xml'));

    expect(loaded.model.hasProjectManifest).toBe(true);
    expect(checkProject(loaded.model, 'warning').diagnostics.map((d) => d.code)).toContain(
      DIAGNOSTIC_CODES.UNKNOWN_SCHEMA_VERSION,
    );
  });
});
