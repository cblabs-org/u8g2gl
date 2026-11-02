/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/packaging/notices.test.ts
 * Purpose: Keeps the npm package's licence notices true as its contents
 *          change. The package redistributes the designer bundle's production
 *          dependencies and U8G2's sources, so a dependency added to the
 *          designer, or a version bumped, must not ship unannounced; and the
 *          licence texts the notices point at must exist and be the real ones.
 * Description: The designer's production dependency tree is read from
 *              `designer/package-lock.json` (what the bundle is built from),
 *              and compared with the table under "The designer bundle" in
 *              `THIRD-PARTY-NOTICES.md`: the same packages, at the same
 *              versions, each naming licence texts that exist in `LICENSES/`.
 *              Type-declaration packages (`@types/*`) carry no code into the
 *              bundle and are exempt. U8G2's licence copy is checked
 *              byte-for-byte against the submodule's, and `package.json`'s
 *              author against carrying an email address.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoDir = resolve(cliDir, '..');

/** One row of the designer bundle's notice table. */
interface NoticeRow {
  readonly name: string;
  readonly version: string;
  readonly licenceFiles: readonly string[];
}

// designerProductionDependencies
// Every package in the designer's lock file that is not dev-only, by name and
// version, without the type-only `@types/*` packages.
function designerProductionDependencies(): Map<string, string> {
  const lock = JSON.parse(readFileSync(resolve(repoDir, 'designer', 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string; dev?: boolean; devOptional?: boolean }>;
  };
  const deps = new Map<string, string>();
  for (const [path, entry] of Object.entries(lock.packages)) {
    const name = path.replace(/^.*node_modules\//, '');
    if (path === '' || entry.dev === true || entry.devOptional === true || name.startsWith('@types/')) {
      continue;
    }
    deps.set(name, entry.version ?? '');
  }
  return deps;
}

// noticeRows
// The rows of the table under "## The designer bundle", up to the next heading.
function noticeRows(): NoticeRow[] {
  const notices = readFileSync(resolve(repoDir, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  const start = notices.indexOf('## The designer bundle');
  expect(start, 'THIRD-PARTY-NOTICES.md has a "The designer bundle" section').toBeGreaterThanOrEqual(0);
  const section = notices.slice(start, notices.indexOf('\n## ', start + 1));
  return [...section.matchAll(/^\| `([^`]+)` \| ([^ |]+) \| [^|]+ \| (.+) \|$/gm)].map((match) => ({
    name: match[1]!,
    version: match[2]!,
    licenceFiles: [...match[3]!.matchAll(/LICENSES\/([\w.-]+)/g)].map((file) => file[1]!),
  }));
}

describe("the package's licence notices", () => {
  it("name every production dependency of the designer, at the lock file's version", () => {
    const deps = designerProductionDependencies();
    const rows = noticeRows();
    expect(rows.map((row) => row.name).sort()).toEqual([...deps.keys()].sort());
    for (const row of rows) {
      expect(row.version, row.name).toBe(deps.get(row.name));
    }
  });

  it('point each dependency at licence texts that exist in LICENSES/', () => {
    for (const row of noticeRows()) {
      expect(row.licenceFiles.length, row.name).toBeGreaterThan(0);
      for (const file of row.licenceFiles) {
        expect(existsSync(resolve(cliDir, 'LICENSES', file)), `${row.name}: LICENSES/${file}`).toBe(true);
      }
    }
  });

  it('mention every licence text the package carries', () => {
    const notices = readFileSync(resolve(repoDir, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    for (const file of readdirSync(resolve(cliDir, 'LICENSES'))) {
      expect(notices, file).toContain(`LICENSES/${file}`);
    }
  });

  it("carry U8G2's licence, with its font terms, exactly as the submodule has it", () => {
    const upstream = resolve(repoDir, 'extern', 'u8g2', 'LICENSE');
    const copy = readFileSync(resolve(cliDir, 'LICENSES', 'u8g2-BSD-2-Clause.txt'));
    expect(Buffer.compare(copy, readFileSync(upstream))).toBe(0);
    expect(copy.toString('utf8')).toMatch(/Fonts are licensed under different conditions/);
  });

  it("name the package's author without an email address", () => {
    const pkg = JSON.parse(readFileSync(resolve(cliDir, 'package.json'), 'utf8')) as { author?: unknown };
    expect(typeof pkg.author).toBe('string');
    expect(pkg.author as string).not.toMatch(/@|</);
  });
});
