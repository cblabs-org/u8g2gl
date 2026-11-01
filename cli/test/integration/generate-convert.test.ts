/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/generate-convert.test.ts
 * Purpose: End-to-end `<convert>` through the built CLI:
 *          two runs from different working directories and `TZ` values produce
 *          byte-identical trees for a project using both conversion modes; the
 *          budget and the emitted provenance comments say what the images cost
 *          and how they were made; and `validate` judges a `<convert>` without
 *          the PNG existing.
 * Description: Runs `dist/node/cli.js` in child processes against a throwaway
 *              project under `tmp/`. The PNG is built by
 *              `test/helpers/png-builder.ts`.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildPng } from '../helpers/png-builder.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(testDir, '../../dist/node/cli.js');
const tempDirs: string[] = [];

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the built CLI in a child process with the given cwd and extra env. */
function runCliIn(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<ExecResult> {
  return new Promise((res) => {
    execFile(process.execPath, [cliPath, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } }, (error, stdout, stderr) => {
      res({ code: error && typeof error.code === 'number' ? error.code : 0, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

/** A 16x16 RGBA PNG: a soft-edged dark disc on a transparent ground, so both modes have work to do. */
function discPng(): Buffer {
  const samples: number[] = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const alpha = Math.max(0, Math.min(255, Math.round((7.5 - d) * 64)));
      samples.push(30 + x * 8, 30 + y * 8, 60, alpha);
    }
  }
  return buildPng({ width: 16, height: 16, colourType: 6, depth: 8, samples, filters: [0, 1, 2, 3, 4] });
}

/** A project with one threshold and one dither `<convert>`, both drawn on a screen. */
function createProject(): string {
  mkdirSync(resolve(testDir, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(testDir, '../../tmp/generate-convert-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets/disc.png'), discPng());
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.5" name="convert_determinism" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />
    </targets>
</u8g2gl>
`,
  );
  writeFileSync(
    join(dir, 'globals.xml'),
    `<globals><images>
        <convert name="disc_hard" src="assets/disc.png" width="16" height="16" />
        <convert name="disc_soft" src="assets/disc.png" width="16" height="16" mode="dither" threshold="140" />
    </images></globals>\n`,
  );
  writeFileSync(
    join(dir, 'screens/screen_home.xml'),
    `<screen name="home">
    <view>
        <u8g2gl_xbm name="hard" x="0" y="0" width="16" height="16" src="disc_hard" />
        <u8g2gl_xbm name="soft" x="32" y="0" width="16" height="16" src="disc_soft" />
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

describe('<convert> through the built CLI', () => {
  it('produces byte-identical output across cwd and TZ, with no absolute path in it', async () => {
    const dir = createProject();
    const outA = join(dir, 'out-a');
    const outB = join(dir, 'out-b');

    const runA = await runCliIn(dir, ['generate', '.', '--out', outA], { TZ: 'UTC' });
    const runB = await runCliIn(resolve(dir, 'screens'), ['generate', '..', '--out', outB], { TZ: 'Asia/Tokyo' });

    expect(runA.code, runA.stderr).toBe(0);
    expect(runB.code, runB.stderr).toBe(0);
    expect(snapshot(outA)).toEqual(snapshot(outB));
    for (const [path, content] of snapshot(outA)) {
      expect(content, path).not.toContain(dir);
      expect(content, path).not.toMatch(/\/(Users|home)\//);
    }
  });

  it('the images and the budget: measured, with a comment saying how each was made', async () => {
    const dir = createProject();
    const res = await runCliIn(dir, ['generate', '.', '--json']);
    expect(res.code, res.stderr).toBe(0);

    const parsed = JSON.parse(res.stdout) as { budget: { flash: { item: string; names?: string[]; figure: unknown }[] } };
    const line = parsed.budget.flash.find((l) => l.item === 'image data (bitmap arrays)');
    expect(line?.names).toEqual(['disc_hard', 'disc_soft']);
    // 16x16 -> 2 bytes per row x 16 rows = 32 bytes each.
    expect(line?.figure).toMatchObject({ kind: 'measured', bytes: 64 });

    const images = readFileSync(join(dir, 'generated/ui_images.cpp'), 'utf-8');
    expect(images).toContain('// disc_hard: converted from assets/disc.png, 16x16, mode threshold, threshold 128, 32 bytes.');
    expect(images).toContain('// disc_soft: converted from assets/disc.png, 16x16, mode dither, threshold 140, 32 bytes.');
    expect(images).not.toMatch(/\b(WO|PR-)\d/);
  });

  it('validate reports a bad <convert> without the PNG existing, and generate refuses it', async () => {
    const dir = createProject();
    rmSync(join(dir, 'assets/disc.png'));
    writeFileSync(
      join(dir, 'globals.xml'),
      `<globals><images><convert name="disc_hard" src="assets/disc.png" width="16" height="16" mode="blur" threshold="300" /></images></globals>\n`,
    );
    const validated = await runCliIn(dir, ['validate', '.', '--json']);
    const codes = (JSON.parse(validated.stdout) as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
    expect(codes).toContain('U8G2GL_INVALID_ENUM_VALUE');
    expect(codes).toContain('U8G2GL_TYPE_MISMATCH');
    expect(codes).not.toContain('U8G2GL_MISSING_FILE');

    // generate: the same two attribute errors, once each, and no second report
    // (no MISSING_FILE, no internal-error guard) from the asset step.
    const generated = await runCliIn(dir, ['generate', '.', '--json']);
    expect(generated.code).toBe(1);
    const genCodes = (JSON.parse(generated.stdout) as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
    expect(genCodes.filter((c) => c === 'U8G2GL_INVALID_ENUM_VALUE')).toHaveLength(1);
    expect(genCodes).not.toContain('U8G2GL_MISSING_COMPILED_IMAGE');
  });

  it('a PNG of the wrong size is refused, naming both sizes', async () => {
    const dir = createProject();
    writeFileSync(
      join(dir, 'globals.xml'),
      `<globals><images><convert name="disc_hard" src="assets/disc.png" width="32" height="32" /></images></globals>\n`,
    );
    const res = await runCliIn(dir, ['generate', '.']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("Image 'disc_hard' declares 32x32 but 'assets/disc.png' is 16x16; resize the PNG.");
  });
});
