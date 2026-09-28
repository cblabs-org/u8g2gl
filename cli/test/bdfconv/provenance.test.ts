/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/bdfconv/provenance.test.ts
 * Purpose: Guards the one invariant WO1 exists to protect: the catalogue, the bundled
 *          font list and the bdfconv converter must all trace to the same U8G2 commit,
 *          and the committed Wasm artefact must be exactly the bytes bdfconv-source.json
 *          says it is. A submodule bump that silently changes one without the others
 *          would otherwise surface only as a mysterious font-rendering difference far
 *          downstream (PROJECT.md Finding 4's correctness oracle depends on this).
 * Description: Compares bdfconv-source.json's recorded U8G2 commit against
 *              catalogue-source.json's and against the submodule's own pinned gitlink
 *              (read directly with `git ls-tree`, independent of readU8g2Source()), then
 *              recomputes sha256 over each committed artefact file and checks it against
 *              the recorded value.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(testDir, '..', '..');
const repoRoot = resolve(cliDir, '..');
const dataDir = resolve(cliDir, 'src', 'data', 'bdfconv');

interface BdfconvSource {
  readonly u8g2: { readonly tag: string | null; readonly commit: string | null };
  readonly emscripten: { readonly version: string; readonly commit: string };
  readonly flags: readonly string[];
  readonly wasm: { readonly sha256: string };
  readonly artefacts: Readonly<Record<string, string>>;
}

interface CatalogueSource {
  readonly u8g2: { readonly tag: string | null; readonly commit: string | null };
}

/**
 * @brief Computes a file's sha256, hex-encoded.
 * @param path Absolute path to the file.
 * @return Lowercase hex digest.
 */
function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('bdfconv-source.json provenance', () => {
  const sourcePath = resolve(dataDir, 'bdfconv-source.json');
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as BdfconvSource;

  it('records a non-null U8G2 commit', () => {
    expect(source.u8g2.commit).not.toBeNull();
    expect(source.u8g2.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('matches catalogue-source.json\'s recorded U8G2 commit', () => {
    const cataloguePath = resolve(cliDir, 'src', 'data', 'catalogue-source.json');
    const catalogueSource = JSON.parse(readFileSync(cataloguePath, 'utf8')) as CatalogueSource;
    expect(source.u8g2.commit).toBe(catalogueSource.u8g2.commit);
  });

  it("matches the extern/u8g2 submodule's pinned gitlink", () => {
    // `git ls-tree` reads the gitlink recorded in the superproject's index — the commit
    // the submodule is *pinned to* — independent of readU8g2Source()'s own `git -C`
    // lookup inside the submodule, so a bug in one cannot make this test agree with
    // itself.
    const lsTree = execFileSync('git', ['ls-tree', 'HEAD', 'extern/u8g2'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const match = /^\S+ commit (\S+)\s/.exec(lsTree);
    expect(match).not.toBeNull();
    expect(source.u8g2.commit).toBe(match?.[1]);
  });

  it('records the pinned Emscripten version', () => {
    expect(source.emscripten.version).toBe('5.0.3');
    expect(source.emscripten.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('records the -ffile-prefix-map flag without a literal machine path', () => {
    // The flag must be present (it is what keeps the artefact path-independent — see
    // the Completion Report's Decisions Made), but its recorded form uses a placeholder
    // rather than this machine's absolute checkout path, so the file itself stays
    // reproducible across checkouts (typescript.md §5 determinism).
    const prefixMapFlag = source.flags.find((flag) => flag.startsWith('-ffile-prefix-map='));
    expect(prefixMapFlag).toBeDefined();
    expect(prefixMapFlag).not.toContain(repoRoot);
  });

  it.each(['bdfconv-glue.generated.ts', 'bdfconv-wasm.json'] as const)(
    'recorded sha256 for %s matches the committed file',
    (fileName) => {
      const recorded = source.artefacts[fileName];
      expect(recorded).toBeDefined();
      expect(fileSha256(resolve(dataDir, fileName))).toBe(recorded);
    }
  );

  it('recorded Wasm sha256 matches the bytes embedded in bdfconv-wasm.json', () => {
    const wasmModule = JSON.parse(readFileSync(resolve(dataDir, 'bdfconv-wasm.json'), 'utf8')) as {
      readonly base64: string;
    };
    const wasmBytes = Buffer.from(wasmModule.base64, 'base64');
    const digest = createHash('sha256').update(wasmBytes).digest('hex');
    expect(digest).toBe(source.wasm.sha256);
  });
});
