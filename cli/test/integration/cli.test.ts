/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/cli.test.ts
 * Purpose: End-to-end integration tests executing the built CLI binary via child_process.execFile.
 * Description: Verifies CLI behavior, process exit status codes, standard error / output routing,
 *              human-readable diagnostic formatting (§15.1), and machine-readable JSON contracts (§15.3).
 *              The WO9 block covers validate --fix-names: that the default build journey
 *              refuses to invent element identity, and that --fix-names writes generated
 *              names into the source and revalidates the rewritten project.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cliPath = resolve(__dirname, '../../dist/node/cli.js');
const validProjectDir = resolve(__dirname, 'fixtures/valid-project');
const brokenProjectDir = resolve(__dirname, 'fixtures/broken-project');

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Executes the built CLI binary in a child process.
 */
function runCliSubprocess(args: readonly string[]): Promise<ExecResult> {
  return new Promise((res) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        const exitCode = error && typeof error.code === 'number' ? error.code : 0;
        res({
          code: exitCode,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}

describe('U8G2GL CLI End-to-End Integration', () => {
  it('u8g2gl validate valid-project/ -> exit 0, no output on stderr', async () => {
    const res = await runCliSubprocess(['validate', validProjectDir]);

    expect(res.code).toBe(0);
    expect(res.stderr.trim()).toBe('');
    expect(res.stdout).toContain('Validation passed: 0 errors, 0 warnings.');
  });

  it('u8g2gl validate valid-project/ --json -> valid JSON, errors: 0', async () => {
    const res = await runCliSubprocess(['validate', validProjectDir, '--json']);

    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      diagnostics: unknown[];
      errors: number;
      warnings: number;
    };
    expect(parsed.errors).toBe(0);
    expect(parsed.warnings).toBe(0);
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
    expect(parsed.diagnostics).toHaveLength(0);
  });

  it('u8g2gl validate broken-project/ -> exit 1, diagnostics on stderr', async () => {
    const res = await runCliSubprocess(['validate', brokenProjectDir]);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('error:');
    expect(res.stderr).toContain('Validation failed:');
    // Verifies the four expected error categories
    expect(res.stderr).toContain('small_9');
    expect(res.stderr).toContain('123invalid_name');
    expect(res.stderr).toContain('bad_status_bar');
    expect(res.stderr).toContain('U8G2_NONEXISTENT_999X999_HW_I2C');
  });

  it('u8g2gl validate broken-project/ --json -> valid JSON with diagnostics', async () => {
    const res = await runCliSubprocess(['validate', brokenProjectDir, '--json']);

    expect(res.code).toBe(1);
    const parsed = JSON.parse(res.stdout) as {
      diagnostics: Array<{ code: string; severity: string; message: string }>;
      errors: number;
      warnings: number;
    };
    expect(parsed.errors).toBeGreaterThan(0);
    expect(parsed.diagnostics.length).toBeGreaterThanOrEqual(4);

    const codes = parsed.diagnostics.map((d) => d.code);
    expect(codes).toContain('U8G2GL_UNKNOWN_FONT');
    expect(codes).toContain('U8G2GL_UNKNOWN_DISPLAY');
    expect(codes).toContain('U8G2GL_MISSING_REQUIRED');
    expect(codes).toContain('U8G2GL_INVALID_NAME');
  });

  it('u8g2gl find "SSD1306 128x64 i2c" -> output contains "SSD1306"', async () => {
    const res = await runCliSubprocess(['find', 'SSD1306 128x64 i2c']);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('SSD1306');
    expect(res.stdout).toContain('128x64');
  });

  it('u8g2gl find "SSD1306 128x64 i2c" --json -> valid JSON array', async () => {
    const res = await runCliSubprocess(['find', 'SSD1306 128x64 i2c', '--json']);

    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].controller).toBe('SSD1306');
  });

  it('u8g2gl catalogue --json -> valid JSON, array length > 100', async () => {
    const res = await runCliSubprocess(['catalogue', '--json']);

    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(100);
  });

  it('u8g2gl --version -> prints version matching package.json', async () => {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    const res = await runCliSubprocess(['--version']);

    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(pkg.version);
  });

  it('u8g2gl --help -> prints usage including all commands', async () => {
    const res = await runCliSubprocess(['--help']);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Usage: u8g2gl');
    expect(res.stdout).toContain('validate');
    expect(res.stdout).toContain('find');
    expect(res.stdout).toContain('catalogue');
  });

  it('u8g2gl nonexistent -> exit 1, error message', async () => {
    const res = await runCliSubprocess(['nonexistent']);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Unknown command: nonexistent');
    expect(res.stderr).toContain('Available commands: validate, find, catalogue');
  });
});

describe('WO9: validate --fix-names end-to-end', () => {
  const projectXml = `<?xml version="1.0" encoding="UTF-8"?>
<u8g2gl schema="0.4" name="fix_names_demo" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" rotation="R0" />
    </targets>
</u8g2gl>
`;

  const globalsXml = `<?xml version="1.0" encoding="UTF-8"?>
<globals>
    <fonts>
        <bdf name="small_9" src="fonts/small_9.bdf" />
    </fonts>
</globals>
`;

  const unnamedScreenXml = `<?xml version="1.0" encoding="UTF-8"?>
<screen name="home">
    <!-- keep this comment -->
    <view>
        <u8g2gl_label y="0" x="0" width="128" height="12" font="small_9" text="a" />
        <u8g2gl_label x="0" y="20" width="128" height="12" font="small_9" text="b" />
    </view>
</screen>
`;

  /**
   * Materialises a throwaway project under the repo's git-ignored tmp/ so the
   * write-back has real files to rewrite without touching a committed fixture.
   */
  function createTempProject(): string {
    const dir = mkdtempSync(resolve(__dirname, '../../tmp/fix-names-'));
    mkdirSync(join(dir, 'screens'), { recursive: true });
    mkdirSync(join(dir, 'widgets/u8g2gl_label'), { recursive: true });
    writeFileSync(join(dir, 'u8g2gl.xml'), projectXml, 'utf-8');
    writeFileSync(join(dir, 'globals.xml'), globalsXml, 'utf-8');
    writeFileSync(join(dir, 'screens/screen_home.xml'), unnamedScreenXml, 'utf-8');
    // Reuse the committed label manifest: without it the rewritten screen would
    // still fail on U8G2GL_UNKNOWN_WIDGET and the revalidation assertions would
    // be measuring the wrong thing.
    writeFileSync(
      join(dir, 'widgets/u8g2gl_label/u8g2gl_label.xml'),
      readFileSync(
        join(validProjectDir, 'widgets/u8g2gl_label/u8g2gl_label.xml'),
        'utf-8',
      ),
      'utf-8',
    );
    return dir;
  }

  const tempDirs: string[] = [];

  beforeAll(() => {
    mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('without --fix-names, unnamed elements are errors and nothing is written', async () => {
    const dir = createTempProject();
    tempDirs.push(dir);

    const res = await runCliSubprocess(['validate', dir]);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain("is missing a required 'name' attribute");
    expect(readFileSync(join(dir, 'screens/screen_home.xml'), 'utf-8')).toBe(unnamedScreenXml);
  });

  it('--fix-names writes the names, reports them, and revalidates clean', async () => {
    const dir = createTempProject();
    tempDirs.push(dir);

    const res = await runCliSubprocess(['validate', dir, '--fix-names']);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Wrote 2 generated name(s) into 1 file(s):');
    expect(res.stdout).toContain('screens/screen_home.xml: label_0, label_1');
    expect(res.stdout).toContain('Validation passed: 0 errors');

    const rewritten = readFileSync(join(dir, 'screens/screen_home.xml'), 'utf-8');
    expect(rewritten).toContain('<u8g2gl_label name="label_0" y="0" x="0"');
    expect(rewritten).toContain('<u8g2gl_label name="label_1" x="0" y="20"');
    expect(rewritten).toContain('<!-- keep this comment -->');
  });

  it('--fix-names --json reports fixedNames alongside the existing contract', async () => {
    const dir = createTempProject();
    tempDirs.push(dir);

    const res = await runCliSubprocess(['validate', dir, '--fix-names', '--json']);

    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      diagnostics: unknown[];
      errors: number;
      warnings: number;
      fixedNames: { file: string; names: string[] }[];
    };
    expect(parsed.errors).toBe(0);
    expect(parsed.diagnostics).toHaveLength(0);
    expect(parsed.fixedNames).toEqual([
      { file: 'screens/screen_home.xml', names: ['label_0', 'label_1'] },
    ]);
  });

  it('--fix-names is idempotent: a second run writes nothing', async () => {
    const dir = createTempProject();
    tempDirs.push(dir);

    await runCliSubprocess(['validate', dir, '--fix-names']);
    const afterFirst = readFileSync(join(dir, 'screens/screen_home.xml'), 'utf-8');

    const res = await runCliSubprocess(['validate', dir, '--fix-names']);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('No missing element names: nothing written.');
    expect(readFileSync(join(dir, 'screens/screen_home.xml'), 'utf-8')).toBe(afterFirst);
  });

  it('--fix-names works on a single file and does not swallow the path argument', async () => {
    const dir = createTempProject();
    tempDirs.push(dir);
    const screenPath = join(dir, 'screens/screen_home.xml');

    const res = await runCliSubprocess(['validate', '--fix-names', screenPath, '--json']);

    // A screen validated in isolation still reports the references it cannot
    // resolve without globals and manifests, so the exit code is not the
    // subject here: what matters is that the flag was not mistaken for the
    // path, and the named file was rewritten.
    const parsed = JSON.parse(res.stdout) as {
      diagnostics: { code: string }[];
      fixedNames: { file: string; names: string[] }[];
    };
    expect(parsed.fixedNames[0]!.names).toEqual(['label_0', 'label_1']);
    expect(parsed.diagnostics.some((d) => d.code === 'U8G2GL_MISSING_NAME')).toBe(false);
    expect(readFileSync(screenPath, 'utf-8')).toContain('name="label_0"');
  });

  it('--fix-names leaves an already-named project untouched', async () => {
    const before = readFileSync(join(validProjectDir, 'screens/screen_home.xml'), 'utf-8');

    const res = await runCliSubprocess(['validate', validProjectDir, '--fix-names']);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('No missing element names: nothing written.');
    expect(readFileSync(join(validProjectDir, 'screens/screen_home.xml'), 'utf-8')).toBe(before);
  });
});
