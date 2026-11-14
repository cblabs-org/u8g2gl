/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/display-command.test.ts
 * Purpose: Holds `u8g2gl display <setup>` to its contract through the built
 *          CLI: the record with the pins its constructor takes, and
 *          `--snippet`, which must be byte for byte the `constructorSnippet()`
 *          text the designer's target section shows, so the two can never
 *          offer a board different code ([D-22]).
 * Description: Runs dist/node/cli.js in a child process (vitest's global setup
 *              builds it first), and compares its stdout with the core
 *              function's text for the same inputs. Also the refusals: an
 *              unknown setup exits 1 naming the nearest catalogued setups, a
 *              page-mode one names its full-buffer twin, and a bad option or
 *              rotation is a usage error, exit 2. Then the `--json` shapes.
 */

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { constructorSnippet } from '../../src/core/catalogue/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import { CATALOGUE } from '../../src/data/catalogue.js';

const cliPath = resolve(__dirname, '../../dist/node/cli.js');

/** One CLI run's exit status and both streams. */
interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the built CLI with `args`. */
function run(args: readonly string[]): Promise<ExecResult> {
  return new Promise((done) => {
    execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
      done({ code: error && typeof error.code === 'number' ? error.code : 0, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

/** The catalogue record a setup names. */
function record(setup: string): (typeof CATALOGUE)[number] {
  const found = CATALOGUE.find((r) => r.setup === setup);
  if (found === undefined) throw new Error(`${setup} is not in the catalogue`);
  return found;
}

const SSD1322 = 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI';
const SSD1306_I2C = 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C';

describe('u8g2gl display <setup> --snippet is constructorSnippet(), byte for byte', () => {
  it('at the defaults: R0, target main', async () => {
    const res = await run(['display', SSD1322, '--snippet']);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toBe(constructorSnippet(record(SSD1322), 'R0', 'main'));
  });

  it.each([
    [SSD1306_I2C, '90', 'portrait'],
    [SSD1322, 'MIRROR', 'hud'],
    ['U8G2_KS0108_128X64_F', 'R2', 'main'],
  ])('%s at --rotation %s --target %s', async (setup, rotation, target) => {
    const res = await run(['display', setup, '--snippet', '--rotation', rotation, '--target', target]);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(constructorSnippet(record(setup), rotation, target));
  });
});

describe('u8g2gl display <setup> prints the record', () => {
  it('names the controller, native size, bus, pins with the optional ones marked, and framebuffer', async () => {
    const res = await run(['display', SSD1306_I2C]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(SSD1306_I2C);
    expect(res.stdout).toContain('SSD1306');
    expect(res.stdout).toContain('128x64 (native, before rotation)');
    expect(res.stdout).toContain('i2c, HW_I2C');
    expect(res.stdout).toContain('reset (optional: U8X8_PIN_NONE), clock (optional: U8X8_PIN_NONE), data (optional: U8X8_PIN_NONE)');
    expect(res.stdout).toContain('1024 bytes');
    expect(res.stdout).toContain(`u8g2gl display ${SSD1306_I2C} --snippet`);
  });

  it('marks only reset optional on 4-wire HW SPI', async () => {
    const res = await run(['display', SSD1322]);
    expect(res.stdout).toContain('pins         cs, dc, reset (optional: U8X8_PIN_NONE)\n');
  });
});

describe('u8g2gl display refuses what it cannot answer', () => {
  it('an unknown setup exits 1, naming the near misses', async () => {
    const res = await run(['display', 'U8G2_SSD1306_128X64_NONAME_F_HW_I2X']);
    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain("Unknown display setup 'U8G2_SSD1306_128X64_NONAME_F_HW_I2X'");
    expect(res.stderr).toContain(`Did you mean: ${SSD1306_I2C}`);
  });

  it('an unknown setup under --json is a U8G2GL_UNKNOWN_DISPLAY with the suggestions as data', async () => {
    const res = await run(['--json', 'display', 'U8G2_SSD1306_128X64_NONAME_F_HW_I2X', '--snippet']);
    expect(res.code).toBe(1);
    const parsed = JSON.parse(res.stdout) as {
      display: unknown;
      snippet: unknown;
      diagnostics: { code: string; suggestions: string[] }[];
      errors: number;
    };
    expect(parsed.display).toBeNull();
    expect(parsed.snippet).toBeNull();
    expect(parsed.errors).toBe(1);
    expect(parsed.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.UNKNOWN_DISPLAY);
    expect(parsed.diagnostics[0]?.suggestions[0]).toBe(SSD1306_I2C);
  });

  it('a page-mode setup names its full-buffer twin', async () => {
    const res = await run(['display', 'U8G2_SSD1306_128X64_NONAME_1_HW_I2C']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain(`U8G2GL needs the full-buffer one, ${SSD1306_I2C}.`);
  });

  it.each([
    [['display'], 'display needs a setup'],
    [['display', SSD1322, '--rotation', 'R9'], "Unknown rotation 'R9'"],
    [['display', SSD1322, '--pins'], "Unknown option '--pins' for display."],
    [['display', SSD1322, SSD1306_I2C], 'display takes one setup'],
    [['display', SSD1322, '--target'], '--target needs a value.'],
  ])('%j is a usage error, exit 2', async (args, message) => {
    const res = await run(args);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain(message);
    expect(res.stderr).toContain("Run 'u8g2gl --help' for display's options.");
  });
});

describe('u8g2gl display --json', () => {
  it('is { display, snippet }: the record as catalogued and the snippet text', async () => {
    const res = await run(['--json', 'display', SSD1322, '--rotation', '90', '--target', 'portrait']);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { display: unknown; snippet: string };
    expect(Object.keys(parsed)).toEqual(['display', 'snippet']);
    expect(parsed.display).toEqual(record(SSD1322));
    expect(parsed.snippet).toBe(constructorSnippet(record(SSD1322), '90', 'portrait'));
  });

  it('gives the same shape with --snippet', async () => {
    const res = await run(['--json', 'display', SSD1322, '--snippet']);
    expect(Object.keys(JSON.parse(res.stdout) as object)).toEqual(['display', 'snippet']);
  });
});

describe('u8g2gl --help lists display', () => {
  it('in the commands and with its options', async () => {
    const res = await run(['--help']);
    expect(res.stdout).toContain('  display    One display');
    expect(res.stdout).toContain('Display Options:');
    expect(res.stdout).toContain('--snippet');
  });
});
