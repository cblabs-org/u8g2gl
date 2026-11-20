/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/builtin-fonts.test.ts
 * Purpose: The built-in font index the design server serves fonts from must
 *          hold exactly the bytes U8G2 compiles, since the designer injects
 *          them in place of the compiled-in fonts the firmware links.
 * Description: Parses the pinned `extern/u8g2/csrc/u8g2_fonts.c`: every name
 *              the font catalogue lists is there, large fonts included, each
 *              at its declared length. A few fonts are compared byte for byte
 *              with what a C compiler makes of the same declaration (skipped
 *              with a message where there is no `cc`). The parser's refusals,
 *              and the lazy source's first-use parse, are tested on small
 *              inputs; the first parse's time and the index's size are
 *              printed.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import FONT_NAMES from '../../../src/data/u8g2-fonts.json' with { type: 'json' };
import LARGE_FONTS from '../../../src/data/u8g2-large-fonts.json' with { type: 'json' };
import { BuiltinFontSource, parseU8g2Fonts, U8G2_FONTS_FILE } from '../../../src/node/design/builtin-fonts.js';
import { FRAMEWORK_ROOT } from './build/departures-project.js';
import { makeTempDir, removeTempDirs } from './temp-project.js';

afterAll(removeTempDirs);

const FONTS_FILE = join(FRAMEWORK_ROOT, U8G2_FONTS_FILE);
const source = readFileSync(FONTS_FILE);
const index = parseU8g2Fonts(source);

/** Fonts compared with the compiler: both section macros, a large one, a Unicode one. */
const COMPARED = ['u8g2_font_6x10_mr', 'u8g2_font_helvR08_tr', 'u8g2_font_amstrad_cpc_extended_8f', 'u8g2_font_unifont_t_symbols', LARGE_FONTS[0]!];

const hasCc = spawnSync('cc', ['--version']).status === 0;
if (!hasCc) {
  console.warn('builtin-fonts.test.ts: the compiler comparison is skipped, no cc on PATH');
}

// compiled
// What a C compiler makes of one font's declaration, copied out of the file
// and compiled alone with a main that prints its bytes as hex.
//   name — the font
function compiled(name: string): Uint8Array {
  const text = source.toString('latin1');
  const start = text.indexOf(`const uint8_t ${name}[`);
  // The declaration ends at a `;` after a literal's closing quote: a `;` can
  // also appear inside a literal.
  const end = text.indexOf('";\n', start) + 2;
  const dir = makeTempDir('font-cc');
  mkdirSync(dir, { recursive: true });
  const program = [
    '#include <stdio.h>',
    '#include <stdint.h>',
    '#define U8G2_FONT_SECTION(name)',
    '#define U8X8_FONT_SECTION(name)',
    Buffer.from(text.slice(start, end), 'latin1').toString('latin1'),
    `int main(void) { for (size_t i = 0; i < sizeof ${name}; i++) printf("%02x", ${name}[i]); return 0; }`,
    '',
  ].join('\n');
  writeFileSync(join(dir, 'font.c'), Buffer.from(program, 'latin1'));
  const build = spawnSync('cc', ['-w', '-o', join(dir, 'font'), join(dir, 'font.c')], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(build.stderr);
  return Uint8Array.from(Buffer.from(spawnSync(join(dir, 'font'), { encoding: 'utf8' }).stdout, 'hex'));
}

describe('parseU8g2Fonts() over the packaged u8g2_fonts.c', () => {
  it('finds every font the catalogue lists, and nothing else', () => {
    expect([...index.fonts.keys()].sort()).toEqual([...FONT_NAMES].sort());
  });

  it('reads the large fonts inside #ifdef U8G2_USE_LARGE_FONTS', () => {
    for (const name of LARGE_FONTS) {
      expect(index.fonts.get(name)?.length, name).toBeGreaterThan(32 * 1024);
    }
  });

  it('gives each font its declared length, which counts the terminating NUL', () => {
    const declared = [...source.toString('latin1').matchAll(/^const uint8_t (u8g2_font_\w+)\[(\d+)\]/gm)];
    expect(declared).toHaveLength(index.fonts.size);
    for (const [, name, length] of declared) {
      expect(index.fonts.get(name!)?.length, name).toBe(Number(length));
    }
    expect(index.totalBytes).toBe(declared.reduce((sum, [, , length]) => sum + Number(length), 0));
  });

  it.skipIf(!hasCc).each(COMPARED)('%s is byte for byte what a C compiler makes of it', (name) => {
    expect(Buffer.from(index.fonts.get(name)!).equals(Buffer.from(compiled(name)))).toBe(true);
  });
});

describe('parseU8g2Fonts() refusals', () => {
  const parse = (text: string) => parseU8g2Fonts(Buffer.from(text, 'latin1'));
  const head = 'const uint8_t u8g2_font_x_tr[4] U8G2_FONT_SECTION("u8g2_font_x_tr") = \n';

  it('decodes octal escapes and pads to the declared length, each literal on its own', () => {
    // "\0612" is \061 then '2', and "\1" "2" is 1 then '2': an escape never
    // runs on into the next literal.
    expect(Array.from(parse(`${head}  "\\0612";\n`).fonts.get('u8g2_font_x_tr')!)).toEqual([0x31, 0x32, 0, 0]);
    expect(Array.from(parse(`${head}  "\\1"\n  "2";\n`).fonts.get('u8g2_font_x_tr')!)).toEqual([1, 0x32, 0, 0]);
  });

  it('refuses a literal with no room for its NUL, an escape other than octal, and text between literals', () => {
    expect(() => parse(`${head}  "abcd";\n`)).toThrow(/does not fit its declared 4/);
    expect(() => parse(`${head}  "\\n";\n`)).toThrow(/escape other than octal/);
    expect(() => parse(`${head}  "a" x "b";\n`)).toThrow(/expected a string literal/);
  });
});

describe('BuiltinFontSource', () => {
  it('parses on the first lookup, keeps the index, and reports what it holds', () => {
    const fonts = new BuiltinFontSource(FRAMEWORK_ROOT);
    expect(fonts.available).toBe(true);
    expect(fonts.stats()).toBeUndefined();
    const first = fonts.lookup('u8g2_font_6x10_mr');
    const stats = fonts.stats();
    expect(first?.length).toBe(1152);
    expect(fonts.lookup('u8g2_font_6x10_mr')).toBe(first);
    expect(fonts.lookup('u8g2_font_no_such_font')).toBeUndefined();
    console.log(
      `built-in font index: ${stats?.fonts} fonts, ${((stats?.totalBytes ?? 0) / 1024 / 1024).toFixed(1)} MiB, parsed in ${stats?.parseMs.toFixed(0)} ms on the first request`,
    );
  });

  it('is unavailable without a framework tree, and finds nothing', () => {
    const fonts = new BuiltinFontSource(undefined);
    expect(fonts.available).toBe(false);
    expect(fonts.lookup('u8g2_font_6x10_mr')).toBeUndefined();
  });
});
