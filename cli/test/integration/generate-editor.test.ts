/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/generate-editor.test.ts
 * Purpose: `u8g2gl generate --target-kind editor` end to end through the built
 *          CLI (PR-04 WO11, [UD-4]): it writes the editor registry and scene
 *          description into `<output dir>_editor`, never touching the firmware
 *          units; it refuses exactly what a firmware build refuses; and a
 *          mistyped kind is a usage error, not a silent firmware build.
 * Description: Runs dist/node/cli.js in a child process against copies of the
 *              committed compile fixture under the git-ignored cli/tmp/.
 */

import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const cliPath = resolve(__dirname, '../../dist/node/cli.js');
const fixtureDir = resolve(__dirname, '../../../test/generated_fixture');

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[]): Promise<ExecResult> {
  return new Promise((res) => {
    execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
      res({
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

const tempDirs: string[] = [];

/** A copy of the fixture's sources, without any generated output. */
function fixtureCopy(): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/generate-editor-'));
  tempDirs.push(dir);
  for (const entry of ['u8g2gl.xml', 'globals.xml', 'screens', 'widgets', 'assets']) {
    cpSync(join(fixtureDir, entry), join(dir, entry), { recursive: true });
  }
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('generate --target-kind editor (WO11)', () => {
  it('writes the registry and scene into <output dir>_editor', async () => {
    const dir = fixtureCopy();
    const run = await runCli(['--json', 'generate', dir, '--target-kind', 'editor']);
    expect(run.code, run.stderr).toBe(0);
    const json = JSON.parse(run.stdout) as { files: { path: string; action: string }[] };
    expect(json.files).toEqual([
      { path: 'ui_editor_registry.cpp', action: 'created' },
      { path: 'ui_scene.json', action: 'created' },
    ]);
    expect(readdirSync(join(dir, 'generated_editor')).sort()).toEqual(['ui_editor_registry.cpp', 'ui_scene.json']);
    expect(existsSync(join(dir, 'generated'))).toBe(false);
    // The scene describes subjects without values.
    const scene = JSON.parse(readFileSync(join(dir, 'generated_editor', 'ui_scene.json'), 'utf-8')) as {
      subjects: object[];
    };
    for (const subject of scene.subjects) {
      expect(subject).not.toHaveProperty('value');
    }
  });

  it('leaves the firmware units alone, and firmware leaves the editor output alone', async () => {
    const dir = fixtureCopy();
    expect((await runCli(['generate', dir])).code).toBe(0);
    const firmwareBefore = readdirSync(join(dir, 'generated')).map((f) => readFileSync(join(dir, 'generated', f), 'utf-8'));
    expect((await runCli(['generate', dir, '--target-kind', 'editor'])).code).toBe(0);
    expect(readdirSync(join(dir, 'generated')).map((f) => readFileSync(join(dir, 'generated', f), 'utf-8'))).toEqual(
      firmwareBefore,
    );
    // A second firmware run does not treat the sibling editor output as stale.
    expect((await runCli(['generate', dir])).code).toBe(0);
    expect(readdirSync(join(dir, 'generated_editor'))).toHaveLength(2);
  });

  it('is up to date under --check after writing, and --out overrides the directory', async () => {
    const dir = fixtureCopy();
    expect((await runCli(['generate', dir, '--target-kind', 'editor'])).code).toBe(0);
    const check = await runCli(['generate', dir, '--target-kind', 'editor', '--check']);
    expect(check.code, check.stdout).toBe(0);
    const out = join(dir, 'elsewhere');
    expect((await runCli(['generate', dir, '--target-kind', 'editor', '--out', out])).code).toBe(0);
    expect(readdirSync(out).sort()).toEqual(['ui_editor_registry.cpp', 'ui_scene.json']);
  });

  it('refuses what a firmware build refuses, and writes nothing', async () => {
    const dir = fixtureCopy();
    const home = join(dir, 'screens', 'screen_home.xml');
    writeFileSync(home, readFileSync(home, 'utf-8').replace('font="u8g2_font_6x10_mr" align', 'font="no_such_font" align'));
    const run = await runCli(['--json', 'generate', dir, '--target-kind', 'editor']);
    expect(run.code).toBe(1);
    expect((JSON.parse(run.stdout) as { errors: number }).errors).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'generated_editor'))).toBe(false);
  });

  it('treats an unknown or missing kind as a usage error', async () => {
    const dir = fixtureCopy();
    const unknown = await runCli(['generate', dir, '--target-kind', 'wasm']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("Unknown target kind 'wasm'; expected firmware or editor.");
    const missing = await runCli(['generate', dir, '--target-kind']);
    expect(missing.code).toBe(2);
    expect(existsSync(join(dir, 'generated'))).toBe(false);
  });
});
