/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/write-generated.test.ts
 * Purpose: Pins the writer's three guarantees (PR-04 WO5b, §13.10): it never
 *          writes outside the output directory — not through `..`, an absolute
 *          path or a symlink; it never deletes a file without the GENERATED
 *          marker; and it writes nothing for a result with errors. Also that
 *          planning (`--check`) writes nothing.
 * Description: Every test works in a fresh directory under the git-ignored cli/tmp/.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { planGeneratedWrite, writeGenerated } from '../../src/node/write-generated.js';
import {
  formatHeaderStamp,
  type GeneratedFile,
  type GenerateResult,
} from '../../src/core/generator/index.js';

const tempDirs: string[] = [];

/** A fresh sandbox holding an `out/` path (not yet created) and an `outside/` directory. */
function sandbox(): { out: string; outside: string } {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/write-generated-'));
  tempDirs.push(dir);
  const outside = join(dir, 'outside');
  mkdirSync(outside);
  return { out: join(dir, 'out'), outside };
}

function stamped(path: string, body = ''): GeneratedFile {
  return {
    path,
    content: formatHeaderStamp({ source: 'u8g2gl.xml', schema: '0.4', generator: '1.0.0', target: 'primary' }) + body,
  };
}

function ok(files: readonly GeneratedFile[]): GenerateResult {
  return { files, diagnostics: [], errors: 0, warnings: 0 };
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeGenerated (PR-04 WO5b)', () => {
  it('creates files, including nested ones, and rewrites nothing that is already right', () => {
    const { out } = sandbox();
    const files = [stamped('ui.hpp'), stamped('sub/ui_screen_home.cpp')];

    expect(writeGenerated(out, ok(files))).toEqual([
      { path: 'ui.hpp', action: 'created' },
      { path: 'sub/ui_screen_home.cpp', action: 'created' },
    ]);
    expect(readFileSync(join(out, 'sub/ui_screen_home.cpp'), 'utf-8')).toBe(files[1]!.content);
    expect(writeGenerated(out, ok(files)).map((c) => c.action)).toEqual(['unchanged', 'unchanged']);
  });

  it('never escapes the output directory through ".." — and writes nothing at all', () => {
    const { out, outside } = sandbox();

    expect(() => writeGenerated(out, ok([stamped('ui.hpp'), stamped('../outside/escape.h')]))).toThrow(
      /Refusing to write '\.\.\/outside\/escape\.h'/,
    );
    expect(() => writeGenerated(out, ok([stamped('sub/../../outside/escape.h')]))).toThrow();
    expect(readdirSync(outside)).toEqual([]);
    expect(existsSync(join(out, 'ui.hpp'))).toBe(false);
  });

  it('never writes to an absolute path', () => {
    const { out, outside } = sandbox();

    expect(() => writeGenerated(out, ok([stamped(join(outside, 'abs.h'))]))).toThrow();
    expect(readdirSync(outside)).toEqual([]);
  });

  it('never writes through a symlink that leads out of the output directory', () => {
    const { out, outside } = sandbox();
    mkdirSync(out);
    symlinkSync(outside, join(out, 'link'));

    expect(() => writeGenerated(out, ok([stamped('link/evil.h')]))).toThrow(/symlink/);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('deletes a stale file only if it carries the GENERATED marker', () => {
    const { out } = sandbox();
    mkdirSync(join(out, 'old'), { recursive: true });
    writeFileSync(join(out, 'ui_screen_gone.cpp'), stamped('x').content);
    writeFileSync(join(out, 'old/ui_screen_older.cpp'), stamped('x').content);
    writeFileSync(join(out, 'hand_written.cpp'), '// my code\n');
    writeFileSync(join(out, 'notes.txt'), 'notes\n');
    // The marker must open the file; mentioning it later does not make a file generated.
    writeFileSync(join(out, 'quoted.h'), `// copied from a generated file:\n${stamped('x').content}`);

    const changes = writeGenerated(out, ok([stamped('ui.hpp')]));

    expect(changes).toEqual([
      { path: 'ui.hpp', action: 'created' },
      { path: 'old/ui_screen_older.cpp', action: 'deleted' },
      { path: 'ui_screen_gone.cpp', action: 'deleted' },
    ]);
    expect(existsSync(join(out, 'ui_screen_gone.cpp'))).toBe(false);
    expect(readFileSync(join(out, 'hand_written.cpp'), 'utf-8')).toBe('// my code\n');
    expect(existsSync(join(out, 'notes.txt'))).toBe(true);
    expect(existsSync(join(out, 'quoted.h'))).toBe(true);
  });

  it('refuses a result with errors, writing nothing', () => {
    const { out } = sandbox();
    const refused: GenerateResult = { ...ok([stamped('ui.hpp')]), errors: 1 };

    expect(() => writeGenerated(out, refused)).toThrow(/1 error/);
    expect(existsSync(out)).toBe(false);
  });
});

describe('planGeneratedWrite (PR-04 WO5b, --check)', () => {
  it('writes nothing, and reports a hand edit as an update', () => {
    const { out } = sandbox();
    const files = [stamped('ui.hpp')];

    expect(planGeneratedWrite(out, files)).toEqual([{ path: 'ui.hpp', action: 'created' }]);
    expect(existsSync(out)).toBe(false);

    writeGenerated(out, ok(files));
    expect(planGeneratedWrite(out, files)).toEqual([{ path: 'ui.hpp', action: 'unchanged' }]);

    writeFileSync(join(out, 'ui.hpp'), `${files[0]!.content}// hand edit\n`);
    expect(planGeneratedWrite(out, files)).toEqual([{ path: 'ui.hpp', action: 'updated' }]);
    expect(readFileSync(join(out, 'ui.hpp'), 'utf-8')).toContain('// hand edit');
  });
});
