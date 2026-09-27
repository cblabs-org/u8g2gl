/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/read-project-order.test.ts
 * Purpose: The direct form of §13.9's discovery-order test: `readdirSync` is
 *          replaced with one that **reverses** every listing, and the generated
 *          bytes must not move. `readdir` order is unspecified — on some
 *          filesystems it follows creation or inode order rather than name — so
 *          without the loader's own sort, two developers with the same project
 *          would commit different generated files, and neither diff would be
 *          wrong.
 * Description: A file of its own because it mocks `node:fs`, which must not be
 *              mocked for the rest of the suite. The mock records what it
 *              reversed, so the test cannot pass by quietly not shuffling; and it
 *              asserts the recorded listing is in *descending* order, which is
 *              the reversal actually having happened rather than the directory
 *              coincidentally being read that way.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every listing the mock reversed, as names, newest call last. */
const listings: string[][] = [];

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: actual,
    readdirSync: ((path: string, options: unknown) => {
      const entries = (actual.readdirSync as (p: string, o: unknown) => unknown[])(path, options);
      const reversed = [...entries].reverse();
      listings.push(reversed.map((e) => (typeof e === 'string' ? e : String((e as { name: string }).name))));
      return reversed;
    }) as typeof actual.readdirSync,
  };
});

const { generate } = await import('../../src/core/generator/index.js');
const { loadProject } = await import('../../src/node/load-project.js');

const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  listings.length = 0;
});

/**
 * A project with three screens and two widget manifests, so both of the loader's
 * two discovery listings are exercised. Three screens, because a reversal of two
 * is indistinguishable from several other orders.
 */
function project(): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/read-order-'));
  tempDirs.push(dir);
  mkdirSync(resolve(dir, 'screens'));
  mkdirSync(resolve(dir, 'widgets/badge'), { recursive: true });
  mkdirSync(resolve(dir, 'widgets/chip'), { recursive: true });
  writeFileSync(
    resolve(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.4" name="order" version="1.0.0">
    <targets><target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" /></targets>
</u8g2gl>
`,
  );
  writeFileSync(
    resolve(dir, 'globals.xml'),
    '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n',
  );
  for (const [tag, text] of [
    ['badge', 'B'],
    ['chip', 'C'],
  ] as const) {
    writeFileSync(
      resolve(dir, `widgets/${tag}/${tag}.xml`),
      `<widget name="${tag}">
    <api />
    <view>
        <u8g2gl_label name="lbl" x="0" y="0" width="40" height="12" font="u8g2_font_6x10_mr" text="${text}" />
    </view>
</widget>
`,
    );
  }
  for (const name of ['alpha', 'beta', 'gamma']) {
    writeFileSync(
      resolve(dir, `screens/screen_${name}.xml`),
      `<screen name="${name}">
    <view>
        <badge name="b_${name}" x="0" y="0" width="40" height="12" />
        <chip name="c_${name}" x="44" y="0" width="40" height="12" />
    </view>
</screen>
`,
    );
  }
  return dir;
}

/** Generates a project at the fixed golden version. */
function generateAt(dir: string): ReturnType<typeof generate> {
  const loaded = loadProject(dir);
  const result = generate({ ...loaded.model, generatorVersion: GOLDEN_GENERATOR_VERSION, assets: loaded.assets });
  expect(result.errors, JSON.stringify(result.diagnostics.slice(0, 2))).toBe(0);
  return result;
}

describe('a reversed readdirSync changes no emitted byte (§13.9)', () => {
  it('reverses every listing it is asked for — the mock is doing its job', () => {
    // Non-vacuity. If the mock silently returned the real order, every assertion
    // below would still pass and the test would prove nothing at all.
    generateAt(project());

    const screens = listings.find((names) => names.some((n) => n.startsWith('screen_')));
    expect(screens, 'the loader never listed screens/').toBeDefined();
    expect(screens).toEqual(['screen_gamma.xml', 'screen_beta.xml', 'screen_alpha.xml']);
    const widgets = listings.find((names) => names.includes('chip') && names.includes('badge'));
    expect(widgets).toEqual(['chip', 'badge']);
  });

  it('emits the same files, in the same order, with the same bytes', () => {
    const dir = project();
    const first = generateAt(dir);
    const second = generateAt(dir);

    expect(second.files.map((f) => f.path)).toEqual(first.files.map((f) => f.path));
    // The order the loader settled on is the sorted one, not the reversed one the
    // filesystem reported — so the sort, not luck, is what fixes the bytes.
    expect(first.files.filter((f) => f.path.startsWith('ui_screen_')).map((f) => f.path)).toEqual([
      'ui_screen_alpha.cpp',
      'ui_screen_beta.cpp',
      'ui_screen_gamma.cpp',
    ]);
    for (const [index, file] of first.files.entries()) {
      expect(second.files[index]?.content, file.path).toBe(file.content);
    }
  });

  it('registers both widget manifests however the widgets directory is read', () => {
    // A manifest missed because of listing order would not be a byte difference,
    // it would be an unknown-tag error — a louder failure, but the same cause.
    const result = generateAt(project());
    const screen = result.files.find((f) => f.path === 'ui_screen_alpha.cpp')?.content ?? '';
    expect(screen).toContain('ui_obj_b_alpha');
    expect(screen).toContain('ui_obj_c_alpha');
  });
});
