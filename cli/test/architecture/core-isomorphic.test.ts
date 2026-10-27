/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/architecture/core-isomorphic.test.ts
 * Purpose: Holds src/core/ isomorphic [D-10]: it must run unmodified in Node
 *          and in the browser, because the designer validates and generates
 *          client-side. A Node builtin in core compiles and passes every Node
 *          test, then fails only in the browser — late and expensively — so
 *          the rule is enforced here rather than by vigilance.
 *          layering.test.ts reads the same imports but deliberately ignores
 *          `node:` specifiers; this is the test that does not.
 * Description: Reads every `.ts` file under src/core with the TypeScript
 *              compiler's `preProcessFile`, which reports static imports,
 *              `export ... from`, dynamic `import()`, `require()` and
 *              `import x = require()`, and ignores comments and strings. It
 *              fails on any `node:` specifier, any bare Node builtin (`fs`,
 *              `path`, `fs/promises`, ...), and any package specifier at all:
 *              core has no runtime dependency, and a package added to it
 *              would have to be proven browser-safe first.
 *              The eslint `no-restricted-imports` rule covers static imports
 *              only; this also catches `require()` and `import()`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'core');

const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

// coreSources
// Every `.ts` file under src/core, relative to it, `/`-separated and sorted
// so a failure lists offenders in a stable order.
function coreSources(dir = CORE_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...coreSources(path));
    } else if (entry.name.endsWith('.ts')) {
      out.push(relative(CORE_DIR, path).split(sep).join('/'));
    }
  }
  return out.sort();
}

// violation
// Why `specifier` may not appear in core, or undefined if it may. Only a
// relative specifier is allowed: it stays inside the package.
function violation(specifier: string): string | undefined {
  if (specifier.startsWith('.')) {
    return undefined;
  }
  if (specifier.startsWith('node:')) {
    return 'a node: import';
  }
  if (BUILTINS.has(specifier)) {
    return 'a bare Node builtin';
  }
  return 'a package import (core has no runtime dependencies)';
}

const FILES = coreSources();

describe('src/core is isomorphic: no Node builtin, no package import [D-10]', () => {
  it('scans real files, so a pass is not vacuous', () => {
    expect(FILES.length).toBeGreaterThan(50);
    const specifiers = FILES.flatMap(
      (file) => ts.preProcessFile(readFileSync(join(CORE_DIR, file), 'utf8'), true, true).importedFiles,
    );
    expect(specifiers.length).toBeGreaterThan(100);
  });

  it('no file under src/core imports or requires a Node builtin or a package', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(join(CORE_DIR, file), 'utf8');
      for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
        const why = violation(fileName);
        if (why) {
          offenders.push(`src/core/${file} imports '${fileName}': ${why}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('recognises every form of import the scan relies on', () => {
    // A self-check on preProcessFile, so a TypeScript upgrade that stopped
    // reporting one of these forms would fail here rather than pass silently.
    const sample = [
      "import { a } from 'node:fs';",
      "export { b } from 'path';",
      "const c = await import('node:url');",
      "const d = require('fs/promises');",
      "import e = require('os');",
      "import f from 'some-package';",
      "// import { g } from 'node:comment';",
      "const h = 'node:string';",
    ].join('\n');
    const found = ts.preProcessFile(sample, true, true).importedFiles.map((f) => f.fileName);
    expect(found.sort()).toEqual(['fs/promises', 'node:fs', 'node:url', 'os', 'path', 'some-package']);
    expect(found.map(violation).every((why) => why !== undefined)).toBe(true);
  });
});
