/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/classed-composite.test.ts
 * Purpose: Proves, through the built CLI and real XML on disk, that a composite
 *          declaring its own C++ class (`<widget extends="…"><view>`) is refused
 *          as not yet supported — a warning in `validate`, an error in `generate`
 *          (PR-04 decision 1). Before PR-04 WO7 the parser dropped `extends` on
 *          such a manifest, so this refusal could not fire from XML (WO5b F1).
 * Description: Builds a throwaway project under the git-ignored cli/tmp/ and runs
 *              dist/node/cli.js in a child process.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const cliPath = resolve(__dirname, '../../dist/node/cli.js');

interface RunResult {
  readonly code: number;
  readonly stdout: string;
}

interface CliJson {
  readonly diagnostics: Array<{ code: string; severity: string; file: string; line: number; message: string }>;
  readonly errors: number;
  readonly warnings: number;
  readonly files?: unknown[];
}

function runCli(args: readonly string[]): Promise<RunResult> {
  return new Promise((res) => {
    execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (error, stdout) => {
      res({ code: error && typeof error.code === 'number' ? error.code : 0, stdout: stdout.toString() });
    });
  });
}

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A generatable project whose one composite declares `extends`. */
function createProject(): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/classed-composite-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'));
  mkdirSync(join(dir, 'widgets/card'), { recursive: true });
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    '<u8g2gl schema="0.4" name="classed" version="1.0.0">\n    <targets>\n        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />\n    </targets>\n</u8g2gl>\n',
  );
  writeFileSync(join(dir, 'globals.xml'), '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n');
  writeFileSync(
    join(dir, 'widgets/card/card.xml'),
    [
      '<widget name="card" extends="u8g2gl_obj">',
      '    <api />',
      '    <view>',
      '        <u8g2gl_label name="caption" x="0" y="0" width="64" height="12" font="u8g2_font_6x10_mr" text="Hi" />',
      '    </view>',
      '</widget>',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'screens/screen_home.xml'),
    '<screen name="home">\n    <view>\n        <card name="panel" x="0" y="0" width="64" height="12" />\n    </view>\n</screen>\n',
  );
  return dir;
}

describe('a composite with its own C++ class, from real XML (PR-04 WO7)', () => {
  it('validate warns and generate refuses, with U8G2GL_NOT_YET_SUPPORTED at the manifest', async () => {
    const dir = createProject();

    const validated = await runCli(['validate', dir, '--json']);
    const validateJson = JSON.parse(validated.stdout) as CliJson;
    expect(validated.code).toBe(0);
    expect(validateJson.errors).toBe(0);
    expect(validateJson.diagnostics.map((d) => [d.code, d.severity, d.file, d.line])).toEqual([
      ['U8G2GL_NOT_YET_SUPPORTED', 'warning', 'widgets/card/card.xml', 1],
    ]);
    expect(validateJson.diagnostics[0]?.message).toContain("Composite <card> also extends C++ class 'u8g2gl_obj'");

    const generated = await runCli(['generate', dir, '--json']);
    const generateJson = JSON.parse(generated.stdout) as CliJson;
    expect(generated.code).toBe(1);
    expect(generateJson.files).toEqual([]);
    expect(generateJson.diagnostics.map((d) => [d.code, d.severity, d.file, d.line])).toEqual([
      ['U8G2GL_NOT_YET_SUPPORTED', 'error', 'widgets/card/card.xml', 1],
    ]);
  });
});
