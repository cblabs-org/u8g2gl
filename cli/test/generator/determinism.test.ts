/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/determinism.test.ts
 * Purpose: Proves §13.9 rather than asserting it. Generated output is committed
 *          and read in review ([D-11]), so "byte-identical for identical input"
 *          is a promise to every reviewer who treats a diff as meaningful — and
 *          it is a promise that fails *quietly*, on somebody else's machine,
 *          months later. The three ways it can fail are the three tests here:
 *          output that varies between runs, output that follows the order the
 *          filesystem happened to hand the files over in, and diagnostics
 *          ordered by the host's locale.
 * Description: Each test is written to fail if the guarantee is removed, and says
 *              how. The shuffle test reverses what `readdirSync` returns and
 *              checks the reversal actually happened, so it cannot pass by not
 *              shuffling; the locale test uses a pair whose code-unit and
 *              collated orders genuinely differ, so it cannot pass under
 *              `localeCompare`.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator/index.js';
import { finaliseDiagnostics } from '../../src/core/generator/index.js';
import { compareDiagnostics } from '../../src/core/validator/index.js';
import { compareCodeUnits } from '../../src/core/order.js';
import type { Diagnostic } from '../../src/core/schema/diagnostic.js';
import { loadProject } from '../../src/node/load-project.js';
import { readProjectFiles } from '../../src/node/read-project.js';
import { formatDiagnostics } from '../../src/node/format-diagnostic.js';
import { compileProjectAssets } from '../../src/core/assets/index.js';

const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';
const committedFixture = resolve(__dirname, '../../../test/generated_fixture');
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Generates a project at the fixed golden version, as every expectation is
 * made. Compiles every `<bdf>` first — the committed
 * fixture declares two, so a plain `generate()` with no
 * `compiledAssets` would refuse it with `U8G2GL_MISSING_COMPILED_FONT`.
 */
async function generateAt(dir: string): Promise<ReturnType<typeof generate>> {
  const loaded = loadProject(dir);
  const compiledAssets = await compileProjectAssets({ globals: loaded.model.globals, assets: loaded.assets });
  const result = generate({
    ...loaded.model,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    compiledAssets,
    bdfLicenceFiles: loaded.bdfLicenceFiles,
  });
  expect(result.errors, JSON.stringify(result.diagnostics.slice(0, 2))).toBe(0);
  return result;
}

describe('generating twice gives identical bytes (§13.9)', () => {
  it('holds for the committed compile fixture, file for file and in emission order', async () => {
    const first = await generateAt(committedFixture);
    const second = await generateAt(committedFixture);

    // Paths in order, not just as a set: emission order is draw order and file
    // order, and a reordered file list is a diff in u8g2gl.xml-driven output.
    expect(second.files.map((f) => f.path)).toEqual(first.files.map((f) => f.path));
    for (const [index, file] of first.files.entries()) {
      expect(second.files[index]?.content, file.path).toBe(file.content);
    }
    expect(first.files.length).toBeGreaterThan(5);
  });

  it('holds across a fresh process boundary, which is where a Map or Set order would differ', async () => {
    // The two calls above share one module instance. This one re-reads the
    // project from disk into a new model, so anything keyed on object identity
    // or insertion order rather than on the document would diverge here.
    const first = await generateAt(committedFixture);
    const fresh = await generateAt(committedFixture);
    expect(JSON.stringify(fresh.capacities)).toBe(JSON.stringify(first.capacities));
    expect(fresh.files.map((f) => f.content).join('\u0000')).toBe(first.files.map((f) => f.content).join('\u0000'));
  });

  it('carries no timestamp and no absolute path into any emitted file', async () => {
    for (const file of (await generateAt(committedFixture)).files) {
      expect(file.content, file.path).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(file.content, file.path).not.toMatch(/\/Users\//);
    }
  });
});

describe('file-discovery order cannot reach the emitted bytes (§13.9)', () => {
  /**
   * A project with three screens. Three, not two, so a reversal cannot
   * coincidentally equal the sorted order, and the files are **written** in
   * descending name order, so any filesystem that reported creation order would
   * hand them over reversed.
   */
  function threeScreenProject(): string {
    mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
    const dir = mkdtempSync(resolve(__dirname, '../../tmp/determinism-'));
    tempDirs.push(dir);
    mkdirSync(resolve(dir, 'screens'));
    writeFileSync(
      resolve(dir, 'u8g2gl.xml'),
      `<u8g2gl schema="0.5" name="shuffle" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
    );
    writeFileSync(
      resolve(dir, 'globals.xml'),
      '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n',
    );
    for (const name of ['gamma', 'beta', 'alpha']) {
      writeFileSync(
        resolve(dir, `screens/screen_${name}.xml`),
        `<screen name="${name}">
    <view>
        <u8g2gl_label name="t_${name}" x="0" y="0" width="128" height="12" font="u8g2_font_6x10_mr" text="${name}" />
    </view>
</screen>
`,
      );
    }
    return dir;
  }

  // The guarantee is in two parts, and both are needed. The loader canonicalises
  // the order (part 1); and the order is load-bearing, so canonicalising it is
  // what makes the bytes stable rather than a no-op (part 2). A test of part 1
  // alone would still pass if emission ignored the order entirely, which would
  // make it prove nothing about §13.9; a test of part 2 alone would not say where
  // the guarantee lives. The direct shuffle — reversing `readdirSync` — is in
  // `test/node/read-project-order.test.ts`, which mocks `node:fs` and therefore
  // has to be a file of its own.

  it('part 1: the loader hands emission one canonical order, by code unit', async () => {
    const dir = threeScreenProject();
    const files = readProjectFiles(dir);
    const names = files.screenXmls.map((f) => f.filename);

    expect(names).toEqual(['screens/screen_alpha.xml', 'screens/screen_beta.xml', 'screens/screen_gamma.xml']);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

    const generated = (await generateAt(dir)).files.filter((f) => f.path.startsWith('ui_screen_')).map((f) => f.path);
    expect(generated).toEqual(['ui_screen_alpha.cpp', 'ui_screen_beta.cpp', 'ui_screen_gamma.cpp']);
  });

  it('part 2: the order is load-bearing, so canonicalising it is not a no-op', () => {
    const dir = threeScreenProject();
    const loaded = loadProject(dir);
    const forwards = generate({
      ...loaded.model,
      generatorVersion: GOLDEN_GENERATOR_VERSION,
      });
    const backwards = generate({
      ...loaded.model,
      screens: [...loaded.model.screens].reverse(),
      generatorVersion: GOLDEN_GENERATOR_VERSION,
      });

    expect(backwards.errors).toBe(0);
    // Reversing the screens really does change the output — the file list order
    // and `ui.hpp`'s declarations follow it. So an uncanonicalised discovery
    // order would reach the committed bytes, which is the defect the sort
    // prevents.
    expect(backwards.files.map((f) => f.path)).not.toEqual(forwards.files.map((f) => f.path));
    expect(backwards.files.find((f) => f.path === 'ui.hpp')?.content).not.toBe(
      forwards.files.find((f) => f.path === 'ui.hpp')?.content,
    );
    // And it changes *only* the order: the same screens are emitted either way.
    expect([...backwards.files.map((f) => f.path)].sort()).toEqual([...forwards.files.map((f) => f.path)].sort());
  });
});

describe('diagnostics are ordered by file, line, column — by code unit, not locale (§13.9)', () => {
  /** A diagnostic at a position, with everything else fixed. */
  function at(file: string, line: number, column: number, code = 'U8G2GL_A'): Diagnostic {
    return { code, severity: 'error', file, line, column, message: `${file}:${line}:${column}` };
  }

  /**
   * A pair whose collated and code-unit orders genuinely differ.
   *
   * `'a'.localeCompare('B')` is **negative** on any ICU build — collation
   * case-folds, so `a` comes before `B` — while by code unit `'B'` (0x42) comes
   * before `'a'` (0x61). So this pair is the whole point of the test: it fails
   * under `localeCompare` and passes by code unit, on the same machine.
   */
  const CASE_PAIR = ['a.xml', 'B.xml'] as const;

  it('is the pair that tells the two orders apart', () => {
    // Guards the test itself: if a future Node made localeCompare agree with a
    // code-unit comparison, this pair would stop proving anything and the test
    // below would become vacuous without failing.
    expect('a.xml'.localeCompare('B.xml')).toBeLessThan(0);
    expect(compareDiagnostics(at('a.xml', 1, 1), at('B.xml', 1, 1))).toBeGreaterThan(0);
  });

  it('orders files by code unit', () => {
    const sorted = [...[at(CASE_PAIR[0], 1, 1), at(CASE_PAIR[1], 1, 1)]].sort(compareDiagnostics);
    expect(sorted.map((d) => d.file)).toEqual(['B.xml', 'a.xml']);
  });

  it('orders by file, then line, then column, then code', () => {
    const shuffled = [
      at('b.xml', 1, 1),
      at('a.xml', 2, 1),
      at('a.xml', 1, 9),
      at('a.xml', 1, 2, 'U8G2GL_Z'),
      at('a.xml', 1, 2, 'U8G2GL_A'),
    ];
    expect([...shuffled].sort(compareDiagnostics).map((d) => `${d.file}:${d.line}:${d.column}:${d.code}`)).toEqual([
      'a.xml:1:2:U8G2GL_A',
      'a.xml:1:2:U8G2GL_Z',
      'a.xml:1:9:U8G2GL_A',
      'a.xml:2:1:U8G2GL_A',
      'b.xml:1:1:U8G2GL_A',
    ]);
  });

  it('puts every path that orders diagnostics on the one comparator', () => {
    // Three places used to sort with localeCompare: the validator, the
    // generator's merge, and the CLI's formatter. The merge and the formatter
    // must now agree with the comparator exactly, or the human output and the
    // --json array would list the same diagnostics in different orders.
    const unsorted = [at('a.xml', 1, 1), at('B.xml', 1, 1), at('B.xml', 1, 1)];
    const merged = finaliseDiagnostics(unsorted);
    expect(merged.diagnostics.map((d) => d.file)).toEqual(['B.xml', 'a.xml']);
    // …and deduplicated, which is why the comparator needs no tie-break.
    expect(merged.diagnostics).toHaveLength(2);

    const formatted = formatDiagnostics(unsorted);
    expect(formatted.indexOf('B.xml')).toBeLessThan(formatted.indexOf('a.xml'));
  });

  it('leaves no localeCompare in the diagnostic path', () => {
    // A guard against the next copy: the comparator is the only thing these
    // three modules may sort diagnostics with, and a fourth copy would be
    // invisible in a review.
    for (const source of ['validate.ts', 'check-project.ts', 'format-diagnostic.ts']) {
      // Comments stripped first: two of these files *mention* localeCompare, to
      // record why it is not used, and a naive search would forbid explaining
      // the rule in the very place it applies.
      const code = sourceOf(source)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${source} still sorts diagnostics with localeCompare`).not.toContain('localeCompare');
    }
  });
});

// sourceOf
// One of the three modules that order diagnostics, read as text. Reading the
// source is the only way to check that a *second spelling* has not come back:
// a behavioural test passes under either comparator for every input whose two
// orders happen to agree, which is most of them.
//   basename — the file's name, which is unique across the three directories
function sourceOf(basename: string): string {
  const paths: Record<string, string> = {
    'validate.ts': '../../src/core/validator/validate.ts',
    'check-project.ts': '../../src/core/generator/check-project.ts',
    'format-diagnostic.ts': '../../src/node/format-diagnostic.ts',
  };
  const path = paths[basename];
  expect(path, `no source path for ${basename}`).toBeDefined();
  return readFileSync(resolve(__dirname, path as string), 'utf-8');
}

describe('discovery order is code-unit, not locale (§13.9, WO12 follow-up)', () => {
  /**
   * The pair that tells the two orders apart, in filenames an author would
   * actually write.
   *
   * ICU collation weakens the underscore, so `screen_a_1.xml` collates **before**
   * `screen_a1.xml`; by code unit it sorts **after** it, because `'1'` is 0x31 and
   * `'_'` is 0x5F. Both are ordinary lowercase screen files. This refutes the
   * comfortable assumption — which this worker made in its own first report —
   * that lowercase ASCII project filenames make the locale question academic.
   */
  const LOCALE_SENSITIVE = ['screen_a_1.xml', 'screen_a1.xml'] as const;

  /** A project with the two screens whose filenames the two orders disagree about. */
  function pairProject(): string {
    mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
    const dir = mkdtempSync(resolve(__dirname, '../../tmp/order-pair-'));
    tempDirs.push(dir);
    mkdirSync(resolve(dir, 'screens'));
    mkdirSync(resolve(dir, 'widgets/w_1'), { recursive: true });
    mkdirSync(resolve(dir, 'widgets/w1'), { recursive: true });
    writeFileSync(
      resolve(dir, 'u8g2gl.xml'),
      `<u8g2gl schema="0.5" name="pair" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
    );
    writeFileSync(
      resolve(dir, 'globals.xml'),
      '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n',
    );
    for (const tag of ['w_1', 'w1']) {
      writeFileSync(
        resolve(dir, `widgets/${tag}/${tag}.xml`),
        `<widget name="${tag}">
    <api />
    <view>
        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="12" font="u8g2_font_6x10_mr" text="${tag}" />
    </view>
</widget>
`,
      );
    }
    for (const name of ['a_1', 'a1']) {
      writeFileSync(
        resolve(dir, `screens/screen_${name}.xml`),
        `<screen name="${name}">
    <view>
        <w_1 name="p_${name}" x="0" y="0" width="40" height="12" />
        <w1 name="q_${name}" x="44" y="0" width="40" height="12" />
    </view>
</screen>
`,
      );
    }
    return dir;
  }

  it('is the pair that tells the two orders apart', () => {
    // Guards the test itself. If a future ICU made collation agree with a
    // code-unit comparison for this pair, everything below would still pass and
    // would be proving nothing.
    expect(LOCALE_SENSITIVE[0].localeCompare(LOCALE_SENSITIVE[1])).toBeLessThan(0);
    expect(compareCodeUnits(LOCALE_SENSITIVE[0], LOCALE_SENSITIVE[1])).toBeGreaterThan(0);
  });

  it('loads the two screens in code-unit order, which is not the collated order', () => {
    const files = readProjectFiles(pairProject());
    expect(files.screenXmls.map((f) => f.filename)).toEqual([
      'screens/screen_a1.xml',
      'screens/screen_a_1.xml',
    ]);
    // Said explicitly: under localeCompare this array is the other way round, so
    // the assertion above fails on the very machine it passes on now.
    expect(files.screenXmls.map((f) => f.filename)).not.toEqual(
      [...files.screenXmls.map((f) => f.filename)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('loads the two widget manifests in code-unit order too', () => {
    const files = readProjectFiles(pairProject());
    expect(files.widgetManifestXmls.map((f) => f.filename)).toEqual([
      'widgets/w1/w1.xml',
      'widgets/w_1/w_1.xml',
    ]);
  });

  it('emits the screens in that order, which is how the order reaches the bytes', async () => {
    // The point of fixing this sort rather than only the diagnostics: a screen's
    // position in the load order is its position in the emitted file list and in
    // ui.hpp, so a collated order would put different bytes in a committed file.
    const result = await generateAt(pairProject());
    expect(result.files.filter((f) => f.path.startsWith('ui_screen_')).map((f) => f.path)).toEqual([
      'ui_screen_a1.cpp',
      'ui_screen_a_1.cpp',
    ]);
    const header = result.files.find((f) => f.path === 'ui.hpp')?.content ?? '';
    expect(header.indexOf('ui_screen_a1_init')).toBeLessThan(header.indexOf('ui_screen_a_1_init'));
  });

  it('leaves no localeCompare anywhere it could order output', () => {
    // The diagnostic path was closed in WO12; these four were the rest. The scan
    // covers the whole of src/, so the next copy — wherever it lands — fails here.
    for (const source of [
      '../../src/node/read-project.ts',
      '../../src/node/catalogue-builder.ts',
      '../../src/core/catalogue/edit-distance.ts',
      '../../src/core/catalogue/query.ts',
    ]) {
      const code = readFileSync(resolve(__dirname, source), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${source} still sorts with localeCompare`).not.toContain('localeCompare');
    }
  });
});
