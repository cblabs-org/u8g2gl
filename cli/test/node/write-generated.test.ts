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
    content: formatHeaderStamp({ source: 'u8g2gl.xml', schema: '0.5', generator: '1.0.0', target: 'primary' }) + body,
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

describe('the writer removes a directory it emptied, and no other (PR-04 WO12)', () => {
  it('removes a subdirectory whose last generated file it deleted', () => {
    const { out } = sandbox();
    writeGenerated(out, ok([stamped('ui.hpp'), stamped('screens/ui_screen_home.cpp')]));
    expect(existsSync(join(out, 'screens'))).toBe(true);

    // The screen is renamed out of the subdirectory: its file goes stale and is
    // deleted, and before WO12 the empty directory stayed for ever.
    const changes = writeGenerated(out, ok([stamped('ui.hpp')]));
    expect(changes).toContainEqual({ path: 'screens/ui_screen_home.cpp', action: 'deleted' });
    expect(existsSync(join(out, 'screens'))).toBe(false);
    expect(existsSync(join(out, 'ui.hpp'))).toBe(true);
    // The output directory itself is never removed.
    expect(existsSync(out)).toBe(true);
  });

  it('cascades upward while each parent is one it emptied', () => {
    const { out } = sandbox();
    writeGenerated(out, ok([stamped('ui.hpp'), stamped('a/b/c/ui_screen_home.cpp')]));
    writeGenerated(out, ok([stamped('ui.hpp')]));

    expect(existsSync(join(out, 'a'))).toBe(false);
    expect(existsSync(out)).toBe(true);
  });

  it('leaves a directory that was already empty before the run', () => {
    const { out } = sandbox();
    writeGenerated(out, ok([stamped('ui.hpp'), stamped('screens/ui_screen_home.cpp')]));
    const placeholder = join(out, 'placeholder');
    mkdirSync(placeholder);

    writeGenerated(out, ok([stamped('ui.hpp')]));

    // Not this run's to remove: nothing was deleted from it.
    expect(existsSync(placeholder)).toBe(true);
    expect(existsSync(join(out, 'screens'))).toBe(false);
  });

  it("leaves a directory still holding somebody else's file", () => {
    const { out } = sandbox();
    writeGenerated(out, ok([stamped('screens/ui_screen_home.cpp')]));
    writeFileSync(join(out, 'screens/notes.md'), 'mine\n', 'utf-8');

    writeGenerated(out, ok([stamped('ui.hpp')]));

    expect(existsSync(join(out, 'screens/notes.md'))).toBe(true);
    expect(existsSync(join(out, 'screens'))).toBe(true);
  });
});

describe('the writer recognises a generated JSON file (PR-04 WO11 f2, closed in WO12)', () => {
  /** A generated JSON file, marked the way `scene.ts` marks `ui_scene.json`. */
  const sceneLike = (body: string): string =>
    `${JSON.stringify({ u8g2gl_generated: "GENERATED by u8g2gl. Do not edit: regenerate with 'u8g2gl generate'.", body }, null, 2)}\n`;

  it('deletes a stale one, which it could never do while the marker had to be a comment', () => {
    const { out } = sandbox();
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'ui_scene.json'), sceneLike('stale'), 'utf-8');

    const changes = writeGenerated(out, ok([stamped('ui.hpp')]));

    expect(changes).toContainEqual({ path: 'ui_scene.json', action: 'deleted' });
    expect(existsSync(join(out, 'ui_scene.json'))).toBe(false);
  });

  it('is not fooled by a hand-written JSON file, whatever it is called', () => {
    const { out } = sandbox();
    mkdirSync(out, { recursive: true });
    // Named exactly like the generated one, and carrying the format and version
    // keys a host reads — but not the marker, so it is a person's file.
    writeFileSync(
      join(out, 'ui_scene.json'),
      `${JSON.stringify({ format: 'u8g2gl-scene', version: 2 }, null, 2)}\n`,
      'utf-8',
    );

    const changes = writeGenerated(out, ok([stamped('ui.hpp')]));

    expect(changes.map((c) => c.path)).not.toContain('ui_scene.json');
    expect(existsSync(join(out, 'ui_scene.json'))).toBe(true);
  });

  it('recognises it by its marker and not by its name', () => {
    // The point of a marker key: a renamed or newly added generated JSON file is
    // still deletable without the writer being taught its name.
    const { out } = sandbox();
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'ui_scene_home.json'), sceneLike('stale'), 'utf-8');

    expect(writeGenerated(out, ok([stamped('ui.hpp')]))).toContainEqual({
      path: 'ui_scene_home.json',
      action: 'deleted',
    });
  });
});
