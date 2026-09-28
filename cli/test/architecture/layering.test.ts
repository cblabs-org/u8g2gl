/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/architecture/layering.test.ts
 * Purpose: Holds the CLI core's dependency direction — realise <- validator <-
 *          generator, with schema/ beneath all three (PR-4R WO1, ruling A;
 *          u8g2gl-standards §4). Before WO1 the validator imported four tables
 *          and the realisation rule from generator/, so the two layers depended
 *          on each other and whichever direction someone picked first became
 *          permanent by accident. A rule no test enforces drifts back the same
 *          way, so this reads every import in src/core and fails on a
 *          forbidden edge, naming the file and the import.
 * Description: Specifiers come from the TypeScript compiler's own
 *              `preProcessFile`, which sees static imports, `export ... from`
 *              and dynamic `import()`, and ignores comments and strings. Each
 *              relative specifier is resolved to a path under src/core and its
 *              first segment taken as the layer, so `'../generator/x.js'` is
 *              judged by where it lands, not by whether the text contains
 *              "generator". Package and `node:` specifiers belong to no layer.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'core');

/** One import edge: the importing file, the specifier as written, and where it resolves. */
interface ImportEdge {
  /** Importer, relative to src/core, `/`-separated. */
  readonly from: string;
  readonly specifier: string;
  /** Resolved target relative to src/core, or undefined for a package or `node:` import. */
  readonly to: string | undefined;
}

/**
 * Which layers each layer may not import. The direction is realise <-
 * validator <- generator, and schema/ is the neutral ground all three share,
 * so it may import none of them.
 */
const FORBIDDEN: Readonly<Record<string, readonly string[]>> = {
  validator: ['generator'],
  realise: ['validator', 'generator'],
  schema: ['validator', 'generator', 'realise'],
};

// coreSources
// Every `.ts` file under src/core, relative to it, `/`-separated and sorted so a
// failure lists offenders in a stable order.
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

// importEdges
// Every import in one source file, each relative specifier resolved against the
// file's own directory. `.js` specifiers name the `.ts` source under NodeNext,
// but only the directory matters for the layer, so the extension is left as is.
function importEdges(file: string): ImportEdge[] {
  const text = readFileSync(join(CORE_DIR, file), 'utf8');
  const { importedFiles } = ts.preProcessFile(text, true, true);
  return importedFiles.map(({ fileName: specifier }) => {
    if (!specifier.startsWith('.')) {
      return { from: file, specifier, to: undefined };
    }
    const target = resolve(join(CORE_DIR, dirname(file)), specifier);
    return { from: file, specifier, to: relative(CORE_DIR, target).split(sep).join('/') };
  });
}

/** The layer a src/core path belongs to: its first directory, or undefined for a top-level file. */
function layerOf(path: string): string | undefined {
  const slash = path.indexOf('/');
  return slash === -1 ? undefined : path.slice(0, slash);
}

const EDGES: readonly ImportEdge[] = coreSources().flatMap(importEdges);

describe('the CLI core depends one way: realise <- validator <- generator (PR-4R WO1)', () => {
  it('reads real import edges, so a pass is not vacuous', () => {
    // The permitted directions must be visible, or the scan has found nothing.
    const crosses = (from: string, to: string): boolean =>
      EDGES.some((edge) => layerOf(edge.from) === from && edge.to !== undefined && layerOf(edge.to) === to);
    expect(crosses('generator', 'validator')).toBe(true);
    expect(crosses('validator', 'realise')).toBe(true);
    expect(crosses('realise', 'schema')).toBe(true);
  });

  for (const [layer, forbidden] of Object.entries(FORBIDDEN)) {
    it(`${layer}/ imports nothing from ${forbidden.map((name) => `${name}/`).join(', ')}`, () => {
      const offenders = EDGES.filter(
        (edge) =>
          layerOf(edge.from) === layer &&
          edge.to !== undefined &&
          forbidden.includes(layerOf(edge.to) ?? ''),
      ).map(
        (edge) =>
          `src/core/${edge.from} imports '${edge.specifier}' (src/core/${edge.to}): ` +
          `${layer}/ must not depend on ${layerOf(edge.to!)}/`,
      );
      expect(offenders).toEqual([]);
    });
  }
});
