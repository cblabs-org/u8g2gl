/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/generate-bdf.test.ts
 * Purpose: End-to-end `<bdf>` determinism through the built CLI (PR-04b WO3
 *          item 7): two runs from different working directories and `TZ`
 *          values produce byte-identical trees, and no absolute path leaks
 *          into a generated file — the same guarantee WO1 measured for
 *          bdfconv itself and WO2 measured for compileBdf(), now proven
 *          through `u8g2gl generate` end to end.
 * Description: Runs `dist/node/cli.js generate` in two child processes against
 *              copies of the same project, one per throwaway directory, with
 *              different `cwd` and `TZ`.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(testDir, '../../dist/node/cli.js');
const repoRoot = resolve(testDir, '../../..');
const fourBySix = resolve(repoRoot, 'extern/u8g2/tools/font/bdf/4x6.bdf');

const tempDirs: string[] = [];

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the built CLI in a child process with the given cwd and extra env. */
function runCliIn(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<ExecResult> {
  return new Promise((res) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd, env: { ...process.env, NO_COLOR: '1', ...env } },
      (error, stdout, stderr) => {
        res({ code: error && typeof error.code === 'number' ? error.code : 0, stdout: stdout.toString(), stderr: stderr.toString() });
      },
    );
  });
}

/** Builds a fresh project with one <bdf> font under its own throwaway directory. */
function createProject(): string {
  mkdirSync(resolve(testDir, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(testDir, '../../tmp/generate-bdf-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'), { recursive: true });
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  copyFileSync(fourBySix, join(dir, 'fonts/4x6.bdf'));
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.4" name="bdf_determinism" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`,
  );
  writeFileSync(
    join(dir, 'globals.xml'),
    '<globals><fonts><bdf name="small_9" src="fonts/4x6.bdf" range="0x20-0x7F" /></fonts></globals>\n',
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
  return dir;
}

/** Every file under a directory with its bytes, sorted by path. */
function snapshot(dir: string): Array<[string, string]> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e): [string, string] => {
      const full = join(e.parentPath, e.name);
      return [full.slice(dir.length + 1), readFileSync(full, 'utf-8')];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('<bdf> determinism through the built CLI (PR-04b WO3 item 7)', () => {
  it('produces byte-identical output across cwd and TZ, with no absolute path in it', async () => {
    const dir = createProject();
    const outA = join(dir, 'out-a');
    const outB = join(dir, 'out-b');

    const runA = await runCliIn(dir, ['generate', '.', '--out', outA], { TZ: 'UTC' });
    const runB = await runCliIn(resolve(dir, 'screens'), ['generate', '..', '--out', outB], { TZ: 'Asia/Tokyo' });

    expect(runA.code).toBe(0);
    expect(runB.code).toBe(0);
    expect(snapshot(outA)).toEqual(snapshot(outB));

    // No absolute path anywhere in the generated tree — the same guarantee
    // WO1 measured for bdfconv's own -ffile-prefix-map and WO2 for
    // compileBdf(), carried through generate()'s own emission.
    for (const [path, content] of snapshot(outA)) {
      expect(content, path).not.toContain(dir);
      expect(content, path).not.toMatch(/\/(Users|home)\//);
    }
    // And the compiled font actually made it in, not silently dropped.
    const fontsUnit = snapshot(outA).find(([path]) => path === 'ui_fonts.cpp')?.[1];
    expect(fontsUnit).toContain('ui_fontdata_small_9[723]');
  });
});
