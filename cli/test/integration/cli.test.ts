/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/cli.test.ts
 * Purpose: End-to-end integration tests executing the built CLI binary via child_process.execFile.
 * Description: Verifies CLI behavior, process exit status codes, standard error / output routing,
 *              human-readable diagnostic formatting (§15.1), and machine-readable JSON contracts (§15.3).
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
