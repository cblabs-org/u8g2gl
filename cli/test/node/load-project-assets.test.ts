/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/load-project-assets.test.ts
 * Purpose: `loadProject()`'s PR-04b WO3 additions: a `<bdf>`'s `src` is read as
 *          bytes into the same asset channel an `<xbm>` uses (item 2), and the
 *          licence-file rule beside it (item 5) — none, one and several
 *          matches, project-relative and sorted.
 * Description: Loads throwaway projects written under the git-ignored cli/tmp/,
 *              exactly as test/node/load-project.test.ts does.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadProject } from '../../src/node/load-project.js';

const tempDirs: string[] = [];

/** A project directory with one <bdf> font at fonts/<bdfName>, and whatever extra files. */
function createProject(options: {
  readonly bdfName?: string;
  readonly extraFiles?: Readonly<Record<string, string>>;
}): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/load-project-assets-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'), { recursive: true });
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  const bdfName = options.bdfName ?? 'small_9.bdf';
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.4" name="loaded" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
  );
  writeFileSync(
    join(dir, 'globals.xml'),
    `<globals><fonts><bdf name="small_9" src="fonts/${bdfName}" /></fonts></globals>\n`,
  );
  writeFileSync(
    join(dir, 'screens/screen_home.xml'),
    `<screen name="home">
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="128" height="12" font="small_9" text="Hi" />
    </view>
</screen>
`,
  );
  // A minimal BDF — content does not matter to loadProject(), only that bytes
  // come through unchanged; compilation is compileProjectAssets()'s concern.
  writeFileSync(join(dir, 'fonts', bdfName), 'STARTFONT 2.1\nENDFONT\n');
  for (const [path, content] of Object.entries(options.extraFiles ?? {})) {
    const absolute = join(dir, path);
    mkdirSync(resolve(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content);
  }
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadProject() — asset bytes (PR-04b WO3 item 2)', () => {
  it('reads a <bdf> src as bytes, keyed by its declared path, byte for byte', () => {
    const dir = createProject({});
    const loaded = loadProject(dir);

    const bytes = loaded.assets.get('fonts/small_9.bdf');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('STARTFONT 2.1\nENDFONT\n');
  });

  it('leaves an unreadable <bdf> src absent, for compileProjectAssets() to diagnose', () => {
    const dir = createProject({ bdfName: 'nonexistent.bdf' });
    // Remove the file loadProject() would otherwise have found, so 'src'
    // names something that genuinely is not there.
    rmSync(join(dir, 'fonts', 'nonexistent.bdf'));
    const loaded = loadProject(dir);

    expect(loaded.assets.has('fonts/nonexistent.bdf')).toBe(false);
  });
});

describe('loadProject() — <bdf> licence files (PR-04b WO3 item 5)', () => {
  it('finds none when nothing beside the BDF looks like a licence', () => {
    const dir = createProject({});
    const loaded = loadProject(dir);

    expect(loaded.bdfLicenceFiles.has('small_9')).toBe(false);
  });

  it('finds one generic LICENSE file, project-relative', () => {
    const dir = createProject({ extraFiles: { 'fonts/LICENSE': 'MIT\n' } });
    const loaded = loadProject(dir);

    expect(loaded.bdfLicenceFiles.get('small_9')).toEqual(['fonts/LICENSE']);
  });

  it('finds a stem-named licence file case-insensitively, with any extension', () => {
    const dir = createProject({ extraFiles: { 'fonts/small_9.LICENSE.txt': 'MIT\n' } });
    const loaded = loadProject(dir);

    expect(loaded.bdfLicenceFiles.get('small_9')).toEqual(['fonts/small_9.LICENSE.txt']);
  });

  it('finds several matches, sorted, and ignores an unrelated file', () => {
    const dir = createProject({
      extraFiles: {
        'fonts/COPYING': 'GPL\n',
        'fonts/OFL.txt': 'OFL\n',
        'fonts/readme.txt': 'not a licence\n',
      },
    });
    const loaded = loadProject(dir);

    expect(loaded.bdfLicenceFiles.get('small_9')).toEqual(['fonts/COPYING', 'fonts/OFL.txt']);
  });

  it("never reaches outside the project directory, even when the <bdf> src tries to", () => {
    // src escapes the project root with '../'; a real BDF and a LICENSE file
    // both sit where it points, outside the project — the same [D-11]/§13.10
    // boundary readAssets() already applies to reading the BDF itself applies
    // here to the licence scan, so neither the bytes nor the licence file are
    // found.
    mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
    const parent = mkdtempSync(resolve(__dirname, '../../tmp/load-project-assets-escape-'));
    tempDirs.push(parent);
    const dir = join(parent, 'project');
    mkdirSync(join(dir, 'screens'), { recursive: true });
    mkdirSync(join(parent, 'outside'), { recursive: true });
    writeFileSync(join(parent, 'outside', 'small_9.bdf'), 'STARTFONT 2.1\nENDFONT\n');
    writeFileSync(join(parent, 'outside', 'LICENSE'), 'not this project\'s licence\n');
    writeFileSync(
      join(dir, 'u8g2gl.xml'),
      `<u8g2gl schema="0.4" name="loaded" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
    );
    writeFileSync(
      join(dir, 'globals.xml'),
      '<globals><fonts><bdf name="small_9" src="../outside/small_9.bdf" /></fonts></globals>\n',
    );
    writeFileSync(
      join(dir, 'screens/screen_home.xml'),
      `<screen name="home">
    <view>
        <u8g2gl_label name="title" x="0" y="0" width="128" height="12" font="small_9" text="Hi" />
    </view>
</screen>
`,
    );

    const loaded = loadProject(dir);

    expect(loaded.assets.has('../outside/small_9.bdf')).toBe(false);
    expect(loaded.bdfLicenceFiles.has('small_9')).toBe(false);
  });
});

describe('loadProject() — symlinks and the project boundary', () => {
  it('treats a symlinked <bdf> src that points outside the project as outside', () => {
    const dir = createProject({});
    const outsideDir = mkdtempSync(resolve(__dirname, '../../tmp/load-project-assets-target-'));
    tempDirs.push(outsideDir);
    writeFileSync(join(outsideDir, 'secret.bdf'), 'STARTFONT 2.1\nENDFONT\n');
    rmSync(join(dir, 'fonts', 'small_9.bdf'));
    symlinkSync(join(outsideDir, 'secret.bdf'), join(dir, 'fonts', 'small_9.bdf'));

    const loaded = loadProject(dir);

    expect(loaded.assets.has('fonts/small_9.bdf')).toBe(false);
    expect(loaded.bdfLicenceFiles.has('small_9')).toBe(false);
  });

  it('still reads a symlink that stays inside the project', () => {
    const dir = createProject({ extraFiles: { 'fonts/real.bdf': 'STARTFONT 2.1\nENDFONT\n' } });
    rmSync(join(dir, 'fonts', 'small_9.bdf'));
    symlinkSync(join(dir, 'fonts', 'real.bdf'), join(dir, 'fonts', 'small_9.bdf'));

    const loaded = loadProject(dir);

    expect(new TextDecoder().decode(loaded.assets.get('fonts/small_9.bdf'))).toBe('STARTFONT 2.1\nENDFONT\n');
  });

  it('still works when the project root itself is reached through a symlink', () => {
    const dir = createProject({});
    const link = `${dir}-link`;
    symlinkSync(dir, link);
    tempDirs.push(link);

    const loaded = loadProject(link);

    expect(loaded.assets.has('fonts/small_9.bdf')).toBe(true);
  });
});
