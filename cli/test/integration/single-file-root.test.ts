/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/single-file-root.test.ts
 * Purpose: `u8g2gl validate <file>` picks a parser by the file's root element.
 *          A file no parser takes used to pass validation unread: `<foo/>`
 *          always did, and a screen with stray text before its root did once
 *          the root was found by the parser rather than by a search for the
 *          first `<name`. Both must fail, and a valid file of every kind must
 *          still pass.
 * Description: Runs the built CLI (dist/) in a child process on files written
 *              under the git-ignored cli/tmp/, reading the `--json` contract.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CLI = resolve(__dirname, '../../dist/node/cli.js');
const tempDirs: string[] = [];

interface ValidateResult {
  readonly code: number;
  readonly errors: number;
  readonly diagnostics: ReadonlyArray<{ code: string; severity: string; line: number; column: number; message: string }>;
}

// validateFile
// Write `content` to a fresh file called `name` and run `validate --json` on it.
function validateFile(name: string, content: string): Promise<ValidateResult> {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/single-root-'));
  tempDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return new Promise((done) => {
    execFile(process.execPath, [CLI, 'validate', path, '--json'], (error, stdout) => {
      const parsed = JSON.parse(stdout.toString()) as Omit<ValidateResult, 'code'>;
      done({ code: error && typeof error.code === 'number' ? error.code : 0, ...parsed });
    });
  });
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validate on a single file whose root no parser takes', () => {
  it('fails on text before the root, with the parse error', async () => {
    const res = await validateFile('screen_home.xml', 'hello <screen name="s"><view/></screen>\n');
    expect(res.code).not.toBe(0);
    expect(res.errors).toBeGreaterThan(0);
    expect(res.diagnostics[0]).toMatchObject({ code: 'U8G2GL_MALFORMED_XML', line: 1, column: 7 });
  });

  // A deliberate change: until now `<foo/>` passed validation silently.
  it('fails on a well-formed unknown root, naming it and the accepted roots', async () => {
    const res = await validateFile('foo.xml', '<foo/>\n');
    expect(res.code).not.toBe(0);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]).toMatchObject({ code: 'U8G2GL_MALFORMED_XML', line: 1, column: 1 });
    expect(res.diagnostics[0]?.message).toContain('<foo>');
    for (const root of ['<u8g2gl>', '<globals>', '<screen>', '<widget>']) {
      expect(res.diagnostics[0]?.message).toContain(root);
    }
  });
});

describe('validate on a valid single file of each kind', () => {
  it.each([
    [
      'u8g2gl.xml',
      '<u8g2gl schema="0.4" name="p" version="1.0.0">\n    <targets><target name="primary" ' +
        'setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>\n</u8g2gl>\n',
    ],
    ['globals.xml', '<globals>\n</globals>\n'],
    [
      'screen_home.xml',
      '<screen name="home">\n    <view>\n        <u8g2gl_box name="b" x="0" y="0" width="4" height="4" />\n' +
        '    </view>\n</screen>\n',
    ],
    ['wd_x.xml', '<widget name="wd_x" extends="u8g2gl_obj">\n    <api />\n</widget>\n'],
  ])('passes %s', async (name, content) => {
    const res = await validateFile(name, content);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(res.errors).toBe(0);
    expect(res.code).toBe(0);
  });
});
